export interface DurablePendingRecord {
  schemaVersion: number
  queuedAt: number
  attempts: number
  lastAttemptAt?: number
}

export interface DurableFailedRecord<Pending extends DurablePendingRecord> {
  schemaVersion: number
  action: Pending
  reason: string
  failedAt: number
}

export interface DurableOutboxCodec<
  Pending extends DurablePendingRecord,
  Failed extends DurableFailedRecord<Pending>,
> {
  parsePending(value: unknown): Pending | null
  parseFailed(value: unknown): Failed | null
  createFailure(action: Pending, reason: string, failedAt: number): Failed
  operationId(action: Pending): string
  belongsToScope(action: Pending, ownerId: string, scopeId: string): boolean
  compare?(left: Pending, right: Pending): number
}

export interface DurableOutboxKeys {
  pendingIndex(scopeId: string, ownerId: string): string
  pendingRecord(scopeId: string, operationId: string, ownerId: string): string
  failedIndex(scopeId: string, ownerId: string): string
  failedRecord(scopeId: string, operationId: string, ownerId: string): string
}

export interface DurableStringStorage {
  getString(key: string): string | undefined
  getAllKeys(): string[]
  set(key: string, value: string): void
  delete(key: string): void
}

export interface DurableOutboxLimits {
  maxPendingRecords: number
  maxPendingBytes: number
  maxFailedRecords: number
  maxFailedBytes: number
  maxFailureReasonBytes: number
}

export type DurableLimitReason = "record_limit" | "byte_limit"

export type DurableEnqueueResult<Pending> =
  | { accepted: true; pending: Pending[] }
  | { accepted: false; reason: DurableLimitReason; pending: Pending[] }

export type DurableFailResult<Pending, Failed> =
  | { accepted: true; failed: Failed[]; pending: Pending[] }
  | {
      accepted: false
      reason: DurableLimitReason
      failed: Failed[]
      pending: Pending[]
    }

export const DURABLE_OUTBOX_LIMITS: DurableOutboxLimits = {
  maxPendingRecords: 128,
  maxPendingBytes: 128 * 1024,
  maxFailedRecords: 32,
  maxFailedBytes: 64 * 1024,
  maxFailureReasonBytes: 512,
}

export const DURABLE_QUARANTINE_PREFIX = "quarantine:"

export const DURABLE_SIDECAR_PREFIX = "meta:"

const MAX_REPORTED_RECORDS = 10

// why: only these exact strings may leave the device; anything else in a record could be player or deck data.
const KNOWN_OPERATION_TYPES = new Set([
  "life.changed",
  "commanderDamage.submitted",
  "commanderDamage.resolved",
  "cards",
  "create",
  "rename",
  "delete",
])

export type QuarantineReason = "empty" | "invalid_json" | "rejected"

type RecordShape = string | { [key: string]: RecordShape }

export interface QuarantinedRecord {
  slot: "pending" | "failed"
  reason: QuarantineReason
  bytes: number
  shape: RecordShape
  operationType?: string
  writtenBy: string
}

export interface QuarantineReport {
  outbox: string
  count: number
  reasons: QuarantineReason[]
  records: QuarantinedRecord[]
}

interface OutboxDiagnostics {
  writtenBy: string
  report: (report: QuarantineReport) => void
}

let diagnostics: OutboxDiagnostics = { writtenBy: "unknown", report: () => {} }

/** why: sync code stays free of React Native, so the app supplies its build identity and error reporter at startup. */
export function configureOutboxDiagnostics(next: Partial<OutboxDiagnostics>): void {
  diagnostics = { ...diagnostics, ...next }
}

// why: provenance lives beside the record, never in it, so builds that predate it read records unchanged.
const sidecarKey = (recordKey: string): string => `${DURABLE_SIDECAR_PREFIX}${recordKey}`

// why: reports name the outbox by its fixed `<namespace>.vN` key prefix so owner, game, and operation IDs never leave the device.
const outboxLabel = (recordKey: string): string =>
  /^(.+?\.v\d+)(?:\.|$)/.exec(recordKey)?.[1] ?? "unknown"

const parsedJson = (value: string | undefined): unknown => {
  if (!value) return null
  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

// why: types only, one level into nested objects like `action` or `event`; values never appear.
const shapeOf = (value: unknown, depth = 1): RecordShape => {
  if (value === null) return "null"
  if (Array.isArray(value)) return "array"
  if (!isRecord(value)) return typeof value
  if (depth < 0) return "object"
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [key, shapeOf(child, depth - 1)]),
  )
}

