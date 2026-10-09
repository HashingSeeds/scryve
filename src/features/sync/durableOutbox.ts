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
  /** why: a report names only these kinds, so a corrupt record can't pass a value off as its type. */
  operationTypes?: readonly string[]
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

export type QuarantineReason = "empty" | "invalid_json" | "rejected"

/** why: the last writer, not the first, because its serializer produced the bytes on disk. */
export interface WrittenBy {
  app: string
  update: string
  runtime: string
  /** why: web builds have no update id or runtime, so the release commit is what tells two deploys apart. */
  commit?: string
}

export interface QuarantinedRecord {
  slot: "pending" | "failed"
  reason: QuarantineReason
  bytes: number
  /** why: key paths and `typeof` labels only; values can hold player data. */
  shape: Record<string, string>
  operationType: string
  writtenBy: WrittenBy | "unknown"
}

export interface QuarantineReport {
  outbox: string
  count: number
  reasons: QuarantineReason[]
  records: QuarantinedRecord[]
}

const MAX_REPORTED_RECORDS = 16
const MAX_SHAPE_ENTRIES = 64
const SHAPE_DEPTH = 4
const SHAPE_ARRAY_SAMPLE = 3

let reportQuarantine: (report: QuarantineReport) => void = () => {}
let currentWriter: WrittenBy | undefined

/** why: sync code stays free of React Native, so the app wires its error reporter in at startup. */
export function setQuarantineReporter(reporter: (report: QuarantineReport) => void): void {
  reportQuarantine = reporter
}

/** why: the app stamps its build onto every record it writes, so a quarantined record says which codec produced it. */
export function setOutboxWriter(writer: WrittenBy | undefined): void {
  currentWriter = writer
}

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

// why: provenance lives on the stored envelope only. Codecs and send paths never see it, so it can't reach a strict Convex validator whatever a codec passes through.
const withoutProvenance = (value: unknown): unknown => {
  if (!isRecord(value)) return value
  const { writtenBy: _record, ...rest } = value
  if (!isRecord(rest.action)) return rest
  const { writtenBy: _action, ...action } = rest.action
  return { ...rest, action }
}

const provenancePart = (value: unknown): value is string =>
  typeof value === "string" && /^[\w.+:-]{1,64}$/.test(value)

const parseWrittenBy = (value: unknown): WrittenBy | "unknown" =>
  isRecord(value) &&
  provenancePart(value.app) &&
  provenancePart(value.update) &&
  provenancePart(value.runtime)
    ? {
        app: value.app,
        update: value.update,
        runtime: value.runtime,
        ...(provenancePart(value.commit) ? { commit: value.commit } : {}),
      }
    : "unknown"

const typeLabel = (value: unknown): string =>
  value === null ? "null" : Array.isArray(value) ? "array" : typeof value

// why: a key built from data (a uuid, a Convex id, a timestamp) would leak that value, so it is reported as a placeholder.
const ID_LIKE_KEY =
  /^(?:[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}|[\da-f]{12,}|\d{6,}|(?=[\w-]*\d)(?=[\w-]*[a-z])[\w-]{16,})$/i

const shapeKey = (key: string): string => (ID_LIKE_KEY.test(key) ? "<id>" : key.slice(0, 40))

const shapeChildren = (node: unknown): Array<[string, unknown]> =>
  Array.isArray(node)
    ? node.slice(0, SHAPE_ARRAY_SAMPLE).map((item, index) => [`${index}`, item])
    : isRecord(node)
      ? Object.entries(node).map(([key, child]) => [shapeKey(key), child])
      : []

/** why: deep enough for a failed record's `action.cards.0.quantity`; breadth-first so the entry cap drops the deepest paths, and arrays are sampled because their elements share a shape. */
const shapeOf = (value: unknown): Record<string, string> => {
  if (!isRecord(value)) return value === null ? {} : { $: typeLabel(value) }
  const shape: Record<string, string> = {}
  let level: Array<[string, unknown]> = shapeChildren(value)
  for (let depth = 1; depth <= SHAPE_DEPTH && level.length; depth += 1) {
    const next: Array<[string, unknown]> = []
    for (const [path, node] of level) {
      if (Object.keys(shape).length >= MAX_SHAPE_ENTRIES) return shape
      shape[path] = typeLabel(node)
      for (const [key, child] of shapeChildren(node)) next.push([`${path}.${key}`, child])
    }
    level = next
  }
  return shape
}

