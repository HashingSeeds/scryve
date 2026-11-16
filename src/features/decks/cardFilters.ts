import type { MagicDatasetCard } from "../../../convex/lib/magicDataset"
import type { CardFilterDefinition, MagicCardFilterId } from "../../../convex/lib/systems"

export type CardFilterState = Readonly<Record<string, readonly string[]>>

export type MagicFilterCard = Partial<
  Pick<
    MagicDatasetCard,
    "typeLine" | "keywords" | "power" | "toughness" | "manaValue" | "legalFormats"
  >
>

/** why: a range filter keeps its bounds as picked options, so ">=3" and "<=5" read as 3 to 5. */
export type RangeBound = ">=" | "<="

/** why: one catalog's half of a filter: where a card keeps the value, and the search keys that ask for it. The first key is the one Scryve writes. */
type FilterField<Card> = {
  keys: readonly string[]
  read: (card: Card) => readonly string[] | number | undefined
}

function typeLineWords(typeLine: string | undefined, part: "types" | "subtypes") {
  return typeLine
    ?.split(" // ")
    .flatMap((face) => face.split(" — ")[part === "types" ? 0 : 1]?.split(" ") ?? [])
    .filter(Boolean)
}

function stat(value: string | undefined) {
  const number = value === undefined || value === "" ? NaN : Number(value)
  return Number.isFinite(number) ? number : undefined
}

function matchesOption(value: readonly string[] | number, option: string) {
  if (typeof value !== "number") {
    const wanted = option.toLocaleLowerCase()
    return value.some((entry) => entry.toLocaleLowerCase() === wanted)
  }
  const bound = Number(option.slice(2))
  return option.startsWith(">=") ? value >= bound : value <= bound
}

const TYPE_KEYS = ["t", "type"]

const SCRYFALL_FIELDS = {
  format: { keys: ["f", "format", "legal"], read: (card) => card.legalFormats },
  type: { keys: TYPE_KEYS, read: (card) => typeLineWords(card.typeLine, "types") },
  supertype: { keys: TYPE_KEYS, read: (card) => typeLineWords(card.typeLine, "types") },
  subtype: { keys: TYPE_KEYS, read: (card) => typeLineWords(card.typeLine, "subtypes") },
  manaValue: { keys: ["mv", "cmc", "manavalue"], read: (card) => card.manaValue },
  keyword: {
    keys: ["kw", "keyword"],
    read: (card) => card.keywords?.split("\n").filter(Boolean),
  },
  power: { keys: ["pow", "power"], read: (card) => stat(card.power) },
  toughness: { keys: ["tou", "toughness"], read: (card) => stat(card.toughness) },
} satisfies Record<MagicCardFilterId, FilterField<MagicFilterCard>>

const scryfallFields: ReadonlyMap<string, FilterField<MagicFilterCard>> = new Map(
  Object.entries(SCRYFALL_FIELDS),
)

function filterTerm(filter: CardFilterDefinition, key: string, option: string) {
  if (filter.options === "range") return `${key}${option}`
  const value = option.replace(/["\\]/g, "").toLocaleLowerCase()
  return `${key}:${/^[a-z0-9-]+$/.test(value) ? value : `"${value}"`}`
}

export function matchesCardFilters(
  card: MagicFilterCard,
  filters: readonly CardFilterDefinition[],
  picked: CardFilterState,
) {
  return filters.every((filter) => {
    const options = picked[filter.id] ?? []
    if (!options.length) return true
    const value = scryfallFields.get(filter.id)?.read(card)
    if (value === undefined) return false
    const has = (option: string) => matchesOption(value, option)
    return filter.options !== "range" && filter.match === "any"
      ? options.some(has)
      : options.every(has)
  })
}

export function scryfallFilterTerms(
  filters: readonly CardFilterDefinition[],
  picked: CardFilterState,
) {
  return filters.flatMap((filter) => {
    const key = scryfallFields.get(filter.id)?.keys[0]
    const terms = key ? (picked[filter.id] ?? []).map((o) => filterTerm(filter, key, o)) : []
    return filter.options === "range" || filter.match === "all" || terms.length < 2
      ? terms
      : [`(${terms.join(" or ")})`]
  })
}

/**
 * why: reads one typed term back into the filter that writes it, so typed syntax lights up the
 * sheet. Undefined leaves the term as raw syntax for Scryfall. A `t:` word goes to the first
 * filter that declares it, else to the filter whose options come from cards.
 */
export function readFilterTerm(
  filters: readonly CardFilterDefinition[],
  { key, operator, value }: { key: string; operator: string; value: string },
  cardOptionsFor: (filterId: string) => readonly string[],
): { filter: CardFilterDefinition; options: readonly string[] } | undefined {
  const fields = filters.filter((filter) =>
    scryfallFields.get(filter.id)?.keys.includes(key.toLocaleLowerCase()),
  )
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
  filters: readonly CardFilterDefinition[],
  key: string,
  typed: string,
  cardOptionsFor: (filterId: string) => readonly string[],
  limit: number,
) {
  const wanted = typed.toLocaleLowerCase()
  const options = filters.flatMap((filter) =>
    filter.options !== "range" && scryfallFields.get(filter.id)?.keys.includes(key)
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
    return total + (filter.options === "range" ? Math.min(options, 1) : options)
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

const optionCache = new WeakMap<readonly MagicDatasetCard[], Map<string, readonly string[]>>()

/** why: this walks all 30k cards, so each card file keeps its counts instead of recounting on every sheet open. */
export function cardOptions(
  cards: readonly MagicDatasetCard[],
  filterId: string,
  formats: readonly string[],
): readonly string[] {
  const scoped = formats.length > 0 && cards.some((card) => card.legalFormats !== undefined)
  const key = `${filterId}:${scoped ? formats.join(",") : ""}`
  const cached = optionCache.get(cards)?.get(key)
  if (cached) return cached
  const field = scryfallFields.get(filterId)
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
  const byKey = optionCache.get(cards) ?? new Map<string, readonly string[]>()
  byKey.set(key, options)
  optionCache.set(cards, byKey)
  return options
}
