import { translate } from "@/i18n/translate"
import { captureGame, type GameEndSource } from "@/utils/analytics"
import { storage as mmkvStorage } from "@/utils/storage"
import { recordReviewCompletion } from "@/utils/storeReview"

import {
  accountForSystem,
  asActorId,
  asDeviceId,
  asGameId,
  asOperationId,
  asPlayerId,
  createClientId,
  hasLocalGameStarted,
  isCommanderSlot,
  isLifeDelta,
  localGameAccount,
  MAX_COMMANDER_DAMAGE,
  retainedLogOrder,
  validatePlayerNames,
} from "./domain"
import { gameShape } from "./gameShape"
import { applyClaimDecisions, type ClaimDecision } from "./localGameClaims"
import { isSeatOrder, playerGridLayoutForCount } from "./playerLayouts"
import {
  defaultStartingLife,
  isPlaySystemId,
  playSystemFormats,
  playSystemRules,
  type PlaySystemId,
} from "./playSystems"
import {
  isSetupReplayable,
  parseRecentSetup,
  withRecentSetup,
  type NewRecentSetup,
  type RecentSetup,
} from "./recentSetups"
import { isRoundClockSetup, type RoundClock } from "./roundClock"
import { isChessBankMinutes, type ChessBankMinutes } from "./turnTab"
import type {
  CommanderDamageTotals,
  GameEvent,
  GamePlayer,
  LocalGame,
  LocalGameAccount,
  LocalGameMatch,
  LocalGameResult,
  LocalGameSummary,
  MatchSeatOutcome,
  NewPlayerInput,
  SeatPassHashes,
  CounterLogEntry,
  TurnLogEntry,
} from "./types"
import { isPlayerMarkShape } from "../../../convex/lib/appearance"
import { isMatchBestOf, MAX_GAMES_PER_MATCH } from "../../../convex/lib/matchResults"
import { MAX_PLAYERS, MIN_PLAYERS, SEATS_BEFORE_CLIENT_LIMIT } from "../../../convex/lib/policy"
import { isSeatPassHash } from "../../../convex/lib/seatPass"
import { startingValueRange } from "../../../convex/lib/systems"
import { parseTableState } from "../../../convex/lib/table"
import { isValidTurn, isValidTurnGroups } from "../../../convex/lib/turns"
import { isValidTeams, TWO_HEADED_GIANT } from "../../../convex/lib/twoHeadedGiant"

export const MAX_HISTORY_GAMES = 30
export const MAX_ACTIVE_EVENTS = 500
export const MAX_HISTORY_EVENTS = 250
const EVENT_CHUNK_SIZE = 100
const PASS_LABEL_PASSES = 3
export const ACTIVE_SCHEMA_VERSION = 1
/** why: a build from before seven-plus seats rejects those games, so they save as a newer schema it keeps instead of replacing. */
export const WIDE_ACTIVE_SCHEMA_VERSION = 2

export const LOCAL_KEYS = {
  device: "count.local.device.v1",
  analytics: "count.local.analytics.v1",
  settings: "count.local.settings.v1",
  legacySettings: "count.local.settings",
  active: "count.local.active.v1",
  historyIndex: "count.local.history.index.v1",
  // why: a build from before seven-plus seats rewrites the main index without the games it cannot parse, so those games live where it never writes.
  wideHistoryIndex: "count.local.history.index.wide.v1",
  noSystemHistoryRepaired: "count.local.history.noSystemRepaired.v1",
  meSeat: "count.local.meSeat.v1",
  pendingMatchEnd: "count.local.matchEnd.v1",
  recentSetups: "count.local.recentSetups.v1",
  deferredClaims: "count.local.claims.deferred.v1",
  turnPasses: "count.local.turnPasses.v1",
  activeEvents: (index: number) => `count.local.active.events.v1.${index}`,
  historyDetail: (gameId: string) => `count.local.history.detail.v1.${gameId}`,
} as const

const NO_SYSTEM_RELEASED_AT = Date.parse("2026-09-04T16:15:49Z")

export type ThemePreference = "system" | "light" | "dark"
export type LaunchDestination = "play" | "decks"

export interface LocalSettings {
  schemaVersion: 1
  defaultPlayerCount: number
  defaultStartingLife: number
  hapticsEnabled: boolean
  themePreference: ThemePreference
  launchDestination: LaunchDestination
  defaultSystem?: PlaySystemId
  defaultFormat?: string
  askWhatYouPlay?: true
  syncStats?: boolean
  turnTab?: true
  teamBinding?: "frame"
  chessMinutes?: ChessBankMinutes
}

export const COMMANDER_SEATS = 4

const COMMANDER_POD = {
  defaultSystem: "mtg",
  defaultFormat: "commander",
  defaultPlayerCount: COMMANDER_SEATS,
  defaultStartingLife: defaultStartingLife("mtg", "commander", COMMANDER_SEATS),
} satisfies Partial<LocalSettings>

export const DEFAULT_LOCAL_SETTINGS: LocalSettings = {
  schemaVersion: 1,
  ...COMMANDER_POD,
  hapticsEnabled: true,
  themePreference: "system",
  launchDestination: "play",
}

export interface StringStorage {
  getString(key: string): string | undefined
  set(key: string, value: string): void
  delete(key: string): void
}

/**
 * why: a life tap appends one event, so a save rewrites only the newest chunk. Past
 * MAX_ACTIVE_EVENTS the oldest whole chunk of events is dropped in one rewrite, so chunks always
 * start at 0 where schema 1 builds read them, and any older JS a crash or rollback falls back to
 * can still open the game. `eventCount` and `lastOperationId` mark what the last save committed;
 * a save from an older build has neither, so the next save rewrites every chunk. A newer format
 * must keep this key and raise `schemaVersion`, so this build keeps that game instead of replacing it.
 */
interface ActiveMetadata {
  schemaVersion: typeof ACTIVE_SCHEMA_VERSION | typeof WIDE_ACTIVE_SCHEMA_VERSION
  game: Omit<LocalGame, "events">
  eventChunkCount: number
  eventCount: number
  lastOperationId?: string
}

interface ActiveEventLayout {
  chunkCount: number
  tail?: { eventCount: number; lastOperationId: string }
}

interface HistoryDetail {
  schemaVersion: 1
  game: LocalGame
  eventsTruncated: boolean
}

export const syncStatsEnabled = (settings: string | undefined) =>
  parseSettings(parseJson(settings))?.syncStats === true

function parseJson(value: string | undefined): unknown {
  if (!value) return null
  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
  }
}

