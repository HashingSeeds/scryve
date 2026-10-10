import { spawnSync } from "node:child_process"
import { join } from "node:path"

import {
  DURABLE_QUARANTINE_PREFIX,
  DurableOutbox,
  type DurableFailedRecord,
  type DurableOutboxCodec,
  type DurableOutboxKeys,
  type DurablePendingRecord,
  type QuarantineReport,
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

  it("won't revive an operation another tab failed and dismissed", () => {
    const storage = new MemoryStorage()
    const staleTab = new DurableOutbox(storage, "owner", keys, codec)
    const otherTab = new DurableOutbox(storage, "owner", keys, codec)
    const rejected = operation("note-rejected", 1)
    otherTab.enqueue(rejected, "deck")
    const stalePending = staleTab.loadPending("deck")
    otherTab.fail("deck", "note-rejected", "rejected", 2)
    otherTab.dismissFailed("deck", "note-rejected")

    expect(staleTab.updateAttempt("deck", "note-rejected", 3)).toBeNull()
    expect(staleTab.failAction(rejected, "deck", "rejected", 3, [], stalePending)).toEqual({
      accepted: true,
      failed: [],
      pending: [],
    })
    expect(staleTab.loadFailed("deck")).toEqual([])
    expect(staleTab.loadPending("deck")).toEqual([])
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
  const writer = {
    app: "1.4.0",
    update: "0b6f3c2e-5d1a-4f8e-9c7b-2a4d6e8f0a1c",
    runtime: "3a5f9c1e7b2d4f6a8c0e1b3d5f7a9c2e4b6d8f0a",
    commit: "0123456789ab",
  }
  const otherWriter = {
    app: "2.0.0",
    update: "embedded",
    runtime: "9f8e7d6c5b4a39281706f5e4d3c2b1a098765432",
  }
  const notes = {
    ...codec,
    operationTypes: ["create"],
    knownKeys: ["id", "ownerId", "scopeId", "payload", "note", "op"],
  }
  const bytes = (value: string) => new TextEncoder().encode(value).length
  const digest: unknown = expect.stringMatching(/^[\da-f]{8}$/)
  const stored = (storage: MemoryStorage, key: string): Record<string, unknown> =>
    JSON.parse(storage.getString(key)!) as Record<string, unknown>
  const reported = (report: jest.Mock) =>
    report.mock.calls.flatMap(([{ records }]: [QuarantineReport]) => records)

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

    setOutboxWriter(otherWriter)
    outbox.updateAttempt("deck", "note-1", 5)
    expect(stored(storage, pendingKey).writtenBy).toEqual(otherWriter)

    outbox.fail("deck", "note-1", "rejected", 6)
    const failed = stored(storage, keys.failedRecord("deck", "note-1", "owner"))
    expect(failed.writtenBy).toEqual(otherWriter)
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

  it("budgets the bytes on disk, not this build's re-serialization of them", () => {
    const storage = new MemoryStorage()
    setOutboxWriter(writer)
    const first = operation("note-first", 1)
    new DurableOutbox(storage, "owner", keys, codec).enqueue(first, "deck")
    new DurableOutbox(storage, "owner", keys, codec).fail("deck", "note-first", "x", 2)
    new DurableOutbox(storage, "owner", keys, codec).enqueue(operation("note-held", 3), "deck")
    const onDisk = (key: string) => bytes(storage.getString(key)!)
    setOutboxWriter(undefined)
    const second = operation("note-second", 4)
    const pendingLimit =
      onDisk(keys.pendingRecord("deck", "note-held", "owner")) + bytes(JSON.stringify(second)) - 1
    const failedLimit =
      onDisk(keys.failedRecord("deck", "note-first", "owner")) +
      bytes(JSON.stringify(codec.createFailure(second, "x", 5))) -
      1
    const outbox = new DurableOutbox(storage, "owner", keys, codec, {
      maxPendingBytes: pendingLimit,
      maxFailedBytes: failedLimit,
    })

    expect(outbox.enqueue(second, "deck")).toMatchObject({ accepted: false, reason: "byte_limit" })
    expect(
      outbox.failAction(
        second,
        "deck",
        "x",
        5,
        outbox.loadFailed("deck"),
        outbox.loadPending("deck"),
      ),
    ).toMatchObject({ accepted: false, reason: "byte_limit" })
  })

  it("reports each quarantined record's structure and writer, never its values", () => {
    const sentinel = "sentinel-7f3a"
    const report = jest.fn()
    setQuarantineReporter(report)
    const storage = new MemoryStorage()
    const outbox = new DurableOutbox(storage, "owner", keys, notes)
    const future = JSON.stringify({
      ...operation("note-future", 1),
      op: "create",
      payload: { body: sentinel },
      writtenBy: otherWriter,
    })
    const torn = JSON.stringify({ writtenBy: writer, payload: { note: sentinel } }).slice(0, -8)
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
                "payload.<key1>": "string",
                "op": "string",
                "writtenBy": "object",
                "writtenBy.app": "string",
                "writtenBy.update": "string",
                "writtenBy.runtime": "string",
              },
              operationType: "create",
              writtenBy: { ...otherWriter, runtime: digest },
            },
            {
              slot: "pending",
              reason: "invalid_json",
              bytes: bytes(torn),
              shape: {},
              operationType: "unknown",
              writtenBy: { app: writer.app, update: digest, runtime: digest, commit: digest },
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

  it("describes nested fields and sampled array elements, and replaces every unknown key", () => {
    const report = jest.fn()
    setQuarantineReporter(report)
    const storage = new MemoryStorage()
    const outbox = new DurableOutbox(storage, "owner", keys, {
      ...notes,
      knownKeys: ["cards", "name", "quantity", "byName"],
    })
    const dataKeys = [
      "Sol Ring",
      "abcdefghijklmnop",
      "3f2b8c1e-9a4d-4c2b-8e1f-0a9b8c7d6e5f",
      "1700000000000",
    ]
    storage.set(
      keys.failedRecord("deck", "note-nested", "owner"),
      JSON.stringify({
        schemaVersion: 1,
        action: {
          cards: [{ name: "Island" }, { quantity: 2, foil: true }, {}, { name: "Swamp" }],
          byName: Object.fromEntries(dataKeys.map((key, index) => [key, index])),
        },
        reason: "x",
        failedAt: 1,
      }),
    )

    outbox.loadFailed("deck")

    const [record] = reported(report)
    expect(record.shape).toEqual({
      "schemaVersion": "number",
      "action": "object",
      "reason": "string",
      "failedAt": "number",
      "action.cards": "array",
      "action.byName": "object",
      "action.cards.0": "object",
      "action.cards.1": "object",
      "action.cards.2": "object",
      "action.byName.<key1>": "number",
      "action.byName.<key2>": "number",
      "action.byName.<key3>": "number",
      "action.byName.<key4>": "number",
      "action.cards.0.name": "string",
      "action.cards.1.quantity": "number",
      "action.cards.1.<key1>": "boolean",
    })
    for (const key of [...dataKeys, "Island", "foil"])
      expect(JSON.stringify(report.mock.calls)).not.toContain(key)
  })

  it("reports only build identifiers in the formats the app writes", () => {
    const clerkId = "user_2NNEqL2nrIRdJ194ndJqAHwEfxC"
    const report = jest.fn()
    setQuarantineReporter(report)
    const storage = new MemoryStorage()
    const outbox = new DurableOutbox(storage, "owner", keys, notes)
    const stamped = (id: string, writtenBy: Record<string, string>) =>
      storage.set(
        keys.pendingRecord("deck", id, "owner"),
        JSON.stringify({ writtenBy, id, payload: { body: 1 } }),
      )
    stamped("note-clerk", { ...writer, update: clerkId })
    stamped("note-names", { app: "Sol Ring", update: "Island", runtime: clerkId, commit: clerkId })

    outbox.loadPending("deck")

    expect(reported(report).map((record) => record.writtenBy)).toEqual([
      { app: writer.app, update: "unknown", runtime: digest, commit: digest },
      "unknown",
    ])
    expect(JSON.stringify(report.mock.calls)).not.toMatch(/user_|Sol Ring|Island/)
  })

  it("reports build IDs only as digests that the lookup script maps back", () => {
    const operationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    const report = jest.fn()
    setQuarantineReporter(report)
    const storage = new MemoryStorage()
    const outbox = new DurableOutbox(storage, "owner", keys, notes)
    for (const [id, update] of [
      ["note-copied", operationId],
      ["note-real", writer.update],
    ])
      storage.set(
        keys.pendingRecord("deck", id, "owner"),
        JSON.stringify({ writtenBy: { ...writer, update }, id, payload: { body: 1 } }),
      )

    outbox.loadPending("deck")

    expect(JSON.stringify(report.mock.calls)).not.toMatch(
      new RegExp([operationId, writer.update, writer.runtime, writer.commit].join("|")),
    )
    const [, real] = reported(report)
    const lookup = spawnSync(
      process.execPath,
      [
        join(__dirname, "../../../scripts/outbox-provenance-lookup.cjs"),
        real.writtenBy === "unknown" ? "" : real.writtenBy.update,
      ],
      { input: `${operationId}\n${writer.update}\n`, encoding: "utf8" },
    )
    expect(lookup.stdout.trim().split(" ")[1]).toBe(writer.update)
  })
})
