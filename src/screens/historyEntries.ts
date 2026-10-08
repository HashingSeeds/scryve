import { matchScoreAfter, matchScoreLabel } from "@/features/game/domain"
import {
  counterValueLabel,
  NO_PLAY_SYSTEM,
  playFormatLabel,
  isPlaySystemId,
  PLAY_SYSTEM_IDS,
  playSystemId,
  playSystemRules,
  type PlaySystemId,
} from "@/features/game/playSystems"
import type { LocalGameMatch, LocalGameSummary } from "@/features/game/types"

export type HistorySource = "local" | "connected" | "manual"
export type HistoryOutcome = "win" | "loss" | "draw" | "unrecorded"

export interface HistoryPlayerSummary {
  id: string
  name: string
  color?: string
  deckName?: string
}

export interface HistoryMatchDetails {
  bestOf: number
  /** why: manual rows read "vs ..."; a Scryve match lists its players like a game row. */
  opponents?: string[]
  deckName?: string
  // why: "2-1" or "2-1-1" when the owner entered a game score, otherwise nothing to show.
  score?: string
  eventName?: string
  roundNumber?: number
  /** why: a Scryve match folds its games under one row, newest first. */
  games?: HistoryEntry[]
  inProgress?: boolean
}

/** why: what one game row knows about its whole match; the group takes the most complete standing. */
export interface HistoryMatchStanding {
  finished: boolean
  outcome: HistoryOutcome
  score?: string
}

export interface HistoryMatchRef {
  publicId: string
  bestOf: number
  standing: HistoryMatchStanding
  /** why: the ordinal the device or server stored; the group falls back to time order only when none did. */
  gameNumber?: number
}

export interface HistoryEntry {
  key: string
  source: HistorySource
  routeId: string
  finishedAt: number
  status: "finished" | "abandoned"
  outcome: HistoryOutcome
  winnerNames?: string[]
  eventCount?: number
  players: HistoryPlayerSummary[]
  system?: PlaySystemId
  format: string
  match?: HistoryMatchDetails
  /** why: set on a game played inside a Scryve match; `groupMatchGames` folds these rows away. */
  scryveMatch?: HistoryMatchRef
}

export function matchGroupKey(publicId: string) {
  return `scryve-match:${publicId}`
}

export const SOURCE_LABELS: Record<HistorySource, string> = {
  local: "Local",
  connected: "Connected",
  manual: "Manual",
}

function toHistoryOutcome(outcome: string | undefined): HistoryOutcome {
  return outcome === "win" || outcome === "loss" || outcome === "draw" ? outcome : "unrecorded"
}

export type ManualMatchSeat = {
  seat: number
  displayName: string
  deckName?: string
  gamesWon?: number
  gamesDrawn?: number
  outcome?: "win" | "loss" | "draw" | "unknown"
  mine: boolean
}

export function manualMatchScore(seats: readonly ManualMatchSeat[]) {
  const mine = seats.find((seat) => seat.mine)
  if (mine?.gamesWon === undefined) return undefined
  const losses = seats
    .filter((seat) => !seat.mine)
    .reduce((sum, seat) => sum + (seat.gamesWon ?? 0), 0)
  const draws = mine.gamesDrawn ?? 0
  return draws > 0 ? `${mine.gamesWon}-${losses}-${draws}` : `${mine.gamesWon}-${losses}`
}

export function manualHistoryEntry(match: {
  publicId: string
  bestOf: number
  system?: string
  format?: string
  eventName?: string
  roundNumber?: number
  finishedAt: number
  outcome?: "win" | "loss" | "draw" | "unknown"
  seats: readonly ManualMatchSeat[]
}): HistoryEntry {
  const system = match.system === undefined ? undefined : playSystemId(match.system)
  const winnerNames = match.seats
    .filter((seat) => seat.outcome === "win")
    .map((seat) => seat.displayName)
  const score = manualMatchScore(match.seats)
  const mine = match.seats.find((seat) => seat.mine)
  return {
    key: `manual:${match.publicId}`,
    source: "manual",
    routeId: match.publicId,
    finishedAt: match.finishedAt,
    status: "finished",
    outcome: toHistoryOutcome(match.outcome),
    ...(winnerNames.length > 0 ? { winnerNames } : {}),
    system,
    players: match.seats.map((seat) => ({
      id: `${match.publicId}:${seat.seat}`,
      name: seat.displayName,
      deckName: seat.deckName,
    })),
    // why: a deckless manual match has no system, so it files under a plain "Match" format.
    format: system && match.format ? playFormatLabel(system, match.format) : "Match",
    match: {
      bestOf: match.bestOf,
      opponents: match.seats.filter((seat) => !seat.mine).map((seat) => seat.displayName),
      ...(mine?.deckName ? { deckName: mine.deckName } : {}),
      ...(score ? { score } : {}),
      ...(match.eventName ? { eventName: match.eventName } : {}),
      ...(match.roundNumber === undefined ? {} : { roundNumber: match.roundNumber }),
    },
  }
}

