import {
  DURABLE_QUARANTINE_PREFIX,
  DurableOutbox,
  type DurableFailedRecord,
  type DurableOutboxCodec,
  type DurableOutboxKeys,
  type DurablePendingRecord,
  setOutboxWriter,
  setQuarantineReporter,
} from "./durableOutbox"

interface NoteOperation extends DurablePendingRecord {
  schemaVersion: 1
  id: string
  ownerId: string
  scopeId: string
  payload: { note: string }
}

interface NoteFailure extends DurableFailedRecord<NoteOperation> {
  schemaVersion: 1
}

class MemoryStorage {
  values = new Map<string, string>()

  getString(key: string) {
    return this.values.get(key)
  }

  getAllKeys() {
    return [...this.values.keys()]
  }

  set(key: string, value: string) {
    this.values.set(key, value)
  }

  delete(key: string) {
    this.values.delete(key)
  }
}

const keys: DurableOutboxKeys = {
  pendingIndex: (scope, owner) => `notes.pendingIndex.v1.${owner}.${scope}`,
  pendingRecord: (scope, operationId, owner) => `notes.pending.v1.${owner}.${scope}.${operationId}`,
  failedIndex: (scope, owner) => `notes.failedIndex.v1.${owner}.${scope}`,
  failedRecord: (scope, operationId, owner) => `notes.failed.v1.${owner}.${scope}.${operationId}`,
}

const codec: DurableOutboxCodec<NoteOperation, NoteFailure> = {
  parsePending: (value) => {
    if (
      typeof value !== "object" ||
      value === null ||
      !("payload" in value) ||
      typeof value.payload !== "object" ||
      value.payload === null ||
      !("note" in value.payload) ||
      typeof value.payload.note !== "string"
    )
      return null
    const candidate = value as Partial<NoteOperation>
    return typeof candidate.id === "string" && candidate.id.length > 0
      ? (candidate as NoteOperation)
      : null
  },
  parseFailed: (value) => {
    if (typeof value !== "object" || value === null || !("action" in value)) return null
    const candidate = value as Partial<NoteFailure>
    const action = codec.parsePending(candidate.action)
    return action && typeof candidate.reason === "string" && typeof candidate.failedAt === "number"
      ? ({ ...candidate, action } as NoteFailure)
      : null
  },
  createFailure: (action, reason, failedAt) => ({
    schemaVersion: 1,
    action,
    reason,
    failedAt,
  }),
  operationId: (action) => action.id,
  belongsToScope: (action, ownerId, scopeId) =>
    action.ownerId === ownerId && action.scopeId === scopeId,
}

function operation(
  id: string,
  queuedAt: number,
  note = id,
): NoteOperation & {
  id: string
  ownerId: string
  scopeId: string
} {
  return {
    schemaVersion: 1,
    id,
    ownerId: "owner",
    scopeId: "deck",
    queuedAt,
    attempts: 0,
    payload: { note },
  }
}

