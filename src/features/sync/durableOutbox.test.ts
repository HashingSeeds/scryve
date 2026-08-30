import {
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
  pendingIndex: (scope, owner) => `pending.${owner}.${scope}`,
  pendingRecord: (scope, operationId, owner) => `pending.${owner}.${scope}.${operationId}`,
  failedIndex: (scope, owner) => `failed.${owner}.${scope}`,
  failedRecord: (scope, operationId, owner) => `failed.${owner}.${scope}.${operationId}`,
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
