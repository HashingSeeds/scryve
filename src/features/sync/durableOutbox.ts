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
  compare?(left: Pending, right: Pending): number
  /** why: a report names only these kinds, so a corrupt record can't pass a value off as its type. */
  operationTypes?: readonly string[]
  /** why: a report names only field names this codec writes; any other key may be data (a card name, an ID), so it is reported as a numbered placeholder. */
  knownKeys?: readonly string[]
}

/** why: `keyof` on a union keeps only shared keys; this keeps every member's, so a `knownKeys` record must list them all. */
export type FieldName<T> = T extends unknown ? Extract<keyof T, string> : never

export interface DurableOutboxKeys {
  pendingIndex: string
  pendingRecordPrefix: string
  failedIndex: string
  failedRecordPrefix: string
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

export interface DurableOutboxOptions<
  Pending extends DurablePendingRecord,
  Failed extends DurableFailedRecord<Pending>,
> {
  storage: DurableStringStorage
  keys: DurableOutboxKeys
  codec: DurableOutboxCodec<Pending, Failed>
  owns(action: Pending): boolean
  limits?: Partial<DurableOutboxLimits>
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

export interface WrittenBy {
  app: string
  update: string
  runtime: string
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

// why: each part is checked against the format the app actually writes, so a corrupt record can't carry any other string (an account ID, a name) into a report.
const WRITTEN_BY_FORMATS = {
  app: /^(?:\d{1,4}\.\d{1,4}\.\d{1,6}(?:-(?:alpha|beta|rc)(?:\.\d{1,4})?)?|unknown)$/,
  update: /^(?:[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}|embedded)$/,
  runtime: /^(?:[\da-f]{40}|unknown)$/,
  commit: /^[\da-f]{7,40}$/,
} satisfies Record<keyof WrittenBy, RegExp>

const writtenByPart = (value: unknown, part: keyof WrittenBy): string | undefined =>
  typeof value === "string" && WRITTEN_BY_FORMATS[part].test(value) ? value : undefined

/** why: FNV-1a, so `scripts/outbox-provenance-lookup.cjs` can hash known builds and match without expo-crypto. */
const provenanceDigest = (value: string): string => {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, "0")
}

// why: a well-formed UUID or hex string could still be an operation or account ID copied in, so only a digest leaves the device.
const digestPart = (value: string | undefined): string =>
  value === undefined || value === "embedded" || value === "unknown"
    ? (value ?? "unknown")
    : provenanceDigest(value)

const parseWrittenBy = (value: unknown): WrittenBy | "unknown" => {
  if (!isRecord(value)) return "unknown"
  const app = writtenByPart(value.app, "app")
  const update = writtenByPart(value.update, "update")
  const runtime = writtenByPart(value.runtime, "runtime")
  const commit = writtenByPart(value.commit, "commit")
  if (!app && !update && !runtime && !commit) return "unknown"
  return {
    app: app ?? "unknown",
    update: digestPart(update),
    runtime: digestPart(runtime),
    ...(commit ? { commit: digestPart(commit) } : {}),
  }
}

const typeLabel = (value: unknown): string =>
  value === null ? "null" : Array.isArray(value) ? "array" : typeof value

const ENVELOPE_KEYS: readonly string[] = [
  "schemaVersion",
  "queuedAt",
  "attempts",
  "lastAttemptAt",
  "action",
  "reason",
  "failedAt",
  "writtenBy",
  ...Object.keys(WRITTEN_BY_FORMATS),
]

const shapeChildren = (node: unknown, known: ReadonlySet<string>): Array<[string, unknown]> => {
  if (Array.isArray(node))
    return node.slice(0, SHAPE_ARRAY_SAMPLE).map((item, index) => [`${index}`, item])
  if (!isRecord(node)) return []
  let unknownKeys = 0
  return Object.entries(node).map(([key, child]) => [
    known.has(key) ? key : `<key${(unknownKeys += 1)}>`,
    child,
  ])
}

const shapeOf = (value: unknown, knownKeys: readonly string[]): Record<string, string> => {
  if (!isRecord(value)) return value === null ? {} : { $: typeLabel(value) }
  const known = new Set([...ENVELOPE_KEYS, ...knownKeys])
  const shape: Record<string, string> = {}
  let level = shapeChildren(value, known)
  for (let depth = 1; depth <= SHAPE_DEPTH && level.length; depth += 1) {
    const next: Array<[string, unknown]> = []
    for (const [path, node] of level) {
      if (Object.keys(shape).length >= MAX_SHAPE_ENTRIES) return shape
      shape[path] = typeLabel(node)
      for (const [key, child] of shapeChildren(node, known)) next.push([`${path}.${key}`, child])
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
  private readonly storage: DurableStringStorage
  private readonly keys: DurableOutboxKeys
  private readonly codec: DurableOutboxCodec<Pending, Failed>
  private readonly owns: (action: Pending) => boolean
  private readonly limits: DurableOutboxLimits

  constructor(options: DurableOutboxOptions<Pending, Failed>) {
    this.storage = options.storage
    this.keys = options.keys
    this.codec = options.codec
    this.owns = options.owns
    this.limits = { ...DURABLE_OUTBOX_LIMITS, ...options.limits }
  }

  private pendingKey(operationId: string): string {
    return this.keys.pendingRecordPrefix + operationId
  }

  private failedKey(operationId: string): string {
    return this.keys.failedRecordPrefix + operationId
  }

  /** why: provenance goes first so a record cut short mid-write still names its writer. */
  private serialize(record: Pending | Failed): string {
    return JSON.stringify(currentWriter ? { writtenBy: currentWriter, ...record } : record)
  }

  private read(key: string): unknown {
    return withoutProvenance(parsedJson(this.storage.getString(key)))
  }

  /** why: budgets count what is on disk; another build may have stamped a longer writer than this one would. */
  private storedBytes(key: string, record: Pending | Failed): number {
    return utf8ByteLength(this.storage.getString(key) ?? this.serialize(record))
  }

  private index(key: string, discovered: readonly string[] = []): string[] {
    return stringIndex([...stringIndex(parsedJson(this.storage.getString(key))), ...discovered])
  }

  private discovered(allKeys: readonly string[], prefix: string): string[] {
    return allKeys.filter((key) => key.startsWith(prefix)).map((key) => key.slice(prefix.length))
  }

  order(actions: readonly Pending[]): Pending[] {
    return oldestFirst(actions, this.codec.operationId, this.codec.compare)
  }

  enqueue(
    action: Pending,
    currentPending: readonly Pending[] = this.loadPending(),
  ): DurableEnqueueResult<Pending> {
    const pending = this.order(currentPending)
    const operationId = this.codec.operationId(action)
    if (pending.some((candidate) => this.codec.operationId(candidate) === operationId))
      return { accepted: true, pending }
    if (pending.length >= this.limits.maxPendingRecords)
      return { accepted: false, reason: "record_limit", pending }
    const serialized = this.serialize(action)
    const pendingBytes = pending.reduce(
      (total, candidate) =>
        total + this.storedBytes(this.pendingKey(this.codec.operationId(candidate)), candidate),
      0,
    )
    if (pendingBytes + utf8ByteLength(serialized) > this.limits.maxPendingBytes)
      return { accepted: false, reason: "byte_limit", pending }
    this.storage.set(this.pendingKey(operationId), serialized)
    const index = this.index(this.keys.pendingIndex)
    if (!index.includes(operationId)) {
      index.push(operationId)
      this.storage.set(this.keys.pendingIndex, JSON.stringify(index))
    }
    return { accepted: true, pending: this.order([...pending, action]) }
  }

  load(): { pending: Pending[]; failures: Failed[] } {
    const allKeys = this.storage.getAllKeys()
    return { pending: this.readPending(allKeys), failures: this.readFailed(allKeys) }
  }

  loadPending(): Pending[] {
    return this.readPending(this.storage.getAllKeys())
  }

  loadFailed(): Failed[] {
    return this.readFailed(this.storage.getAllKeys())
  }

  private readPending(allKeys: readonly string[]): Pending[] {
    const index = this.index(
      this.keys.pendingIndex,
      this.discovered(allKeys, this.keys.pendingRecordPrefix),
    )
    const pending: Pending[] = []
    const validIds: string[] = []
    const quarantined: QuarantinedRecord[] = []
    for (const operationId of index) {
      const pendingKey = this.pendingKey(operationId)
      const failedKey = this.failedKey(operationId)
      const action = this.codec.parsePending(this.read(pendingKey))
      const failedValue = this.storage.getString(failedKey)
      const failed = this.codec.parseFailed(withoutProvenance(parsedJson(failedValue)))
      if (failedValue && failed) {
        if (this.codec.operationId(failed.action) === operationId && this.owns(failed.action)) {
          if (action) this.storage.delete(pendingKey)
          else this.quarantine(pendingKey, "pending", quarantined)
          continue
        }
        this.quarantine(failedKey, "failed", quarantined)
      } else if (failedValue) this.quarantine(failedKey, "failed", quarantined)
      if (action && this.codec.operationId(action) === operationId && this.owns(action)) {
        pending.push(action)
        validIds.push(operationId)
      } else this.quarantine(pendingKey, "pending", quarantined)
    }
    this.storage.set(this.keys.pendingIndex, JSON.stringify(validIds))
    this.reportQuarantined(quarantined)
    return this.order(pending)
  }

  updateAttempt(operationId: string, attemptedAt: number): Pending | null {
    const key = this.pendingKey(operationId)
    const action = this.codec.parsePending(this.read(key))
    if (!action) return null
    const updated = { ...action, attempts: action.attempts + 1, lastAttemptAt: attemptedAt }
    this.storage.set(key, this.serialize(updated))
    return updated
  }

  rewriteUnattempted(
    operationId: string,
    rewrite: (action: Pending) => Pending | null,
  ): Pending | null {
    const key = this.pendingKey(operationId)
    const action = this.codec.parsePending(this.read(key))
    if (!action || action.attempts > 0 || action.lastAttemptAt !== undefined) return null
    const rewritten = rewrite(action)
    if (rewritten) this.storage.set(key, this.serialize(rewritten))
    return rewritten
  }

  acknowledge(operationId: string): void {
    this.storage.delete(this.pendingKey(operationId))
    const index = this.index(this.keys.pendingIndex).filter(
      (candidate) => candidate !== operationId,
    )
    this.storage.set(this.keys.pendingIndex, JSON.stringify(index))
  }

  failAction(
    action: Pending,
    reason: string,
    failedAt: number,
    currentFailed: readonly Failed[],
    currentPending: readonly Pending[],
  ): DurableFailResult<Pending, Failed> {
    const operationId = this.codec.operationId(action)
    const failed = [...currentFailed]
    const pending = this.order(currentPending)
    if (
      failed.some((candidate) => this.codec.operationId(candidate.action) === operationId) ||
      // why: another tab settled it after this list was loaded; failing it now would bring back a dismissed failure.
      this.storage.getString(this.pendingKey(operationId)) === undefined
    )
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
      (total, candidate) =>
        total +
        this.storedBytes(this.failedKey(this.codec.operationId(candidate.action)), candidate),
      0,
    )
    const serialized = this.serialize(record)
    if (failedBytes + utf8ByteLength(serialized) > this.limits.maxFailedBytes)
      return { accepted: false, reason: "byte_limit", failed, pending }
    this.storage.set(this.failedKey(operationId), serialized)
    const nextFailed = [...failed, record].sort((left, right) => left.failedAt - right.failedAt)
    this.storage.set(
      this.keys.failedIndex,
      JSON.stringify(nextFailed.map((candidate) => this.codec.operationId(candidate.action))),
    )
    const nextPending = pending.filter(
      (candidate) => this.codec.operationId(candidate) !== operationId,
    )
    this.storage.delete(this.pendingKey(operationId))
    this.storage.set(
      this.keys.pendingIndex,
      JSON.stringify(nextPending.map((candidate) => this.codec.operationId(candidate))),
    )
    return { accepted: true, failed: nextFailed, pending: nextPending }
  }

  private readFailed(allKeys: readonly string[]): Failed[] {
    const index = this.index(
      this.keys.failedIndex,
      this.discovered(allKeys, this.keys.failedRecordPrefix),
    )
    const failures: Failed[] = []
    const quarantined: QuarantinedRecord[] = []
    for (const operationId of index) {
      const key = this.failedKey(operationId)
      const failure = this.codec.parseFailed(this.read(key))
      if (
        failure &&
        this.codec.operationId(failure.action) === operationId &&
        this.owns(failure.action)
      )
        failures.push(failure)
      else this.quarantine(key, "failed", quarantined)
    }
    this.reportQuarantined(quarantined)
    failures.sort((left, right) => left.failedAt - right.failedAt)
    this.storage.set(
      this.keys.failedIndex,
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
        shape: shapeOf(root, this.codec.knownKeys ?? []),
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
  private reportQuarantined(quarantined: readonly QuarantinedRecord[]): void {
    if (!quarantined.length) return
    reportQuarantine({
      outbox: outboxLabel(this.keys.pendingRecordPrefix),
      count: quarantined.length,
      reasons: [...new Set(quarantined.map((record) => record.reason))],
      records: quarantined.slice(0, MAX_REPORTED_RECORDS),
    })
  }

  dismissFailed(operationId: string): void {
    this.storage.delete(this.failedKey(operationId))
    const index = this.index(this.keys.failedIndex).filter((candidate) => candidate !== operationId)
    this.storage.set(this.keys.failedIndex, JSON.stringify(index))
  }

  clear(): void {
    for (const key of this.storage.getAllKeys())
      if (
        key.startsWith(this.keys.pendingRecordPrefix) ||
        key.startsWith(this.keys.failedRecordPrefix)
      )
        this.storage.delete(key)
    this.storage.delete(this.keys.pendingIndex)
    this.storage.delete(this.keys.failedIndex)
  }
}
