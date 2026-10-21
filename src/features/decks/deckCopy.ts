import { translate } from "@/i18n/translate"

import { versionLabel } from "../../../convex/lib/deckVersions"
import { HIDDEN_DECK_NAME, nameFailsGate } from "../../../convex/lib/nameFilter"

// why: a percent over fewer games than this says more about luck than the deck.
export const MIN_RATED_GAMES = 10

export function recordText(record: Pick<DeckRecord, "wins" | "losses" | "draws">) {
  return `${record.wins}-${record.losses}${record.draws ? `-${record.draws}` : ""}`
}

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

export function deckVersionLabel(version: { name?: string; versionNumber: number }) {
  return version.name?.trim()
    ? versionLabel(version)
    : translate("decks:numberedVersion", { number: version.versionNumber })
}

export function deckNameWarning(name: string) {
  return nameFailsGate(name)
    ? translate("decks:hiddenNameWarning", { hiddenName: HIDDEN_DECK_NAME })
    : undefined
}

export function recordSummary(record: DeckRecord | undefined) {
  if (!record) return undefined
  if (record.games === 0) return translate("decks:record.noGames")
  if (record.games < MIN_RATED_GAMES) return recordText(record)
  return translate("decks:record.winRate", {
    percent: Math.round((record.wins / record.games) * 100),
    games: record.games,
  })
}
