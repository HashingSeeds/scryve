import type { CardFilterDefinition } from "../../../convex/lib/systems"

export type CardFilterState = Readonly<Record<string, readonly string[]>>

/** why: a range filter keeps its bounds as picked options, so ">=3" and "<=5" read as 3 to 5. */
export type RangeBound = ">=" | "<="

/** why: one catalog's half of a filter: where a card keeps the value, and the search keys that ask for it. The first key is the one Scryve writes. */
export type FilterField<Card> = {
  keys: readonly string[]
  read: (card: Card) => readonly string[] | number | undefined
}

/**
 * why: a card catalog's fields by filter id. Reading, writing, suggesting and matching filter
 * terms go through one, so another catalog gets the search bar's syntax by declaring its own.
 */
export type CardSource<Card = never> = ReadonlyMap<string, FilterField<Card>>

function occurrences(values: readonly string[], wanted: string) {
  return values.filter((value) => value === wanted).length
}

function matchesOption(value: readonly string[] | number, option: string) {
  if (typeof value !== "number") {
    const wanted = option.toLocaleLowerCase()
    return value.some((entry) => entry.toLocaleLowerCase() === wanted)
  }
  const bound = Number(option.slice(2))
  return option.startsWith(">=") ? value >= bound : value <= bound
}

