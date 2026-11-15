import type { MagicDatasetCard } from "../../../convex/lib/magicDataset"
import type { CardFilterDefinition, MagicCardFilterId } from "../../../convex/lib/systems"

export type CardFilterState = Readonly<Record<string, readonly string[]>>

export type MagicFilterCard = Partial<
  Pick<MagicDatasetCard, "typeLine" | "keywords" | "power" | "toughness" | "manaValue">
>

/** why: one catalog's half of a filter: where a card keeps the value, and how its search asks for it. */
type FilterField<Card> = {
  read: (card: Card) => readonly string[] | number | undefined
  query: (option: string) => string
}

const MIN_CARDS_PER_OPTION = 3

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

function numberQuery(key: string) {
  return (option: string) =>
    option.endsWith("+") ? `${key}>=${Number.parseInt(option)}` : `${key}=${option}`
}

function matchesOption(value: readonly string[] | number, option: string) {
  if (typeof value !== "number") return value.includes(option)
  return option.endsWith("+") ? value >= Number.parseInt(option) : value === Number(option)
}

const SCRYFALL_FIELDS = {
  type: { read: (card) => typeLineWords(card.typeLine, "types"), query: (o) => `t:${quoted(o)}` },
  supertype: {
    read: (card) => typeLineWords(card.typeLine, "types"),
    query: (o) => `t:${quoted(o)}`,
  },
  subtype: {
    read: (card) => typeLineWords(card.typeLine, "subtypes"),
    query: (o) => `t:${quoted(o)}`,
  },
  manaValue: { read: (card) => card.manaValue, query: numberQuery("mv") },
  keyword: {
    read: (card) => card.keywords?.split("\n").filter(Boolean),
    query: (o) => `kw:${quoted(o)}`,
  },
  power: { read: (card) => stat(card.power), query: numberQuery("pow") },
  toughness: { read: (card) => stat(card.toughness), query: numberQuery("tou") },
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
    return filter.match === "any" ? options.some(has) : options.every(has)
  })
}

export function scryfallFilterTerms(
  filters: readonly CardFilterDefinition[],
  picked: CardFilterState,
) {
  return filters.flatMap((filter) => {
    const field = scryfallFields.get(filter.id)
    const terms = field ? (picked[filter.id] ?? []).map(field.query) : []
    return filter.match === "all" || terms.length < 2 ? terms : [`(${terms.join(" or ")})`]
  })
}

export function pickedCount(picked: CardFilterState) {
  return Object.values(picked).reduce((total, options) => total + options.length, 0)
}

export function togglePicked(picked: CardFilterState, filterId: string, option: string) {
  const current = picked[filterId] ?? []
  return {
    ...picked,
    [filterId]: current.includes(option)
      ? current.filter((value) => value !== option)
      : [...current, option],
  }
}

const optionCache = new WeakMap<readonly MagicDatasetCard[], Map<string, readonly string[]>>()

/** why: this walks all 30k cards, so each card file keeps its counts instead of recounting on every sheet open. */
export function cardOptions(
  cards: readonly MagicDatasetCard[],
  filterId: string,
  format: string | undefined,
): readonly string[] {
  const scoped = format !== undefined && cards.some((card) => card.legalFormats !== undefined)
  const key = `${filterId}:${scoped ? format : ""}`
  const cached = optionCache.get(cards)?.get(key)
  if (cached) return cached
  const field = scryfallFields.get(filterId)
  const counts = new Map<string, number>()
  for (const card of field ? cards : []) {
    if (scoped && !card.legalFormats?.includes(format)) continue
    const value = field?.read(card)
    if (value === undefined || typeof value === "number") continue
    for (const option of new Set(value)) counts.set(option, (counts.get(option) ?? 0) + 1)
  }
  const options = [...counts]
    .filter(([, count]) => count >= MIN_CARDS_PER_OPTION)
    .sort(([a, countA], [b, countB]) => countB - countA || a.localeCompare(b))
    .map(([option]) => option)
  const byKey = optionCache.get(cards) ?? new Map<string, readonly string[]>()
  byKey.set(key, options)
  optionCache.set(cards, byKey)
  return options
}
