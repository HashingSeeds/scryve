import {
  DEFAULT_MENU_BUTTON_STYLE,
  isMenuButtonStyle,
  type MenuButtonStyle,
} from "@/components/GameMenuButtonShape"
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
import { playerGridLayoutForCount, type PlayerGridLayoutVariant } from "./playerLayouts"
import {
  isPlaySystemId,
  playSystemFormats,
  playSystemId,
  playSystemRules,
  type PlaySystemId,
} from "./playSystems"
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
} from "./types"
import { isPlayerMarkShape } from "../../../convex/lib/appearance"
import { isMatchBestOf, MAX_GAMES_PER_MATCH } from "../../../convex/lib/matchResults"

export const MAX_HISTORY_GAMES = 30
export const MAX_ACTIVE_EVENTS = 500
export const MAX_HISTORY_EVENTS = 250
const EVENT_CHUNK_SIZE = 100

export const LOCAL_KEYS = {
  device: "count.local.device.v1",
  analytics: "count.local.analytics.v1",
  settings: "count.local.settings.v1",
  legacySettings: "count.local.settings",
  active: "count.local.active.v1",
  layouts: "count.local.layouts.v1",
  historyIndex: "count.local.history.index.v1",
  meSeat: "count.local.meSeat.v1",
  pendingMatchEnd: "count.local.matchEnd.v1",
  activeEvents: (index: number) => `count.local.active.events.v1.${index}`,
  historyDetail: (gameId: string) => `count.local.history.detail.v1.${gameId}`,
} as const

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

interface ActiveMetadata {
  schemaVersion: 1
  game: Omit<LocalGame, "events">
  eventChunkCount: number
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

// why: a match that does not line up with the seats is dropped rather than scored wrong.
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
  const account = parseAccount(value.account)
  const match = parseMatch(value.match, players.length)
  return {
    schemaVersion: 1,
    id: asGameId(value.id),
    status: value.status,
    ...(isPlaySystemId(value.system) ? { system: value.system } : {}),
    ...(typeof value.format === "string" ? { format: value.format } : {}),
    layout: playerGridLayoutForCount(players.length, value.layout),
    lifeStep:
      isLifeDelta(value.lifeStep) && value.lifeStep > 0
        ? value.lifeStep
        : playSystemRules(value.system).counter.tapStep,
    startingLife: value.startingLife,
    players,
    events,
    ...(commanderDamage ? { commanderDamage } : {}),
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    ...(typeof value.finishedAt === "number" ? { finishedAt: value.finishedAt } : {}),
    ...(result ? { result } : {}),
    ...(account ? { account } : {}),
    ...(match ? { match } : {}),
  }
}

function parseSettings(value: unknown): LocalSettings | null {
  if (!isRecord(value)) return null
  const migrated = value.schemaVersion === undefined ? { ...value, schemaVersion: 1 } : value
  const maximumStartingValue = playSystemRules(migrated.defaultSystem).counter.maxStartingValue
  if (
    migrated.schemaVersion !== 1 ||
    typeof migrated.defaultPlayerCount !== "number" ||
    migrated.defaultPlayerCount < 2 ||
    migrated.defaultPlayerCount > 6 ||
    typeof migrated.defaultStartingLife !== "number" ||
    migrated.defaultStartingLife < 1 ||
    migrated.defaultStartingLife > maximumStartingValue ||
    typeof migrated.hapticsEnabled !== "boolean" ||
    (migrated.themePreference !== "system" &&
      migrated.themePreference !== "light" &&
      migrated.themePreference !== "dark")
  ) {
    return null
  }
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
    ...parseSystemPreference(migrated.defaultSystem, migrated.defaultFormat),
  }
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
  return players
    ? {
        schemaVersion: 1,
        id: asGameId(value.id),
        status: value.status,
        ...(isPlaySystemId(value.system) ? { system: value.system } : {}),
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
      }
    : null
}

