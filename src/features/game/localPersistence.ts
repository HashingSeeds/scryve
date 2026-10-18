import {
  DEFAULT_MENU_BUTTON_STYLE,
  isMenuButtonStyle,
  type MenuButtonStyle,
} from "@/components/GameMenuButtonShape"
import { translate } from "@/i18n/translate"
import { captureGame, type GameEndSource } from "@/utils/analytics"
import { storage as mmkvStorage } from "@/utils/storage"
import { recordReviewCompletion } from "@/utils/storeReview"

import {
  asActorId,
  asDeviceId,
  asGameId,
  asOperationId,
  asPlayerId,
  createClientId,
  isLifeDelta,
  localGameAccount,
  MAX_COMMANDER_DAMAGE,
  validatePlayerNames,
} from "./domain"
import { applyClaimDecisions, type ClaimDecision } from "./localGameClaims"
import {
  isSeatOrder,
  playerGridLayoutForCount,
  type PlayerGridLayoutVariant,
} from "./playerLayouts"
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
} from "./types"
import { isPlayerMarkShape } from "../../../convex/lib/appearance"
import { isMatchBestOf, MAX_GAMES_PER_MATCH } from "../../../convex/lib/matchResults"
import { isSeatPassHash } from "../../../convex/lib/seatPass"
import { startingValueRange } from "../../../convex/lib/systems"
import { parseTableState } from "../../../convex/lib/table"

export const MAX_HISTORY_GAMES = 30
export const MAX_ACTIVE_EVENTS = 500
export const MAX_HISTORY_EVENTS = 250
const EVENT_CHUNK_SIZE = 100
const ACTIVE_SCHEMA_VERSION = 1

export const LOCAL_KEYS = {
  device: "count.local.device.v1",
  analytics: "count.local.analytics.v1",
  settings: "count.local.settings.v1",
  legacySettings: "count.local.settings",
  active: "count.local.active.v1",
  layouts: "count.local.layouts.v1",
  historyIndex: "count.local.history.index.v1",
  noSystemHistoryRepaired: "count.local.history.noSystemRepaired.v1",
  meSeat: "count.local.meSeat.v1",
  pendingMatchEnd: "count.local.matchEnd.v1",
  recentSetups: "count.local.recentSetups.v1",
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
  menuButtonStyle: MenuButtonStyle
  launchDestination: LaunchDestination
  defaultSystem?: PlaySystemId
  defaultFormat?: string
  askWhatYouPlay?: true
}

export const DEFAULT_LOCAL_SETTINGS: LocalSettings = {
  schemaVersion: 1,
  defaultPlayerCount: 2,
  defaultStartingLife: 20,
  hapticsEnabled: true,
  themePreference: "system",
  menuButtonStyle: DEFAULT_MENU_BUTTON_STYLE,
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
  schemaVersion: typeof ACTIVE_SCHEMA_VERSION
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

function parseJson(value: string | undefined): unknown {
  if (!value) return null
  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
  }
}