function readActiveLayout(raw: unknown): ActiveEventLayout | null {
  if (
    !isRecord(raw) ||
    (raw.schemaVersion !== ACTIVE_SCHEMA_VERSION &&
      raw.schemaVersion !== WIDE_ACTIVE_SCHEMA_VERSION)
  )
    return null
  const { eventChunkCount: chunkCount, eventCount, lastOperationId } = raw
  if (!isCount(chunkCount) || chunkCount > MAX_ACTIVE_EVENTS / EVENT_CHUNK_SIZE) return null
  return {
    chunkCount,
    ...(isCount(eventCount) &&
    eventCount <= MAX_ACTIVE_EVENTS &&
    typeof lastOperationId === "string"
      ? { tail: { eventCount, lastOperationId } }
      : {}),
  }
}

function isNewerActiveGame(raw: unknown) {
  return (
    isRecord(raw) &&
    typeof raw.schemaVersion === "number" &&
    raw.schemaVersion > WIDE_ACTIVE_SCHEMA_VERSION
  )
}

function storedWindow(
  events: readonly GameEvent[],
  tail: ActiveEventLayout["tail"],
): { keepFrom: number; dirtyChunk: number } {
  const last = tail
    ? events.findLastIndex(({ operationId }) => operationId === tail.lastOperationId)
    : -1
  const storedFrom = tail && last >= 0 ? last + 1 - tail.eventCount : -1
  if (tail && storedFrom >= 0 && events.length - storedFrom <= MAX_ACTIVE_EVENTS)
    return { keepFrom: storedFrom, dirtyChunk: Math.floor(tail.eventCount / EVENT_CHUNK_SIZE) }
  const from = Math.max(0, storedFrom)
  const excess = Math.max(0, events.length - from - MAX_ACTIVE_EVENTS)
  return { keepFrom: from + Math.ceil(excess / EVENT_CHUNK_SIZE) * EVENT_CHUNK_SIZE, dirtyChunk: 0 }
}

/**
 * why: chunks are written before the metadata that commits them, so a killed save can leave an extra
 * event or a repeated chunk. Keeping each operation once, up to the committed one, matches the
 * life totals the metadata stored.
 */
function committedEvents(events: readonly GameEvent[], tail: ActiveEventLayout["tail"]) {
  const seen = new Set<string>()
  const unique: GameEvent[] = []
  for (const event of events) {
    if (seen.has(event.operationId)) continue
    seen.add(event.operationId)
    unique.push(event)
  }
  const end = tail
    ? unique.findLastIndex(({ operationId }) => operationId === tail.lastOperationId)
    : -1
  return end < 0 ? unique : unique.slice(0, end + 1)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function parsePlayers(value: unknown): GamePlayer[] | null {
  if (!Array.isArray(value) || value.length < MIN_PLAYERS || value.length > MAX_PLAYERS) return null
  const players: GamePlayer[] = []
  for (const candidate of value) {
    if (
      !isRecord(candidate) ||
      typeof candidate.id !== "string" ||
      typeof candidate.name !== "string" ||
      typeof candidate.color !== "string" ||
      typeof candidate.life !== "number" ||
      !Number.isFinite(candidate.life) ||
      typeof candidate.seat !== "number"
    ) {
      return null
    }
    players.push({
      id: asPlayerId(candidate.id),
      name: candidate.name,
      color: candidate.color,
      ...(isPlayerMarkShape(candidate.shape) ? { shape: candidate.shape } : {}),
      life: candidate.life,
      seat: candidate.seat,
      ...(typeof candidate.startingLife === "number" && Number.isInteger(candidate.startingLife)
        ? { startingLife: candidate.startingLife }
        : {}),
    })
  }
  return players
}

function parseResult(value: unknown): LocalGameResult | undefined {
  if (!isRecord(value)) return undefined
  if (value.kind === "draw") return { kind: "draw" }
  if (
    value.kind !== "win" ||
    !Array.isArray(value.winnerPlayerIds) ||
    value.winnerPlayerIds.length < 1 ||
    value.winnerPlayerIds.some((id) => typeof id !== "string")
  ) {
    return undefined
  }
  return { kind: "win", winnerPlayerIds: (value.winnerPlayerIds as string[]).map(asPlayerId) }
}

function parseEvent(value: unknown): GameEvent | null {
  if (
    !isRecord(value) ||
    typeof value.type !== "string" ||
    typeof value.operationId !== "string" ||
    typeof value.gameId !== "string" ||
    typeof value.actorId !== "string" ||
    typeof value.deviceId !== "string" ||
    typeof value.clientCreatedAt !== "number"
  ) {
    return null
  }
  const base = {
    operationId: asOperationId(value.operationId),
    gameId: asGameId(value.gameId),
    actorId: asActorId(value.actorId),
    deviceId: asDeviceId(value.deviceId),
    clientCreatedAt: value.clientCreatedAt,
  }
  if (value.type === "game.finished") {
    const result = parseResult(value.result)
    return { ...base, type: "game.finished", ...(result ? { result } : {}) }
  }
  if (value.type === "game.abandoned") {
    return { ...base, type: "game.abandoned" }
  }
  if (value.type === "commanderDamage.assigned") {
    if (
      typeof value.fromPlayerId !== "string" ||
      typeof value.toPlayerId !== "string" ||
      typeof value.delta !== "number" ||
      !Number.isInteger(value.delta) ||
      value.delta === 0 ||
      Math.abs(value.delta) > MAX_COMMANDER_DAMAGE ||
      !isCommanderSlot(value.commander) ||
      (value.compensatesOperationId !== undefined &&
        typeof value.compensatesOperationId !== "string")
    ) {
      return null
    }
    return {
      ...base,
      type: "commanderDamage.assigned",
      fromPlayerId: asPlayerId(value.fromPlayerId),
      toPlayerId: asPlayerId(value.toPlayerId),
      ...(value.commander ? { commander: value.commander } : {}),
      delta: value.delta,
      ...(typeof value.compensatesOperationId === "string"
        ? { compensatesOperationId: asOperationId(value.compensatesOperationId) }
        : {}),
    }
  }
  if (
    value.type !== "life.changed" ||
    typeof value.playerId !== "string" ||
    !isLifeDelta(value.delta) ||
    (value.compensatesOperationId !== undefined && typeof value.compensatesOperationId !== "string")
  ) {
    return null
  }
  return {
    ...base,
    type: "life.changed",
    playerId: asPlayerId(value.playerId),
    delta: value.delta,
    ...(typeof value.compensatesOperationId === "string"
      ? { compensatesOperationId: asOperationId(value.compensatesOperationId) }
      : {}),
  }
}

function parseAccount(value: unknown, system: unknown): LocalGameAccount | undefined {
  if (!isRecord(value) || typeof value.ownerId !== "string" || !value.ownerId) return undefined
  const deckVersionId = typeof value.deckVersionId === "string" ? value.deckVersionId : undefined
  return accountForSystem(system, {
    ownerId: value.ownerId,
    ...(typeof value.mePlayerId === "string" ? { mePlayerId: asPlayerId(value.mePlayerId) } : {}),
    ...(deckVersionId ? { deckVersionId } : {}),
    ...(typeof value.deckKey === "string" ? { deckKey: value.deckKey } : {}),
    ...(typeof value.deckFingerprint === "string" && /^v1:[0-9a-f]{64}$/.test(value.deckFingerprint)
      ? { deckFingerprint: value.deckFingerprint }
      : {}),
    ...(typeof value.deckName === "string" ? { deckName: value.deckName } : {}),
  })
}

const MATCH_OUTCOMES: readonly MatchSeatOutcome[] = ["win", "loss", "draw"]

function isMatchOutcome(value: unknown): value is MatchSeatOutcome {
  return MATCH_OUTCOMES.some((outcome) => outcome === value)
}

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0
}