const operationTypeOf = (value: unknown): string | undefined =>
  [value, isRecord(value) ? value.action : undefined]
    .flatMap((candidate) =>
      isRecord(candidate)
        ? [candidate.op, candidate.type, isRecord(candidate.event) ? candidate.event.type : null]
        : [],
    )
    .find((type): type is string => typeof type === "string" && KNOWN_OPERATION_TYPES.has(type))

const writtenByOf = (sidecar: string | undefined): string => {
  const parsed = parsedJson(sidecar)
  return isRecord(parsed) && typeof parsed.writtenBy === "string" ? parsed.writtenBy : "unknown"
}

const stringIndex = (value: unknown): string[] =>
  Array.isArray(value)
    ? [...new Set(value.filter((candidate): candidate is string => typeof candidate === "string"))]
    : []

const utf8ByteLength = (value: string): number => {
  let bytes = 0
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0
    bytes += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4
  }
  return bytes
}

const compactUtf8 = (value: string, maximumBytes: number): string => {
  if (utf8ByteLength(value) <= maximumBytes) return value
  const suffix = "…"
  let compacted = ""
  for (const character of value) {
    if (utf8ByteLength(compacted + character + suffix) > maximumBytes) break
    compacted += character
  }
  return compacted + suffix
}

const oldestFirst = <Pending extends DurablePendingRecord>(
  actions: readonly Pending[],
  operationId: (action: Pending) => string,
  compare?: (left: Pending, right: Pending) => number,
): Pending[] =>
  [...actions].sort(
    compare ??
      ((left, right) =>
        left.queuedAt - right.queuedAt || operationId(left).localeCompare(operationId(right))),
  )

export class DurableOutbox<
  Pending extends DurablePendingRecord,
  Failed extends DurableFailedRecord<Pending>,
