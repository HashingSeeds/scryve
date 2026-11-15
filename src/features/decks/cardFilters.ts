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

/** why: one catalog's half of a filter: where a card keeps the value, and how its search asks for it. */
type FilterField<Card> = {
  read: (card: Card) => readonly string[] | number | undefined
  query: (option: string) => string
}

const quoted = (value: string) => `"${value.replace(/["\\]/g, "")}"`

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

function rangeQuery(key: string) {
  return (option: string) => `${key}${option}`
}

function matchesOption(value: readonly string[] | number, option: string) {
  if (typeof value !== "number") return value.includes(option)
  const bound = Number(option.slice(2))
  return option.startsWith(">=") ? value >= bound : value <= bound
}

const SCRYFALL_FIELDS = {
  format: { read: (card) => card.legalFormats, query: (o) => `f:${o}` },
  type: { read: (card) => typeLineWords(card.typeLine, "types"), query: (o) => `t:${quoted(o)}` },
  supertype: {
    read: (card) => typeLineWords(card.typeLine, "types"),
    query: (o) => `t:${quoted(o)}`,
  },
  subtype: {
    read: (card) => typeLineWords(card.typeLine, "subtypes"),
    query: (o) => `t:${quoted(o)}`,
  },
  manaValue: { read: (card) => card.manaValue, query: rangeQuery("mv") },
  keyword: {
    read: (card) => card.keywords?.split("\n").filter(Boolean),
    query: (o) => `kw:${quoted(o)}`,
  },
  power: { read: (card) => stat(card.power), query: rangeQuery("pow") },
  toughness: { read: (card) => stat(card.toughness), query: rangeQuery("tou") },
} satisfies Record<MagicCardFilterId, FilterField<MagicFilterCard>>

const scryfallFields: ReadonlyMap<string, FilterField<MagicFilterCard>> = new Map(
  Object.entries(SCRYFALL_FIELDS),
)

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
    const field = scryfallFields.get(filter.id)
    const terms = field ? (picked[filter.id] ?? []).map(field.query) : []
    return filter.options === "range" || filter.match === "all" || terms.length < 2
      ? terms
      : [`(${terms.join(" or ")})`]
  })
}

export function pickedCount(filters: readonly CardFilterDefinition[], picked: CardFilterState) {
  return filters.reduce((total, filter) => {
    const options = picked[filter.id]?.length ?? 0
    return total + (filter.options === "range" ? Math.min(options, 1) : options)
  }, 0)
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
