import type { CardSource, FilterField } from "./cardFilters"
import type { MagicDatasetCard } from "../../../convex/lib/magicDataset"
import type { CatalogProvider, MagicCardFilterId } from "../../../convex/lib/systems"

export type MagicFilterCard = Partial<
  Pick<
    MagicDatasetCard,
    "typeLine" | "keywords" | "power" | "toughness" | "manaValue" | "manaCost" | "legalFormats"
  >
>

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

const TYPE_KEYS = ["t", "type"]

const SCRYFALL_FIELDS = {
  format: { keys: ["f", "format", "legal"], read: (card) => card.legalFormats },
  type: { keys: TYPE_KEYS, read: (card) => typeLineWords(card.typeLine, "types") },
  supertype: { keys: TYPE_KEYS, read: (card) => typeLineWords(card.typeLine, "types") },
  subtype: { keys: TYPE_KEYS, read: (card) => typeLineWords(card.typeLine, "subtypes") },
  manaValue: { keys: ["mv", "cmc", "manavalue"], read: (card) => card.manaValue },
  manaCost: {
    keys: ["m", "mana"],
    read: (card) => card.manaCost?.match(/\{[^}]+\}/g)?.map((symbol) => symbol.slice(1, -1)),
  },
  keyword: {
    keys: ["kw", "keyword"],
    read: (card) => card.keywords?.split("\n").filter(Boolean),
  },
  power: { keys: ["pow", "power"], read: (card) => stat(card.power) },
  toughness: { keys: ["tou", "toughness"], read: (card) => stat(card.toughness) },
} satisfies Record<MagicCardFilterId, FilterField<MagicFilterCard>>

export const SCRYFALL_SOURCE: CardSource<MagicFilterCard> = new Map(Object.entries(SCRYFALL_FIELDS))

const CARD_SOURCES = { scryfall: SCRYFALL_SOURCE } satisfies Partial<
  Record<CatalogProvider, CardSource>
>

/** why: a game's search bar reads and writes filter syntax only when its catalog has a source here. */
export function cardSource(provider: string | undefined): CardSource | undefined {
  return Object.entries(CARD_SOURCES).find(([id]) => id === provider)?.[1]
}
