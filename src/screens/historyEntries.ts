import type { LocalGameSummary } from "@/features/game/types"

export type HistorySource = "local" | "connected"
export type HistoryOutcome = "win" | "loss" | "draw" | "unrecorded"

export interface HistoryPlayerSummary {
  id: string
  name: string
  color?: string
  deckName?: string
}

export interface HistoryEntry {
  key: string
  source: HistorySource
  routeId: string
  finishedAt: number
  status: "finished" | "abandoned"
  outcome: HistoryOutcome
  winnerNames?: string[]
  eventCount: number
  players: HistoryPlayerSummary[]
  format: string
}

export function localHistoryEntry(game: LocalGameSummary): HistoryEntry {
  const result = game.result
  const winnerNames =
    result?.kind === "win"
      ? game.players
          .filter((player) => result.winnerPlayerIds.includes(player.id))
          .map((player) => player.name)
      : []
  return {
    key: `local:${game.id}`,
    source: "local",
    routeId: game.id,
    finishedAt: game.finishedAt,
    status: game.status,
    outcome: result?.kind === "draw" ? "draw" : winnerNames.length > 0 ? "win" : "unrecorded",
    ...(winnerNames.length > 0 ? { winnerNames } : {}),
    eventCount: game.eventCount,
    players: game.players.map((player) => ({
      id: player.id,
      name: player.name,
      color: player.color,
    })),
    format: `${game.startingLife} life`,
  }
}

export function connectedHistoryEntry(game: {
  publicId: string
  outcome?: "win" | "loss" | "draw" | "unknown"
  eventCount: number
  finishedAt: number
  ruleset?: string
  startingLife?: number
  terminalStatus?: string
  players: {
    playerId?: string
    displayName?: string
    color?: string
    deckNameAtFinish?: string
  }[]
}): HistoryEntry {
  return {
    key: `connected:${game.publicId}`,
    source: "connected",
    routeId: game.publicId,
    finishedAt: game.finishedAt,
    status: game.terminalStatus === "abandoned" ? "abandoned" : "finished",
    outcome:
      game.outcome === "win" || game.outcome === "loss" || game.outcome === "draw"
        ? game.outcome
        : "unrecorded",
    eventCount: game.eventCount,
    players: (game.players ?? []).map((player, index) => ({
      id: player.playerId ?? `${game.publicId}:${index}`,
      name: player.displayName ?? "",
      color: player.color,
      deckName: player.deckNameAtFinish,
    })),
    format: game.ruleset ?? (game.startingLife ? `${game.startingLife} life` : "connected"),
  }
}

export type DateRange = "any" | "7d" | "30d" | "year"

export interface HistoryFilters {
  source: "all" | HistorySource
  dateRange: DateRange
  players: string[]
  decks: string[]
  outcomes: HistoryOutcome[]
  podSizes: number[]
  formats: string[]
}

export const POD_SIZE_MAX = 5
export const NO_FILTERS: HistoryFilters = {
  source: "all",
  dateRange: "any",
  players: [],
  decks: [],
  outcomes: [],
  podSizes: [],
  formats: [],
}

const DAY_MS = 24 * 60 * 60 * 1000
const RANGE_DAYS: Record<Exclude<DateRange, "any" | "year">, number> = { "7d": 7, "30d": 30 }

export const DATE_RANGE_LABELS: Record<DateRange, string> = {
  "any": "Any time",
  "7d": "Last 7 days",
  "30d": "Last 30 days",
  "year": "This year",
}

export const OUTCOME_LABELS: Record<HistoryOutcome, string> = {
  win: "Win",
  loss: "Loss",
  draw: "Draw",
  unrecorded: "No result",
}

export function podSizeLabel(size: number) {
  if (size === 1) return "Solo"
  return size >= POD_SIZE_MAX ? `${POD_SIZE_MAX}+ players` : `${size} players`
}

function matchesDateRange(finishedAt: number, range: DateRange, now: number) {
  if (range === "any") return true
  if (range === "year") return new Date(finishedAt).getFullYear() === new Date(now).getFullYear()
  return finishedAt >= now - RANGE_DAYS[range] * DAY_MS
}

