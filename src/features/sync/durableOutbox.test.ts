import {
  DURABLE_QUARANTINE_PREFIX,
  DurableOutbox,
  type DurableFailedRecord,
  type DurableOutboxCodec,
  type DurableOutboxKeys,
  type DurableOutboxLimits,
  type DurablePendingRecord,
  type QuarantineReport,
  setOutboxWriter,
  setQuarantineReporter,
} from "./durableOutbox"
import { MemoryStorage } from "../../../test/support/memoryStorage"

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

const keysFor = (owner: string): DurableOutboxKeys => ({
  pendingIndex: `notes.pendingIndex.v1.${owner}.deck`,
  pendingRecordPrefix: `notes.pending.v1.${owner}.deck.`,
  failedIndex: `notes.failedIndex.v1.${owner}.deck`,
  failedRecordPrefix: `notes.failed.v1.${owner}.deck.`,
})
const keys = keysFor("owner")
const pendingRecordKey = (operationId: string) => keys.pendingRecordPrefix + operationId
const failedRecordKey = (operationId: string) => keys.failedRecordPrefix + operationId

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
}

function outboxFor(
  storage: MemoryStorage,
  {
    owner = "owner",
    notes = codec,
    limits,
  }: {
    owner?: string
    notes?: DurableOutboxCodec<NoteOperation, NoteFailure>
    limits?: Partial<DurableOutboxLimits>
  } = {},
) {
  return new DurableOutbox({
    storage,
    keys: keysFor(owner),
    codec: notes,
    owns: (action) => action.ownerId === owner && action.scopeId === "deck",
    limits,
  })
}

