import { ConvexError } from "convex/values"

export const DECK_GAMES = {
  mtg: { label: "Magic: The Gathering", defaultFormat: "commander" },
} as const

export type DeckGameId = keyof typeof DECK_GAMES

export const DEFAULT_DECK_GAME: DeckGameId = "mtg"

export function assertDeckGame(game: string): DeckGameId {
  if (!Object.prototype.hasOwnProperty.call(DECK_GAMES, game))
    throw new ConvexError({ code: "unknown_game", message: "Unknown game" })
  return game as DeckGameId
}

export function preconstructedFormat(type: string | undefined) {
  return type?.toLocaleLowerCase().includes("commander") ? "commander" : "constructed"
}
