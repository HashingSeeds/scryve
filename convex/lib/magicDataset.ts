import { type CardReference, normalizeScryfallCard, objectRecord } from "./scryfall"

export const MAGIC_DATASET_URL = "https://ygo-images.scryve.sow.care/datasets/mtg/cards.json"

export type MagicDatasetCard = Omit<CardReference, "oracleText" | "commanderRulesUpdatedAt">

export type MagicDataset = { version: string; cards: MagicDatasetCard[] }

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
    oracleText: _oracleText,
    commanderRulesUpdatedAt: _commanderRulesUpdatedAt,
    faceDetails,
    ...rest
  } = card
  return faceDetails === undefined
    ? rest
    : { ...rest, faceDetails: faceDetailsWithoutOracleText(faceDetails) }
}
