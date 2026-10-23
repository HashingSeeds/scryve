import { translate } from "@/i18n/translate"

import type { DeckRecord } from "./deckCopy"

export type StatsSource = "scryve" | "manual" | "all"

export function statsSourceLabel(source: StatsSource) {
  if (source === "scryve") return "Scryve"
  return source === "manual" ? translate("decks:stats.manual") : translate("decks:stats.all")
}

type Tally = { total: number; wins: number; losses: number; draws: number; unknown?: number }

type SourceCounters = { matches?: Tally; games?: Tally }

// why: envelopes are optional so cached rows and older query shapes still render Scryve games.
export type DeckStatsRecord = DeckRecord & {
  connected?: SourceCounters
  manual?: SourceCounters
}

export function allRecord(record: DeckStatsRecord): DeckRecord {
  const manual = record.manual?.matches
  return {
    games: record.games + (manual?.total ?? 0),
    wins: record.wins + (manual?.wins ?? 0),
    losses: record.losses + (manual?.losses ?? 0),
    draws: record.draws + (manual?.draws ?? 0),
    unknown: record.unknown + (manual?.unknown ?? 0),
  }
}

type KeyStatsRow = DeckRecord & {
  manualMatches?: Tally
  manualGames?: Tally
  connectedMatches?: Tally
}

export function keyStatsRecord(row: KeyStatsRow | null | undefined): DeckStatsRecord {
  return {
    games: row?.games ?? 0,
    wins: row?.wins ?? 0,
    losses: row?.losses ?? 0,
    draws: row?.draws ?? 0,
    unknown: row?.unknown ?? 0,
    connected: {
      games: {
        total: row?.games ?? 0,
        wins: row?.wins ?? 0,
        losses: row?.losses ?? 0,
        draws: row?.draws ?? 0,
      },
      ...(row?.connectedMatches ? { matches: row.connectedMatches } : {}),
    },
    manual: {
      ...(row?.manualMatches ? { matches: row.manualMatches } : {}),
      ...(row?.manualGames ? { games: row.manualGames } : {}),
    },
  }
}
