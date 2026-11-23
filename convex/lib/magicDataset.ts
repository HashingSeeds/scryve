import { type CardReference, normalizeScryfallCard, objectRecord } from "./scryfall"
import { LEGALITY_FORMATS } from "./systems"

export const MAGIC_DATASET_URL = "https://ygo-images.scryve.sow.care/datasets/mtg/cards.json"

/** why: the filter fields live only in the dataset, so Convex's stored card shape is unchanged. */
export type MagicDatasetCard = Omit<CardReference, "oracleText" | "commanderRulesUpdatedAt"> & {
  manaValue?: number
  toughness?: string
  /** why: absent means a file built before legality shipped, so search asks Scryfall instead of finding no legal cards. */
  legalFormats?: string[]
  edhrecRank?: number
  textKey?: string
}

export type MagicDataset = {
  version: string
  cards: MagicDatasetCard[]
  textIndex?: Record<string, string>
}

/**
 * why: the dataset ships in this order, so the app only checks it on load instead of sorting
 * 30k cards on the JS thread.
 */
export function compareCardNames(a: { name: string }, b: { name: string }) {
  return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
}

const NON_DECK_LAYOUTS = new Set([
  "token",
  "double_faced_token",
  "emblem",
  "art_series",
  "vanguard",
  "scheme",
  "planar",
])

const PAPER_FORMATS = [
  "standard",
  "pioneer",
  "modern",
  "legacy",
  "vintage",
  "commander",
  "pauper",
  "oldschool",
  "premodern",
  "predh",
  "paupercommander",
  "oathbreaker",
  "duel",
  "future",
]

/**
 * why: a joke, playtest or digital card is dropped only when no paper format allows it, since
 * Unfinity's black-bordered cards are legal. Legality alone can't decide: a new release is legal
 * nowhere until its legal date.
 */
function outsidePaperDecks(raw: Record<string, unknown>) {
  const legalities = objectRecord(raw.legalities)
  const parts = Array.isArray(raw.all_parts) ? raw.all_parts.map(objectRecord) : []
  const promoTypes = Array.isArray(raw.promo_types) ? raw.promo_types : []
  const meldResult = parts.some(
    (part) => part?.component === "meld_result" && part.name === raw.name,
  )
  const unusual =
    raw.set_type === "funny" ||
    raw.border_color === "silver" ||
    raw.security_stamp === "acorn" ||
    promoTypes.includes("playtest") ||
    raw.digital === true
  const paperLegal = PAPER_FORMATS.some(
    (format) => legalities?.[format] !== undefined && legalities[format] !== "not_legal",
  )
  return meldResult || (unusual && !paperLegal)
}

export function textSearchKey(text: string) {
  // why: Unicode normalization costs about a millisecond a call on Hermes, and typed searches are ASCII.
  const folded = /[^\x00-\x7f]/.test(text) ? text.normalize("NFD").replace(/\p{M}/gu, "") : text
  return folded
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

const COMMON_WORD_CARDS = 4000

/** why: building this from 600k words of card text takes seconds on a phone, so the weekly file ships each word's cards as base-36 gaps between indexes, or "" for a common word. */
export function magicTextIndex(cards: readonly MagicDatasetCard[]): Record<string, string> {
  const holders = new Map<string, number[]>()
  cards.forEach((card, index) => {
    for (const word of new Set(card.textKey?.split(" "))) {
      const list = holders.get(word) ?? []
      list.push(index)
      holders.set(word, list)
    }
  })
  return Object.fromEntries(
    [...holders].map(([word, list]) => [
      word,
      list.length > COMMON_WORD_CARDS
        ? ""
        : list.map((index, at) => (index - (list[at - 1] ?? 0)).toString(36)).join(","),
    ]),
  )
}

export function textIndexCards(list: string) {
  let index = 0
  return list.split(",").map((gap) => (index += parseInt(gap, 36)))
}

function faceDetailsWithoutOracleText(faceDetails: string): string {
  const faces: unknown = JSON.parse(faceDetails)
  if (!Array.isArray(faces)) return faceDetails
  return JSON.stringify(
    faces.map((face) => {
      const { oracleText: _oracleText, ...rest } = objectRecord(face) ?? {}
      return rest
    }),
  )
}

export function magicDatasetCard(value: unknown): MagicDatasetCard | null {
  const raw = objectRecord(value)
  if (!raw) return null
  if (typeof raw.layout === "string" && NON_DECK_LAYOUTS.has(raw.layout)) return null
  if (raw.set_type === "memorabilia" || outsidePaperDecks(raw)) return null

  const card = normalizeScryfallCard(raw)
  if (!card) return null
  const {
    oracleText,
    commanderRulesUpdatedAt: _commanderRulesUpdatedAt,
    faceDetails,
    ...rest
  } = card
  const firstFace = Array.isArray(raw.card_faces) ? objectRecord(raw.card_faces[0]) : null
  const toughness = [firstFace?.toughness, raw.toughness].find(
    (value): value is string => typeof value === "string" && value.length > 0,
  )
  const textKey = oracleText && textSearchKey(oracleText.replace(/ ?\([^()]*\)/g, ""))
  const legalities = objectRecord(raw.legalities)
  const legalFormats = LEGALITY_FORMATS.filter(
    (format) => legalities?.[format] === "legal" || legalities?.[format] === "restricted",
  )
  return {
    ...rest,
    ...(faceDetails === undefined
      ? {}
      : { faceDetails: faceDetailsWithoutOracleText(faceDetails) }),
    ...(typeof raw.cmc === "number" ? { manaValue: raw.cmc } : {}),
    ...(toughness ? { toughness } : {}),
    ...(typeof raw.edhrec_rank === "number" ? { edhrecRank: raw.edhrec_rank } : {}),
    ...(textKey ? { textKey } : {}),
    legalFormats,
  }
}
