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
  if (raw.set_type === "memorabilia") return null

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
