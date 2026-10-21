import type { FunctionReturnType } from "convex/server"

import { MIN_RATED_GAMES, recordText } from "@/features/decks/deckCopy"
import type { StatsSource } from "@/features/decks/deckStatLines"

import type { api } from "../../../convex/_generated/api"

export type DeckSummary = FunctionReturnType<typeof api.deckStats.summary>
export type StatsSlice = DeckSummary["slices"][number]
export type RecordCounts = Pick<StatsSlice, "games" | "wins" | "losses" | "draws">

export function sumSlices(
  slices: readonly StatsSlice[],
  source: StatsSource = "all",
  filter: { fingerprint?: string | null; podSize?: number | null } = {},
): RecordCounts {
  return slices.reduce(
    (total, slice) => {
      if (source !== "all" && slice.source !== source) return total
      if (filter.fingerprint !== undefined && slice.fingerprint !== filter.fingerprint) return total
      if (filter.podSize !== undefined && slice.podSize !== filter.podSize) return total
      return {
        games: total.games + slice.games,
        wins: total.wins + slice.wins,
        losses: total.losses + slice.losses,
        draws: total.draws + slice.draws,
      }
    },
    { games: 0, wins: 0, losses: 0, draws: 0 },
  )
}

export function exactRecord(row: DeckSummary["all"], source: StatsSource): RecordCounts {
  const scryve = {
    games: row?.games ?? 0,
    wins: row?.wins ?? 0,
    losses: row?.losses ?? 0,
    draws: row?.draws ?? 0,
  }
  const manual = row?.manualMatches
  if (source === "scryve") return scryve
  return {
    games: (source === "all" ? scryve.games : 0) + (manual?.total ?? 0),
    wins: (source === "all" ? scryve.wins : 0) + (manual?.wins ?? 0),
    losses: (source === "all" ? scryve.losses : 0) + (manual?.losses ?? 0),
    draws: (source === "all" ? scryve.draws : 0) + (manual?.draws ?? 0),
  }
}

export { recordText }

export function honestRate(record: RecordCounts) {
  return {
    text:
      record.games < MIN_RATED_GAMES
        ? recordText(record)
        : `${Math.round((record.wins / record.games) * 100)}%`,
    tooFew: record.games < MIN_RATED_GAMES,
    games: record.games,
  }
}

export function chanceRate(slices: readonly StatsSlice[], source: StatsSource = "all") {
  let games = 0
  let chance = 0
  for (const slice of slices) {
    if (
      slice.podSize === null ||
      slice.podSize <= 0 ||
      (source !== "all" && slice.source !== source)
    )
      continue
    games += slice.games
    chance += slice.games / slice.podSize
  }
  return games ? chance / games : undefined
}

export function likelyRange({ wins, games }: RecordCounts) {
  if (!games) return undefined
  const z = 1.645
  const p = wins / games
  const denominator = 1 + (z * z) / games
  const center = (p + (z * z) / (2 * games)) / denominator
  const radius = (z * Math.sqrt((p * (1 - p) + (z * z) / (4 * games)) / games)) / denominator
  return { low: Math.round(100 * (center - radius)), high: Math.round(100 * (center + radius)) }
}

export function listStats(summary: DeckSummary, source: StatsSource) {
  const fingerprints = new Set([
    ...summary.lists.map((row) => row.fingerprint),
    ...summary.slices.map((slice) => slice.fingerprint),
  ])
  const rows = [...fingerprints].map((fingerprint) => {
    const slices = summary.slices.filter((slice) => slice.fingerprint === fingerprint)
    const exact = summary.lists.find((row) => row.fingerprint === fingerprint)
    const firstAt = slices.length ? Math.min(...slices.map((slice) => slice.firstAt)) : undefined
    const lastAt = slices.length ? Math.max(...slices.map((slice) => slice.lastAt)) : undefined
    return {
      fingerprint,
      record: exact ? exactRecord(exact, source) : sumSlices(slices, source),
      firstAt,
      lastAt,
      sortAt: lastAt ?? 0,
    }
  })
  rows.sort((a, b) => b.sortAt - a.sortAt)
  let trackedIndex = 0
  return rows.map((row) => {
    const index = row.fingerprint === null ? undefined : trackedIndex++
    const label =
      index === undefined
        ? ("untracked" as const)
        : index === 0
          ? ("current" as const)
          : index === 1
            ? ("previous" as const)
            : ("dated" as const)
    return { ...row, label }
  })
}