function parseMatch(value: unknown, seatCount: number): LocalGameMatch | undefined {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !value.id ||
    !isMatchBestOf(value.bestOf) ||
    !isCount(value.gameNumber) ||
    value.gameNumber < 1 ||
    value.gameNumber > MAX_GAMES_PER_MATCH ||
    !Array.isArray(value.wins) ||
    value.wins.length !== seatCount ||
    !value.wins.every(isCount) ||
    !isCount(value.draws)
  )
    return undefined
  const outcomes = isRecord(value.result) ? value.result.outcomes : undefined
  const result =
    Array.isArray(outcomes) && outcomes.length === seatCount && outcomes.every(isMatchOutcome)
      ? { outcomes }
      : undefined
  return {
    id: value.id,
    bestOf: value.bestOf,
    gameNumber: value.gameNumber,
    wins: value.wins,
    draws: value.draws,
    ...(result ? { result } : {}),
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

const ROUND_CLOCK_NUMBERS = [
  "pausedAt",
  "adjustMs",
  "calledAtMs",
  "turn",
  "bonusTurns",
] as const satisfies readonly (keyof RoundClock)[]

function parseRoundClock(value: unknown): RoundClock | undefined {
  if (!isRecord(value) || !isFiniteNumber(value.startedAt)) return undefined
  if (!isRoundClockSetup(value.setup)) return undefined
  const clock: RoundClock = { setup: value.setup, startedAt: value.startedAt }
  for (const key of ROUND_CLOCK_NUMBERS) {
    const field = value[key]
    if (field === undefined) continue
    if (!isFiniteNumber(field)) return undefined
    clock[key] = field
  }
  if (typeof value.steppedBy === "string") clock.steppedBy = value.steppedBy
  return clock
}

function parseSkippedBy(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const ids = value.filter((id): id is string => typeof id === "string" && id.length > 0)
  return ids.length > 0 ? ids : undefined
}

function parseCommanderDamage(value: unknown): CommanderDamageTotals | undefined {
  if (!isRecord(value)) return undefined
  const totals: CommanderDamageTotals = {}
  for (const [key, total] of Object.entries(value)) {
    if (
      typeof total !== "number" ||
      !Number.isInteger(total) ||
      total < 0 ||
      total > MAX_COMMANDER_DAMAGE
    )
      continue
    totals[key] = total
  }
  return Object.keys(totals).length > 0 ? totals : undefined
}

function parseGame(value: unknown, events: GameEvent[]): LocalGame | null {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    typeof value.id !== "string" ||
    (value.status !== "active" && value.status !== "finished" && value.status !== "abandoned") ||
    typeof value.startingLife !== "number" ||
    typeof value.createdAt !== "number" ||
    typeof value.updatedAt !== "number"
  ) {
    return null
  }
  const players = parsePlayers(value.players)
  if (!players || events.some((event) => event.gameId !== value.id)) return null
  const result = parseResult(value.result)
  const commanderDamage = parseCommanderDamage(value.commanderDamage)
  const table = parseTableState(value.table)
  const account = parseAccount(value.account, value.system)
  const match = parseMatch(value.match, players.length)
  const clock = parseRoundClock(value.clock)
  const playerIds = new Set<string>(players.map(({ id }) => id))
  const turn = isValidTurn(value.turn, playerIds) ? value.turn : undefined
  const turnLog = turn ? parseTurnLog(value.turnLog, playerIds) : undefined
  const turnGroups = isValidTurnGroups(value.turnGroups, playerIds) ? value.turnGroups : undefined
  const teams =
    value.variant === TWO_HEADED_GIANT && isValidTeams(turnGroups, playerIds)
      ? turnGroups
      : undefined
  const counterLog = parseCounterLog(value.counterLog, playerIds)
  return {
    schemaVersion: 1,
    id: asGameId(value.id),
    status: value.status,
    ...(isPlaySystemId(value.system) ? { system: value.system } : {}),
    ...(typeof value.format === "string" ? { format: value.format } : {}),
    layout: playerGridLayoutForCount(teams ? teams.length : players.length, value.layout),
    ...(isSeatOrder(value.seatOrder, players.length) ? { seatOrder: value.seatOrder } : {}),
    lifeStep:
      isLifeDelta(value.lifeStep) && value.lifeStep > 0
        ? value.lifeStep
        : playSystemRules(value.system).counter.tapStep,
    startingLife: value.startingLife,
    players,
    events,
    ...(commanderDamage ? { commanderDamage } : {}),
    ...(table ? { table } : {}),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    ...(typeof value.finishedAt === "number" ? { finishedAt: value.finishedAt } : {}),
    ...(result ? { result } : {}),
    ...(account ? { account } : {}),
    ...(match ? { match } : {}),
    ...(clock ? { clock } : {}),
    ...(Number.isInteger(value.firstChooserSeat) &&
    typeof value.firstChooserSeat === "number" &&
    value.firstChooserSeat >= 0 &&
    value.firstChooserSeat < players.length
      ? { firstChooserSeat: value.firstChooserSeat }
      : {}),
    ...(value.firstPlayerOffered === true ? { firstPlayerOffered: true } : {}),
    ...(typeof value.firstPlayerId === "string" &&
    players.some(({ id }) => id === value.firstPlayerId)
      ? { firstPlayerId: asPlayerId(value.firstPlayerId) }
      : {}),
    ...(turn ? { turn } : {}),
    ...(turnLog ? { turnLog } : {}),
    ...(turnGroups ? { turnGroups } : {}),
    ...(teams ? { variant: TWO_HEADED_GIANT } : {}),
    ...(counterLog ? { counterLog } : {}),
    ...(Array.isArray(value.logOrder)
      ? { logOrder: value.logOrder.filter((id): id is string => typeof id === "string") }
      : {}),
  }
}

