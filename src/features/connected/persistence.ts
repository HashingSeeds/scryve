import { storage as mmkvStorage } from "@/utils/storage"

import type { ConnectedProjection, FailedLifeAction, PendingLifeAction } from "./model"
import { toConnectedProjection } from "./model"
import { oldestFirst } from "./reconciliation"
import {
  asActorId,
  asDeviceId,
  asGameId,
  asOperationId,
  asPlayerId,
  isLifeDelta,
} from "../game/domain"
import type { LifeChangedEvent } from "../game/types"

export interface ConnectedStringStorage {
  getString(key: string): string | undefined
  getAllKeys(): string[]
  set(key: string, value: string): void
  delete(key: string): void
}

export const CONNECTED_PERSISTENCE_LIMITS = {
  schemaVersion: 1,
  maxPendingRecords: 128,
  maxPendingBytes: 128 * 1024,
  maxFailedRecords: 32,
  maxFailedBytes: 64 * 1024,
  maxFailureReasonBytes: 512,
} as const

export interface ConnectedPersistenceLimits {
  maxPendingRecords: number
  maxPendingBytes: number
  maxFailedRecords: number
  maxFailedBytes: number
  maxFailureReasonBytes: number
}

export type EnqueueResult =
  | { accepted: true; pending: PendingLifeAction[] }
  | {
      accepted: false
      reason: "record_limit" | "byte_limit"
      pending: PendingLifeAction[]
    }

export type FailActionResult =
  | { accepted: true; failed: FailedLifeAction[]; pending: PendingLifeAction[] }
  | {
      accepted: false
      reason: "record_limit" | "byte_limit"
      failed: FailedLifeAction[]
      pending: PendingLifeAction[]
    }

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

function json(value: string | undefined): any {
  if (!value) return null
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function stringIndex(value: any): string[] {
  return Array.isArray(value)
    ? [...new Set(value.filter((candidate): candidate is string => typeof candidate === "string"))]
    : []
}

function utf8ByteLength(value: string): number {
  let bytes = 0
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0
    bytes += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4
  }
  return bytes
}

function compactUtf8(value: string, maximumBytes: number): string {
  if (utf8ByteLength(value) <= maximumBytes) return value
  const suffix = "…"
  let compacted = ""
  for (const character of value) {
    if (utf8ByteLength(compacted + character + suffix) > maximumBytes) break
    compacted += character
  }
  return compacted + suffix
}

