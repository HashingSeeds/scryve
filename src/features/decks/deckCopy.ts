import { HIDDEN_DECK_NAME, nameFailsGate } from "../../../convex/lib/nameFilter"

export type DeckRecord = {
  games: number
  wins: number
  losses: number
  draws: number
  unknown: number
}

export function cardCountLabel(quantity: number) {
  return `${quantity} ${quantity === 1 ? "card" : "cards"}`
}

export function deckNameWarning(name: string) {
  return nameFailsGate(name) ? `Other players will see "${HIDDEN_DECK_NAME}" instead.` : undefined
}

export function recordSummary(record: DeckRecord | undefined) {
  if (!record) return undefined
  if (record.games === 0) return "No games yet"
  return `${Math.round((record.wins / record.games) * 100)}% of ${record.games}`
}
