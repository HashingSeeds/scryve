import { type CardNameIndex, matchKey, searchCardNames } from "./cardNameMatch"
import { matchesColors, type ColorMatch } from "./colorMatch"
import type { MagicDataset, MagicDatasetCard } from "../../../convex/lib/magicDataset"

export const SCRYFALL_SYNTAX = /[:=<>!"()]|(^|\s)-|(^|\s)(and|or)(\s|$)/i
export const NAME_MATCHES = 20
const LOCAL_RESULTS = 60

export type MagicCards = {
  cards: MagicDatasetCard[]
  keys: string[]
  byName: Map<string, MagicDatasetCard>
}

export type MagicSearch = {
  text: string
  commander: boolean
  colors: readonly string[]
  colorMatch: ColorMatch
  keywords: readonly string[]
}

function isCard(value: unknown) {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    typeof value.name === "string" &&
    "scryfallId" in value &&
    typeof value.scryfallId === "string"
  )
}

function isMagicDataset(value: unknown): value is MagicDataset {
  return (
    typeof value === "object" &&
    value !== null &&
    "version" in value &&
    typeof value.version === "string" &&
    "cards" in value &&
    Array.isArray(value.cards) &&
    value.cards.every(isCard)
  )
}

export function parseMagicCards(text: string): MagicCards {
  const dataset: unknown = JSON.parse(text)
  if (!isMagicDataset(dataset)) throw new Error("Magic card file is malformed")
  // why: sorted once here so a search can stop at its first matches and still list A to Z.
  const cards = dataset.cards.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  return {
    cards,
    keys: cards.map((card) => matchKey(card.name)),
    byName: new Map(cards.map((card) => [card.name, card])),
  }
}

/** why: mirrors the Scryfall query scryfallQuery builds, so local and Scryfall results agree. */
function matchesSearch(card: MagicDatasetCard, search: MagicSearch) {
  const choosesColor = search.commander && card.commanderEligibility === "color-choice"
  return (
    (!search.commander ||
      ((card.commanderEligibility === "eligible" || choosesColor) &&
        card.commanderLegality === "legal")) &&
    search.keywords.every((keyword) => card.keywords?.split("\n").includes(keyword)) &&
    matchesColors(card.colorIdentity, search.colors, search.colorMatch, choosesColor)
  )
}

export function localMagicSearch(
  magicCards: MagicCards | undefined,
  nameIndex: CardNameIndex | undefined,
  search: MagicSearch,
) {
  // why: Japanese and other printed names (#871) only resolve through Scryfall.
  if (!magicCards || SCRYFALL_SYNTAX.test(search.text) || /[^\p{ASCII}]/u.test(search.text))
    return undefined
  const filtered = search.commander || search.colors.length > 0 || search.keywords.length > 0
  const key = matchKey(search.text)
  // why: like scryfallQuery, a single letter alongside filters is dropped rather than searched.
  const words = key.length >= 2 || !filtered ? key.split(" ").filter(Boolean) : []
  if (!words.length && !filtered) return { named: [], found: [] }

  const named = (
    nameIndex && words.length ? searchCardNames(nameIndex, search.text, NAME_MATCHES) : []
  )
    .flatMap((name) => magicCards.byName.get(name) ?? [])
    .filter((card) => matchesSearch(card, search))
  const found: MagicDatasetCard[] = []
  for (const [index, card] of magicCards.cards.entries()) {
    if (found.length === LOCAL_RESULTS) break
    if (words.every((word) => magicCards.keys[index].includes(word)) && matchesSearch(card, search))
      found.push(card)
  }
  return { named, found }
}