const operationTypeOf = (
  root: unknown,
  slot: QuarantinedRecord["slot"],
  allowed: readonly string[],
): string => {
  const body = slot === "failed" && isRecord(root) ? root.action : root
  if (!isRecord(body)) return "unknown"
  const candidates = [body.op, body.type, isRecord(body.event) ? body.event.type : undefined]
  return (
    candidates.find(
      (candidate): candidate is string =>
        typeof candidate === "string" && allowed.includes(candidate),
    ) ?? "unknown"
  )
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

  /** why: provenance goes first so a record cut short mid-write still names its writer. */
  private serialize(record: Pending | Failed): string {
    return JSON.stringify(currentWriter ? { writtenBy: currentWriter, ...record } : record)
  }

  private read(key: string): unknown {
    return withoutProvenance(parsedJson(this.storage.getString(key)))
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
    const serialized = this.serialize(action)
    const pendingBytes = pending.reduce(
      (total, candidate) => total + utf8ByteLength(this.serialize(candidate)),
      0,
    )
    if (pendingBytes + utf8ByteLength(serialized) > this.limits.maxPendingBytes)
      return { accepted: false, reason: "byte_limit", pending }
    this.storage.set(this.keys.pendingRecord(scopeId, operationId, this.ownerId), serialized)
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
      const action = this.codec.parsePending(this.read(pendingKey))
      const failedValue = this.storage.getString(failedKey)
      const failed = this.codec.parseFailed(withoutProvenance(parsedJson(failedValue)))
      if (failedValue && failed) {
        if (
          this.codec.operationId(failed.action) === operationId &&
          this.codec.belongsToScope(failed.action, this.ownerId, scopeId)
        ) {
          if (action) this.storage.delete(pendingKey)
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
    const action = this.codec.parsePending(this.read(key))
    if (!action) return null
    const updated = { ...action, attempts: action.attempts + 1, lastAttemptAt: attemptedAt }
    this.storage.set(key, this.serialize(updated))
    return updated
  }

  replacePending(scopeId: string, action: Pending): void {
    this.storage.set(
      this.keys.pendingRecord(scopeId, this.codec.operationId(action), this.ownerId),
      this.serialize(action),
    )
  }

  acknowledge(scopeId: string, operationId: string): void {
    this.storage.delete(this.keys.pendingRecord(scopeId, operationId, this.ownerId))
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
      (total, candidate) => total + utf8ByteLength(this.serialize(candidate)),
      0,
    )
    const serialized = this.serialize(record)
    if (failedBytes + utf8ByteLength(serialized) > this.limits.maxFailedBytes)
      return { accepted: false, reason: "byte_limit", failed, pending }
    this.storage.set(this.keys.failedRecord(scopeId, operationId, this.ownerId), serialized)
    const nextFailed = [...failed, record].sort((left, right) => left.failedAt - right.failedAt)
    this.storage.set(
      this.keys.failedIndex(scopeId, this.ownerId),
      JSON.stringify(nextFailed.map((candidate) => this.codec.operationId(candidate.action))),
    )
    const nextPending = pending.filter(
      (candidate) => this.codec.operationId(candidate) !== operationId,
    )
    this.storage.delete(this.keys.pendingRecord(scopeId, operationId, this.ownerId))
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
      const failure = this.codec.parseFailed(this.read(key))
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
      const root = parsedJson(value)
      quarantined.push({
        slot,
        reason: value === "" ? "empty" : root === null ? "invalid_json" : "rejected",
        bytes: utf8ByteLength(value),
        shape: shapeOf(root),
        operationType: operationTypeOf(root, slot, this.codec.operationTypes ?? []),
        writtenBy: parseWrittenBy(
          isRecord(root)
            ? root.writtenBy
            : parsedJson(/^\{"writtenBy":(\{[^{}]*\})/.exec(value)?.[1]),
        ),
      })
    }
    this.storage.delete(key)
  }

  /** why: quarantine is otherwise silent; one report per load pass carries enough structure to write a recovering codec, never record values. */
  private reportQuarantined(scopeId: string, quarantined: readonly QuarantinedRecord[]): void {
    if (!quarantined.length) return
    reportQuarantine({
      outbox: outboxLabel(this.keys.pendingRecord(scopeId, "", this.ownerId)),
      count: quarantined.length,
      reasons: [...new Set(quarantined.map((record) => record.reason))],
      records: quarantined.slice(0, MAX_REPORTED_RECORDS),
    })
  }

  dismissFailed(scopeId: string, operationId: string): void {
    this.storage.delete(this.keys.failedRecord(scopeId, operationId, this.ownerId))
    const index = stringIndex(
      parsedJson(this.storage.getString(this.keys.failedIndex(scopeId, this.ownerId))),
    ).filter((candidate) => candidate !== operationId)
    this.storage.set(this.keys.failedIndex(scopeId, this.ownerId), JSON.stringify(index))
  }
}
