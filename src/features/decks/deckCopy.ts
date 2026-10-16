import { translate } from "@/i18n/translate"

import { HIDDEN_DECK_NAME, nameFailsGate } from "../../../convex/lib/nameFilter"

export type DeckRecord = {
  games: number
  wins: number
  losses: number
  draws: number
  unknown: number
}

export function cardCountLabel(quantity: number) {
  return translate("decks:cardCount", { count: quantity })
}

export function deckNameWarning(name: string) {
  return nameFailsGate(name)
    ? translate("decks:hiddenNameWarning", { hiddenName: HIDDEN_DECK_NAME })
    : undefined
}

export function recordSummary(record: DeckRecord | undefined) {
  if (!record) return undefined
  if (record.games === 0) return translate("decks:record.noGames")
  return translate("decks:record.winRate", {
    percent: Math.round((record.wins / record.games) * 100),
    games: record.games,
  })
}