function parseEvent(value: any): LifeChangedEvent | null {
  if (
    !value ||
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

function parsePending(value: any): PendingLifeAction | null {
  if (!value || (value.schemaVersion !== undefined && value.schemaVersion !== 1)) return null
  const event = parseEvent(value.event)
  if (!event || typeof value.queuedAt !== "number" || !Number.isFinite(value.queuedAt)) return null
  return {
    schemaVersion: 1,
    event,
    queuedAt: value.queuedAt,
    attempts: Number.isInteger(value.attempts) && value.attempts >= 0 ? value.attempts : 0,
    ...(typeof value.lastAttemptAt === "number" && Number.isFinite(value.lastAttemptAt)
      ? { lastAttemptAt: value.lastAttemptAt }
      : {}),
  }
}

function parseFailed(value: any): FailedLifeAction | null {
  if (value?.schemaVersion !== 1) return null
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

function failureMatchesScope(
  failure: FailedLifeAction | null,
  ownerId: string,
  gameId: string,
  operationId: string,
): failure is FailedLifeAction {
  return Boolean(
    failure &&
    failure.action.event.gameId === gameId &&
    failure.action.event.operationId === operationId &&
    (ownerId === "anonymous" || failure.action.event.actorId === ownerId),
  )
}

export class ConnectedGameRepository {
  private readonly limits: ConnectedPersistenceLimits

  constructor(
    private readonly storage: ConnectedStringStorage = mmkvStorage,
    private readonly ownerId = "anonymous",
    limits: Partial<ConnectedPersistenceLimits> = {},
  ) {
    this.limits = { ...CONNECTED_PERSISTENCE_LIMITS, ...limits }
  }

  saveProjection(projection: ConnectedProjection): void {
    this.storage.set(
      CONNECTED_KEYS.projection(projection.publicId, this.ownerId),
      JSON.stringify(projection),
    )
  }

  loadProjection(gameId: string): ConnectedProjection | null {
    const key = CONNECTED_KEYS.projection(gameId, this.ownerId)
    const stored = json(this.storage.getString(key))
    if (stored?.schemaVersion !== 1) return null
    const projection = toConnectedProjection(stored)
    if (projection && projection.publicId !== gameId) {
      this.storage.delete(key)
      return null
    }
    return projection
  }

  isMembershipMigrationComplete(): boolean {
    const value = json(this.storage.getString(CONNECTED_KEYS.membershipMigration(this.ownerId)))
    return value?.schemaVersion === 1 && value.complete === true
  }

  markMembershipMigrationComplete(): void {
    this.storage.set(
      CONNECTED_KEYS.membershipMigration(this.ownerId),
      JSON.stringify({ schemaVersion: 1, complete: true }),
    )
  }

  enqueue(action: PendingLifeAction, currentPending?: readonly PendingLifeAction[]): EnqueueResult {
    const gameId = action.event.gameId
    const operationId = action.event.operationId
    const pending = oldestFirst(currentPending ?? this.loadOutbox(gameId))
    if (pending.some((candidate) => candidate.event.operationId === operationId))
      return { accepted: true, pending }
    if (pending.length >= this.limits.maxPendingRecords)
      return { accepted: false, reason: "record_limit", pending }
    const serialized = JSON.stringify(action)
    const pendingBytes = pending.reduce(
      (total, candidate) => total + utf8ByteLength(JSON.stringify(candidate)),
      0,
    )
    if (pendingBytes + utf8ByteLength(serialized) > this.limits.maxPendingBytes)
      return { accepted: false, reason: "byte_limit", pending }
    this.storage.set(CONNECTED_KEYS.outboxRecord(gameId, operationId, this.ownerId), serialized)
    const index = stringIndex(
      json(this.storage.getString(CONNECTED_KEYS.outboxIndex(gameId, this.ownerId))),
    )
    if (!index.includes(operationId)) {
      index.push(operationId)
      this.storage.set(CONNECTED_KEYS.outboxIndex(gameId, this.ownerId), JSON.stringify(index))
    }
    return { accepted: true, pending: oldestFirst([...pending, action]) }
  }

  loadOutbox(gameId: string): PendingLifeAction[] {
    this.migrateLegacyOutbox(gameId)
    return this.readOutbox(gameId)
  }

  private readOutbox(gameId: string): PendingLifeAction[] {
    const recordPrefix = `${CONNECTED_KEYS.outboxRecord(gameId, "", this.ownerId)}`
    const discovered = this.storage
      .getAllKeys()
      .filter((key) => key.startsWith(recordPrefix))
      .map((key) => key.slice(recordPrefix.length))
    const index = stringIndex([
      ...stringIndex(
        json(this.storage.getString(CONNECTED_KEYS.outboxIndex(gameId, this.ownerId))),
      ),
      ...discovered,
    ])
    const actions: PendingLifeAction[] = []
    const validIds: string[] = []
    for (const operationId of index) {
      const outboxKey = CONNECTED_KEYS.outboxRecord(gameId, operationId, this.ownerId)
      const failedKey = CONNECTED_KEYS.failedRecord(gameId, operationId, this.ownerId)
      const action = parsePending(json(this.storage.getString(outboxKey)))
      const failedValue = this.storage.getString(failedKey)
      if (failedValue) {
        const failure = parseFailed(json(failedValue))
        if (failureMatchesScope(failure, this.ownerId, gameId, operationId)) {
          this.storage.delete(outboxKey)
          continue
        }
        this.storage.delete(failedKey)
      }
      if (
        action &&
        action.event.gameId === gameId &&
        action.event.operationId === operationId &&
        (this.ownerId === "anonymous" || action.event.actorId === this.ownerId)
      ) {
        actions.push(action)
        validIds.push(operationId)
      } else this.storage.delete(outboxKey)
    }
    this.storage.set(CONNECTED_KEYS.outboxIndex(gameId, this.ownerId), JSON.stringify(validIds))
    return oldestFirst(actions)
  }

  updateAttempt(
    gameId: string,
    operationId: string,
    attemptedAt: number,
  ): PendingLifeAction | null {
    const key = CONNECTED_KEYS.outboxRecord(gameId, operationId, this.ownerId)
    const action = parsePending(json(this.storage.getString(key)))
    if (!action) return null
    const updated = { ...action, attempts: action.attempts + 1, lastAttemptAt: attemptedAt }
    this.storage.set(key, JSON.stringify(updated))
    return updated
  }

  acknowledge(gameId: string, operationId: string): void {
    this.storage.delete(CONNECTED_KEYS.outboxRecord(gameId, operationId, this.ownerId))
    const index = stringIndex(
      json(this.storage.getString(CONNECTED_KEYS.outboxIndex(gameId, this.ownerId))),
    ).filter((candidate) => candidate !== operationId)
    this.storage.set(CONNECTED_KEYS.outboxIndex(gameId, this.ownerId), JSON.stringify(index))
  }

  fail(
    gameId: string,
    operationId: string,
    reason: string,
    failedAt = Date.now(),
  ): FailActionResult | null {
    const pending = this.loadOutbox(gameId)
    const action = pending.find((candidate) => candidate.event.operationId === operationId)
    if (!action) return null
    return this.failAction(action, reason, failedAt, this.loadFailed(gameId), pending)
  }

  failAction(
    action: PendingLifeAction,
    reason: string,
    failedAt: number,
    currentFailed: readonly FailedLifeAction[],
    currentPending: readonly PendingLifeAction[],
  ): FailActionResult {
    const gameId = action.event.gameId
    const operationId = action.event.operationId
    const failed = [...currentFailed]
    const pending = oldestFirst([...currentPending])
    if (failed.some((candidate) => candidate.action.event.operationId === operationId))
      return {
        accepted: true,
        failed,
        pending: pending.filter((candidate) => candidate.event.operationId !== operationId),
      }
    const record: FailedLifeAction = {
      schemaVersion: 1,
      action,
      reason: compactUtf8(reason || "Action was rejected", this.limits.maxFailureReasonBytes),
      failedAt,
    }
    if (failed.length >= this.limits.maxFailedRecords)
      return { accepted: false, reason: "record_limit", failed, pending }
    const failedBytes = failed.reduce(
      (total, candidate) => total + utf8ByteLength(JSON.stringify(candidate)),
      0,
    )
    if (failedBytes + utf8ByteLength(JSON.stringify(record)) > this.limits.maxFailedBytes)
      return { accepted: false, reason: "byte_limit", failed, pending }
    this.storage.set(
      CONNECTED_KEYS.failedRecord(gameId, operationId, this.ownerId),
      JSON.stringify(record),
    )
    const nextFailed = [...failed, record].sort((left, right) => left.failedAt - right.failedAt)
    this.storage.set(
      CONNECTED_KEYS.failedIndex(gameId, this.ownerId),
      JSON.stringify(nextFailed.map((candidate) => candidate.action.event.operationId)),
    )
    const nextPending = pending.filter((candidate) => candidate.event.operationId !== operationId)
    this.storage.delete(CONNECTED_KEYS.outboxRecord(gameId, operationId, this.ownerId))
    this.storage.set(
      CONNECTED_KEYS.outboxIndex(gameId, this.ownerId),
      JSON.stringify(nextPending.map((candidate) => candidate.event.operationId)),
    )
    return { accepted: true, failed: nextFailed, pending: nextPending }
  }

  loadFailed(gameId: string): FailedLifeAction[] {
    const recordPrefix = `${CONNECTED_KEYS.failedRecord(gameId, "", this.ownerId)}`
    const discovered = this.storage
      .getAllKeys()
      .filter((key) => key.startsWith(recordPrefix))
      .map((key) => key.slice(recordPrefix.length))
    const index = stringIndex([
      ...stringIndex(
        json(this.storage.getString(CONNECTED_KEYS.failedIndex(gameId, this.ownerId))),
      ),
      ...discovered,
    ])
    const failures: FailedLifeAction[] = []
    for (const operationId of index) {
      const key = CONNECTED_KEYS.failedRecord(gameId, operationId, this.ownerId)
      const failure = parseFailed(json(this.storage.getString(key)))
      if (failureMatchesScope(failure, this.ownerId, gameId, operationId)) failures.push(failure)
      else this.storage.delete(key)
    }
    failures.sort((left, right) => left.failedAt - right.failedAt)
    this.storage.set(
      CONNECTED_KEYS.failedIndex(gameId, this.ownerId),
      JSON.stringify(failures.map((failure) => failure.action.event.operationId)),
    )
    return failures
  }

  dismissFailed(gameId: string, operationId: string): void {
    this.storage.delete(CONNECTED_KEYS.failedRecord(gameId, operationId, this.ownerId))
    const index = stringIndex(
      json(this.storage.getString(CONNECTED_KEYS.failedIndex(gameId, this.ownerId))),
    ).filter((candidate) => candidate !== operationId)
    this.storage.set(CONNECTED_KEYS.failedIndex(gameId, this.ownerId), JSON.stringify(index))
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
    const legacy = json(this.storage.getString(legacyKey))
    if (!Array.isArray(legacy)) return
    const remaining: unknown[] = []
    let pending = this.readOutbox(gameId)
    for (const candidate of legacy) {
      const action = parsePending(candidate)
      if (!action || action.event.gameId !== gameId) continue
      if (this.ownerId === "anonymous" || action.event.actorId === this.ownerId) {
        const result = this.enqueue(action, pending)
        if (result.accepted) pending = result.pending
        else remaining.push(candidate)
      } else remaining.push(candidate)
    }
    if (remaining.length) this.storage.set(legacyKey, JSON.stringify(remaining))
    else this.storage.delete(legacyKey)
  }
}