function filterTerm(filter: CardFilterDefinition, key: string, option: string) {
  if (filter.options === "range") return `${key}${option}`
  const value = option.replace(/["\\]/g, "").toLocaleLowerCase()
  return `${key}:${/^[a-z0-9-]+$/.test(value) ? value : `"${value}"`}`
}

export function matchesCardFilters<Card>(
  source: CardSource<Card>,
  card: Card,
  filters: readonly CardFilterDefinition[],
  picked: CardFilterState,
) {
  return filters.every((filter) => {
    const options = picked[filter.id] ?? []
    if (!options.length) return true
    const value = source.get(filter.id)?.read(card)
    if (value === undefined) return false
    if (filter.match === "count")
      return (
        typeof value !== "number" &&
        options.every((option) => occurrences(value, option) >= occurrences(options, option))
      )
    const has = (option: string) => matchesOption(value, option)
    return filter.options !== "range" && filter.match === "any"
      ? options.some(has)
      : options.every(has)
  })
}

export function filterTerms(
  source: CardSource,
  filters: readonly CardFilterDefinition[],
  picked: CardFilterState,
) {
  return filters.flatMap((filter) => {
    const key = source.get(filter.id)?.keys[0]
    const options = picked[filter.id] ?? []
    // why: Scryfall reads `m>=brrr` as at least one black and three red, so the copies join into one term.
    if (filter.match === "count")
      return key && options.length
        ? [
            `${key}>=${filter.options
              .flatMap((option) => Array(occurrences(options, option)).fill(option))
              .join("")
              .toLocaleLowerCase()}`,
          ]
        : []
    const terms = key ? options.map((o) => filterTerm(filter, key, o)) : []
    return filter.options === "range" || filter.match === "all" || terms.length < 2
      ? terms
      : [`(${terms.join(" or ")})`]
  })
}

/**
 * why: reads one typed term back into the filter that writes it, so typed syntax lights up the
 * sheet. Undefined leaves the term as raw syntax for the catalog. A word goes to the first
 * filter with its key that declares it, else to the filter whose options come from cards.
 */
export function readFilterTerm(
  source: CardSource,
  filters: readonly CardFilterDefinition[],
  { key, operator, value }: { key: string; operator: string; value: string },
  cardOptionsFor: (filterId: string) => readonly string[],
): { filter: CardFilterDefinition; options: readonly string[] } | undefined {
  const fields = filters.filter((filter) =>
    source.get(filter.id)?.keys.includes(key.toLocaleLowerCase()),
  )
  const count = fields.find((filter) => filter.match === "count")
  if (count) {
    const symbols = value
      .replace(/\{(\w)\}/g, "$1")
      .toLocaleUpperCase()
      .split("")
    return (operator === ">=" || operator === ":") &&
      symbols.every((symbol) => count.options.includes(symbol))
      ? { filter: count, options: symbols }
      : undefined
  }
  const range = fields.find((filter) => filter.options === "range")
  if (range) {
    if (!/^\d{1,2}$/.test(value)) return undefined
    const bound = String(Number(value))
    if (operator === ">=" || operator === "<=")
      return { filter: range, options: [operator + bound] }
    return operator === ":" || operator === "="
      ? { filter: range, options: [`>=${bound}`, `<=${bound}`] }
      : undefined
  }
  if (operator !== ":" || !value) return undefined
  const wanted = value.toLocaleLowerCase()
  const same = (option: string) => option.toLocaleLowerCase() === wanted
  for (const filter of fields) {
    const option = Array.isArray(filter.options) ? filter.options.find(same) : undefined
    if (option) return { filter, options: [option] }
  }
  const fromCards = fields.find((filter) => filter.options === "cards")
  return fromCards
    ? { filter: fromCards, options: [cardOptionsFor(fromCards.id).find(same) ?? value] }
    : undefined
}

/** why: lists the options a partly typed term could finish as, those starting with the typed text first. */
export function termSuggestions(
  source: CardSource,
  filters: readonly CardFilterDefinition[],
  key: string,
  typed: string,
  cardOptionsFor: (filterId: string) => readonly string[],
  limit: number,
) {
  const wanted = typed.toLocaleLowerCase()
  const options = filters.flatMap((filter) =>
    filter.options !== "range" &&
    filter.match !== "count" &&
    source.get(filter.id)?.keys.includes(key)
      ? (Array.isArray(filter.options) ? filter.options : cardOptionsFor(filter.id)).map(
          (option) => ({ filter, option, at: option.toLocaleLowerCase().indexOf(wanted) }),
        )
      : [],
  )
  return [...options.filter(({ at }) => at === 0), ...options.filter(({ at }) => at > 0)]
    .slice(0, limit)
    .map(({ filter, option }) => ({ filter, option, term: filterTerm(filter, key, option) }))
}

export function pickedCount(filters: readonly CardFilterDefinition[], picked: CardFilterState) {
  return filters.reduce((total, filter) => {
    const options = picked[filter.id]?.length ?? 0
    return (
      total +
      (filter.options === "range" || filter.match === "count" ? Math.min(options, 1) : options)
    )
  }, 0)
}

/** why: filters sharing a group render together, under the heading of the filter the group names. */
export function filterGroups(filters: readonly CardFilterDefinition[]) {
  const groups = new Map<
    string,
    { heading: CardFilterDefinition; filters: CardFilterDefinition[] }
  >()
  for (const filter of filters) {
    const id = filter.group ?? filter.id
    const group = groups.get(id)
    if (group) group.filters.push(filter)
    else groups.set(id, { heading: filters.find((f) => f.id === id) ?? filter, filters: [filter] })
  }
  return [...groups.values()]
}

export function toggleOption(picked: readonly string[], option: string) {
  return picked.includes(option) ? picked.filter((value) => value !== option) : [...picked, option]
}

export function rangeBound(picked: readonly string[], bound: RangeBound) {
  return picked.find((option) => option.startsWith(bound))?.slice(bound.length)
}

export function withRangeBound(picked: readonly string[], bound: RangeBound, value?: number) {
  const kept = picked.filter((option) => !option.startsWith(bound))
  return value === undefined ? kept : [...kept, `${bound}${value}`]
}

const optionCache = new WeakMap<
  CardSource<never>,
  WeakMap<readonly object[], Map<string, readonly string[]>>
>()

/** why: this walks all 30k cards, so each card file keeps its counts instead of recounting on every sheet open. */
export function cardOptions<Card extends { legalFormats?: readonly string[] }>(
  source: CardSource<Card>,
  cards: readonly Card[],
  filterId: string,
  formats: readonly string[],
): readonly string[] {
  const scoped = formats.length > 0 && cards.some((card) => card.legalFormats !== undefined)
  const key = `${filterId}:${scoped ? formats.join(",") : ""}`
  const bySource = optionCache.get(source) ?? new WeakMap()
  optionCache.set(source, bySource)
  const cached = bySource.get(cards)?.get(key)
  if (cached) return cached
  const field = source.get(filterId)
  const counts = new Map<string, number>()
  for (const card of field ? cards : []) {
    if (scoped && !formats.every((format) => card.legalFormats?.includes(format))) continue
    const value = field?.read(card)
    if (value === undefined || typeof value === "number") continue
    for (const option of new Set(value)) counts.set(option, (counts.get(option) ?? 0) + 1)
  }
  const options = [...counts]
    .sort(([a, countA], [b, countB]) => countB - countA || a.localeCompare(b))
    .map(([option]) => option)
  const byKey = bySource.get(cards) ?? new Map<string, readonly string[]>()
  byKey.set(key, options)
  bySource.set(cards, byKey)
  return options
}