> {
  private readonly limits: DurableOutboxLimits

  constructor(
    private readonly storage: DurableStringStorage,
    private readonly ownerId: string,
    private readonly keys: DurableOutboxKeys,
    private readonly codec: DurableOutboxCodec<Pending, Failed>,
    limits: Partial<DurableOutboxLimits> = {},
  ) {
    this.limits = { ...DURABLE_OUTBOX_LIMITS, ...limits }
  }

  enqueue(
    action: Pending,
    scopeId: string,
    currentPending?: readonly Pending[],
  ): DurableEnqueueResult<Pending> {
    const pending = oldestFirst(
      currentPending ?? this.loadPending(scopeId),
      this.codec.operationId,
      this.codec.compare,
    )
    const operationId = this.codec.operationId(action)
    if (pending.some((candidate) => this.codec.operationId(candidate) === operationId))
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
    this.writeRecord(this.keys.pendingRecord(scopeId, operationId, this.ownerId), serialized)
    const index = stringIndex(
      parsedJson(this.storage.getString(this.keys.pendingIndex(scopeId, this.ownerId))),
    )
    if (!index.includes(operationId)) {
      index.push(operationId)
      this.storage.set(this.keys.pendingIndex(scopeId, this.ownerId), JSON.stringify(index))
    }
    return {
      accepted: true,
      pending: oldestFirst([...pending, action], this.codec.operationId, this.codec.compare),
    }
  }

  loadPending(scopeId: string): Pending[] {
    const recordPrefix = `${this.keys.pendingRecord(scopeId, "", this.ownerId)}`
    const discovered = this.storage
      .getAllKeys()
      .filter((key) => key.startsWith(recordPrefix))
      .map((key) => key.slice(recordPrefix.length))
    const index = stringIndex([
      ...stringIndex(
        parsedJson(this.storage.getString(this.keys.pendingIndex(scopeId, this.ownerId))),
      ),
      ...discovered,
    ])
    const pending: Pending[] = []
    const validIds: string[] = []
    const quarantined: QuarantinedRecord[] = []
    for (const operationId of index) {
      const pendingKey = this.keys.pendingRecord(scopeId, operationId, this.ownerId)
      const failedKey = this.keys.failedRecord(scopeId, operationId, this.ownerId)
      const action = this.codec.parsePending(parsedJson(this.storage.getString(pendingKey)))
      const failedValue = this.storage.getString(failedKey)
      const failed = this.codec.parseFailed(parsedJson(failedValue))
      if (failedValue && failed) {
        if (
          this.codec.operationId(failed.action) === operationId &&
          this.codec.belongsToScope(failed.action, this.ownerId, scopeId)
        ) {
          if (action) this.deleteRecord(pendingKey)
          else this.quarantine(pendingKey, "pending", quarantined)
          continue
        }
        this.quarantine(failedKey, "failed", quarantined)
      } else if (failedValue) this.quarantine(failedKey, "failed", quarantined)
      if (
        action &&
        this.codec.operationId(action) === operationId &&
        this.codec.belongsToScope(action, this.ownerId, scopeId)
      ) {
        pending.push(action)
        validIds.push(operationId)
      } else this.quarantine(pendingKey, "pending", quarantined)
    }
    this.storage.set(this.keys.pendingIndex(scopeId, this.ownerId), JSON.stringify(validIds))
    this.reportQuarantined(scopeId, quarantined)
    return oldestFirst(pending, this.codec.operationId, this.codec.compare)
  }

  updateAttempt(scopeId: string, operationId: string, attemptedAt: number): Pending | null {
    const key = this.keys.pendingRecord(scopeId, operationId, this.ownerId)
    const action = this.codec.parsePending(parsedJson(this.storage.getString(key)))
    if (!action) return null
    const updated = { ...action, attempts: action.attempts + 1, lastAttemptAt: attemptedAt }
    this.writeRecord(key, JSON.stringify(updated))
    return updated
  }

  acknowledge(scopeId: string, operationId: string): void {
    this.deleteRecord(this.keys.pendingRecord(scopeId, operationId, this.ownerId))
    const index = stringIndex(
      parsedJson(this.storage.getString(this.keys.pendingIndex(scopeId, this.ownerId))),
    ).filter((candidate) => candidate !== operationId)
    this.storage.set(this.keys.pendingIndex(scopeId, this.ownerId), JSON.stringify(index))
  }

  fail(
    scopeId: string,
    operationId: string,
    reason: string,
    failedAt = Date.now(),
  ): DurableFailResult<Pending, Failed> | null {
    const pending = this.loadPending(scopeId)
    const action = pending.find((candidate) => this.codec.operationId(candidate) === operationId)
    if (!action) return null
    return this.failAction(action, scopeId, reason, failedAt, this.loadFailed(scopeId), pending)
  }

  failAction(
    action: Pending,
    scopeId: string,
    reason: string,
    failedAt: number,
    currentFailed: readonly Failed[],
    currentPending: readonly Pending[],
  ): DurableFailResult<Pending, Failed> {
    const operationId = this.codec.operationId(action)
    const failed = [...currentFailed]
    const pending = oldestFirst(currentPending, this.codec.operationId, this.codec.compare)
    if (failed.some((candidate) => this.codec.operationId(candidate.action) === operationId))
      return {
        accepted: true,
        failed,
        pending: pending.filter((candidate) => this.codec.operationId(candidate) !== operationId),
      }
    const record = this.codec.createFailure(
      action,
      compactUtf8(reason || "Action was rejected", this.limits.maxFailureReasonBytes),
      failedAt,
    )
    if (failed.length >= this.limits.maxFailedRecords)
      return { accepted: false, reason: "record_limit", failed, pending }
    const failedBytes = failed.reduce(
      (total, candidate) => total + utf8ByteLength(JSON.stringify(candidate)),
      0,
    )
    if (failedBytes + utf8ByteLength(JSON.stringify(record)) > this.limits.maxFailedBytes)
      return { accepted: false, reason: "byte_limit", failed, pending }
    this.writeRecord(
      this.keys.failedRecord(scopeId, operationId, this.ownerId),
      JSON.stringify(record),
    )
    const nextFailed = [...failed, record].sort((left, right) => left.failedAt - right.failedAt)
    this.storage.set(
      this.keys.failedIndex(scopeId, this.ownerId),
      JSON.stringify(nextFailed.map((candidate) => this.codec.operationId(candidate.action))),
    )
    const nextPending = pending.filter(
      (candidate) => this.codec.operationId(candidate) !== operationId,
    )
    this.deleteRecord(this.keys.pendingRecord(scopeId, operationId, this.ownerId))
    this.storage.set(
      this.keys.pendingIndex(scopeId, this.ownerId),
      JSON.stringify(nextPending.map((candidate) => this.codec.operationId(candidate))),
    )
    return { accepted: true, failed: nextFailed, pending: nextPending }
  }

  loadFailed(scopeId: string): Failed[] {
    const recordPrefix = `${this.keys.failedRecord(scopeId, "", this.ownerId)}`
    const discovered = this.storage
      .getAllKeys()
      .filter((key) => key.startsWith(recordPrefix))
      .map((key) => key.slice(recordPrefix.length))
    const index = stringIndex([
      ...stringIndex(
        parsedJson(this.storage.getString(this.keys.failedIndex(scopeId, this.ownerId))),
      ),
      ...discovered,
    ])
    const failures: Failed[] = []
    const quarantined: QuarantinedRecord[] = []
    for (const operationId of index) {
      const key = this.keys.failedRecord(scopeId, operationId, this.ownerId)
      const failure = this.codec.parseFailed(parsedJson(this.storage.getString(key)))
      if (
        failure &&
        this.codec.operationId(failure.action) === operationId &&
        this.codec.belongsToScope(failure.action, this.ownerId, scopeId)
      )
        failures.push(failure)
      else this.quarantine(key, "failed", quarantined)
    }
    this.reportQuarantined(scopeId, quarantined)
    failures.sort((left, right) => left.failedAt - right.failedAt)
    this.storage.set(
      this.keys.failedIndex(scopeId, this.ownerId),
      JSON.stringify(failures.map((failure) => this.codec.operationId(failure.action))),
    )
    return failures
  }

  /** why: a record this build can't read may be readable by a later one, so it is kept aside instead of deleted. */
  // why: the record lands before its sidecar, so a torn write leaves provenance unknown rather than wrong for a new record.
  private writeRecord(key: string, value: string): void {
    this.storage.set(key, value)
    this.storage.set(
      sidecarKey(key),
      JSON.stringify({ writtenBy: diagnostics.writtenBy, writtenAt: Date.now() }),
    )
  }

  // why: the sidecar goes first, so a torn delete never leaves provenance pointing at a record that is gone.
  private deleteRecord(key: string): void {
    this.storage.delete(sidecarKey(key))
    this.storage.delete(key)
  }

  /** why: a record this build can't read may be readable by a later one, so it is kept aside instead of deleted. */
  private quarantine(
    key: string,
    slot: QuarantinedRecord["slot"],
    quarantined: QuarantinedRecord[],
  ): void {
    const value = this.storage.getString(key)
    if (value !== undefined) {
      const base = `${DURABLE_QUARANTINE_PREFIX}${Date.now()}:${key}`
      let target = base
      for (let copy = 1; this.storage.getString(target) !== undefined; copy += 1)
        target = `${base}:${copy}`
      this.storage.set(target, value)
      const sidecar = this.storage.getString(sidecarKey(key))
      if (sidecar !== undefined) this.storage.set(sidecarKey(target), sidecar)
      const parsed = parsedJson(value)
      const operationType = operationTypeOf(parsed)
      quarantined.push({
        slot,
        reason: value === "" ? "empty" : parsed === null ? "invalid_json" : "rejected",
        bytes: utf8ByteLength(value),
        shape: shapeOf(parsed),
        ...(operationType ? { operationType } : {}),
        writtenBy: writtenByOf(sidecar),
      })
    }
    this.deleteRecord(key)
  }

  /** why: quarantine is otherwise silent; one report per load pass tells us a release needs a recovery path, without sending record contents. */
  private reportQuarantined(scopeId: string, quarantined: readonly QuarantinedRecord[]): void {
    if (!quarantined.length) return
    diagnostics.report({
      outbox: outboxLabel(this.keys.pendingRecord(scopeId, "", this.ownerId)),
      count: quarantined.length,
      reasons: [...new Set(quarantined.map(({ reason }) => reason))],
      records: quarantined.slice(0, MAX_REPORTED_RECORDS),
    })
  }

  dismissFailed(scopeId: string, operationId: string): void {
    this.deleteRecord(this.keys.failedRecord(scopeId, operationId, this.ownerId))
    const index = stringIndex(
      parsedJson(this.storage.getString(this.keys.failedIndex(scopeId, this.ownerId))),
    ).filter((candidate) => candidate !== operationId)
    this.storage.set(this.keys.failedIndex(scopeId, this.ownerId), JSON.stringify(index))
  }
}