function readActiveLayout(raw: unknown): ActiveEventLayout | null {
  if (!isRecord(raw) || raw.schemaVersion !== ACTIVE_SCHEMA_VERSION) return null
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
    raw.schemaVersion > ACTIVE_SCHEMA_VERSION
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
 * why: chunks are written before the metadata that commits them, so a killed save can leave an
 * event past the committed one, or a half-done rewrite that repeats a chunk. Keeping each operation
 * once, up to the committed one, matches the life totals the metadata stored.
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
  if (!Array.isArray(value) || value.length < 2 || value.length > 6) return null
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

function parseAccount(value: unknown): LocalGameAccount | undefined {
  if (!isRecord(value) || typeof value.ownerId !== "string" || !value.ownerId) return undefined
  const deckVersionId = typeof value.deckVersionId === "string" ? value.deckVersionId : undefined
  return {
    ownerId: value.ownerId,
    ...(typeof value.mePlayerId === "string" ? { mePlayerId: asPlayerId(value.mePlayerId) } : {}),
    ...(deckVersionId ? { deckVersionId } : {}),
    ...(deckVersionId && typeof value.deckName === "string" ? { deckName: value.deckName } : {}),
  }
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
  const account = parseAccount(value.account)
  const match = parseMatch(value.match, players.length)
  const clock = parseRoundClock(value.clock)
  return {
    schemaVersion: 1,
    id: asGameId(value.id),
    status: value.status,
    ...(isPlaySystemId(value.system) ? { system: value.system } : {}),
    ...(typeof value.format === "string" ? { format: value.format } : {}),
    layout: playerGridLayoutForCount(players.length, value.layout),
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
  }
}

function parseSettings(value: unknown): LocalSettings | null {
  if (!isRecord(value)) return null
  const migrated = value.schemaVersion === undefined ? { ...value, schemaVersion: 1 } : value
  const startingValue = startingValueRange(migrated.defaultSystem)
  if (
    migrated.schemaVersion !== 1 ||
    typeof migrated.defaultPlayerCount !== "number" ||
    migrated.defaultPlayerCount < 2 ||
    migrated.defaultPlayerCount > 6 ||
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
    menuButtonStyle: isMenuButtonStyle(migrated.menuButtonStyle)
      ? migrated.menuButtonStyle
      : DEFAULT_MENU_BUTTON_STYLE,
    launchDestination: migrated.launchDestination === "decks" ? "decks" : "play",
    ...systemPreference,
    ...(migrated.askWhatYouPlay === true ? { askWhatYouPlay: true } : {}),
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
  const account = parseAccount(value.account)
  const skippedBy = parseSkippedBy(value.skippedBy)
  const match = players ? parseMatch(value.match, players.length) : undefined
  const seatPassHashes = players ? parseSeatPassHashes(value.seatPassHashes, players) : undefined
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

function withinHistoryCap(games: readonly LocalGameSummary[]): LocalGameSummary[] {
  return games.filter(
    (game, index) =>
      index < MAX_HISTORY_GAMES || game.publish === "pending" || game.matchPublish === "pending",
  )
}

export type LocalGameAccountInput = Parameters<typeof localGameAccount>[1]

export class LocalGameRepository {
  private readonly finishListeners = new Set<() => void>()
  private readonly historyListeners = new Set<() => void>()

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

  private notifyHistoryChanged(): void {
    this.historyListeners.forEach((listener) => listener())
  }

  loadMeSeat(): number | "none" | undefined {
    const stored = this.storage.getString(LOCAL_KEYS.meSeat)
    if (stored === "none") return "none"
    const raw = Number(stored)
    return stored !== undefined && Number.isInteger(raw) && raw >= 0 && raw < 6 ? raw : undefined
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
    if (current && isRecord(stored) && stored.brawlLifeMigrated === true) return current
    const legacyText = current ? undefined : this.storage.getString(LOCAL_KEYS.legacySettings)
    const legacy = parseSettings(parseJson(legacyText))
    const found = current ?? legacy
    // why: every launch saves settings, so nothing stored at all means this install has never opened.
    const freshInstall = storedText === undefined && legacyText === undefined
    const settings: LocalSettings = found
      ? migrateBrawlStartingLife(found)
      : freshInstall
        ? { ...DEFAULT_LOCAL_SETTINGS, askWhatYouPlay: true }
        : DEFAULT_LOCAL_SETTINGS
    this.saveSettings(settings)
    if (legacy) this.storage.delete(LOCAL_KEYS.legacySettings)
    return settings
  }

  saveSettings(settings: LocalSettings): void {
    const valid = parseSettings(settings) ?? DEFAULT_LOCAL_SETTINGS
    // why: anything this build saves is past the one-time Brawl fix, so a 20 chosen afterward is never migrated again.
    this.storage.set(LOCAL_KEYS.settings, JSON.stringify({ ...valid, brawlLifeMigrated: true }))
  }

  loadLayoutPreference(playerCount: number): PlayerGridLayoutVariant {
    const layouts = parseJson(this.storage.getString(LOCAL_KEYS.layouts))
    if (!isRecord(layouts)) return "auto"
    return playerGridLayoutForCount(playerCount, layouts[String(playerCount)])
  }

  saveLayoutPreference(playerCount: number, layout: PlayerGridLayoutVariant): void {
    const current = parseJson(this.storage.getString(LOCAL_KEYS.layouts))
    const layouts = isRecord(current) ? current : {}
    this.storage.set(
      LOCAL_KEYS.layouts,
      JSON.stringify({ ...layouts, [playerCount]: playerGridLayoutForCount(playerCount, layout) }),
    )
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
      schemaVersion: ACTIVE_SCHEMA_VERSION,
      game: gameWithoutEvents,
      eventChunkCount: chunkCount,
      eventCount: kept.length,
      ...(kept.length > 0 ? { lastOperationId: kept[kept.length - 1].operationId } : {}),
    }
    this.storage.set(LOCAL_KEYS.active, JSON.stringify(metadata))
    for (let index = chunkCount; index < (previous?.chunkCount ?? 0); index += 1) {
      this.storage.delete(LOCAL_KEYS.activeEvents(index))
    }
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
      ...(account ? { account: localGameAccount(nextPlayers, account) } : {}),
      updatedAt: Date.now(),
    })
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

  // why: a game claimed at setup keeps that owner even if another account is signed in when it ends, so one account's seat and deck never move to another.
  archiveGame(
    game: LocalGame,
    endSource: GameEndSource = "game_menu",
    ownerId?: string,
  ): LocalGameSummary | null {
    if (game.status === "active" || game.finishedAt === undefined) return null
    const account = game.account ?? (ownerId ? { ownerId } : undefined)
    const summary: LocalGameSummary = {
      schemaVersion: 1,
      id: game.id,
      status: game.status,
      ...(game.system ? { system: game.system } : {}),
      ...(game.format ? { format: game.format } : {}),
      startingLife: game.startingLife,
      players: game.players,
      eventCount: game.events.length,
      createdAt: game.createdAt,
      finishedAt: game.finishedAt,
      ...(game.result ? { result: game.result } : {}),
      ...(account ? { account } : {}),
      ...(account && game.status === "finished" ? { publish: "pending" as const } : {}),
      ...(game.match ? { match: game.match } : {}),
      ...(game.seatPassHashes ? { seatPassHashes: game.seatPassHashes } : {}),
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
    if (game.status === "finished") {
      recordReviewCompletion(`local:${game.id}`)
      captureGame(
        "game_completed",
        { ...game, playerCount: game.players.length },
        "local",
        endSource,
      )
      this.finishListeners.forEach((listener) => listener())
    }
    this.notifyHistoryChanged()
    return summary
  }

  /** why: the uploader runs through this list on sign-in, reconnect, and every finish, oldest first so a match's games land in order. */
  pendingPublishes(ownerId: string): LocalGameSummary[] {
    return this.loadHistory()
      .filter((game) => game.publish === "pending" && game.account?.ownerId === ownerId)
      .sort((left, right) => left.finishedAt - right.finishedAt)
  }

  /** why: the sign-in picker files claimed games under the account and remembers who declined the rest. The index is the authority: once it is written, a failed detail write is repaired by the next call or launch, and the error reaches the picker so the user can retry. */
  resolveClaims(ownerId: string, decisions: readonly ClaimDecision[]): void {
    const history = this.loadHistory()
    const next = applyClaimDecisions(history, ownerId, decisions)
    const changed = next.some((game, index) => game !== history[index])
    if (changed) this.storage.set(LOCAL_KEYS.historyIndex, JSON.stringify(next))
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
    this.storage.set(LOCAL_KEYS.historyIndex, JSON.stringify(next))
    previous
      .filter(({ id }) => !next.some((game) => game.id === id))
      .forEach(({ id }) => this.storage.delete(LOCAL_KEYS.historyDetail(id)))
  }

  loadHistory(): LocalGameSummary[] {
    const raw = parseJson(this.storage.getString(LOCAL_KEYS.historyIndex))
    if (!Array.isArray(raw)) return []
    const games = withinHistoryCap(
      raw.map(parseSummary).filter((value): value is LocalGameSummary => value !== null),
    )
    return this.storage.getString(LOCAL_KEYS.noSystemHistoryRepaired)
      ? games
      : this.repairNoSystemHistory(games)
  }

  /** why: older index entries say "mtg" for No system games and only the detail knows otherwise. Games from before No system existed have system-less details too, and those are Magic. */
  private repairNoSystemHistory(games: LocalGameSummary[]): LocalGameSummary[] {
    const repaired = games.map((game) => {
      if (game.system !== "mtg" || game.createdAt < NO_SYSTEM_RELEASED_AT) return game
      const detail = parseJson(this.storage.getString(LOCAL_KEYS.historyDetail(game.id)))
      if (!isRecord(detail) || !isRecord(detail.game) || isPlaySystemId(detail.game.system))
        return game
      const { system: _system, ...noSystem } = game
      return noSystem
    })
    if (repaired.some((game, index) => game !== games[index]))
      this.storage.set(LOCAL_KEYS.historyIndex, JSON.stringify(repaired))
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
