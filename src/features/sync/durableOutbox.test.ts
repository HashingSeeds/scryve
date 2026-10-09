import {
  configureOutboxDiagnostics,
  DURABLE_QUARANTINE_PREFIX,
  DURABLE_SIDECAR_PREFIX,
  DurableOutbox,
  type DurableFailedRecord,
  type DurableOutboxCodec,
  type DurableOutboxKeys,
  type DurablePendingRecord,
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

  it("keeps provenance beside each record and removes it with the record", () => {
    configureOutboxDiagnostics({ writtenBy: "build-a" })
    const storage = new MemoryStorage()
    const outbox = new DurableOutbox(storage, "owner", keys, codec)
    const sidecar = (key: string) => storage.getString(`${DURABLE_SIDECAR_PREFIX}${key}`)
    const sidecarKeys = () =>
      [...storage.values.keys()].filter((key) => key.startsWith(DURABLE_SIDECAR_PREFIX))
    const ackKey = keys.pendingRecord("deck", "note-ack", "owner")
    const now = jest.spyOn(Date, "now").mockReturnValue(5)
    outbox.enqueue(operation("note-ack", 1), "deck")
    outbox.enqueue(operation("note-fail", 2), "deck")
    outbox.fail("deck", "note-fail", "rejected", 6)
    now.mockRestore()

    expect(storage.getString(ackKey)).toBe(JSON.stringify(operation("note-ack", 1)))
    expect(JSON.parse(sidecar(ackKey)!)).toEqual({ writtenBy: "build-a", writtenAt: 5 })
    expect(sidecar(keys.pendingRecord("deck", "note-fail", "owner"))).toBeUndefined()
    expect(sidecar(keys.failedRecord("deck", "note-fail", "owner"))).toBeDefined()

    outbox.acknowledge("deck", "note-ack")
    outbox.dismissFailed("deck", "note-fail")
    expect(sidecarKeys()).toEqual([])

    outbox.enqueue(operation("note-torn", 3), "deck")
    storage.set(keys.pendingRecord("deck", "note-torn", "owner"), "{")
    outbox.loadPending("deck")
    expect(sidecarKeys()).toEqual([
      expect.stringMatching(/^meta:quarantine:\d+:notes\.pending\.v1\.owner\.deck\.note-torn$/),
    ])
  })

  it("reports each quarantine once with shape and provenance, never values", () => {
    const report = jest.fn()
    configureOutboxDiagnostics({ writtenBy: "1.2.3+update-a@runtime-1", report })
    const storage = new MemoryStorage()
    const outbox = new DurableOutbox(storage, "owner", keys, codec)
    outbox.enqueue(operation("note-valid", 1), "deck")
    outbox.loadPending("deck")
    expect(report).not.toHaveBeenCalled()

    const sentinel = "sentinel-7f3a9c"
    const future = JSON.stringify({
      schemaVersion: 2,
      op: "rename",
      event: { type: "life.changed", note: sentinel, nested: { deep: sentinel } },
      payload: [sentinel],
      label: "not-an-allowlisted-type",
    })
    outbox.enqueue(operation("note-secret", 2, sentinel), "deck")
    storage.set(keys.pendingRecord("deck", "note-secret", "owner"), future)
    storage.set(keys.pendingRecord("deck", "note-empty", "owner"), "")
    outbox.loadPending("deck")
    outbox.loadPending("deck")

    expect(report.mock.calls).toEqual([
      [
        {
          outbox: "notes.pending.v1",
          count: 2,
          reasons: ["rejected", "empty"],
          records: [
            {
              slot: "pending",
              reason: "rejected",
              bytes: Buffer.byteLength(future),
              shape: {
                schemaVersion: "number",
                op: "string",
                event: { type: "string", note: "string", nested: "object" },
                payload: "array",
                label: "string",
              },
              operationType: "rename",
              writtenBy: "1.2.3+update-a@runtime-1",
            },
            { slot: "pending", reason: "empty", bytes: 0, shape: "null", writtenBy: "unknown" },
          ],
        },
      ],
    ])
    expect(JSON.stringify(report.mock.calls)).not.toMatch(
      new RegExp(`${sentinel}|owner|note-secret|not-an-allowlisted-type`),
    )
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