// why: the account's own seat turns a table result into a personal win or loss, like the server does; an owned game with no seat stays unrecorded so the tally matches the server's unknown outcome.
function localOutcome(game: LocalGameSummary, winnerNames: string[]): HistoryOutcome {
  const result = game.result
  const me = game.account?.mePlayerId
  if (game.account && !me) return "unrecorded"
  if (result?.kind === "draw") return "draw"
  if (result?.kind !== "win" || winnerNames.length === 0) return "unrecorded"
  if (!me) return "win"
  return result.winnerPlayerIds.includes(me) ? "win" : "loss"
}

// why: "2-1-1" from the account's seat like manual entry; a signed-out table shows every seat's wins like the board does.
function scryveMatchScore(wins: number[], draws: number, mine: number) {
  if (mine === -1) return matchScoreLabel({ wins, draws })
  const losses = wins.reduce((sum, count, seat) => (seat === mine ? sum : sum + count), 0)
  return draws > 0 ? `${wins[mine]}-${losses}-${draws}` : `${wins[mine]}-${losses}`
}

// why: the device knows the standing after each of its games, so even an unfinished match shows a score.
function localMatchRef(game: LocalGameSummary, match: LocalGameMatch): HistoryMatchRef {
  const { wins, draws } = matchScoreAfter(game)
  const me = game.account?.mePlayerId
  const mine = me ? game.players.findIndex((player) => player.id === me) : -1
  const result = match.result
  const outcome: HistoryOutcome = !result
    ? "unrecorded"
    : mine !== -1
      ? result.outcomes[mine]
      : game.account
        ? "unrecorded"
        : result.outcomes.includes("win")
          ? "win"
          : "draw"
  return {
    publicId: match.id,
    bestOf: match.bestOf,
    gameNumber: match.gameNumber,
    standing: {
      finished: result !== undefined,
      outcome,
      score: scryveMatchScore(wins, draws, mine),
    },
  }
}

export function localHistoryEntry(game: LocalGameSummary): HistoryEntry {
  const system = isPlaySystemId(game.system) ? game.system : undefined
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
    outcome: localOutcome(game, winnerNames),
    ...(winnerNames.length > 0 ? { winnerNames } : {}),
    ...(game.match ? { scryveMatch: localMatchRef(game, game.match) } : {}),
    eventCount: game.eventCount,
    system,
    players: game.players.map((player) => ({
      id: player.id,
      name: player.name,
      color: player.color,
      ...(player.id === game.account?.mePlayerId && game.account.deckName
        ? { deckName: game.account.deckName }
        : {}),
    })),
    format:
      system && game.format
        ? playFormatLabel(system, game.format)
        : counterValueLabel(system, game.startingLife),
  }
}

export type ScryveMatchSummary = {
  publicId: string
  bestOf: number
  status: "active" | "finished" | "abandoned"
  outcome?: "win" | "loss" | "draw" | "unknown"
  seats: readonly {
    seat: number
    gamesWon?: number
    gamesDrawn?: number
    outcome?: "win" | "loss" | "draw" | "unknown"
    mine: boolean
  }[]
}

// why: the server only scores a match once it is finished; until then the loaded games tell the standing.
function serverMatchRef(match: ScryveMatchSummary, gameNumber?: number): HistoryMatchRef {
  const finished = match.status === "finished"
  const mine = match.seats.findIndex((seat) => seat.mine)
  const wins = match.seats.map((seat) => seat.gamesWon)
  // why: a drawn game is drawn for every seat, so the server stores the same count on each; read one.
  const draws = (match.seats[mine] ?? match.seats[0])?.gamesDrawn ?? 0
  const score =
    finished && wins.every((count) => count !== undefined)
      ? scryveMatchScore(wins, draws, mine)
      : undefined
  return {
    publicId: match.publicId,
    bestOf: match.bestOf,
    ...(gameNumber === undefined ? {} : { gameNumber }),
    standing: {
      finished,
      outcome: finished ? toHistoryOutcome(match.outcome) : "unrecorded",
      ...(score ? { score } : {}),
    },
  }
}

