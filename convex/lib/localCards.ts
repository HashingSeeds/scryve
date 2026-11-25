import { objectRecord } from "./scryfall"
import type { SystemId } from "./systems"

export type LocalCard = {
  /** why: the id the game's image and rulings lookups take (a Scryfall id for Magic). */
  cardId: string
  name: string
  /** why: lower is more played, so a short prefix like "light" lists the cards people mean first. */
  rank?: number
  imageUrl?: string
  smallImageUrl?: string
  manaCost?: string
  typeLine?: string
  oracleText?: string
  faceDetails?: string
  keywords?: string
  colorIdentity?: string
}

/** why: the worker, the sync and the rules sheet all read this list, so a game gets offline cards by joining it. */
export const LOCAL_CARD_GAMES = ["mtg"] as const satisfies readonly SystemId[]
export type LocalCardGame = (typeof LOCAL_CARD_GAMES)[number]

export function isLocalCardGame(game: string): game is LocalCardGame {
  return LOCAL_CARD_GAMES.some((candidate) => candidate === game)
}

export function localCardsPath(game: LocalCardGame) {
  return `/datasets/${game}/local-cards.jsonl`
}

export function localCardsUrl(game: LocalCardGame) {
  return `https://ygo-images.scryve.sow.care${localCardsPath(game)}`
}

/** why: JSON Lines (a `{ version }` header, then a card per line) lets the app parse a slice at a time, so a weekly refresh never blocks the board. */
export function encodeLocalCards(version: string, cards: readonly LocalCard[]) {
  return [JSON.stringify({ version }), ...cards.map((card) => JSON.stringify(card))].join("\n")
}

export function localCardsVersion(header: string): string {
  const version = objectRecord(JSON.parse(header))?.version
  if (typeof version !== "string") throw new Error("Local card file is missing its version")
  return version
}

export function decodeLocalCard(line: string): LocalCard | undefined {
  const card = objectRecord(JSON.parse(line))
  return typeof card?.cardId === "string" && typeof card.name === "string"
    ? (card as LocalCard)
    : undefined
}