function parseCounterLog(
  value: unknown,
  playerIds: ReadonlySet<string>,
): CounterLogEntry[] | undefined {
  if (!Array.isArray(value)) return undefined
  const entries = value.flatMap((entry): CounterLogEntry[] =>
    isRecord(entry) &&
    typeof entry.operationId === "string" &&
    typeof entry.playerId === "string" &&
    playerIds.has(entry.playerId) &&
    typeof entry.counterId === "string" &&
    Number.isInteger(entry.delta) &&
    Number.isInteger(entry.value) &&
    typeof entry.at === "number" &&
    Number.isFinite(entry.at)
      ? [
          {
            operationId: entry.operationId,
            playerId: asPlayerId(entry.playerId),
            counterId: entry.counterId,
            delta: Number(entry.delta),
            value: Number(entry.value),
            at: entry.at,
          },
        ]
      : [],
  )
  return entries.length > 0 ? entries : undefined
}

function parseTurnLog(value: unknown, playerIds: ReadonlySet<string>): TurnLogEntry[] | undefined {
  if (!Array.isArray(value)) return undefined
  const entries = value.flatMap((entry): TurnLogEntry[] =>
    isRecord(entry) &&
    typeof entry.operationId === "string" &&
    typeof entry.playerId === "string" &&
    playerIds.has(entry.playerId) &&
    typeof entry.number === "number" &&
    Number.isInteger(entry.number) &&
    typeof entry.at === "number" &&
    Number.isFinite(entry.at)
      ? [
          {
            operationId: entry.operationId,
            playerId: asPlayerId(entry.playerId),
            number: entry.number,
            at: entry.at,
          },
        ]
      : [],
  )
  return entries.length > 0 ? entries : undefined
}

function parseSettings(value: unknown): LocalSettings | null {
  if (!isRecord(value)) return null
  const migrated = value.schemaVersion === undefined ? { ...value, schemaVersion: 1 } : value
  const startingValue = startingValueRange(migrated.defaultSystem)
  if (
    migrated.schemaVersion !== 1 ||
    typeof migrated.defaultPlayerCount !== "number" ||
    migrated.defaultPlayerCount < MIN_PLAYERS ||
    migrated.defaultPlayerCount > MAX_PLAYERS ||
    typeof migrated.defaultStartingLife !== "number" ||
    migrated.defaultStartingLife < startingValue.min ||
    migrated.defaultStartingLife > startingValue.max ||
    typeof migrated.hapticsEnabled !== "boolean" ||
    (migrated.themePreference !== "system" &&
      migrated.themePreference !== "light" &&
      migrated.themePreference !== "dark")
  ) {
    return null
  }
  const systemPreference = parseSystemPreference(migrated.defaultSystem, migrated.defaultFormat)
  return {
    schemaVersion: 1,
    defaultPlayerCount: migrated.defaultPlayerCount,
    defaultStartingLife: migrated.defaultStartingLife,
    hapticsEnabled: migrated.hapticsEnabled,
    themePreference: migrated.themePreference,
    launchDestination: migrated.launchDestination === "decks" ? "decks" : "play",
    ...systemPreference,
    ...(migrated.askWhatYouPlay === true ? { askWhatYouPlay: true } : {}),
    ...(typeof migrated.syncStats === "boolean" ? { syncStats: migrated.syncStats } : {}),
    ...(migrated.turnTab === true ? { turnTab: true } : {}),
    ...(migrated.teamBinding === "frame" ? { teamBinding: "frame" } : {}),
    ...(isChessBankMinutes(migrated.chessMinutes) ? { chessMinutes: migrated.chessMinutes } : {}),
  }
}

// why: Brawl preferences saved before Brawl had its own default stored Magic's 20, which would otherwise read as a custom value and stop following format changes.
function migrateBrawlStartingLife(settings: LocalSettings): LocalSettings {
  const { defaultSystem, defaultFormat, defaultStartingLife: startingLife } = settings
  return defaultSystem === "mtg" && defaultFormat === "brawl" && startingLife === 20
    ? {
        ...settings,
        defaultStartingLife: defaultStartingLife(
          defaultSystem,
          defaultFormat,
          settings.defaultPlayerCount,
        ),
      }
    : settings
}

function migrateOldTwoPlayerFallback(settings: LocalSettings): LocalSettings {
  const { defaultSystem, defaultFormat, defaultPlayerCount, defaultStartingLife: life } = settings
  return defaultSystem === undefined &&
    defaultFormat === undefined &&
    defaultPlayerCount === 2 &&
    life === 20
    ? { ...settings, ...COMMANDER_POD }
    : settings
}

function parseSystemPreference(
  system: unknown,
  format: unknown,
): { defaultSystem?: PlaySystemId; defaultFormat?: string } {
  if (!isPlaySystemId(system)) return {}
  if (typeof format !== "string" || !playSystemFormats(system).some(({ id }) => id === format)) {
    return { defaultSystem: system }
  }
  return { defaultSystem: system, defaultFormat: format }
}

function parseSummary(value: unknown): LocalGameSummary | null {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    typeof value.id !== "string" ||
    (value.status !== "finished" && value.status !== "abandoned") ||
    typeof value.startingLife !== "number" ||
    typeof value.eventCount !== "number" ||
    typeof value.createdAt !== "number" ||
    typeof value.finishedAt !== "number"
  )
    return null
  const players = parsePlayers(value.players)
  const result = parseResult(value.result)
  const account = parseAccount(value.account, value.system)
  const skippedBy = parseSkippedBy(value.skippedBy)
  const match = players ? parseMatch(value.match, players.length) : undefined
  const seatPassHashes = players ? parseSeatPassHashes(value.seatPassHashes, players) : undefined
  const turnGroups =
    players && isValidTurnGroups(value.turnGroups, new Set(players.map(({ id }) => id)))
      ? value.turnGroups
      : undefined
  return players
    ? {
        schemaVersion: 1,
        id: asGameId(value.id),
        status: value.status,
        ...(typeof value.system === "string" ? { system: value.system } : {}),
        ...(typeof value.format === "string" ? { format: value.format } : {}),
        startingLife: value.startingLife,
        players,
        eventCount: value.eventCount,
        ...(typeof value.firstPlayerId === "string" &&
        players.some(({ id }) => id === value.firstPlayerId)
          ? { firstPlayerId: asPlayerId(value.firstPlayerId) }
          : {}),
        createdAt: value.createdAt,
        finishedAt: value.finishedAt,
        ...(result ? { result } : {}),
        ...(account ? { account } : {}),
        ...(account &&
        (value.publish === "pending" || value.publish === "published" || value.publish === "failed")
          ? { publish: value.publish }
          : {}),
        ...(skippedBy ? { skippedBy } : {}),
        ...(match ? { match } : {}),
        ...(account &&
        match?.result &&
        (value.matchPublish === "pending" ||
          value.matchPublish === "published" ||
          value.matchPublish === "failed")
          ? { matchPublish: value.matchPublish }
          : {}),
        ...(seatPassHashes ? { seatPassHashes } : {}),
        ...(turnGroups ? { turnGroups } : {}),
      }
    : null
}

