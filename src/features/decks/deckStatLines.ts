import { translate } from "@/i18n/translate"

import type { DeckRecord } from "./deckCopy"

export const STATS_SOURCES = ["scryve", "manual", "all"] as const

export type StatsSource = (typeof STATS_SOURCES)[number]

export function statsSourceLabel(source: StatsSource) {
  if (source === "scryve") return "Scryve"
  return source === "manual" ? translate("decks:stats.manual") : translate("decks:stats.all")
}

type Tally = { total: number; wins: number; losses: number; draws: number }

type SourceCounters = { matches?: Tally; games?: Tally }

// why: envelopes are optional so cached rows and older query shapes still render Scryve games.
export type DeckStatsRecord = DeckRecord & {
  connected?: SourceCounters
  manual?: SourceCounters
}

export type StatLine = { label: "Matches" | "Games"; text: string }

export function statLineLabel(line: StatLine) {
  return line.label === "Matches"
    ? translate("decks:stats.matches")
    : translate("decks:stats.games")
}

export function statLineSummary(line: StatLine) {
  return line.label === "Matches"
    ? translate("decks:stats.matchesRecord", { record: line.text })
    : translate("decks:stats.gamesRecord", { record: line.text })
}

function add(left: Tally | undefined, right: Tally | undefined): Tally | undefined {
  if (!left) return right
  if (!right) return left
  return {
    total: left.total + right.total,
    wins: left.wins + right.wins,
    losses: left.losses + right.losses,
    draws: left.draws + right.draws,
  }
}

function line(label: StatLine["label"], tally: Tally | undefined): StatLine | undefined {
  if (!tally || tally.total === 0) return undefined
  return { label, text: `${tally.wins}-${tally.losses}-${tally.draws}` }
}

function connectedCounters(record: DeckStatsRecord): SourceCounters {
  if (record.connected) return record.connected
  return {
    games: { total: record.games, wins: record.wins, losses: record.losses, draws: record.draws },
  }
}

export function deckStatLines(record: DeckStatsRecord, source: StatsSource): StatLine[] {
  const connected = connectedCounters(record)
  const manual = record.manual ?? {}
  const counters =
    source === "scryve"
      ? connected
      : source === "manual"
        ? manual
        : {
            matches: add(connected.matches, manual.matches),
            games: add(connected.games, manual.games),
          }
  const matchLine = line("Matches", counters.matches)
  const gameLine = line("Games", counters.games)
  if (matchLine && gameLine && matchLine.text === gameLine.text) return [matchLine]
  return [matchLine, gameLine].filter((entry) => entry !== undefined)
}
