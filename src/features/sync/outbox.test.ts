import type {
  DurableFailedRecord,
  DurableOutboxCodec,
  DurableOutboxKeys,
  DurableOutboxLimits,
  DurablePendingRecord,
} from "./durableOutbox"
import { createOutbox, type OutboxAcknowledgement, type OutboxSender } from "./outbox"
import { MemoryStorage } from "../../../test/support/memoryStorage"

interface Note extends DurablePendingRecord {
  schemaVersion: 1
  id: string
  ownerId: string
  text: string
}

interface NoteFailure extends DurableFailedRecord<Note> {
  schemaVersion: 1
}

const isNote = (value: unknown): value is Note =>
  typeof value === "object" && value !== null && "id" in value && "text" in value

const codec: DurableOutboxCodec<Note, NoteFailure> = {
  parsePending: (value) => (isNote(value) ? value : null),
  parseFailed: (value) =>
    typeof value === "object" && value !== null && "action" in value && isNote(value.action)
      ? (value as NoteFailure)
      : null,
  createFailure: (action, reason, failedAt) => ({ schemaVersion: 1, action, reason, failedAt }),
  operationId: (note) => note.id,
}

const keysFor = (scope: string): DurableOutboxKeys => ({
  pendingIndex: `notes.pending.v1.${scope}`,
  pendingRecordPrefix: `notes.pendingRecord.v1.${scope}.`,
  failedIndex: `notes.failed.v1.${scope}`,
  failedRecordPrefix: `notes.failedRecord.v1.${scope}.`,
})

const note = (id: string, queuedAt = 1): Note => ({
  schemaVersion: 1,
  id,
  ownerId: "owner",
  text: id,
  queuedAt,
  attempts: 0,
})

const ids = (notes: readonly Note[]) => notes.map((queued) => queued.id)
const flush = () => new Promise(setImmediate)

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (cause: Error) => void
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

class ManualTimers {
  delays: number[] = []
  private nextHandle = 1
  private readonly pending = new Map<number, () => void>()

  setTimeoutFn = (handler: () => void, delay: number) => {
    const handle = this.nextHandle++
    this.delays.push(delay)
    this.pending.set(handle, handler)
    return handle as unknown as ReturnType<typeof setTimeout>
  }

  clearTimeoutFn = (handle: ReturnType<typeof setTimeout>) => {
    this.pending.delete(handle as unknown as number)
  }

  get activeCount() {
    return this.pending.size
  }

  runAll() {
    const handlers = [...this.pending.values()]
    this.pending.clear()
    for (const handler of handlers) handler()
  }
}

function reopen(storage: MemoryStorage, scope = "owner") {
  return createOutbox({ storage, keys: keysFor(scope), codec, owns: () => true })
}

function setup({
  respond = async (queued: Note): Promise<OutboxAcknowledgement> => ({ operationId: queued.id }),
  storage = new MemoryStorage(),
  limits,
  ...sender
}: Partial<Omit<OutboxSender<Note>, "send">> & {
  respond?: (queued: Note) => Promise<OutboxAcknowledgement>
  storage?: MemoryStorage
  limits?: Partial<DurableOutboxLimits>
} = {}) {
  const sent: string[] = []
  const timers = new ManualTimers()
  const outbox = createOutbox({
    storage,
    keys: keysFor("owner"),
    codec,
    owns: (queued) => queued.ownerId === "owner",
    limits,
    sender: {
      send: (queued) => {
        sent.push(queued.id)
        return respond(queued)
      },
      rejectReason: (cause) =>
        cause instanceof Error && cause.message === "rejected" ? "rejected" : undefined,
      backoff: { baseMs: 1_000, maxMs: 60_000 },
      setTimeoutFn: timers.setTimeoutFn,
      clearTimeoutFn: timers.clearTimeoutFn,
      ...sender,
    },
  })
  return { outbox, sent, storage, timers }
}