function fail(
  outbox: DurableOutbox<NoteOperation, NoteFailure>,
  operationId: string,
  reason: string,
  failedAt: number,
) {
  const pending = outbox.loadPending()
  const action = pending.find((candidate) => candidate.id === operationId)!
  return outbox.failAction(action, reason, failedAt, outbox.loadFailed(), pending)
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
    const outbox = outboxFor(storage)
    const first = operation("note-1", 2)
    const second = operation("note-2", 1)
    outbox.enqueue(first)
    storage.set(pendingRecordKey("note-2"), JSON.stringify(second))

    expect(outbox.loadPending()).toEqual([second, first])
    expect(JSON.parse(storage.getString(keys.pendingIndex)!)).toEqual(["note-1", "note-2"])
  })

  it("quarantines unreadable records instead of deleting them", () => {
    const storage = new MemoryStorage()
    const outbox = outboxFor(storage)
    const quarantined = () =>
      [...storage.values]
        .filter(([key]) => key.startsWith(DURABLE_QUARANTINE_PREFIX))
        .map(([, value]) => value)
        .sort()
    const pendingKey = pendingRecordKey("note-future")
    const future = JSON.stringify({ ...operation("note-future", 1), payload: { body: "v2" } })
    const rewritten = JSON.stringify({ ...operation("note-future", 2), payload: { body: "v3" } })
    const done = operation("note-done", 1)
    const staleDone = JSON.stringify({ ...done, payload: { body: "v2" } })
    const failedDone = codec.createFailure(done, "rejected", 2)
    storage.set(pendingKey, future)
    storage.set(failedRecordKey("note-torn"), '{"action":')
    storage.set(pendingRecordKey("note-done"), staleDone)
    storage.set(failedRecordKey("note-done"), JSON.stringify(failedDone))
    storage.set(pendingRecordKey("note-empty"), "")

    const now = jest.spyOn(Date, "now").mockReturnValue(1)
    const pending = outbox.loadPending()
    const failed = outbox.loadFailed()
    storage.set(pendingKey, rewritten)
    outbox.loadPending()
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
    const outbox = outboxFor(storage)
    outbox.enqueue(operation("note-valid", 1))
    outbox.loadPending()
    expect(report).not.toHaveBeenCalled()

    storage.set(pendingRecordKey("note-secret"), '{"note":"private"}')
    storage.set(pendingRecordKey("note-empty"), "")
    outbox.loadPending()
    outbox.loadPending()

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
    const staleTab = outboxFor(storage)
    const otherTab = outboxFor(storage)
    const rejected = operation("note-rejected", 1)
    otherTab.enqueue(rejected)
    const stalePending = staleTab.loadPending()
    fail(otherTab, "note-rejected", "rejected", 2)
    otherTab.dismissFailed("note-rejected")

    expect(staleTab.updateAttempt("note-rejected", 3)).toBeNull()
    expect(staleTab.failAction(rejected, "rejected", 3, [], stalePending)).toEqual({
      accepted: true,
      failed: [],
      pending: [],
    })
    expect(staleTab.loadFailed()).toEqual([])
    expect(staleTab.loadPending()).toEqual([])
  })

  it("makes acknowledgements and replay-safe cleanup idempotent", () => {
    const storage = new MemoryStorage()
    const outbox = outboxFor(storage)
    outbox.enqueue(operation("note-ack", 1))
    outbox.acknowledge("note-ack")
    outbox.acknowledge("note-ack")

    expect(outbox.loadPending()).toEqual([])
  })

  it("enforces pending record and byte bounds", () => {
    const storage = new MemoryStorage()
    const outbox = outboxFor(storage, {
      limits: {
        maxPendingRecords: 1,
        maxPendingBytes: 10_000,
      },
    })
    outbox.enqueue(operation("note-cap-1", 1))
    expect(outbox.enqueue(operation("note-cap-2", 2))).toMatchObject({
      accepted: false,
      reason: "record_limit",
    })

    const byteLimited = outboxFor(storage, {
      owner: "owner-2",
      limits: {
        maxPendingBytes: 1,
      },
    })
    expect(byteLimited.enqueue(operation("note-byte", 1))).toMatchObject({
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
    const outbox = outboxFor(storage)
    const note = operation("note-1", 1)
    const pendingKey = pendingRecordKey("note-1")
    outbox.enqueue(note)

    expect(stored(storage, pendingKey)).toEqual({ ...note, writtenBy: writer })
    expect(storage.getString(pendingKey)).toMatch(/^\{"writtenBy":/)
    expect(outbox.loadPending()).toEqual([note])

    setOutboxWriter(otherWriter)
    outbox.updateAttempt("note-1", 5)
    expect(stored(storage, pendingKey).writtenBy).toEqual(otherWriter)

    fail(outbox, "note-1", "rejected", 6)
    const failed = stored(storage, failedRecordKey("note-1"))
    expect(failed.writtenBy).toEqual(otherWriter)
    expect(failed.action).not.toHaveProperty("writtenBy")
    expect(outbox.loadFailed()[0].action).not.toHaveProperty("writtenBy")
  })

  it("reads records with no provenance, and one an older build wrapped with the action's", () => {
    const storage = new MemoryStorage()
    const outbox = outboxFor(storage)
    const legacy = operation("note-legacy", 1)
    const rewrapped = operation("note-rewrapped", 2)
    storage.set(pendingRecordKey("note-legacy"), JSON.stringify(legacy))
    storage.set(
      failedRecordKey("note-rewrapped"),
      JSON.stringify(
        codec.createFailure({ ...rewrapped, writtenBy: writer } as NoteOperation, "x", 3),
      ),
    )

    expect(outbox.loadPending()).toEqual([legacy])
    expect(outbox.loadFailed()).toEqual([codec.createFailure(rewrapped, "x", 3)])
  })

  it("budgets the bytes on disk, not this build's re-serialization of them", () => {
    const storage = new MemoryStorage()
    setOutboxWriter(writer)
    const first = operation("note-first", 1)
    outboxFor(storage).enqueue(first)
    fail(outboxFor(storage), "note-first", "x", 2)
    outboxFor(storage).enqueue(operation("note-held", 3))
    const onDisk = (key: string) => bytes(storage.getString(key)!)
    setOutboxWriter(undefined)
    const second = operation("note-second", 4)
    const pendingLimit = onDisk(pendingRecordKey("note-held")) + bytes(JSON.stringify(second)) - 1
    const failedLimit =
      onDisk(failedRecordKey("note-first")) +
      bytes(JSON.stringify(codec.createFailure(second, "x", 5))) -
      1
    const outbox = outboxFor(storage, {
      limits: {
        maxPendingBytes: pendingLimit,
        maxFailedBytes: failedLimit,
      },
    })

    expect(outbox.enqueue(second)).toMatchObject({ accepted: false, reason: "byte_limit" })
    outboxFor(storage).enqueue(second)
    expect(
      outbox.failAction(second, "x", 5, outbox.loadFailed(), outbox.loadPending()),
    ).toMatchObject({ accepted: false, reason: "byte_limit" })
  })

  it("reports each quarantined record's structure and writer, never its values", () => {
    const sentinel = "sentinel-7f3a"
    const report = jest.fn()
    setQuarantineReporter(report)
    const storage = new MemoryStorage()
    const outbox = outboxFor(storage, { notes })
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
    storage.set(pendingRecordKey("note-future"), future)
    storage.set(pendingRecordKey("note-torn"), torn)
    storage.set(failedRecordKey("note-foreign"), foreign)

    outbox.loadPending()
    outbox.loadFailed()

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
    const outbox = outboxFor(storage, {
      notes: { ...notes, knownKeys: ["cards", "name", "quantity", "byName"] },
    })
    const dataKeys = [
      "Sol Ring",
      "abcdefghijklmnop",
      "3f2b8c1e-9a4d-4c2b-8e1f-0a9b8c7d6e5f",
      "1700000000000",
    ]
    storage.set(
      failedRecordKey("note-nested"),
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

    outbox.loadFailed()

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
    const outbox = outboxFor(storage, { notes })
    const stamped = (id: string, writtenBy: Record<string, string>) =>
      storage.set(pendingRecordKey(id), JSON.stringify({ writtenBy, id, payload: { body: 1 } }))
    stamped("note-clerk", { ...writer, update: clerkId })
    stamped("note-names", { app: "Sol Ring", update: "Island", runtime: clerkId, commit: clerkId })

    outbox.loadPending()

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
    const outbox = outboxFor(storage, { notes })
    for (const [id, update] of [
      ["note-copied", operationId],
      ["note-real", writer.update],
    ])
      storage.set(
        pendingRecordKey(id),
        JSON.stringify({ writtenBy: { ...writer, update }, id, payload: { body: 1 } }),
      )

    outbox.loadPending()

    expect(JSON.stringify(report.mock.calls)).not.toMatch(
      new RegExp([operationId, writer.update, writer.runtime, writer.commit].join("|")),
    )
    const [, real] = reported(report)
    const { lookup } = jest.requireActual<{
      lookup: (digests: string[], candidates: string[]) => string[]
    }>("../../../scripts/outbox-provenance-lookup.cjs")
    expect(
      lookup(
        [real.writtenBy === "unknown" ? "" : real.writtenBy.update],
        [operationId, writer.update],
      ),
    ).toEqual([writer.update])
  })
})
