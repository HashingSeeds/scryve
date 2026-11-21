import { matchesCardFilters, pickedCount, type CardFilterState } from "./cardFilters"
import { type CardNameIndex, matchKey, searchCardNames } from "./cardNameMatch"
import { SCRYFALL_SOURCE } from "./cardSources"
import { matchesColors, type ColorMatch } from "./colorMatch"
import {
  compareCardNames,
  type MagicDataset,
  type MagicDatasetCard,
} from "../../../convex/lib/magicDataset"
import { MAGIC_CARD_FILTERS } from "../../../convex/lib/systems"

export const SCRYFALL_SYNTAX = /[:=<>!"()]|(^|\s)-|(^|\s)(and|or)(\s|$)/i
export const NAME_MATCHES = 20
const LOCAL_RESULTS = 60
const RARITIES = ["mythic", "rare", "uncommon", "common"]
const UNRANKED = 1e9
const BANNED_IN_COMMANDER_RANK = 0

function popularityRank(card: MagicDatasetCard | undefined) {
  const edhrecRank =
    card?.edhrecRank ?? (card?.commanderLegality === "banned" ? BANNED_IN_COMMANDER_RANK : UNRANKED)
  const rarity = RARITIES.indexOf(card?.rarity ?? "")
  return edhrecRank * (RARITIES.length + 1) + (rarity < 0 ? RARITIES.length : rarity)
}

export type MagicCards = {
  cards: MagicDatasetCard[]
  keys: string[]
  keyText: string
  keyStarts: Int32Array
  byName: Map<string, MagicDatasetCard>
  knowsLegality: boolean
}

export type MagicSearch = {
  text: string
  commander: boolean
  colors: readonly string[]
  colorMatch: ColorMatch
  filters: CardFilterState
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
  const sorted = dataset.cards.every(
    (card, index, all) => index === 0 || compareCardNames(all[index - 1], card) <= 0,
  )
  const cards = sorted ? dataset.cards : dataset.cards.sort(compareCardNames)
  const keys = cards.map((card) => matchKey(card.name))
  const keyStarts = new Int32Array(keys.length + 1)
  keys.forEach((key, index) => (keyStarts[index + 1] = keyStarts[index] + key.length + 1))
  return {
    cards,
    keys,
    keyText: keys.join("\n"),
    keyStarts,
    byName: new Map(cards.map((card) => [card.name, card])),
    knowsLegality: cards.some((card) => card.legalFormats !== undefined),
  }
}

function matchesSearch(card: MagicDatasetCard, search: MagicSearch) {
  const choosesColor = search.commander && card.commanderEligibility === "color-choice"
  return (
    (!search.commander ||
      ((card.commanderEligibility === "eligible" || choosesColor) &&
        card.commanderLegality === "legal")) &&
    // why: the color check is the cheapest, so it turns most cards away before the filters read them.
    matchesColors(card.colorIdentity, search.colors, search.colorMatch, choosesColor) &&
    matchesCardFilters(SCRYFALL_SOURCE, card, MAGIC_CARD_FILTERS, search.filters)
  )
}

/** why: the card file lacks rules text and, in older files, legality, so some searches only Scryfall answers. */
export function readsOnDevice(
  magicCards: MagicCards | undefined,
  search: Pick<MagicSearch, "text" | "filters">,
): magicCards is MagicCards {
  return Boolean(
    magicCards &&
    (!search.filters.format?.length || magicCards.knowsLegality) &&
    !SCRYFALL_SYNTAX.test(search.text) &&
    !/[^\p{ASCII}]/u.test(search.text),
  )
}

function cardsHoldingWords(magicCards: MagicCards, words: string[], search: MagicSearch) {
  const { cards, keys, keyText, keyStarts } = magicCards
  const found: MagicDatasetCard[] = []
  const keep = (index: number) => {
    if (words.every((word) => keys[index].includes(word)) && matchesSearch(cards[index], search))
      found.push(cards[index])
  }
  const longest = words.reduce((best, word) => (word.length > best.length ? word : best), "")
  if (!longest) {
    for (let index = 0; index < cards.length && found.length < LOCAL_RESULTS; index++) keep(index)
    return found
  }
  let index = 0
  for (
    let at = keyText.indexOf(longest);
    at >= 0 && found.length < LOCAL_RESULTS;
    at = keyText.indexOf(longest, keyStarts[index])
  ) {
    while (keyStarts[index + 1] <= at) index++
    keep(index++)
  }
  return found
}

export function localMagicSearch(
  magicCards: MagicCards | undefined,
  nameIndex: CardNameIndex | undefined,
  search: MagicSearch,
) {
  if (!readsOnDevice(magicCards, search)) return undefined
  const filtered =
    search.commander ||
    search.colors.length > 0 ||
    pickedCount(MAGIC_CARD_FILTERS, search.filters) > 0
  const key = matchKey(search.text)
  const words = key.length >= 2 || !filtered ? key.split(" ").filter(Boolean) : []
  if (!words.length && !filtered) return { named: [], found: [] }

  const named = (
    nameIndex && words.length
      ? searchCardNames(nameIndex, search.text, NAME_MATCHES, (name) =>
          popularityRank(magicCards.byName.get(name)),
        )
      : []
  )
    .flatMap((name) => magicCards.byName.get(name) ?? [])
    .filter((card) => matchesSearch(card, search))
  return { named, found: cardsHoldingWords(magicCards, words, search) }
}
