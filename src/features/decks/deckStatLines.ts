import type { DeckRecord } from "./deckCopy"

export type StatsSource = "scryve" | "manual" | "all"

export const STATS_SOURCES: { value: StatsSource; label: string }[] = [
  { value: "scryve", label: "Scryve" },
  { value: "manual", label: "Manual" },
  { value: "all", label: "All" },
]

type Tally = { total: number; wins: number; losses: number; draws: number }

// why: `manual` is optional so cached rows and older query shapes still render Scryve games.
export type DeckStatsRecord = DeckRecord & {
  manual?: { matches: Tally; games: Tally }
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

export function deckStatLines(record: DeckStatsRecord, source: StatsSource): StatLine[] {
  const scryveGames = {
    total: record.games,
    wins: record.wins,
    losses: record.losses,
    draws: record.draws,
  }
  // why: Scryve matches are not recorded yet, so only manual entries contribute matches.
  const matches = source === "scryve" ? undefined : record.manual?.matches
  const games =
    source === "scryve"
      ? scryveGames
      : source === "manual"
        ? record.manual?.games
        : add(scryveGames, record.manual?.games)
  const matchLine = line("Matches", matches)
  const gameLine = line("Games", games)
  // why: Bo1 pods make both lines identical, so one line says it all.
  if (matchLine && gameLine && matchLine.text === gameLine.text) return [matchLine]
  return [matchLine, gameLine].filter((entry) => entry !== undefined)
}
