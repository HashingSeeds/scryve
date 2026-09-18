import { readPublicCloudConfig } from "@/features/auth/config"
import {
  DURABLE_OUTBOX_LIMITS,
  DurableOutbox,
  type DurableEnqueueResult,
  type DurableFailResult,
  type DurableOutboxCodec,
  type DurableOutboxKeys,
  type DurableOutboxLimits,
  type DurableStringStorage,
} from "@/features/sync/durableOutbox"
import { storage as mmkvStorage } from "@/utils/storage"

import type { ResumableGame } from "./connectedCopy"
import type {
  CommanderDamageResolvedEvent,
  CommanderDamageSubmittedEvent,
  ConnectedActionEvent,
  ConnectedProjection,
  FailedLifeAction,
  PendingLifeAction,
} from "./model"
import { toConnectedProjection } from "./model"
import {
  asActorId,
  asDeviceId,
  asGameId,
  asOperationId,
  asPlayerId,
  isCommanderDamageDelta,
  isLifeDelta,
} from "../game/domain"
import type { LifeChangedEvent } from "../game/types"

export interface ConnectedStringStorage extends DurableStringStorage {}

export const CONNECTED_PERSISTENCE_LIMITS = {
  schemaVersion: 1,
  ...DURABLE_OUTBOX_LIMITS,
} as const

export interface ConnectedPersistenceLimits extends DurableOutboxLimits {}

export type EnqueueResult = DurableEnqueueResult<PendingLifeAction>
export type FailActionResult = DurableFailResult<PendingLifeAction, FailedLifeAction>

export const RESUME_INDEX_LIMIT = 30

const scoped = (ownerId: string, gameId: string) =>
  `${ownerId.length}:${ownerId}.${gameId.length}:${gameId}`
const ownerScoped = (ownerId: string) => `${ownerId.length}:${ownerId}`

export function connectedDeploymentScope(): string {
  const config = readPublicCloudConfig()
  if (!config.configured) return "unconfigured"
  try {
    return new URL(config.value.convexUrl).host
  } catch {
    return config.value.convexUrl
  }
}

export const CONNECTED_KEYS = {
  projection: (gameId: string, ownerId = "anonymous") =>
    `count.connected.projection.v1.${scoped(ownerId, gameId)}`,
  outboxIndex: (gameId: string, ownerId = "anonymous") =>
    `count.connected.outbox.index.v1.${scoped(ownerId, gameId)}`,
  outboxRecord: (gameId: string, operationId: string, ownerId = "anonymous") =>
    `count.connected.outbox.record.v1.${scoped(ownerId, gameId)}.${operationId}`,
  failedIndex: (gameId: string, ownerId = "anonymous") =>
    `count.connected.failed.index.v1.${scoped(ownerId, gameId)}`,
  failedRecord: (gameId: string, operationId: string, ownerId = "anonymous") =>
    `count.connected.failed.record.v1.${scoped(ownerId, gameId)}.${operationId}`,
  membershipMigration: (ownerId: string) =>
    `count.connected.membership-migration.v1.${ownerScoped(ownerId)}`,
  resumeIndex: (ownerId: string, deployment: string) =>
    `count.connected.resume.v1.${deployment}.${ownerScoped(ownerId)}`,
  legacyOutbox: (gameId: string) => `count.connected.outbox.v0.${gameId}`,
} as const

