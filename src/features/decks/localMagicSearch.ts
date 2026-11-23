import { matchesCardFilters, pickedCount, type CardFilterState } from "./cardFilters"
import { type CardNameIndex, matchKey, searchCardNames } from "./cardNameMatch"
import { SCRYFALL_SOURCE } from "./cardSources"
import { matchesColors, type ColorMatch } from "./colorMatch"
import {
  compareCardNames,
  type MagicDataset,
  type MagicDatasetCard,
  textIndexCards,
  textSearchKey,
} from "../../../convex/lib/magicDataset"
import { MAGIC_CARD_FILTERS } from "../../../convex/lib/systems"

export const SCRYFALL_SYNTAX = /[:=<>!"()]|(^|\s)-|(^|\s)(and|or)(\s|$)/i
export const NAME_MATCHES = 20
const LOCAL_RESULTS = 60
const TEXT_RESULTS = 60
const MIN_TEXT_SEARCH = 3
const EXCERPT_BEFORE = 24
const EXCERPT_AFTER = 40
const RARITIES = ["mythic", "rare", "uncommon", "common"]
const UNRANKED = 1e9
const BANNED_IN_COMMANDER_RANK = 0

/**
 * why: players search for a rule the cards never print ("commander tax"), so each such term maps
 * to the words the cards use. Add one only when an eval case shows the plain words miss.
 */
const TEXT_CONCEPTS: Record<string, string[]> = {
  "commander tax": ["from the command zone"],
  "board wipe": ["destroy all", "exile all"],
}

function popularityRank(card: MagicDatasetCard | undefined, knowsPopularity: boolean) {
  const edhrecRank =
    card?.edhrecRank ??
    (knowsPopularity && card?.commanderLegality === "banned" ? BANNED_IN_COMMANDER_RANK : UNRANKED)
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
  knowsPopularity: boolean
  /** why: cards with text, most played first, so a text search stops at its first page of matches instead of reading every card. */
  textCards: Int32Array
  textRank: Int32Array
  textIndex: ReadonlyMap<string, string>
  textWords: string[]
}

export type TextMatch = { card: MagicDatasetCard; excerpt: string; printed: boolean }

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
  const knowsPopularity = cards.some((card) => card.edhrecRank !== undefined)
  // why: a name search lists a Commander-banned card as most played, but a text search wants cards to play, so it ranks by EDHREC alone.
  const ranks = cards.map((card) => popularityRank(card, false))
  const textCards = Int32Array.from(cards.keys())
    .filter((index) => cards[index].textKey !== undefined)
    .sort((a, b) => ranks[a] - ranks[b])
  const textRank = new Int32Array(cards.length)
  textCards.forEach((index, position) => (textRank[index] = position))
  // why: the index counts cards in the file's order, so it is dropped if the cards had to be sorted.
  const textIndex = new Map(sorted ? Object.entries(dataset.textIndex ?? {}) : [])
  return {
    cards,
    keys,
    keyText: keys.join("\n"),
    keyStarts,
    byName: new Map(cards.map((card) => [card.name, card])),
    knowsLegality: cards.some((card) => card.legalFormats !== undefined),
    knowsPopularity,
    textCards,
    textRank,
    textIndex,
    textWords: [...textIndex.keys()].sort(),
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

/** why: the card file holds only words of rules text and, in older files, no legality, so Scryfall syntax and some filters only Scryfall answers. */
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

function wordsStarting(words: readonly string[], start: string) {
  let low = 0
  let high = words.length
  while (low < high) {
    const middle = (low + high) >> 1
    if (words[middle] < start) low = middle + 1
    else high = middle
  }
  const found: string[] = []
  for (let at = low; at < words.length && words[at].startsWith(start); at++) found.push(words[at])
  return found
}

/** why: a word still being typed matches every word it starts; undefined means one is too common to list, so no list narrows the search. */
function listsStarting(magicCards: MagicCards, word: string) {
  const lists = wordsStarting(magicCards.textWords, word).map(
    (each) => magicCards.textIndex.get(each) ?? "",
  )
  return lists.includes("") ? undefined : lists
}

/** why: only the rarest word's cards are read; with only common words, reading from the most played card fills a page quickly, so a phone never reads all 30k texts for a common phrase. */
function textPositions(
  magicCards: MagicCards,
  phrase: string,
  keep: (position: number) => boolean,
  loose: boolean,
) {
  const { cards, textCards, textRank } = magicCards
  const words = phrase.split(" ")
  const size = (lists: string[]) => lists.reduce((total, list) => total + list.length, 0)
  // why: a list's length in characters tracks its card count, so only the rarest word's list is read.
  const rarest = words
    .map((word) => listsStarting(magicCards, word))
    .reduce<string[] | undefined>(
      (best, lists) => (lists && (!best || size(lists) < size(best)) ? lists : best),
      undefined,
    )
    ?.flatMap(textIndexCards)
  const positions = rarest && Int32Array.from(rarest, (index) => textRank[index]).sort()
  // why: with only common words this loop reads thousands of cards, so it builds no strings per card.
  const starts = [phrase, ...words].map((start) => ({ start, inside: ` ${start}` }))
  const holds = (text: string, { start, inside }: (typeof starts)[number]) =>
    text.startsWith(start) || text.includes(inside)
  const [whole, ...each] = starts
  const exact: number[] = []
  const others: number[] = []
  const count = positions ? positions.length : textCards.length
  for (let at = 0; at < count && exact.length < TEXT_RESULTS; at++) {
    const position = positions ? positions[at] : at
    if (positions && at > 0 && position === positions[at - 1]) continue
    const text = cards[textCards[position]].textKey ?? ""
    if (holds(text, whole)) {
      if (keep(position)) exact.push(position)
    } else if (
      loose &&
      others.length < TEXT_RESULTS &&
      each.every((word) => holds(text, word)) &&
      keep(position)
    )
      others.push(position)
  }
  return { exact, others }
}

function excerpt(text: string, phrase: string) {
  const at = ` ${text}`.indexOf(` ${phrase}`)
  const start = at <= EXCERPT_BEFORE ? 0 : text.indexOf(" ", at - EXCERPT_BEFORE) + 1
  const end = text.indexOf(" ", at + phrase.length + EXCERPT_AFTER)
  return `${start ? "…" : ""}${text.slice(start, end < 0 ? undefined : end)}${end < 0 ? "" : "…"}`
}

/**
 * why: a phrase the card prints comes first, then cards holding every word in any order, so a
 * search for what a card does is never empty when cards plainly relate.
 */
function cardsWithText(
  magicCards: MagicCards,
  search: MagicSearch,
  shown: ReadonlySet<string>,
): TextMatch[] {
  const key = textSearchKey(search.text)
  if (key.length < MIN_TEXT_SEARCH) return []
  const { cards, textCards } = magicCards
  const cardAt = (position: number) => cards[textCards[position]]
  const keep = (position: number) =>
    !shown.has(cardAt(position).name) && matchesSearch(cardAt(position), search)
  const typed = textPositions(magicCards, key, keep, true)
  const concepts = Object.entries(TEXT_CONCEPTS).flatMap(([concept, wordings]) =>
    ` ${key} `.includes(` ${concept} `)
      ? wordings.map((wording) => key.replace(concept, wording))
      : [],
  )
  const exact = [
    ...typed.exact.map((position) => ({ position, phrase: key })),
    ...concepts.flatMap((phrase) =>
      textPositions(magicCards, phrase, keep, false).exact.map((position) => ({
        position,
        phrase,
      })),
    ),
  ].sort((a, b) => a.position - b.position)
  const longest = key.split(" ").reduce((best, word) => (word.length > best.length ? word : best))
  const listed = new Map<number, { phrase: string; printed: boolean }>()
  for (const { position, phrase } of exact)
    if (!listed.has(position)) listed.set(position, { phrase, printed: true })
  for (const position of typed.others)
    if (!listed.has(position)) listed.set(position, { phrase: longest, printed: false })
  return [...listed].slice(0, TEXT_RESULTS).map(([position, { phrase, printed }]) => {
    const card = cardAt(position)
    return { card, excerpt: excerpt(card.textKey ?? "", phrase), printed }
  })
}

/** why: `text` also holds any match lifted into `named`, so the screen can label it with the words it matched. */
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
  if (!words.length && !filtered) return { named: [], found: [], text: [] }

  const named = (
    nameIndex && words.length
      ? searchCardNames(nameIndex, search.text, NAME_MATCHES, (name) =>
          popularityRank(magicCards.byName.get(name), magicCards.knowsPopularity),
        )
      : []
  )
    .flatMap((name) => magicCards.byName.get(name) ?? [])
    .filter((card) => matchesSearch(card, search))
  const found = cardsHoldingWords(magicCards, words, search)
  // why: when no card name holds every typed word, the closest names are guesses ("commander tax" finds Ant-Man, Colony Commander), so cards printing the phrase lead.
  const guessed = found.length === 0
  const text = cardsWithText(
    magicCards,
    search,
    new Set([...(guessed ? [] : named), ...found].map((card) => card.name)),
  )
  const printed = guessed ? text.filter((match) => match.printed).map(({ card }) => card) : []
  const lead = new Set(printed.map((card) => card.name))
  return { named: [...printed, ...named.filter((card) => !lead.has(card.name))], found, text }
}