export function connectedHistoryEntry(game: {
  publicId: string
  /** why: a published local game keys as `local:<id>` so the device's own copy folds into it. */
  source?: "local" | "connected"
  outcome?: "win" | "loss" | "draw" | "unknown"
  eventCount: number
  finishedAt: number
  ruleset?: string
  system?: string
  format?: string
  startingLife?: number
  terminalStatus?: string
  match?: ScryveMatchSummary
  matchGameNumber?: number
  players: {
    playerId?: string
    displayName?: string
    color?: string
    deckNameAtFinish?: string
  }[]
}): HistoryEntry {
  const system = game.system === NO_PLAY_SYSTEM ? undefined : playSystemId(game.system)
  const source = game.source ?? "connected"
  return {
    key: `${source}:${game.publicId}`,
    source,
    routeId: game.publicId,
    finishedAt: game.finishedAt,
    status: game.terminalStatus === "abandoned" ? "abandoned" : "finished",
    outcome: toHistoryOutcome(game.outcome),
    ...(game.match ? { scryveMatch: serverMatchRef(game.match, game.matchGameNumber) } : {}),
    eventCount: game.eventCount,
    system,
    players: (game.players ?? []).map((player, index) => ({
      id: player.playerId ?? `${game.publicId}:${index}`,
      name: player.displayName ?? "",
      color: player.color,
      deckName: player.deckNameAtFinish,
    })),
    format:
      system && (game.format || game.ruleset)
        ? playFormatLabel(system, game.format || game.ruleset)
        : game.startingLife !== undefined
          ? counterValueLabel(system, game.startingLife)
          : "Connected",
  }
}

// why: a server match that is still active has no score, so the viewer's loaded game outcomes stand in.
function runningScore(games: HistoryEntry[]) {
  const counts = { win: 0, loss: 0, draw: 0, unrecorded: 0 }
  for (const game of games) counts[game.outcome] += 1
  if (counts.win + counts.loss + counts.draw === 0) return undefined
  return counts.draw > 0
    ? `${counts.win}-${counts.loss}-${counts.draw}`
    : `${counts.win}-${counts.loss}`
}

function matchGroupEntry(publicId: string, games: HistoryEntry[]): HistoryEntry {
  // why: stored ordinals keep "Game 3" right when only game 3 is loaded; time order is the fallback for rows without one.
  const ordered = [...games]
    .sort(
      (a, b) =>
        (a.scryveMatch?.gameNumber ?? 0) - (b.scryveMatch?.gameNumber ?? 0) ||
        a.finishedAt - b.finishedAt,
    )
    .map((game, index) => ({
      ...game,
      scryveMatch: { ...game.scryveMatch!, gameNumber: game.scryveMatch?.gameNumber ?? index + 1 },
    }))
  const latest = ordered[ordered.length - 1]
  const ref = latest.scryveMatch
  // why: the device copy of the ending game and every server row know the result; an unfinished match reads the latest game.
  const standing =
    ordered.map((game) => game.scryveMatch.standing).find((known) => known.finished) ?? ref.standing
  const score = standing.score ?? runningScore(ordered)
  return {
    key: matchGroupKey(publicId),
    source: latest.source,
    routeId: publicId,
    finishedAt: latest.finishedAt,
    status: "finished",
    outcome: standing.finished ? standing.outcome : "unrecorded",
    players: latest.players,
    system: latest.system,
    format: latest.format,
    match: {
      bestOf: ref.bestOf,
      ...(score ? { score } : {}),
      games: ordered.reverse(),
      ...(standing.finished ? {} : { inProgress: true }),
    },
  }
}

/** why: games that share a Scryve match fold into one entry placed at the latest game, however many pages they span. */
export function groupMatchGames(entries: HistoryEntry[]): HistoryEntry[] {
  const games = new Map<string, HistoryEntry[]>()
  const grouped: HistoryEntry[] = []
  for (const entry of entries) {
    const publicId = entry.scryveMatch?.publicId
    if (publicId === undefined) {
      grouped.push(entry)
      continue
    }
    const members = games.get(publicId)
    if (members) members.push(entry)
    else games.set(publicId, [entry])
  }
  for (const [publicId, members] of games) grouped.push(matchGroupEntry(publicId, members))
  return grouped
}