function parseSeatPassHashes(value: unknown, players: GamePlayer[]): SeatPassHashes | undefined {
  if (!isRecord(value)) return undefined
  const hashes: SeatPassHashes = {}
  for (const player of players) {
    const hash = value[player.id]
    if (typeof hash === "string" && isSeatPassHash(hash)) hashes[player.id] = hash
  }
  return Object.keys(hashes).length > 0 ? hashes : undefined
}

const isWide = (game: { players: readonly unknown[] }) =>
  game.players.length > SEATS_BEFORE_CLIENT_LIMIT

function withinHistoryCap(games: readonly LocalGameSummary[]): LocalGameSummary[] {
  return games.filter(
    (game, index) =>
      index < MAX_HISTORY_GAMES || game.publish === "pending" || game.matchPublish === "pending",
  )
}

export type LocalGameAccountInput = Parameters<typeof localGameAccount>[1]

const settingsListeners = new Set<() => void>()

export class LocalGameRepository {
  private readonly finishListeners = new Set<() => void>()
  private readonly historyListeners = new Set<() => void>()
  private readonly claimListeners = new Set<() => void>()
  private abandoned?: { game: LocalGame; endSource: GameEndSource }

  constructor(private readonly storage: StringStorage = mmkvStorage) {}

  onGameFinished(listener: () => void): () => void {
    this.finishListeners.add(listener)
    return () => {
      this.finishListeners.delete(listener)
    }
  }

  onHistoryChanged(listener: () => void): () => void {
    this.historyListeners.add(listener)
    return () => {
      this.historyListeners.delete(listener)
    }
  }

  onClaimsReopened(listener: () => void): () => void {
    this.claimListeners.add(listener)
    return () => {
      this.claimListeners.delete(listener)
    }
  }

  private notifyHistoryChanged(): void {
    this.historyListeners.forEach((listener) => listener())
  }

  loadMeSeat(): number | "none" | undefined {
    const stored = this.storage.getString(LOCAL_KEYS.meSeat)
    if (stored === "none") return "none"
    const raw = Number(stored)
    return stored !== undefined && Number.isInteger(raw) && raw >= 0 && raw < MAX_PLAYERS
      ? raw
      : undefined
  }

  saveMeSeat(seat: number | undefined): void {
    this.storage.set(LOCAL_KEYS.meSeat, seat === undefined ? "none" : String(seat))
  }

  getDeviceId(): ReturnType<typeof asDeviceId> {
    const existing = this.storage.getString(LOCAL_KEYS.device)
    if (existing) return asDeviceId(existing)
    const created = asDeviceId(createClientId("device"))
    this.storage.set(LOCAL_KEYS.device, created)
    return created
  }

  getAnalyticsId(): string {
    const existing = this.storage.getString(LOCAL_KEYS.analytics)
    if (existing) return existing
    const created = createClientId("analytics")
    this.storage.set(LOCAL_KEYS.analytics, created)
    return created
  }

  resetAnalyticsId(): string {
    const created = createClientId("analytics")
    this.storage.set(LOCAL_KEYS.analytics, created)
    return created
  }

  loadSettings(): LocalSettings {
    const storedText = this.storage.getString(LOCAL_KEYS.settings)
    const stored = parseJson(storedText)
    const current = parseSettings(stored)
    const flags = current && isRecord(stored) ? stored : {}
    if (current && flags.brawlLifeMigrated === true && flags.podDefaultMigrated === true)
      return current
    const legacyText = current ? undefined : this.storage.getString(LOCAL_KEYS.legacySettings)
    const legacy = parseSettings(parseJson(legacyText))
    const found = current ?? legacy
    // why: every launch saves settings, so nothing stored at all means this install has never opened.
    const freshInstall = storedText === undefined && legacyText === undefined
    const brawlChecked =
      found && flags.brawlLifeMigrated !== true ? migrateBrawlStartingLife(found) : found
    const settings: LocalSettings = brawlChecked
      ? flags.podDefaultMigrated === true
        ? brawlChecked
        : migrateOldTwoPlayerFallback(brawlChecked)
      : freshInstall
        ? { ...DEFAULT_LOCAL_SETTINGS, askWhatYouPlay: true }
        : DEFAULT_LOCAL_SETTINGS
    this.saveSettings(settings)
    if (legacy) this.storage.delete(LOCAL_KEYS.legacySettings)
    return settings
  }

  turnsEnabled(): boolean {
    return this.loadSettings().turnTab === true
  }

  saveTurnsEnabled(enabled: boolean): void {
    const { turnTab: _turnTab, ...rest } = this.loadSettings()
    this.saveSettings({ ...rest, ...(enabled ? { turnTab: true } : {}) })
  }

  chessMinutes(): ChessBankMinutes | undefined {
    const settings = this.loadSettings()
    return settings.turnTab === true ? settings.chessMinutes : undefined
  }

  saveChessMinutes(minutes: ChessBankMinutes | undefined): void {
    const { chessMinutes: _chessMinutes, ...rest } = this.loadSettings()
    this.saveSettings({ ...rest, ...(minutes ? { chessMinutes: minutes } : {}) })
  }

  passLabelShown(): boolean {
    return this.turnPasses() < PASS_LABEL_PASSES
  }

  notePass(): void {
    const passes = this.turnPasses()
    if (passes < PASS_LABEL_PASSES) this.storage.set(LOCAL_KEYS.turnPasses, String(passes + 1))
  }

  private turnPasses(): number {
    const passes = Number(this.storage.getString(LOCAL_KEYS.turnPasses))
    return Number.isInteger(passes) && passes > 0 ? passes : 0
  }

  onSettingsChanged(listener: () => void): () => void {
    settingsListeners.add(listener)
    return () => {
      settingsListeners.delete(listener)
    }
  }

  teamBinding(): "link" | "frame" {
    return this.loadSettings().teamBinding ?? "link"
  }

  saveTeamBinding(binding: "link" | "frame") {
    const { teamBinding: _binding, ...rest } = this.loadSettings()
    this.saveSettings({ ...rest, ...(binding === "frame" ? { teamBinding: "frame" } : {}) })
  }

  hapticsEnabled(): boolean {
    const stored = parseSettings(parseJson(this.storage.getString(LOCAL_KEYS.settings)))
    return (stored ?? DEFAULT_LOCAL_SETTINGS).hapticsEnabled
  }

  saveSettings(settings: LocalSettings): void {
    const valid = parseSettings(settings) ?? DEFAULT_LOCAL_SETTINGS
    // why: anything this build saves is past the one-time Brawl and pod fixes, so a 20 or a 2/20 chosen afterward is never migrated again.
    this.storage.set(
      LOCAL_KEYS.settings,
      JSON.stringify({ ...valid, brawlLifeMigrated: true, podDefaultMigrated: true }),
    )
    settingsListeners.forEach((listener) => listener())
  }