describe("durable outbox", () => {
  it("supports a different operation shape and repairs a torn index", () => {
    const storage = new MemoryStorage()
    const outbox = new DurableOutbox(storage, "owner", keys, codec)
    const first = operation("note-1", 2)
    const second = operation("note-2", 1)
    outbox.enqueue(first, "deck")
    storage.set(keys.pendingRecord("deck", "note-2", "owner"), JSON.stringify(second))

    expect(outbox.loadPending("deck")).toEqual([second, first])
    expect(JSON.parse(storage.getString(keys.pendingIndex("deck", "owner"))!)).toEqual([
      "note-1",
      "note-2",
    ])
  })

  it("quarantines unreadable records instead of deleting them", () => {
    const storage = new MemoryStorage()
    const outbox = new DurableOutbox(storage, "owner", keys, codec)
    const quarantined = () =>
      [...storage.values]
        .filter(([key]) => key.startsWith(DURABLE_QUARANTINE_PREFIX))
        .map(([, value]) => value)
        .sort()
    const pendingKey = keys.pendingRecord("deck", "note-future", "owner")
    const future = JSON.stringify({ ...operation("note-future", 1), payload: { body: "v2" } })
    const rewritten = JSON.stringify({ ...operation("note-future", 2), payload: { body: "v3" } })
    const done = operation("note-done", 1)
    const staleDone = JSON.stringify({ ...done, payload: { body: "v2" } })
    const failedDone = codec.createFailure(done, "rejected", 2)
    storage.set(pendingKey, future)
    storage.set(keys.failedRecord("deck", "note-torn", "owner"), '{"action":')
    storage.set(keys.pendingRecord("deck", "note-done", "owner"), staleDone)
    storage.set(keys.failedRecord("deck", "note-done", "owner"), JSON.stringify(failedDone))
    storage.set(keys.pendingRecord("deck", "note-empty", "owner"), "")

    const now = jest.spyOn(Date, "now").mockReturnValue(1)
    const pending = outbox.loadPending("deck")
    const failed = outbox.loadFailed("deck")
    storage.set(pendingKey, rewritten)
    outbox.loadPending("deck")
    now.mockRestore()

    expect(pending).toEqual([])
    expect(failed).toEqual([failedDone])
    expect([...storage.values.keys()].filter((key) => key.startsWith("notes.pending."))).toEqual([])
    expect(quarantined()).toEqual([future, rewritten, staleDone, '{"action":', ""].sort())
  })

  it("reports each quarantine once with metadata only, and a clean load not at all", () => {
    const report = jest.fn()
    setQuarantineReporter(report)
    const storage = new MemoryStorage()
    const outbox = new DurableOutbox(storage, "owner", keys, codec)
    outbox.enqueue(operation("note-valid", 1), "deck")
    outbox.loadPending("deck")
    expect(report).not.toHaveBeenCalled()

    storage.set(keys.pendingRecord("deck", "note-secret", "owner"), '{"note":"private"}')
    storage.set(keys.pendingRecord("deck", "note-empty", "owner"), "")
    outbox.loadPending("deck")
    outbox.loadPending("deck")

    expect(report.mock.calls).toEqual([
      [
        expect.objectContaining({
          outbox: "notes.pending.v1",
          count: 2,
          reasons: ["rejected", "empty"],
        }),
      ],
    ])
    expect(JSON.stringify(report.mock.calls)).not.toMatch(/owner|private|note-secret/)
  })

  it("makes acknowledgements and replay-safe cleanup idempotent", () => {
    const storage = new MemoryStorage()
    const outbox = new DurableOutbox(storage, "owner", keys, codec)
    outbox.enqueue(operation("note-ack", 1), "deck")
    outbox.acknowledge("deck", "note-ack")
    outbox.acknowledge("deck", "note-ack")

    expect(outbox.loadPending("deck")).toEqual([])
  })

  it("enforces pending record and byte bounds", () => {
    const storage = new MemoryStorage()
    const outbox = new DurableOutbox(storage, "owner", keys, codec, {
      maxPendingRecords: 1,
      maxPendingBytes: 10_000,
    })
    outbox.enqueue(operation("note-cap-1", 1), "deck")
    expect(outbox.enqueue(operation("note-cap-2", 2), "deck")).toMatchObject({
      accepted: false,
      reason: "record_limit",
    })

    const byteLimited = new DurableOutbox(storage, "owner-2", keys, codec, {
      maxPendingBytes: 1,
    })
    expect(byteLimited.enqueue(operation("note-byte", 1), "deck")).toMatchObject({
      accepted: false,
      reason: "byte_limit",
    })
  })
})