export type DateRange = "any" | "7d" | "30d" | "year"

export type HistorySystem = PlaySystemId | typeof NO_PLAY_SYSTEM
export type FormatKey = `${HistorySystem}:${string}`

const SYSTEM_ORDER: HistorySystem[] = [...PLAY_SYSTEM_IDS, NO_PLAY_SYSTEM]

export function entrySystem(entry: HistoryEntry): HistorySystem {
  return entry.system ?? NO_PLAY_SYSTEM
}

export function systemLabel(system: HistorySystem) {
  return playSystemRules(system).shortLabel
}

export function entryFormatKey(entry: HistoryEntry): FormatKey {
  return `${entrySystem(entry)}:${entry.format}`
}

export function formatKeySystem(key: FormatKey): HistorySystem {
  const system = key.slice(0, key.indexOf(":"))
  return isPlaySystemId(system) ? system : NO_PLAY_SYSTEM
}

export function formatKeyLabel(key: FormatKey) {
  return key.slice(key.indexOf(":") + 1)
}

export interface HistoryFilters {
  source: "all" | HistorySource
  dateRange: DateRange
  players: string[]
  decks: string[]
  outcomes: HistoryOutcome[]
  podSizes: number[]
  systems: HistorySystem[]
  formats: FormatKey[]
}

export const POD_SIZE_MAX = 5
export const NO_FILTERS: HistoryFilters = {
  source: "all",
  dateRange: "any",
  players: [],
  decks: [],
  outcomes: [],
  podSizes: [],
  systems: [],
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
    filters.systems.length > 0 ||
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
    filters.systems.length +
    filters.formats.length
  )
}

export function filterOptions(entries: HistoryEntry[]) {
  const players = new Set<string>()
  const decks = new Set<string>()
  const systems = new Set<HistorySystem>()
  const formats = new Set<FormatKey>()
  const podSizes = new Set<number>()
  for (const entry of entries) {
    entryPlayerNames(entry).forEach((name) => players.add(name))
    entryDeckNames(entry).forEach((deck) => decks.add(deck))
    systems.add(entrySystem(entry))
    formats.add(entryFormatKey(entry))
    podSizes.add(podSizeBucket(entry.players.length))
  }
  const byName = (a: string, b: string) => a.localeCompare(b)
  return {
    players: [...players].sort(byName),
    decks: [...decks].sort(byName),
    systems: SYSTEM_ORDER.filter((system) => systems.has(system)),
    formats: [...formats].sort(
      (a, b) =>
        SYSTEM_ORDER.indexOf(formatKeySystem(a)) - SYSTEM_ORDER.indexOf(formatKeySystem(b)) ||
        byName(formatKeyLabel(a), formatKeyLabel(b)),
    ),
    podSizes: [...podSizes].sort((a, b) => a - b),
  }
}

export function formatChoices(formats: FormatKey[], systems: HistorySystem[]) {
  const available =
    systems.length > 0 ? formats.filter((key) => systems.includes(formatKeySystem(key))) : formats
  const labels = available.map(formatKeyLabel)
  return available.map((key) => {
    const label = formatKeyLabel(key)
    const shared = labels.indexOf(label) !== labels.lastIndexOf(label)
    return { key, label: shared ? `${label} (${systemLabel(formatKeySystem(key))})` : label }
  })
}

export function toggleSystem(filters: HistoryFilters, system: HistorySystem): HistoryFilters {
  const systems = filters.systems.includes(system)
    ? filters.systems.filter((value) => value !== system)
    : [...filters.systems, system]
  const formats =
    systems.length > 0
      ? filters.formats.filter((key) => systems.includes(formatKeySystem(key)))
      : filters.formats
  return { ...filters, systems, formats }
}

export function filterHistory(entries: HistoryEntry[], filters: HistoryFilters, now: number) {
  return entries.filter((entry) => {
    if (filters.source !== "all" && entry.source !== filters.source) return false
    if (!matchesDateRange(entry.finishedAt, filters.dateRange, now)) return false
    if (filters.outcomes.length > 0 && !filters.outcomes.includes(entry.outcome)) return false
    if (filters.systems.length > 0 && !filters.systems.includes(entrySystem(entry))) return false
    if (filters.formats.length > 0 && !filters.formats.includes(entryFormatKey(entry))) return false
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