  saveDefaultsFrom(game: Pick<LocalGame, "players" | "startingLife" | "system" | "format">): void {
    const { defaultSystem: _system, defaultFormat: _format, ...rest } = this.loadSettings()
    const next = parseSettings({
      ...rest,
      defaultPlayerCount: game.players.length,
      defaultStartingLife: game.startingLife,
      ...(game.system ? { defaultSystem: game.system, defaultFormat: game.format } : {}),
    })
    if (next) this.saveSettings(next)
  }

  loadRecentSetups(): RecentSetup[] {
    return this.storedRecentSetups().filter(isSetupReplayable)
  }

  rememberSetup(setup: NewRecentSetup, savedAt = Date.now()): void {
    this.storage.set(
      LOCAL_KEYS.recentSetups,
      JSON.stringify(withRecentSetup(this.storedRecentSetups(), setup, savedAt)),
    )
  }

  private storedRecentSetups(): RecentSetup[] {
    const stored = parseJson(this.storage.getString(LOCAL_KEYS.recentSetups))
    return Array.isArray(stored)
      ? stored.flatMap((entry: unknown) => parseRecentSetup(entry) ?? [])
      : []
  }

  saveActiveGame(game: LocalGame): void {
    if (game.status !== "active") return
    const previousRaw = parseJson(this.storage.getString(LOCAL_KEYS.active))
    if (isNewerActiveGame(previousRaw)) return
    const previous = readActiveLayout(previousRaw)
    const { events, ...gameWithoutEvents } = game
    const { keepFrom, dirtyChunk } = storedWindow(events, previous?.tail)
    const kept = events.slice(keepFrom)
    const chunkCount = Math.ceil(kept.length / EVENT_CHUNK_SIZE)
    for (let index = dirtyChunk; index < chunkCount; index += 1) {
      this.storage.set(
        LOCAL_KEYS.activeEvents(index),
        JSON.stringify(kept.slice(index * EVENT_CHUNK_SIZE, (index + 1) * EVENT_CHUNK_SIZE)),
      )
    }
    const metadata: ActiveMetadata = {
      schemaVersion: isWide(game) ? WIDE_ACTIVE_SCHEMA_VERSION : ACTIVE_SCHEMA_VERSION,
      game: {
        ...gameWithoutEvents,
        ...(game.logOrder ? { logOrder: retainedLogOrder({ ...game, events: kept }) } : {}),
      },
      eventChunkCount: chunkCount,
      eventCount: kept.length,
      ...(kept.length > 0 ? { lastOperationId: kept[kept.length - 1].operationId } : {}),
    }
    this.storage.set(LOCAL_KEYS.active, JSON.stringify(metadata))
    for (let index = chunkCount; index < (previous?.chunkCount ?? 0); index += 1) {
      this.storage.delete(LOCAL_KEYS.activeEvents(index))
    }
  }

  boardRevision(): string {
    return JSON.stringify([
      this.storage.getString(LOCAL_KEYS.settings),
      this.storage.getString(LOCAL_KEYS.active),
    ])
  }

  loadActiveGame(): LocalGame | null {
    const raw = parseJson(this.storage.getString(LOCAL_KEYS.active))
    const layout = readActiveLayout(raw)
    if (!layout || !isRecord(raw) || !isRecord(raw.game)) return null
    const events: GameEvent[] = []
    for (let index = 0; index < layout.chunkCount; index += 1) {
      const chunk = parseJson(this.storage.getString(LOCAL_KEYS.activeEvents(index)))
      if (!Array.isArray(chunk)) return null
      for (const rawEvent of chunk) {
        const event = parseEvent(rawEvent)
        if (!event) return null
        events.push(event)
      }
    }
    const game = parseGame(raw.game, committedEvents(events, layout.tail))
    return game?.status === "active" ? game : null
  }

  hasRunningGame(): boolean {
    const game = this.loadActiveGame()
    return game !== null && hasLocalGameStarted(game)
  }

  hasNewerActiveGame(): boolean {
    return isNewerActiveGame(parseJson(this.storage.getString(LOCAL_KEYS.active)))
  }

  updateActivePlayers(
    gameId: string,
    players: NewPlayerInput[],
    account?: LocalGameAccountInput,
  ): void {
    const game = this.loadActiveGame()
    if (!game || game.id !== gameId || game.players.length !== players.length)
      throw new Error(translate("board:playerNames.gameChanged"))
    const names = validatePlayerNames(players.map((player) => player.name))
    if (!names.valid)
      throw new Error(names.errors.find(Boolean) ?? translate("board:playerNames.invalid"))
    const nextPlayers = game.players.map((player, index) => ({
      ...player,
      name: names.names[index],
      color: players[index].color,
      shape: players[index].shape,
    }))
    this.saveActiveGame({
      ...game,
      players: nextPlayers,
      ...(account
        ? { account: accountForSystem(game.system, localGameAccount(nextPlayers, account)) }
        : {}),
      updatedAt: Date.now(),
    })
  }

  /** why: clearActiveGame also runs when a game moves elsewhere, so only a discard says how far the game got. */
  discardActiveGame(
    endSource: GameEndSource,
    { undoable = false }: { undoable?: boolean } = {},
  ): void {
    const game = this.loadActiveGame()
    if (game) {
      if (undoable) this.rememberAbandoned(game, endSource)
      else this.reportAbandoned(game, endSource)
    }
    this.clearActiveGame()
  }

  /** why: Abandon asks nothing first, so the next board offers a started game back until its first action. Memory only, as that board may sit on another route. The report waits for the offer to end, so a game taken back never counts as abandoned. */
  rememberAbandoned(game: LocalGame, endSource: GameEndSource): void {
    this.forgetAbandoned()
    if (hasLocalGameStarted(game)) this.abandoned = { game, endSource }
  }

  recentlyAbandoned(): LocalGame | undefined {
    return this.abandoned?.game
  }

  forgetAbandoned(): void {
    const abandoned = this.takeBackAbandoned()
    if (abandoned) this.reportAbandoned(abandoned.game, abandoned.endSource)
  }

  takeBackAbandoned() {
    const abandoned = this.abandoned
    this.abandoned = undefined
    return abandoned
  }

  /** why: a match game restarted mid-way is thrown away too, but its board is replaced rather than cleared. */
  reportAbandoned(game: LocalGame, endSource: GameEndSource): void {
    if (game.status === "active" && hasLocalGameStarted(game))
      captureGame(
        "game_abandoned",
        {
          ...game,
          playerCount: game.players.length,
          shape: gameShape({ ...game, finishedAt: Date.now() }),
        },
        "local",
        endSource,
      )
  }