export type LocalGameAccountInput = Parameters<typeof localGameAccount>[1]

export class LocalGameRepository {
  private readonly finishListeners = new Set<() => void>()
  private readonly historyListeners = new Set<() => void>()

  constructor(private readonly storage: StringStorage = mmkvStorage) {}

  /** why: the publisher waits for finishes and sign-in claims instead of polling storage. */
  onGameFinished(listener: () => void): () => void {
    this.finishListeners.add(listener)
    return () => {
      this.finishListeners.delete(listener)
    }
  }

  /** why: a mounted History re-reads after archives, publish results, and sign-in claims or skips. */
  onHistoryChanged(listener: () => void): () => void {
    this.historyListeners.add(listener)
    return () => {
      this.historyListeners.delete(listener)
    }
  }

  private notifyHistoryChanged(): void {
    this.historyListeners.forEach((listener) => listener())
  }

  // why: "none" means the player chose no seat last time, which is different from never having chosen.
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
    const current = parseSettings(parseJson(this.storage.getString(LOCAL_KEYS.settings)))
    if (current) return current
    const legacy = parseSettings(parseJson(this.storage.getString(LOCAL_KEYS.legacySettings)))
    const settings = legacy ?? DEFAULT_LOCAL_SETTINGS
    this.saveSettings(settings)
    if (legacy) this.storage.delete(LOCAL_KEYS.legacySettings)
    return settings
  }

  saveSettings(settings: LocalSettings): void {
    const valid = parseSettings(settings)
    this.storage.set(LOCAL_KEYS.settings, JSON.stringify(valid ?? DEFAULT_LOCAL_SETTINGS))
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

  saveActiveGame(game: LocalGame): void {
    if (game.status !== "active") return
    const previous = parseJson(this.storage.getString(LOCAL_KEYS.active))
    const previousChunkCount =
      isRecord(previous) && typeof previous.eventChunkCount === "number"
        ? previous.eventChunkCount
        : 0
    const events = game.events.slice(-MAX_ACTIVE_EVENTS)
    const chunkCount = Math.ceil(events.length / EVENT_CHUNK_SIZE)
    const { events: _events, ...gameWithoutEvents } = game
    const metadata: ActiveMetadata = {
      schemaVersion: 1,
      game: gameWithoutEvents,
      eventChunkCount: chunkCount,
    }
    this.storage.set(LOCAL_KEYS.active, JSON.stringify(metadata))
    for (let index = 0; index < chunkCount; index += 1) {
      this.storage.set(
        LOCAL_KEYS.activeEvents(index),
        JSON.stringify(events.slice(index * EVENT_CHUNK_SIZE, (index + 1) * EVENT_CHUNK_SIZE)),
      )
    }
    for (let index = chunkCount; index < previousChunkCount; index += 1) {
      this.storage.delete(LOCAL_KEYS.activeEvents(index))
    }
  }

  loadActiveGame(): LocalGame | null {
    const raw = parseJson(this.storage.getString(LOCAL_KEYS.active))
    if (!isRecord(raw) || raw.schemaVersion !== 1 || !isRecord(raw.game)) return null
    const chunkCount = raw.eventChunkCount
    if (
      typeof chunkCount !== "number" ||
      chunkCount < 0 ||
      chunkCount > MAX_ACTIVE_EVENTS / EVENT_CHUNK_SIZE
    ) {
      return null
    }
    const events: GameEvent[] = []
    for (let index = 0; index < chunkCount; index += 1) {
      const chunk = parseJson(this.storage.getString(LOCAL_KEYS.activeEvents(index)))
      if (!Array.isArray(chunk)) return null
      for (const rawEvent of chunk) {
        const event = parseEvent(rawEvent)
        if (!event) return null
        events.push(event)
      }
    }
    const game = parseGame(raw.game, events)
    return game?.status === "active" ? game : null
  }

  updateActivePlayers(
    gameId: string,
    players: NewPlayerInput[],
    account?: LocalGameAccountInput,
  ): void {
    const game = this.loadActiveGame()
    if (!game || game.id !== gameId || game.players.length !== players.length)
      throw new Error("This game changed. Reopen setup to edit its players.")
    const names = validatePlayerNames(players.map((player) => player.name))
    if (!names.valid) throw new Error(names.errors.find(Boolean) ?? "Enter valid player names.")
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
      system: playSystemId(game.system),
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
      ...(account && game.status === "finished" && game.match?.result
        ? { matchPublish: "pending" as const }
        : {}),
    }
    const current = this.loadHistory().filter(({ id }) => id !== game.id)
    const next = [summary, ...current].slice(0, MAX_HISTORY_GAMES)
    const removed = current.filter(({ id }) => !next.some((candidate) => candidate.id === id))
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
    this.storage.set(LOCAL_KEYS.historyIndex, JSON.stringify(next))
    removed.forEach(({ id }) => this.storage.delete(LOCAL_KEYS.historyDetail(id)))
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

  /** why: brings every detail record owned by this account in line with the index; safe to run on any launch. */
  repairClaimedDetails(ownerId: string): void {
    for (const game of this.loadHistory()) {
      if (game.account?.ownerId !== ownerId) continue
      const detail = this.loadHistoryDetail(game.id)
      if (!detail || detail.game.account?.ownerId === ownerId) continue
      const record: HistoryDetail = {
        schemaVersion: 1,
        game: { ...detail.game, account: game.account },
        eventsTruncated: detail.eventsTruncated,
      }
      this.storage.set(LOCAL_KEYS.historyDetail(game.id), JSON.stringify(record))
    }
  }

  markPublished(gameId: string): void {
    this.settlePublish(gameId, "published")
  }

  // why: a game the server rejected stays on the device but stops blocking the uploads behind it.
  markPublishFailed(gameId: string): void {
    this.settlePublish(gameId, "failed")
  }

  private settlePublish(gameId: string, publish: "published" | "failed"): void {
    this.patchSummary(gameId, (game) =>
      game.publish === "pending" ? { ...game, publish } : undefined,
    )
  }

  /** why: a match result only uploads once every game it counts has been acked. */
  pendingMatchFinishes(ownerId: string): LocalGameSummary[] {
    const history = this.loadHistory()
    return history.filter(
      (game) =>
        game.matchPublish === "pending" &&
        game.account?.ownerId === ownerId &&
        !history.some((other) => other.publish === "pending" && other.match?.id === game.match?.id),
    )
  }

  /** why: the server scores a match from its published games, so a result with a rejected game can never land. */
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

  /** why: the latest game of a match is the one that carries its result when the player ends it. */
  latestMatchGame(matchId: string): LocalGameSummary | undefined {
    return this.loadHistory().find((game) => game.match?.id === matchId)
  }

  /** why: a match that hit the game cap has no board left; the result it still owes survives a restart here. */
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

  // why: ending a match happens after its last game was archived, so the result is written onto that game.
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
    const detail = parseJson(this.storage.getString(LOCAL_KEYS.historyDetail(latest.id)))
    if (isRecord(detail) && isRecord(detail.game))
      this.storage.set(
        LOCAL_KEYS.historyDetail(latest.id),
        JSON.stringify({ ...detail, game: { ...detail.game, match } }),
      )
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
    this.storage.set(
      LOCAL_KEYS.historyIndex,
      JSON.stringify(history.map((game) => (game.id === gameId ? next : game))),
    )
    this.notifyHistoryChanged()
  }

  loadHistory(): LocalGameSummary[] {
    const raw = parseJson(this.storage.getString(LOCAL_KEYS.historyIndex))
    if (!Array.isArray(raw)) return []
    return raw
      .map(parseSummary)
      .filter((value): value is LocalGameSummary => value !== null)
      .slice(0, MAX_HISTORY_GAMES)
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
