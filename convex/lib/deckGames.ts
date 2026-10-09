import { ConvexError } from "convex/values"

import {
  SYSTEM_IDS,
  SYSTEMS,
  isSystemId,
  systemDefinition,
  type DeckSection,
  type FormatDefinition,
  type SystemId,
} from "./systems"

export type { DeckSection }
export type DeckFormat = FormatDefinition

export type DeckGame = {
  id: string
  label: string
  shortLabel: string
  available: boolean
  defaultFormat: string
  formats: readonly DeckFormat[]
}

function deckGameFor(id: SystemId): DeckGame {
  const { label, shortLabel, available, defaultFormat, formats } = SYSTEMS[id]
  return { id, label, shortLabel, available, defaultFormat: defaultFormat.deck, formats }
}

export const DECK_GAMES: Record<string, DeckGame> = Object.fromEntries(
  SYSTEM_IDS.map((id) => [id, deckGameFor(id)]),
)

export const DECK_GAME_LIST: readonly DeckGame[] = Object.values(DECK_GAMES)

export type DeckGameId = string

export const DEFAULT_DECK_GAME = "mtg" satisfies SystemId

export function deckGame(game: string): DeckGame | undefined {
  return isSystemId(game) ? DECK_GAMES[game] : undefined
}

export function assertDeckGame(game: string): DeckGameId {
  if (!deckGame(game)) throw new ConvexError({ code: "unknown_game", message: "Unknown game" })
  return game
}

export function assertPlayableDeckGame(game: string): DeckGameId {
  const known = deckGame(assertDeckGame(game))!
  if (!known.available)
    throw new ConvexError({
      code: "game_unavailable",
      message: `${known.label} decks are not supported yet`,
    })
  return known.id
}

export function assertDeckGameFormat(game: string, format: string) {
  const known = deckGame(assertPlayableDeckGame(game))!
  if (!known.formats.some((candidate) => candidate.id === format))
    throw new ConvexError({
      code: "unknown_format",
      message: `${format} is not a ${known.label} format`,
    })
  return format
}

export function deckFormats(game: string): readonly DeckFormat[] {
  return deckGame(game)?.formats ?? []
}

export function defaultDeckFormat(game: string) {
  return deckGame(game)?.defaultFormat ?? SYSTEMS[DEFAULT_DECK_GAME].defaultFormat.deck
}

export function deckFormatLabel(game: string, format: string) {
  const known = deckFormats(game).find((candidate) => candidate.id === format)
  if (known) return known.label
  return format.charAt(0).toUpperCase() + format.slice(1)
}

export function deckSections(game: string, format: string): readonly DeckSection[] {
  return deckFormats(game).find((candidate) => candidate.id === format)?.sections ?? []
}

export const PRECON_FORMATS = [
  "commander",
  "brawl",
  "standard",
  "pioneer",
  "modern",
  "constructed",
] as const

export function preconstructedFormat(type: string | undefined) {
  const value = type?.toLocaleLowerCase() ?? ""
  if (value.includes("commander")) return "commander"
  if (value.includes("brawl")) return "brawl"
  if (value.includes("pioneer challenger")) return "pioneer"
  if (value.includes("modern event")) return "modern"
  if (value === "challenger deck" || value === "event deck") return "standard"
  return "constructed"
}

export function magicCatalogCardFields(card: {
  game: string
  cardId?: string
  printingId?: string
  section: string
}) {
  if (systemDefinition(card.game)?.integration.capabilities.cardCatalog.provider !== "scryfall")
    return {}
  const board = card.section === "commander" || card.section === "sideboard" ? card.section : "main"
  return { oracleId: card.cardId, scryfallId: card.printingId, board } as const
}