  clearActiveGame(): void {
    const raw = parseJson(this.storage.getString(LOCAL_KEYS.active))
    const chunkCount =
      isRecord(raw) && typeof raw.eventChunkCount === "number" ? raw.eventChunkCount : 0
    this.storage.delete(LOCAL_KEYS.active)
    for (let index = 0; index < chunkCount; index += 1) {
      this.storage.delete(LOCAL_KEYS.activeEvents(index))
    }
  }

  // why: a game claimed at setup keeps its owner even if another account is signed in at the end, so one account's seat and deck never move to another.
  archiveGame(
    game: LocalGame,
    endSource: GameEndSource = "game_menu",
    ownerId?: string,
  ): LocalGameSummary | null {
    if (game.status === "active" || game.finishedAt === undefined) return null
    const claimed = game.account ?? (ownerId ? { ownerId } : undefined)
    const account = claimed && accountForSystem(game.system, claimed)
    const summary: LocalGameSummary = {
      schemaVersion: 1,
      id: game.id,
      status: game.status,
      ...(game.system ? { system: game.system } : {}),
      ...(game.format ? { format: game.format } : {}),
      startingLife: game.startingLife,
      players: game.players,
      eventCount: game.events.length,
      ...(game.firstPlayerId ? { firstPlayerId: game.firstPlayerId } : {}),
      createdAt: game.createdAt,
      finishedAt: game.finishedAt,
      ...(game.result ? { result: game.result } : {}),
      ...(account ? { account } : {}),
      ...(account && game.status === "finished" ? { publish: "pending" as const } : {}),
      ...(game.match ? { match: game.match } : {}),
      ...(game.seatPassHashes ? { seatPassHashes: game.seatPassHashes } : {}),
      ...(game.turnGroups ? { turnGroups: game.turnGroups } : {}),
      ...(account && game.status === "finished" && game.match?.result
        ? { matchPublish: "pending" as const }
        : {}),
    }
    const current = this.loadHistory().filter(({ id }) => id !== game.id)
    const boundedGame = {
      ...game,
      ...(account ? { account } : {}),
      events: game.events.slice(-MAX_HISTORY_EVENTS),
    }
    const detail: HistoryDetail = {
      schemaVersion: 1,
      game: boundedGame,
      eventsTruncated: game.events.length > MAX_HISTORY_EVENTS,
    }
    this.storage.set(LOCAL_KEYS.historyDetail(game.id), JSON.stringify(detail))
    this.saveHistory([summary, ...current], current)
    const active = this.loadActiveGame()
    if (active?.id === game.id) this.clearActiveGame()
    const analyticsGame = { ...game, playerCount: game.players.length, shape: gameShape(game) }
    if (game.status === "finished") {
      recordReviewCompletion(`local:${game.id}`)
      captureGame("game_completed", analyticsGame, "local", endSource)
      this.finishListeners.forEach((listener) => listener())
    } else if (hasLocalGameStarted(game))
      captureGame("game_abandoned", analyticsGame, "local", endSource)
    this.notifyHistoryChanged()
    return summary
  }

  /** why: oldest first, so a match's games land in order. */
  pendingPublishes(ownerId: string): LocalGameSummary[] {
    return this.loadHistory()
      .filter((game) => game.publish === "pending" && game.account?.ownerId === ownerId)
      .sort((left, right) => left.finishedAt - right.finishedAt)
  }

  /** why: the index is the authority: a failed detail write is repaired by the next call or launch, and the error reaches the picker for retry. */
  resolveClaims(ownerId: string, decisions: readonly ClaimDecision[]): void {
    const history = this.loadHistory()
    const next = applyClaimDecisions(history, ownerId, decisions)
    const changed = next.some((game, index) => game !== history[index])
    if (changed) this.writeHistoryIndex(next)
    // why: a match claimed between games continues under the same account and seat, or its next game would not link.
    const active = this.loadActiveGame()
    const claimed = active?.match
      ? decisions.find((decision) => decision.claim && decision.id === active.match?.id)
      : undefined
    if (active && claimed && !active.account) {
      const me = claimed.meSeat === undefined ? undefined : active.players[claimed.meSeat]
      this.saveActiveGame({
        ...active,
        account: { ownerId, ...(me ? { mePlayerId: me.id } : {}) },
        updatedAt: Date.now(),
      })
    }
    try {
      this.repairClaimedDetails(ownerId)
    } finally {
      if (next.some((game, index) => game.account && !history[index].account))
        this.finishListeners.forEach((listener) => listener())
      if (changed) this.notifyHistoryChanged()
    }
  }

  loadDeferredClaims(ownerId: string): Set<string> {
    return new Set(this.readDeferredClaims()[ownerId])
  }

  /** why: ids of games that left history are dropped on each write, so the list never outgrows it. */
  deferClaims(ownerId: string, gameIds: readonly string[]): void {
    const live = new Set<string>(this.loadHistory().map((game) => game.id))
    const deferred = this.readDeferredClaims()
    const merged = [...new Set([...(deferred[ownerId] ?? []), ...gameIds])].filter((id) =>
      live.has(id),
    )
    this.writeDeferredClaims({ ...deferred, [ownerId]: merged })
  }

  reopenClaims(ownerId: string): void {
    const kept = Object.entries(this.readDeferredClaims()).filter(([id]) => id !== ownerId)
    this.writeDeferredClaims(Object.fromEntries(kept))
    this.claimListeners.forEach((listener) => listener())
  }

  private readDeferredClaims(): Record<string, string[]> {
    const raw = parseJson(this.storage.getString(LOCAL_KEYS.deferredClaims))
    if (!isRecord(raw)) return {}
    return Object.fromEntries(
      Object.entries(raw).flatMap(([ownerId, ids]) =>
        Array.isArray(ids) ? [[ownerId, ids.filter((id) => typeof id === "string")]] : [],
      ),
    )
  }

  private writeDeferredClaims(deferred: Record<string, string[]>): void {
    this.storage.set(LOCAL_KEYS.deferredClaims, JSON.stringify(deferred))
  }

  repairClaimedDetails(ownerId: string): void {
    for (const game of this.loadHistory()) {
      if (game.account?.ownerId !== ownerId) continue
      const detail = this.loadHistoryDetail(game.id)
      if (!detail || detail.game.account?.ownerId === ownerId) continue
      this.patchHistoryDetail(game.id, { account: game.account })
    }
  }

  /** why: patches the stored JSON, not a parsed game, so fields this build drops (a newer build's system) survive. */
  private patchHistoryDetail(gameId: string, patch: Partial<LocalGame>): void {
    const key = LOCAL_KEYS.historyDetail(gameId)
    const detail = parseJson(this.storage.getString(key))
    if (isRecord(detail) && isRecord(detail.game))
      this.storage.set(key, JSON.stringify({ ...detail, game: { ...detail.game, ...patch } }))
  }