function podSizeBucket(playerCount: number) {
  return Math.min(Math.max(playerCount, 1), POD_SIZE_MAX)
}

export function entryDeckNames(entry: HistoryEntry) {
  return entry.players.map((player) => player.deckName).filter(Boolean) as string[]
}

export function entryPlayerNames(entry: HistoryEntry) {
  return entry.players.map((player) => player.name).filter(Boolean)
}

export function filtersActive(filters: HistoryFilters) {
  return (
    filters.source !== "all" ||
    filters.dateRange !== "any" ||
    filters.players.length > 0 ||
    filters.decks.length > 0 ||
    filters.outcomes.length > 0 ||
    filters.podSizes.length > 0 ||
    filters.formats.length > 0
  )
}

export function activeFilterCount(filters: HistoryFilters) {
  return (
    (filters.source === "all" ? 0 : 1) +
    (filters.dateRange === "any" ? 0 : 1) +
    filters.players.length +
    filters.decks.length +
    filters.outcomes.length +
    filters.podSizes.length +
    filters.formats.length
  )
}

export function filterOptions(entries: HistoryEntry[]) {
  const players = new Set<string>()
  const decks = new Set<string>()
  const formats = new Set<string>()
  const podSizes = new Set<number>()
  for (const entry of entries) {
    entryPlayerNames(entry).forEach((name) => players.add(name))
    entryDeckNames(entry).forEach((deck) => decks.add(deck))
    formats.add(entry.format)
    podSizes.add(podSizeBucket(entry.players.length))
  }
  const byName = (a: string, b: string) => a.localeCompare(b)
  return {
    players: [...players].sort(byName),
    decks: [...decks].sort(byName),
    formats: [...formats].sort(byName),
    podSizes: [...podSizes].sort((a, b) => a - b),
  }
}

export function filterHistory(entries: HistoryEntry[], filters: HistoryFilters, now: number) {
  return entries.filter((entry) => {
    if (filters.source !== "all" && entry.source !== filters.source) return false
    if (!matchesDateRange(entry.finishedAt, filters.dateRange, now)) return false
    if (filters.outcomes.length > 0 && !filters.outcomes.includes(entry.outcome)) return false
    if (filters.formats.length > 0 && !filters.formats.includes(entry.format)) return false
    if (
      filters.podSizes.length > 0 &&
      !filters.podSizes.includes(podSizeBucket(entry.players.length))
    )
      return false
    if (filters.players.length > 0) {
      const names = entryPlayerNames(entry)
      if (!filters.players.every((name) => names.includes(name))) return false
    }
    if (filters.decks.length > 0) {
      const decks = entryDeckNames(entry)
      if (!filters.decks.some((deck) => decks.includes(deck))) return false
    }
    return true
  })
}

export function sortedByRecency(entries: HistoryEntry[]) {
  return [...entries].sort((a, b) => b.finishedAt - a.finishedAt)
}

export function tallyOutcomes(entries: HistoryEntry[]) {
  return {
    wins: entries.filter((entry) => entry.outcome === "win").length,
    losses: entries.filter((entry) => entry.outcome === "loss").length,
    draws: entries.filter((entry) => entry.outcome === "draw").length,
  }
}

function startOfDay(timestamp: number) {
  const date = new Date(timestamp)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

export function dayLabel(timestamp: number, now: number) {
  const daysAgo = Math.round((startOfDay(now) - startOfDay(timestamp)) / DAY_MS)
  if (daysAgo <= 0) return "Today"
  if (daysAgo === 1) return "Yesterday"
  const date = new Date(timestamp)
  if (daysAgo < 7) return date.toLocaleDateString(undefined, { weekday: "long" })
  return date.toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    ...(date.getFullYear() === new Date(now).getFullYear() ? {} : { year: "numeric" }),
  })
}

export function daySections(entries: HistoryEntry[], now: number) {
  const sections: { label: string; data: HistoryEntry[] }[] = []
  for (const entry of entries) {
    const label = dayLabel(entry.finishedAt, now)
    const current = sections.at(-1)
    if (current?.label === label) current.data.push(entry)
    else sections.push({ label, data: [entry] })
  }
  return sections
}