describe("createOutbox", () => {
  it("sends oldest first only while started, and sends nothing after a stop but the write in flight", async () => {
    const first = deferred<OutboxAcknowledgement>()
    const { outbox, sent, storage } = setup({
      respond: async (queued) =>
        queued.id === "note-1" ? first.promise : { operationId: queued.id },
    })
    outbox.enqueue(note("note-2", 2))
    outbox.enqueue(note("note-1", 1))

    await outbox.drain()
    expect(sent).toEqual([])

    const stop = outbox.start()
    await flush()
    expect(sent).toEqual(["note-1"])
    stop()
    first.resolve({ operationId: "note-1" })
    await flush()

    expect(sent).toEqual(["note-1"])
    expect(ids(outbox.getState().pending)).toEqual(["note-2"])
    expect(ids(reopen(storage).getState().pending)).toEqual(["note-2"])
  })

  it("sends writes queued mid-pass and coalesces drains requested meanwhile into one more pass", async () => {
    const first = deferred<OutboxAcknowledgement>()
    const passes = jest.fn()
    const { outbox, sent } = setup({
      respond: async (queued) =>
        queued.id === "note-1" ? first.promise : { operationId: queued.id },
      onDrained: passes,
    })
    outbox.enqueue(note("note-1", 1))
    outbox.start()
    await flush()

    outbox.enqueue(note("note-2", 2))
    void outbox.drain()
    void outbox.drain()
    first.resolve({ operationId: "note-1" })
    await flush()

    expect(sent).toEqual(["note-1", "note-2"])
    expect(passes.mock.calls).toEqual([
      [{ acknowledged: 2, failed: 0, outcome: "success" }],
      [{ acknowledged: 0, failed: 0, outcome: "success" }],
    ])
  })

  it("loads storage once for a whole pass", async () => {
    const { outbox, storage } = setup()
    outbox.enqueue(note("note-1", 1))
    outbox.enqueue(note("note-2", 2))
    const getAllKeys = jest.spyOn(storage, "getAllKeys")

    outbox.start()
    await flush()

    expect(getAllKeys).toHaveBeenCalledTimes(1)
    expect(outbox.getState().pending).toEqual([])
  })

  it("replays the same stored write after a lost acknowledgement, on a doubling backoff up to its cap", async () => {
    let failures = 3
    const { outbox, sent, storage, timers } = setup({
      respond: async (queued) => {
        if (failures-- > 0) throw new Error("offline")
        return { operationId: queued.id }
      },
      backoff: { baseMs: 1_000, maxMs: 3_000 },
    })
    outbox.enqueue(note("note-1"))
    outbox.start()
    await flush()
    expect(outbox.getState().pending).toMatchObject([{ id: "note-1", attempts: 1 }])

    for (let retry = 0; retry < 3; retry += 1) {
      timers.runAll()
      await flush()
    }

    expect(sent).toEqual(["note-1", "note-1", "note-1", "note-1"])
    expect(timers.delays).toEqual([2_000, 3_000, 3_000])
    expect(reopen(storage).getState().pending).toEqual([])
  })

  it("schedules no retry while it can't drain, and a stop cancels the one pending", async () => {
    let open = true
    const { outbox, sent, timers } = setup({
      respond: async () => {
        open = sent.length < 2
        throw new Error("offline")
      },
      canDrain: () => open,
    })
    outbox.enqueue(note("note-1"))
    const stop = outbox.start()
    await flush()
    expect(timers.activeCount).toBe(1)
    stop()
    expect(timers.activeCount).toBe(0)

    outbox.start()
    await flush()
    expect(sent).toEqual(["note-1", "note-1"])
    expect(timers.activeCount).toBe(0)
    await outbox.drain()
    expect(sent).toHaveLength(2)
  })

  it("moves a rejected write to failures and keeps draining the writes behind it", async () => {
    const { outbox, sent, storage } = setup({
      respond: async (queued) => {
        if (queued.id === "note-1") throw new Error("rejected")
        return { operationId: queued.id }
      },
      now: () => 20,
    })
    outbox.enqueue(note("note-1", 1))
    outbox.enqueue(note("note-2", 2))
    outbox.start()
    await flush()

    expect(sent).toEqual(["note-1", "note-2"])
    expect(outbox.getState()).toMatchObject({
      pending: [],
      failures: [{ action: { id: "note-1" }, reason: "rejected", failedAt: 20 }],
    })
    expect(reopen(storage).getState()).toMatchObject({
      pending: [],
      failures: [{ action: { id: "note-1" } }],
    })
  })

  it("pauses at failure capacity without hiding the rejected write, and resumes once a failure is dismissed", async () => {
    const { outbox, sent, storage } = setup({
      respond: async () => {
        throw new Error("rejected")
      },
      limits: { maxFailedRecords: 1, maxFailedBytes: 10_000 },
    })
    outbox.enqueue(note("note-1", 1))
    outbox.enqueue(note("note-2", 2))
    outbox.start()
    await flush()

    expect(outbox.getState()).toMatchObject({
      pending: [{ id: "note-2", attempts: 1 }],
      failures: [{ action: { id: "note-1" } }],
      capacityBlocked: true,
    })
    expect(ids(reopen(storage).getState().pending)).toEqual(["note-2"])
    await outbox.drain()
    expect(sent).toEqual(["note-1", "note-2"])

    outbox.dismiss("note-1")
    expect(outbox.getState().capacityBlocked).toBe(false)
    await flush()

    expect(sent).toEqual(["note-1", "note-2", "note-2"])
    expect(outbox.getState()).toMatchObject({
      pending: [],
      failures: [{ action: { id: "note-2" } }],
      capacityBlocked: false,
    })
  })

  it("uses failure capacity another tab freed while a rejection was in flight", async () => {
    const inFlight = deferred<OutboxAcknowledgement>()
    const { outbox, storage } = setup({
      respond: async (queued) => {
        if (queued.id === "note-1") throw new Error("rejected")
        return inFlight.promise
      },
      limits: { maxFailedRecords: 1, maxFailedBytes: 10_000 },
    })
    outbox.enqueue(note("note-1", 1))
    outbox.start()
    await flush()
    outbox.enqueue(note("note-2", 2))
    await flush()

    reopen(storage).dismiss("note-1")
    inFlight.reject(new Error("rejected"))
    await flush()

    expect(outbox.getState()).toMatchObject({
      pending: [],
      failures: [{ action: { id: "note-2" } }],
      capacityBlocked: false,
    })
  })

  it("skips a write another tab settled after this pass loaded it", async () => {
    const storage = new MemoryStorage()
    const { outbox, sent } = setup({
      storage,
      respond: async (queued) => {
        reopen(storage).acknowledge(["note-2"])
        return { operationId: queued.id }
      },
    })
    outbox.enqueue(note("note-1", 1))
    outbox.enqueue(note("note-2", 2))
    outbox.start()
    await flush()

    expect(sent).toEqual(["note-1"])
    expect(outbox.getState()).toMatchObject({ pending: [], failures: [] })
  })

  it("acknowledges writes confirmed elsewhere but leaves the one being sent to its send", async () => {
    const first = deferred<OutboxAcknowledgement>()
    const { outbox, sent, storage } = setup({
      respond: async (queued) =>
        queued.id === "note-1" ? first.promise : { operationId: queued.id },
    })
    outbox.enqueue(note("note-1", 1))
    outbox.enqueue(note("note-2", 2))
    outbox.enqueue(note("note-3", 3))
    outbox.start()
    await flush()

    outbox.acknowledge(["note-1", "note-2", "note-unknown"])
    expect(ids(outbox.getState().pending)).toEqual(["note-1", "note-3"])
    expect(ids(reopen(storage).getState().pending)).toEqual(["note-1", "note-3"])
    first.resolve({ operationId: "note-1" })
    await flush()

    expect(sent).toEqual(["note-1", "note-3"])
    expect(outbox.getState().pending).toEqual([])
  })

  it("rewrites a write only until a drain attempts it", async () => {
    const first = deferred<OutboxAcknowledgement>()
    const { outbox, storage } = setup({ respond: () => first.promise })
    outbox.enqueue(note("note-1"))
    const append = (queued: Note) => ({ ...queued, text: `${queued.text}+` })

    expect(outbox.rewriteUnattempted("note-1", append)).toMatchObject({ text: "note-1+" })
    expect(reopen(storage).getState().pending).toMatchObject([{ text: "note-1+" }])
    outbox.start()
    await flush()

    expect(outbox.rewriteUnattempted("note-1", append)).toBeNull()
    expect(outbox.getState().pending).toMatchObject([{ text: "note-1+", attempts: 1 }])
  })

  it("dedupes an operation and refuses one past its limit without storing it", () => {
    const { outbox, storage } = setup({ limits: { maxPendingRecords: 1 } })

    expect(outbox.enqueue(note("note-1"))).toBe(true)
    expect(outbox.enqueue(note("note-1"))).toBe(true)
    expect(outbox.enqueue(note("note-2"))).toBe(false)

    expect(ids(outbox.getState().pending)).toEqual(["note-1"])
    expect(storage.getString(`${keysFor("owner").pendingRecordPrefix}note-2`)).toBeUndefined()
  })

  it("clears every record and index in its scope and nothing outside it", async () => {
    const { outbox, storage } = setup({
      respond: async () => {
        throw new Error("rejected")
      },
    })
    const other = reopen(storage, "other")
    other.enqueue(note("note-other"))
    outbox.enqueue(note("note-1", 1))
    outbox.start()
    await flush()
    outbox.enqueue(note("note-2", 2))

    outbox.clear()

    expect(outbox.getState()).toMatchObject({ pending: [], failures: [] })
    expect([...storage.values.keys()].filter((key) => key.includes(".v1.owner"))).toEqual([])
    expect(ids(reopen(storage, "other").getState().pending)).toEqual(["note-other"])
  })
})
