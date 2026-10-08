import type { DeckRecord } from "./deckCopy"

export type StatsSource = "scryve" | "manual" | "all"

export const STATS_SOURCES: { value: StatsSource; label: string }[] = [
  { value: "scryve", label: "Scryve" },
  { value: "manual", label: "Manual" },
  { value: "all", label: "All" },
]

type Tally = { total: number; wins: number; losses: number; draws: number }

// why: an absent tally means the source has no data for that line, so it hides.
type SourceCounters = { matches?: Tally; games?: Tally }

// why: envelopes are optional so cached rows and older query shapes still render Scryve games.
export type DeckStatsRecord = DeckRecord & {
  connected?: SourceCounters
  manual?: SourceCounters
}

export type StatLine = { label: "Matches" | "Games"; text: string }

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
  // why: Bo1 pods make both lines identical, so one line says it all.
  if (matchLine && gameLine && matchLine.text === gameLine.text) return [matchLine]
  return [matchLine, gameLine].filter((entry) => entry !== undefined)
}