const outboxKeys: DurableOutboxKeys = {
  pendingIndex: CONNECTED_KEYS.outboxIndex,
  pendingRecord: CONNECTED_KEYS.outboxRecord,
  failedIndex: CONNECTED_KEYS.failedIndex,
  failedRecord: CONNECTED_KEYS.failedRecord,
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

function parseLifeEvent(value: Record<string, unknown>): LifeChangedEvent | null {
  if (
    !isRecord(value) ||
    value.type !== "life.changed" ||
    typeof value.operationId !== "string" ||
    typeof value.gameId !== "string" ||
    typeof value.playerId !== "string" ||
    !isLifeDelta(value.delta) ||
    typeof value.actorId !== "string" ||
    typeof value.deviceId !== "string" ||
    !/^[A-Za-z0-9_-]{16,128}$/.test(value.operationId) ||
    !/^[A-Za-z0-9_-]{8,128}$/.test(value.deviceId) ||
    typeof value.clientCreatedAt !== "number" ||
    !Number.isSafeInteger(value.clientCreatedAt) ||
    value.clientCreatedAt < 0 ||
    (value.compensatesOperationId !== undefined &&
      (typeof value.compensatesOperationId !== "string" ||
        !/^[A-Za-z0-9_-]{16,128}$/.test(value.compensatesOperationId)))
  )
    return null
  return {
    type: "life.changed",
    operationId: asOperationId(value.operationId),
    gameId: asGameId(value.gameId),
    playerId: asPlayerId(value.playerId),
    delta: value.delta,
    actorId: asActorId(value.actorId),
    deviceId: asDeviceId(value.deviceId),
    clientCreatedAt: value.clientCreatedAt,
    ...(typeof value.compensatesOperationId === "string"
      ? { compensatesOperationId: asOperationId(value.compensatesOperationId) }
      : {}),
  }
}

function parseCommanderDamageEvent(
  value: Record<string, unknown>,
): CommanderDamageSubmittedEvent | null {
  if (
    value.type !== "commanderDamage.submitted" ||
    typeof value.operationId !== "string" ||
    typeof value.gameId !== "string" ||
    typeof value.fromPlayerId !== "string" ||
    typeof value.toPlayerId !== "string" ||
    value.fromPlayerId === value.toPlayerId ||
    !isCommanderDamageDelta(value.delta) ||
    typeof value.actorId !== "string" ||
    typeof value.deviceId !== "string" ||
    !/^[A-Za-z0-9_-]{16,128}$/.test(value.operationId) ||
    !/^[A-Za-z0-9_-]{8,128}$/.test(value.deviceId) ||
    typeof value.clientCreatedAt !== "number" ||
    !Number.isSafeInteger(value.clientCreatedAt) ||
    value.clientCreatedAt < 0
  )
    return null
  return {
    type: "commanderDamage.submitted",
    operationId: asOperationId(value.operationId),
    gameId: asGameId(value.gameId),
    fromPlayerId: asPlayerId(value.fromPlayerId),
    toPlayerId: asPlayerId(value.toPlayerId),
    delta: value.delta,
    actorId: asActorId(value.actorId),
    deviceId: asDeviceId(value.deviceId),
    clientCreatedAt: value.clientCreatedAt,
  }
}

function parseCommanderResolutionEvent(
  value: Record<string, unknown>,
): CommanderDamageResolvedEvent | null {
  if (
    value.type !== "commanderDamage.resolved" ||
    typeof value.operationId !== "string" ||
    typeof value.claimOperationId !== "string" ||
    typeof value.gameId !== "string" ||
    typeof value.toPlayerId !== "string" ||
    typeof value.accepted !== "boolean" ||
    typeof value.actorId !== "string" ||
    typeof value.deviceId !== "string" ||
    !/^[A-Za-z0-9_-]{16,128}$/.test(value.operationId) ||
    !/^[A-Za-z0-9_-]{16,128}$/.test(value.claimOperationId) ||
    !/^[A-Za-z0-9_-]{8,128}$/.test(value.deviceId) ||
    typeof value.clientCreatedAt !== "number" ||
    !Number.isSafeInteger(value.clientCreatedAt) ||
    value.clientCreatedAt < 0
  )
    return null
  return {
    type: "commanderDamage.resolved",
    operationId: asOperationId(value.operationId),
    claimOperationId: asOperationId(value.claimOperationId),
    gameId: asGameId(value.gameId),
    toPlayerId: asPlayerId(value.toPlayerId),
    accepted: value.accepted,
    actorId: asActorId(value.actorId),
    deviceId: asDeviceId(value.deviceId),
    clientCreatedAt: value.clientCreatedAt,
  }
}

function parseEvent(value: unknown): ConnectedActionEvent | null {
  if (!isRecord(value)) return null
  if (value.type === "life.changed") return parseLifeEvent(value)
  if (value.type === "commanderDamage.resolved") return parseCommanderResolutionEvent(value)
  return parseCommanderDamageEvent(value)
}

function parsePending(value: unknown): PendingLifeAction | null {
  if (!isRecord(value) || (value.schemaVersion !== undefined && value.schemaVersion !== 1))
    return null
  const event = parseEvent(value.event)
  if (!event || typeof value.queuedAt !== "number" || !Number.isFinite(value.queuedAt)) return null
  const attempts =
    typeof value.attempts === "number" && Number.isInteger(value.attempts) && value.attempts >= 0
      ? value.attempts
      : 0
  return {
    schemaVersion: 1,
    event,
    queuedAt: value.queuedAt,
    attempts,
    ...(typeof value.lastAttemptAt === "number" && Number.isFinite(value.lastAttemptAt)
      ? { lastAttemptAt: value.lastAttemptAt }
      : {}),
  }
}

function parseFailed(value: unknown): FailedLifeAction | null {
  if (!isRecord(value) || value.schemaVersion !== 1) return null
  const action = parsePending(value.action)
  if (
    !action ||
    typeof value.reason !== "string" ||
    typeof value.failedAt !== "number" ||
    !Number.isFinite(value.failedAt)
  )
    return null
  return { schemaVersion: 1, action, reason: value.reason, failedAt: value.failedAt }
}

function parseResumeEntry(value: unknown): ResumableGame | null {
  if (!isRecord(value) || typeof value.publicId !== "string" || !value.publicId) return null
  if (value.status !== "lobby" && value.status !== "active") return null
  if (typeof value.isHost !== "boolean") return null
  if (typeof value.playerCount !== "number" || !Number.isInteger(value.playerCount)) return null
  if (typeof value.ruleset !== "string" || typeof value.updatedAt !== "number") return null
  if (!Number.isSafeInteger(value.updatedAt) || value.updatedAt < 0) return null
  if (value.deckRequired !== undefined && typeof value.deckRequired !== "boolean") return null
  if (
    value.startingLife !== undefined &&
    (typeof value.startingLife !== "number" || !Number.isSafeInteger(value.startingLife))
  )
    return null
  return {
    publicId: value.publicId,
    status: value.status,
    isHost: value.isHost,
    playerCount: value.playerCount,
    ruleset: value.ruleset,
    updatedAt: value.updatedAt,
    ...(typeof value.system === "string" ? { system: value.system } : {}),
    ...(typeof value.format === "string" ? { format: value.format } : {}),
    ...(value.deckRequired === true ? { deckRequired: true } : {}),
    ...(value.startingLife !== undefined ? { startingLife: value.startingLife } : {}),
  }
}

const resumeOrder = (left: ResumableGame, right: ResumableGame) =>
  Number(right.isHost) - Number(left.isHost) || right.updatedAt - left.updatedAt

function filteredResumeBound(games: Array<ResumableGame | null>): ResumableGame[] {
  return games
    .filter((game): game is ResumableGame => game !== null)
    .sort(resumeOrder)
    .slice(0, RESUME_INDEX_LIMIT)
}

function parseResumeIndex(stored: unknown): ResumableGame[] {
  if (!isRecord(stored) || stored.schemaVersion !== 1 || !Array.isArray(stored.games)) return []
  return filteredResumeBound(stored.games.map(parseResumeEntry))
}

export function loadNewestResumeGame(
  storage: ConnectedStringStorage = mmkvStorage,
  deployment = connectedDeploymentScope(),
): ResumableGame | null {
  const prefix = `count.connected.resume.v1.${deployment}.`
  let newest: ResumableGame | null = null
  for (const key of storage.getAllKeys()) {
    if (!key.startsWith(prefix) || !/^\d+:/.test(key.slice(prefix.length))) continue
    for (const game of parseResumeIndex(parseJson(storage.getString(key)))) {
      if (!newest || game.updatedAt > newest.updatedAt) newest = game
    }
  }
  return newest
}

const resumeIndexListeners = new Set<() => void>()

export function subscribeResumeIndex(listener: () => void): () => void {
  resumeIndexListeners.add(listener)
  return () => {
    resumeIndexListeners.delete(listener)
  }
}

function notifyResumeIndexChanged(): void {
  for (const listener of [...resumeIndexListeners]) listener()
}

const outboxCodec: DurableOutboxCodec<PendingLifeAction, FailedLifeAction> = {
  parsePending,
  parseFailed,
  createFailure: (action, reason, failedAt) => ({ schemaVersion: 1, action, reason, failedAt }),
  operationId: (action) => action.event.operationId,
  belongsToScope: (action, ownerId, gameId) =>
    action.event.gameId === gameId && (ownerId === "anonymous" || action.event.actorId === ownerId),
  compare: (left, right) =>
    left.queuedAt - right.queuedAt ||
    left.event.clientCreatedAt - right.event.clientCreatedAt ||
    left.event.operationId.localeCompare(right.event.operationId),
}

export class ConnectedGameRepository {
  private readonly outbox: DurableOutbox<PendingLifeAction, FailedLifeAction>

  constructor(
    private readonly storage: ConnectedStringStorage = mmkvStorage,
    private readonly ownerId = "anonymous",
    limits: Partial<ConnectedPersistenceLimits> = {},
    private readonly deployment = connectedDeploymentScope(),
  ) {
    this.outbox = new DurableOutbox(storage, ownerId, outboxKeys, outboxCodec, limits)
  }

  saveProjection(projection: ConnectedProjection): void {
    this.storage.set(
      CONNECTED_KEYS.projection(projection.publicId, this.ownerId),
      JSON.stringify(projection),
    )
  }

  loadProjection(gameId: string): ConnectedProjection | null {
    const key = CONNECTED_KEYS.projection(gameId, this.ownerId)
    const stored = parseJson(this.storage.getString(key))
    if (!isRecord(stored) || stored.schemaVersion !== 1) return null
    const projection = toConnectedProjection(stored)
    if (projection && projection.publicId !== gameId) {
      this.storage.delete(key)
      return null
    }
    return projection
  }

  syncResumeIndex(games: readonly ResumableGame[], exhaustedPageSet: boolean): void {
    if (this.ownerId === "anonymous") return
    if (exhaustedPageSet) {
      this.persistResumeIndex(filteredResumeBound(games.map(parseResumeEntry)))
      return
    }
    const current = this.loadResumeIndex()
    const byId = new Map(current.map((game) => [game.publicId, game]))
    for (const candidate of games) {
      const game = parseResumeEntry(candidate)
      if (game) byId.set(game.publicId, game)
    }
    this.persistResumeIndex([...byId.values()])
  }

  loadResumeIndex(): ResumableGame[] {
    if (this.ownerId === "anonymous") return []
    return parseResumeIndex(
      parseJson(this.storage.getString(CONNECTED_KEYS.resumeIndex(this.ownerId, this.deployment))),
    )
  }

  removeResumeEntry(gameId: string): void {
    if (this.ownerId === "anonymous") return
    const current = this.loadResumeIndex()
    const remaining = current.filter((game) => game.publicId !== gameId)
    if (remaining.length === current.length) return
    this.persistResumeIndex(remaining)
  }

  private persistResumeIndex(next: ResumableGame[]): void {
    const bounded =
      next.length > RESUME_INDEX_LIMIT
        ? [...next].sort(resumeOrder).slice(0, RESUME_INDEX_LIMIT)
        : next
    const key = CONNECTED_KEYS.resumeIndex(this.ownerId, this.deployment)
    const serialized = JSON.stringify({
      schemaVersion: 1,
      games: bounded,
    } as const)
    if (this.storage.getString(key) === serialized) return
    this.storage.set(key, serialized)
    notifyResumeIndexChanged()
  }

  isMembershipMigrationComplete(): boolean {
    const value = parseJson(
      this.storage.getString(CONNECTED_KEYS.membershipMigration(this.ownerId)),
    )
    return isRecord(value) && value.schemaVersion === 1 && value.complete === true
  }

  markMembershipMigrationComplete(): void {
    this.storage.set(
      CONNECTED_KEYS.membershipMigration(this.ownerId),
      JSON.stringify({ schemaVersion: 1, complete: true }),
    )
  }

  enqueue(action: PendingLifeAction, currentPending?: readonly PendingLifeAction[]): EnqueueResult {
    return this.outbox.enqueue(action, action.event.gameId, currentPending)
  }

  loadOutbox(gameId: string): PendingLifeAction[] {
    this.migrateLegacyOutbox(gameId)
    return this.outbox.loadPending(gameId)
  }

  updateAttempt(
    gameId: string,
    operationId: string,
    attemptedAt: number,
  ): PendingLifeAction | null {
    return this.outbox.updateAttempt(gameId, operationId, attemptedAt)
  }

  acknowledge(gameId: string, operationId: string): void {
    this.outbox.acknowledge(gameId, operationId)
  }

  fail(
    gameId: string,
    operationId: string,
    reason: string,
    failedAt = Date.now(),
  ): FailActionResult | null {
    return this.outbox.fail(gameId, operationId, reason, failedAt)
  }

  failAction(
    action: PendingLifeAction,
    reason: string,
    failedAt: number,
    currentFailed: readonly FailedLifeAction[],
    currentPending: readonly PendingLifeAction[],
  ): FailActionResult {
    return this.outbox.failAction(
      action,
      action.event.gameId,
      reason,
      failedAt,
      currentFailed,
      currentPending,
    )
  }

  loadFailed(gameId: string): FailedLifeAction[] {
    return this.outbox.loadFailed(gameId)
  }

  dismissFailed(gameId: string, operationId: string): void {
    this.outbox.dismissFailed(gameId, operationId)
  }

  cleanupTerminalGame(
    projection: ConnectedProjection,
    pending: readonly PendingLifeAction[],
    failed: readonly FailedLifeAction[],
  ): boolean {
    if (
      (projection.status !== "finished" && projection.status !== "abandoned") ||
      pending.length > 0 ||
      failed.length > 0
    )
      return false
    const gameId = projection.publicId
    const recordPrefixes = [
      CONNECTED_KEYS.outboxRecord(gameId, "", this.ownerId),
      CONNECTED_KEYS.failedRecord(gameId, "", this.ownerId),
    ]
    for (const key of this.storage.getAllKeys()) {
      if (recordPrefixes.some((prefix) => key.startsWith(prefix))) this.storage.delete(key)
    }
    this.storage.delete(CONNECTED_KEYS.projection(gameId, this.ownerId))
    this.storage.delete(CONNECTED_KEYS.outboxIndex(gameId, this.ownerId))
    this.storage.delete(CONNECTED_KEYS.failedIndex(gameId, this.ownerId))
    return true
  }

  private migrateLegacyOutbox(gameId: string): void {
    const legacyKey = CONNECTED_KEYS.legacyOutbox(gameId)
    const legacy = parseJson(this.storage.getString(legacyKey))
    if (!Array.isArray(legacy)) return
    const remaining: unknown[] = []
    let pending = this.outbox.loadPending(gameId)
    for (const candidate of legacy) {
      const action = parsePending(candidate)
      if (!action || action.event.gameId !== gameId) continue
      if (this.ownerId === "anonymous" || action.event.actorId === this.ownerId) {
        const result = this.outbox.enqueue(action, gameId, pending)
        if (result.accepted) pending = result.pending
        else remaining.push(candidate)
      } else remaining.push(candidate)
    }
    if (remaining.length) this.storage.set(legacyKey, JSON.stringify(remaining))
    else this.storage.delete(legacyKey)
  }
}
