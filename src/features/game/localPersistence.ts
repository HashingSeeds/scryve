import {
  DEFAULT_MENU_BUTTON_STYLE,
  isMenuButtonStyle,
  type MenuButtonStyle,
} from "@/components/GameMenuButtonShape"
import { storage as mmkvStorage } from "@/utils/storage"

import {
  asActorId,
  asDeviceId,
  asGameId,
  asOperationId,
  asPlayerId,
  createClientId,
  isLifeDelta,
} from "./domain"
import { playSystemId } from "./playSystems"
import type { GameEvent, GamePlayer, LocalGame, LocalGameResult, LocalGameSummary } from "./types"
import { isPlayerMarkShape } from "../../../convex/lib/appearance"

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
  historyIndex: "count.local.history.index.v1",
  activeEvents: (index: number) => `count.local.active.events.v1.${index}`,
  historyDetail: (gameId: string) => `count.local.history.detail.v1.${gameId}`,
} as const

export type ThemePreference = "system" | "light" | "dark"

export interface LocalSettings {
  schemaVersion: 1
  defaultPlayerCount: number
  defaultStartingLife: number
  hapticsEnabled: boolean
  themePreference: ThemePreference
  menuButtonStyle: MenuButtonStyle
}

export const DEFAULT_LOCAL_SETTINGS: LocalSettings = {
  schemaVersion: 1,
  defaultPlayerCount: 2,
  defaultStartingLife: 20,
  hapticsEnabled: true,
  themePreference: "system",
  menuButtonStyle: DEFAULT_MENU_BUTTON_STYLE,
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
  return {
    schemaVersion: 1,
    id: asGameId(value.id),
    status: value.status,
    system: playSystemId(value.system),
    ...(typeof value.format === "string" ? { format: value.format } : {}),
    startingLife: value.startingLife,
    players,
    events,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    ...(typeof value.finishedAt === "number" ? { finishedAt: value.finishedAt } : {}),
    ...(result ? { result } : {}),
  }
}

function parseSettings(value: unknown): LocalSettings | null {
  if (!isRecord(value)) return null
  const migrated = value.schemaVersion === undefined ? { ...value, schemaVersion: 1 } : value
  if (
    migrated.schemaVersion !== 1 ||
    typeof migrated.defaultPlayerCount !== "number" ||
    migrated.defaultPlayerCount < 2 ||
    migrated.defaultPlayerCount > 6 ||
    typeof migrated.defaultStartingLife !== "number" ||
    migrated.defaultStartingLife < 1 ||
    migrated.defaultStartingLife > 999 ||
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
  }
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
  return players
    ? {
        schemaVersion: 1,
        id: asGameId(value.id),
        status: value.status,
        system: playSystemId(value.system),
        ...(typeof value.format === "string" ? { format: value.format } : {}),
        startingLife: value.startingLife,
        players,
        eventCount: value.eventCount,
        createdAt: value.createdAt,
        finishedAt: value.finishedAt,
        ...(result ? { result } : {}),
      }
    : null
}

export class LocalGameRepository {
  constructor(private readonly storage: StringStorage = mmkvStorage) {}

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

  clearActiveGame(): void {
    const raw = parseJson(this.storage.getString(LOCAL_KEYS.active))
    const chunkCount =
      isRecord(raw) && typeof raw.eventChunkCount === "number" ? raw.eventChunkCount : 0
    this.storage.delete(LOCAL_KEYS.active)
    for (let index = 0; index < chunkCount; index += 1) {
      this.storage.delete(LOCAL_KEYS.activeEvents(index))
    }
  }

  archiveGame(game: LocalGame): LocalGameSummary | null {
    if (game.status === "active" || game.finishedAt === undefined) return null
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
    }
    const current = this.loadHistory().filter(({ id }) => id !== game.id)
    const next = [summary, ...current].slice(0, MAX_HISTORY_GAMES)
    const removed = current.filter(({ id }) => !next.some((candidate) => candidate.id === id))
    const boundedGame = { ...game, events: game.events.slice(-MAX_HISTORY_EVENTS) }
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
    return summary
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
