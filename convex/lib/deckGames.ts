import { ConvexError } from "convex/values"

export type DeckSection = { id: string; label: string }

export type DeckFormat = {
  id: string
  label: string
  blurb?: string
  sections: readonly DeckSection[]
}

const MTG_COMMANDER_SECTIONS = [
  { id: "commander", label: "Commander" },
  { id: "main", label: "Main deck" },
  { id: "sideboard", label: "Sideboard" },
] as const

const MTG_CONSTRUCTED_SECTIONS = [
  { id: "main", label: "Main deck" },
  { id: "sideboard", label: "Sideboard" },
] as const

const YUGIOH_SECTIONS = [
  { id: "main", label: "Main Deck" },
  { id: "extra", label: "Extra Deck" },
  { id: "side", label: "Side Deck" },
] as const

export type DeckGame = {
  id: string
  label: string
  shortLabel: string
  available: boolean
  defaultFormat: string
  formats: readonly DeckFormat[]
}

const MTG_FORMATS = [
  {
    id: "commander",
    label: "Commander",
    blurb: "100 cards, singleton, one commander",
    sections: MTG_COMMANDER_SECTIONS,
  },
  {
    id: "standard",
    label: "Standard",
    blurb: "60 cards from recent sets",
    sections: MTG_CONSTRUCTED_SECTIONS,
  },
  {
    id: "pioneer",
    label: "Pioneer",
    blurb: "60 cards, Return to Ravnica forward",
    sections: MTG_CONSTRUCTED_SECTIONS,
  },
  {
    id: "modern",
    label: "Modern",
    blurb: "60 cards, 8th Edition forward",
    sections: MTG_CONSTRUCTED_SECTIONS,
  },
  {
    id: "legacy",
    label: "Legacy",
    blurb: "60 cards, nearly every set",
    sections: MTG_CONSTRUCTED_SECTIONS,
  },
  {
    id: "vintage",
    label: "Vintage",
    blurb: "60 cards, restricted list",
    sections: MTG_CONSTRUCTED_SECTIONS,
  },
  {
    id: "pauper",
    label: "Pauper",
    blurb: "60 cards, commons only",
    sections: MTG_CONSTRUCTED_SECTIONS,
  },
  {
    id: "brawl",
    label: "Brawl",
    blurb: "60 cards, singleton, one commander",
    sections: MTG_COMMANDER_SECTIONS,
  },
  {
    id: "limited",
    label: "Limited",
    blurb: "Draft and sealed pools",
    sections: MTG_CONSTRUCTED_SECTIONS,
  },
  {
    id: "constructed",
    label: "Constructed",
    blurb: "Anything else you build",
    sections: MTG_CONSTRUCTED_SECTIONS,
  },
] as const

const YUGIOH_FORMATS = [
  { id: "advanced", label: "Advanced", sections: YUGIOH_SECTIONS },
  { id: "traditional", label: "Traditional", sections: YUGIOH_SECTIONS },
  { id: "speed", label: "Speed Duel", sections: YUGIOH_SECTIONS },
] as const

export const DECK_GAMES: Record<string, DeckGame> = {
  mtg: {
    id: "mtg",
    label: "Magic: The Gathering",
    shortLabel: "Magic",
    available: true,
    defaultFormat: "commander",
    formats: MTG_FORMATS,
  },
  ygo: {
    id: "ygo",
    label: "Yu-Gi-Oh!",
    shortLabel: "Yu-Gi-Oh!",
    available: false,
    defaultFormat: "advanced",
    formats: YUGIOH_FORMATS,
  },
}

export const DECK_GAME_LIST: readonly DeckGame[] = Object.values(DECK_GAMES)

export type DeckGameId = string

export const DEFAULT_DECK_GAME = "mtg"

export function deckGame(game: string): DeckGame | undefined {
  return Object.prototype.hasOwnProperty.call(DECK_GAMES, game) ? DECK_GAMES[game] : undefined
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

export function deckFormats(game: string): readonly DeckFormat[] {
  return deckGame(game)?.formats ?? []
}

export function defaultDeckFormat(game: string) {
  return deckGame(game)?.defaultFormat ?? MTG_FORMATS[0].id
}

export function deckFormatLabel(game: string, format: string) {
  const known = deckFormats(game).find((candidate) => candidate.id === format)
  if (known) return known.label
  return format.charAt(0).toUpperCase() + format.slice(1)
}

export function deckSections(game: string, format: string): readonly DeckSection[] {
  return deckFormats(game).find((candidate) => candidate.id === format)?.sections ?? []
}

export const PRECON_FORMATS = ["commander", "brawl", "constructed"] as const

export function preconSearchFormat(format: string): string | undefined {
  return (PRECON_FORMATS as readonly string[]).includes(format) ? format : undefined
}

export function preconstructedFormat(type: string | undefined) {
  const value = type?.toLocaleLowerCase() ?? ""
  if (value.includes("commander")) return "commander"
  if (value.includes("brawl")) return "brawl"
  return "constructed"
}