  markPublished(gameId: string): void {
    this.settlePublish(gameId, "published")
  }

  markPublishFailed(gameId: string): void {
    this.settlePublish(gameId, "failed")
  }

  private settlePublish(gameId: string, publish: "published" | "failed"): void {
    this.patchSummary(gameId, (game) =>
      game.publish === "pending" ? { ...game, publish } : undefined,
    )
  }

  pendingMatchFinishes(ownerId: string): LocalGameSummary[] {
    const history = this.loadHistory()
    return history.filter(
      (game) =>
        game.matchPublish === "pending" &&
        game.account?.ownerId === ownerId &&
        !history.some((other) => other.publish === "pending" && other.match?.id === game.match?.id),
    )
  }

  matchFinishesWithFailedGames(ownerId: string): LocalGameSummary[] {
    const history = this.loadHistory()
    return history.filter(
      (game) =>
        game.matchPublish === "pending" &&
        game.account?.ownerId === ownerId &&
        history.some((other) => other.publish === "failed" && other.match?.id === game.match?.id),
    )
  }

  markMatchPublished(gameId: string): void {
    this.settleMatchPublish(gameId, "published")
  }

  markMatchPublishFailed(gameId: string): void {
    this.settleMatchPublish(gameId, "failed")
  }

  private settleMatchPublish(gameId: string, matchPublish: "published" | "failed"): void {
    this.patchSummary(gameId, (game) =>
      game.matchPublish === "pending" ? { ...game, matchPublish } : undefined,
    )
  }

  latestMatchGame(matchId: string): LocalGameSummary | undefined {
    return this.loadHistory().find((game) => game.match?.id === matchId)
  }

  loadPendingMatchEnd(): string | undefined {
    const matchId = this.storage.getString(LOCAL_KEYS.pendingMatchEnd)
    return matchId && this.latestMatchGame(matchId)?.match?.result === undefined
      ? matchId
      : undefined
  }

  savePendingMatchEnd(matchId: string | undefined): void {
    if (matchId === undefined) this.storage.delete(LOCAL_KEYS.pendingMatchEnd)
    else this.storage.set(LOCAL_KEYS.pendingMatchEnd, matchId)
  }

  finishMatch(matchId: string, outcomes: MatchSeatOutcome[]): LocalGameSummary | null {
    const latest = this.latestMatchGame(matchId)
    if (!latest?.match || latest.match.result || outcomes.length !== latest.players.length)
      return null
    const match = { ...latest.match, result: { outcomes } }
    const summary: LocalGameSummary = {
      ...latest,
      match,
      ...(latest.account && latest.status === "finished"
        ? { matchPublish: "pending" as const }
        : {}),
    }
    this.patchSummary(latest.id, () => summary)
    if (this.storage.getString(LOCAL_KEYS.pendingMatchEnd) === matchId)
      this.savePendingMatchEnd(undefined)
    this.patchHistoryDetail(latest.id, { match })
    if (summary.matchPublish) this.finishListeners.forEach((listener) => listener())
    return summary
  }

  private patchSummary(
    gameId: string,
    patch: (game: LocalGameSummary) => LocalGameSummary | undefined,
  ): void {
    const history = this.loadHistory()
    const index = history.findIndex((game) => game.id === gameId)
    const next = index === -1 ? undefined : patch(history[index])
    if (!next) return
    this.saveHistory(
      history.map((game) => (game.id === gameId ? next : game)),
      history,
    )
    this.notifyHistoryChanged()
  }

  private saveHistory(
    games: readonly LocalGameSummary[],
    previous: readonly LocalGameSummary[],
  ): void {
    const next = withinHistoryCap(games)
    this.writeHistoryIndex(next)
    previous
      .filter(({ id }) => !next.some((game) => game.id === id))
      .forEach(({ id }) => this.storage.delete(LOCAL_KEYS.historyDetail(id)))
  }

  private writeHistoryIndex(games: readonly LocalGameSummary[]): void {
    this.storage.set(LOCAL_KEYS.historyIndex, JSON.stringify(games.filter((game) => !isWide(game))))
    const wide = games.filter(isWide)
    if (wide.length > 0) this.storage.set(LOCAL_KEYS.wideHistoryIndex, JSON.stringify(wide))
    else this.storage.delete(LOCAL_KEYS.wideHistoryIndex)
  }

  private readHistoryIndex(key: string): LocalGameSummary[] {
    const raw = parseJson(this.storage.getString(key))
    return Array.isArray(raw)
      ? raw.map(parseSummary).filter((value): value is LocalGameSummary => value !== null)
      : []
  }

  loadHistory(): LocalGameSummary[] {
    const wide = this.readHistoryIndex(LOCAL_KEYS.wideHistoryIndex)
    const main = this.readHistoryIndex(LOCAL_KEYS.historyIndex)
    const games = withinHistoryCap(
      wide.length === 0
        ? main
        : [...main, ...wide].sort((left, right) => right.finishedAt - left.finishedAt),
    )
    return this.storage.getString(LOCAL_KEYS.noSystemHistoryRepaired)
      ? games
      : this.repairNoSystemHistory(games)
  }

  /** why: older index entries say "mtg" for No system games; only the detail knows. System-less details from before No system are Magic. */
  private repairNoSystemHistory(games: LocalGameSummary[]): LocalGameSummary[] {
    const repaired = games.map((game) => {
      if (game.system !== "mtg" || game.createdAt < NO_SYSTEM_RELEASED_AT) return game
      const detail = parseJson(this.storage.getString(LOCAL_KEYS.historyDetail(game.id)))
      if (!isRecord(detail) || !isRecord(detail.game) || isPlaySystemId(detail.game.system))
        return game
      const { system: _system, ...noSystem } = game
      return noSystem
    })
    if (repaired.some((game, index) => game !== games[index])) this.writeHistoryIndex(repaired)
    this.storage.set(LOCAL_KEYS.noSystemHistoryRepaired, "1")
    return repaired
  }

  loadHistoryDetail(gameId: string): { game: LocalGame; eventsTruncated: boolean } | null {
    const raw = parseJson(this.storage.getString(LOCAL_KEYS.historyDetail(gameId)))
    if (
      !isRecord(raw) ||
      raw.schemaVersion !== 1 ||
      typeof raw.eventsTruncated !== "boolean" ||
      !isRecord(raw.game)
    ) {
      return null
    }
    const rawEvents = raw.game.events
    if (!Array.isArray(rawEvents)) return null
    const events = rawEvents.map(parseEvent)
    if (events.some((event) => event === null)) return null
    const game = parseGame(raw.game, events as GameEvent[])
    return game ? { game, eventsTruncated: raw.eventsTruncated } : null
  }
}

export const localGameRepository = new LocalGameRepository()
