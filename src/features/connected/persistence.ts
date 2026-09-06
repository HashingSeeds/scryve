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

const scoped = (ownerId: string, gameId: string) =>
  `${ownerId.length}:${ownerId}.${gameId.length}:${gameId}`
const ownerScoped = (ownerId: string) => `${ownerId.length}:${ownerId}`

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