describe("durable outbox provenance", () => {
  const writer = { app: "1.4.0", update: "update-a", runtime: "runtime-1" }
  const stored = (storage: MemoryStorage, key: string): Record<string, unknown> =>
    JSON.parse(storage.getString(key)!) as Record<string, unknown>

  afterEach(() => {
    setOutboxWriter(undefined)
    setQuarantineReporter(() => {})
  })

  it("stamps the writing build on every record and never hands it to the codec's caller", () => {
    setOutboxWriter(writer)
    const storage = new MemoryStorage()
    const outbox = new DurableOutbox(storage, "owner", keys, codec)
    const note = operation("note-1", 1)
    const pendingKey = keys.pendingRecord("deck", "note-1", "owner")
    outbox.enqueue(note, "deck")

    expect(stored(storage, pendingKey)).toEqual({ ...note, writtenBy: writer })
    expect(storage.getString(pendingKey)).toMatch(/^\{"writtenBy":/)
    // why: the test codec passes the stored object through, like the deck codec does.
    expect(outbox.loadPending("deck")).toEqual([note])

    const rolledForward = { ...writer, update: "update-b" }
    setOutboxWriter(rolledForward)
    outbox.updateAttempt("deck", "note-1", 5)
    expect(stored(storage, pendingKey).writtenBy).toEqual(rolledForward)

    outbox.fail("deck", "note-1", "rejected", 6)
    const failed = stored(storage, keys.failedRecord("deck", "note-1", "owner"))
    expect(failed.writtenBy).toEqual(rolledForward)
    expect(failed.action).not.toHaveProperty("writtenBy")
    expect(outbox.loadFailed("deck")[0].action).not.toHaveProperty("writtenBy")
  })

  it("reads records with no provenance, and one an older build wrapped with the action's", () => {
    const storage = new MemoryStorage()
    const outbox = new DurableOutbox(storage, "owner", keys, codec)
    const legacy = operation("note-legacy", 1)
    const rewrapped = operation("note-rewrapped", 2)
    storage.set(keys.pendingRecord("deck", "note-legacy", "owner"), JSON.stringify(legacy))
    // why: an older pass-through codec copies the pending record, provenance included, into `action`.
    storage.set(
      keys.failedRecord("deck", "note-rewrapped", "owner"),
      JSON.stringify(
        codec.createFailure({ ...rewrapped, writtenBy: writer } as NoteOperation, "x", 3),
      ),
    )

    expect(outbox.loadPending("deck")).toEqual([legacy])
    expect(outbox.loadFailed("deck")).toEqual([codec.createFailure(rewrapped, "x", 3)])
  })

  it("reports each quarantined record's structure and writer, never its values", () => {
    const sentinel = "sentinel-7f3a"
    const report = jest.fn()
    setQuarantineReporter(report)
    const storage = new MemoryStorage()
    const outbox = new DurableOutbox(storage, "owner", keys, {
      ...codec,
      operationTypes: ["create"],
    })
    const future = JSON.stringify({
      ...operation("note-future", 1),
      op: "create",
      payload: { body: sentinel },
      writtenBy: { app: "2.0.0", update: "update-z", runtime: "runtime-2" },
    })
    const tornWriter = { app: "1.9.0", update: "update-t", runtime: "runtime-2" }
    const torn = JSON.stringify({ writtenBy: tornWriter, payload: { note: sentinel } }).slice(0, -8)
    const foreign = JSON.stringify({
      schemaVersion: 1,
      action: { op: sentinel, id: sentinel },
      reason: sentinel,
      failedAt: 1,
      writtenBy: { app: sentinel },
    })
    storage.set(keys.pendingRecord("deck", "note-future", "owner"), future)
    storage.set(keys.pendingRecord("deck", "note-torn", "owner"), torn)
    storage.set(keys.failedRecord("deck", "note-foreign", "owner"), foreign)

    outbox.loadPending("deck")
    outbox.loadFailed("deck")

    const bytes = (value: string) => new TextEncoder().encode(value).length
    expect(report.mock.calls).toEqual([
      [
        {
          outbox: "notes.pending.v1",
          count: 2,
          reasons: ["rejected", "invalid_json"],
          records: [
            {
              slot: "pending",
              reason: "rejected",
              bytes: bytes(future),
              shape: {
                "schemaVersion": "number",
                "id": "string",
                "ownerId": "string",
                "scopeId": "string",
                "queuedAt": "number",
                "attempts": "number",
                "payload": "object",
                "payload.body": "string",
                "op": "string",
                "writtenBy": "object",
                "writtenBy.app": "string",
                "writtenBy.update": "string",
                "writtenBy.runtime": "string",
              },
              operationType: "create",
              writtenBy: { app: "2.0.0", update: "update-z", runtime: "runtime-2" },
            },
            {
              slot: "pending",
              reason: "invalid_json",
              bytes: bytes(torn),
              shape: {},
              operationType: "unknown",
              writtenBy: tornWriter,
            },
          ],
        },
      ],
      [
        {
          outbox: "notes.pending.v1",
          count: 1,
          reasons: ["rejected"],
          records: [
            {
              slot: "failed",
              reason: "rejected",
              bytes: bytes(foreign),
              shape: {
                "schemaVersion": "number",
                "action": "object",
                "action.op": "string",
                "action.id": "string",
                "reason": "string",
                "failedAt": "number",
                "writtenBy": "object",
                "writtenBy.app": "string",
              },
              operationType: "unknown",
              writtenBy: "unknown",
            },
          ],
        },
      ],
    ])
    expect(JSON.stringify(report.mock.calls)).not.toContain(sentinel)
  })
})
