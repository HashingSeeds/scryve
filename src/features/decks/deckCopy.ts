import { formatPercent, formatRecord } from "@/i18n/format"
import { translate, translateForStorage } from "@/i18n/translate"

import { DEFAULT_VERSION_NAME, versionLabel } from "../../../convex/lib/deckVersions"
import {
  HIDDEN_COMMANDER_NAME,
  HIDDEN_DECK_NAME,
  nameFailsGate,
} from "../../../convex/lib/nameFilter"

export const MIN_RATED_GAMES = 10

export function recordText(record: Pick<DeckRecord, "wins" | "losses" | "draws">) {
  return record.draws
    ? formatRecord(record.wins, record.losses, record.draws)
    : formatRecord(record.wins, record.losses)
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

export function storedVersionName(
  version: { name?: string; versionNumber: number },
  latestVersionNumber: number,
) {
  return (
    versionLabel(version, latestVersionNumber) ??
    translateForStorage("decks:numberedVersion", { number: version.versionNumber })
  )
}

// why: the server names a new deck's first version "Current" in English and stores it, so only that generated name is translated.
export function deckVersionLabel(
  version: { name?: string; versionNumber: number },
  latestVersionNumber: number,
) {
  const name = versionLabel(version, latestVersionNumber)
  if (name === undefined)
    return translate("decks:numberedVersion", { number: version.versionNumber })
  return name === DEFAULT_VERSION_NAME && version.versionNumber === 1
    ? translate("decks:currentVersion")
    : name
}

export function versionTitle(
  version: { name?: string; versionNumber: number },
  latestVersionNumber: number,
) {
  const numbered = translate("decks:numberedVersion", { number: version.versionNumber })
  const name = deckVersionLabel(version, latestVersionNumber)
  return name === numbered
    ? numbered
    : translate("decks:deckView.version", { number: version.versionNumber, name })
}

export function deckNameWarning(name: string) {
  return nameFailsGate(name)
    ? translate("decks:hiddenNameWarning", { hiddenName: HIDDEN_DECK_NAME })
    : undefined
}

export function commanderNameWarning(name: string) {
  return nameFailsGate(name)
    ? translate("decks:hiddenNameWarning", { hiddenName: HIDDEN_COMMANDER_NAME })
    : undefined
}

export function honestRate(record: Pick<DeckRecord, "wins" | "losses" | "draws">) {
  const games = record.wins + record.losses + record.draws
  if (games < MIN_RATED_GAMES) return { text: recordText(record), tooFew: true as const, games }
  const percent = Math.round((record.wins / games) * 100)
  return { text: formatPercent(percent / 100), tooFew: false as const, games, percent }
}

export function recordSummary(record: DeckRecord | undefined) {
  if (!record) return undefined
  if (record.games === 0) return translate("decks:record.noGames")
  const rate = honestRate(record)
  if (rate.tooFew) return rate.text
  return translate("decks:record.winRate", { rate: rate.percent / 100, games: rate.games })
}
