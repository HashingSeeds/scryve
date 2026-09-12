import type { ConvexReactClient } from "convex/react"
import { ConvexError } from "convex/values"
import { convexTest } from "convex-test"

import { DeckSyncRepository, type SyncedDeck } from "./decksSync"
import { DeckMetadataWriteController, DeckSyncWriteRepository } from "./decksSyncWrites"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import schema from "../../../convex/schema"
import type { DurableStringStorage } from "../sync/durableOutbox"

const modules = {
  "./_generated/api.ts": async () => jest.requireActual("../../../convex/_generated/api"),
  "./_generated/server.ts": async () => jest.requireActual("../../../convex/_generated/server"),
  "./decks.ts": async () => jest.requireActual("../../../convex/decks"),
  "./entitlements.ts": async () => jest.requireActual("../../../convex/entitlements"),
  "./integrationManifest.ts": async () => jest.requireActual("../../../convex/integrationManifest"),
  "./users.ts": async () => jest.requireActual("../../../convex/users"),
}

class MemoryStorage implements DurableStringStorage {
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

const deckId = "deck-1" as Id<"decks">
const metadata = (revision = 0): SyncedDeck => ({
  id: deckId,
  deckId,
  revision,
  name: "Original",
  format: "commander",
  game: "mtg",
  note: "",
  deleted: false,
  createdAt: 1,
  updatedAt: revision,
})

const flush = () => new Promise(setImmediate)

describe("deck metadata writes", () => {
  it("orders same-millisecond edits and blocks dependents after a conflict", async () => {
    const local = new MemoryStorage()
    const reads = new DeckSyncRepository("owner", local)
    reads.mergeMetadata([metadata()])
    const mutation = jest
      .fn()
      .mockRejectedValue(new ConvexError({ code: "sync_conflict", message: "changed elsewhere" }))
    const controller = new DeckMetadataWriteController(
      { mutation } as unknown as ConvexReactClient,
      new DeckSyncWriteRepository("owner", local),
      () => 1,
    )
    controller.update(deckId, { name: "First edit" })
    controller.update(deckId, { note: "Second edit" })
    expect(controller.getSnapshot().pending.map((action) => action.expectedRevision)).toEqual([
      0, 1,
    ])
    const stop = controller.start()
    await flush()
    expect(mutation).toHaveBeenCalledTimes(1)
    expect(controller.getSnapshot().failures).toHaveLength(2)
    expect(controller.getSnapshot().pending).toEqual([])
    reads.mergeMetadata([{ ...metadata(1), name: "Other device" }])
    mutation.mockResolvedValue({ ...metadata(2), name: "First edit", note: "Second edit" })
    const latest = controller.getSnapshot().failures.at(-1)!
    expect(latest.action.note).toBe("Second edit")
    controller.reapplyFailure(controller.getSnapshot().failures[0].action.operationId)
    await flush()
    expect(mutation.mock.calls[1][1]).toMatchObject({
      expectedRevision: 1,
      name: "First edit",
      note: "Second edit",
      expectedOwnerId: "owner",
    })
    expect(controller.getSnapshot().failures).toEqual([])
    stop()
  })

  it("recovers when reapply is interrupted after persisting the replacement", async () => {
    const local = new MemoryStorage()
    new DeckSyncRepository("owner", local).mergeMetadata([metadata()])
    const repository = new DeckSyncWriteRepository("owner", local)
    const mutation = jest
      .fn()
      .mockRejectedValue(new ConvexError({ code: "sync_conflict", message: "changed" }))
    const controller = new DeckMetadataWriteController(
      { mutation } as unknown as ConvexReactClient,
      repository,
    )
    controller.update(deckId, { note: "Keep me" })
    const stop = controller.start()
    await flush()
    stop()
    const failedId = controller.getSnapshot().failures[0].action.operationId
    jest.spyOn(repository, "dismissFailed").mockImplementationOnce(() => {
      throw new Error("process interrupted")
    })
    expect(() => controller.reapplyFailure(failedId)).toThrow("process interrupted")
    expect(repository.loadPending()[0].supersedes).toContain(failedId)
    mutation.mockResolvedValue({ ...metadata(1), note: "Keep me" })
    const restarted = new DeckMetadataWriteController(
      { mutation } as unknown as ConvexReactClient,
      new DeckSyncWriteRepository("owner", local),
    )
    const stopRestarted = restarted.start()
    await flush()
    expect(restarted.getSnapshot()).toMatchObject({
      pending: [],
      failures: [],
      metadata: [{ note: "Keep me" }],
    })
    stopRestarted()
  })

  it("enforces the failure limit across separate drains without dropping edits", async () => {
    const local = new MemoryStorage()
    const decks = Array.from({ length: 33 }, (_, index) => ({
      ...metadata(),
      id: `deck-${index}`,
      deckId: `deck-${index}` as Id<"decks">,
    }))
    new DeckSyncRepository("owner", local).mergeMetadata(decks)
    const client = {
      mutation: jest
        .fn()
        .mockRejectedValue(new ConvexError({ code: "sync_conflict", message: "changed" })),
    } as unknown as ConvexReactClient
    const controller = new DeckMetadataWriteController(
      client,
      new DeckSyncWriteRepository("owner", local),
    )
    for (const deck of decks.slice(0, 32)) controller.update(deck.deckId, { note: "Keep" })
    const stop = controller.start()
    await flush()
    expect(controller.getSnapshot().failures).toHaveLength(32)
    controller.update(decks[32].deckId, { note: "Keep this too" })
    await flush()
    expect(controller.getSnapshot().failures).toHaveLength(32)
    expect(controller.getSnapshot().pending).toMatchObject([{ note: "Keep this too" }])
    stop()
  })

  it("retries unknown server errors and validates edits before persisting them", async () => {
    const local = new MemoryStorage()
    new DeckSyncRepository("owner", local).mergeMetadata([metadata()])
    const client = {
      mutation: jest
        .fn()
        .mockRejectedValue(new ConvexError({ code: "temporary_overload", message: "Try later" })),
    } as unknown as ConvexReactClient
    const controller = new DeckMetadataWriteController(
      client,
      new DeckSyncWriteRepository("owner", local),
    )
    expect(() => controller.update(deckId, { note: "x".repeat(1001) })).toThrow()
    expect(controller.getSnapshot().pending).toEqual([])
    controller.update(deckId, { note: "Valid" })
    const stop = controller.start()
    await flush()
    expect(controller.getSnapshot()).toMatchObject({ pending: [{ note: "Valid" }], failures: [] })
    stop()
  })

  it("keeps account-mismatched writes pending and stops sending after sign-out", async () => {
    const local = new MemoryStorage()
    new DeckSyncRepository("owner", local).mergeMetadata([metadata()])
    const mutation = jest
      .fn()
      .mockRejectedValue(
        new ConvexError({ code: "sync_owner_changed", message: "account changed" }),
      )
    const controller = new DeckMetadataWriteController(
      { mutation } as unknown as ConvexReactClient,
      new DeckSyncWriteRepository("owner", local),
    )
    controller.update(deckId, { note: "Private note" })
    const stop = controller.start()
    await flush()
    stop()
    await controller.drain()
    expect(mutation).toHaveBeenCalledTimes(1)
    expect(controller.getSnapshot()).toMatchObject({
      pending: [{ note: "Private note" }],
      failures: [],
    })
    expect(new DeckSyncWriteRepository("other-owner", local).loadPending()).toEqual([])
  })

  it("keeps fixed revisions and stable operations through an uncertain retry", async () => {
    const local = new MemoryStorage()
    new DeckSyncRepository("owner", local).mergeMetadata([metadata()])
    const sent: object[] = []
    const client = {
      mutation: jest.fn(async (_reference, args) => {
        sent.push(args)
        if (sent.length === 1) throw new Error("connection lost after send")
        return { ...metadata(1), name: "Renamed" }
      }),
    } as unknown as ConvexReactClient
    const controller = new DeckMetadataWriteController(
      client,
      new DeckSyncWriteRepository("owner", local),
    )
    const stop = controller.start()

    controller.update(deckId, { name: "Renamed" })
    await flush()
    const pending = controller.getSnapshot().pending[0]
    expect(pending).toMatchObject({ expectedRevision: 0, name: "Renamed", attempts: 1 })

    await controller.drain()
    expect(sent).toHaveLength(2)
    expect(sent[1]).toEqual(sent[0])
    expect(controller.getSnapshot()).toMatchObject({ pending: [], failures: [] })
    stop()
  })

  it("preserves rejected edits for explicit reapply or discard", async () => {
    const local = new MemoryStorage()
    new DeckSyncRepository("owner", local).mergeMetadata([metadata()])
    const client = {
      mutation: jest.fn(async () => {
        throw new ConvexError({ code: "sync_conflict", message: "changed elsewhere" })
      }),
    } as unknown as ConvexReactClient
    const controller = new DeckMetadataWriteController(
      client,
      new DeckSyncWriteRepository("owner", local),
    )
    const stop = controller.start()

    controller.update(deckId, { note: "Keep this note" })
    await flush()
    expect(controller.getSnapshot()).toMatchObject({
      pending: [],
      failures: [{ action: { note: "Keep this note" }, reason: "changed elsewhere" }],
    })

    const operationId = controller.getSnapshot().failures[0].action.operationId
    controller.discardFailure(operationId)
    expect(controller.getSnapshot().failures).toEqual([])
    stop()
  })

  it("does not let an old replay receipt replace newer metadata", async () => {
    const local = new MemoryStorage()
    const readRepository = new DeckSyncRepository("owner", local)
    readRepository.mergeMetadata([metadata(1)])
    const writes = new DeckSyncWriteRepository("owner", local)
    const operationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    writes.enqueue({
      schemaVersion: 1,
      ownerId: "owner",
      deckId,
      id: deckId,
      operationId,
      expectedRevision: 1,
      name: "Old receipt",
      format: "commander",
      game: "mtg",
      note: "",
      deleted: false,
      queuedAt: 1,
      attempts: 0,
    })
    readRepository.mergeMetadata([{ ...metadata(3), name: "Newest" }])
    const client = {
      mutation: jest.fn(async () => ({ ...metadata(2), name: "Old receipt" })),
    } as unknown as ConvexReactClient
    const controller = new DeckMetadataWriteController(client, writes)
    const stop = controller.start()
    await flush()

    expect(controller.getSnapshot().metadata).toMatchObject([{ revision: 3, name: "Newest" }])
    expect(controller.getSnapshot().pending).toEqual([])
    stop()
  })

  it("replays the same persisted operation against the real backend after acknowledgement loss", async () => {
    const t = convexTest(schema, modules)
    const actor = t.withIdentity({ subject: "owner" })
    await actor.mutation(api.users.syncCurrent, { displayName: "Owner" })
    const id = await actor.mutation(api.decks.create, { name: "Original", format: "commander" })
    const page = await actor.query(api.decks.syncPage, {
      paginationOpts: { numItems: 100, cursor: null },
    })
    const local = new MemoryStorage()
    new DeckSyncRepository("owner", local).mergeMetadata(page.page)
    let lost = true
    const client = {
      mutation: async (
        reference: typeof api.decks.syncWrite,
        args: Parameters<typeof actor.mutation>[1],
      ) => {
        const result = await actor.mutation(reference, args)
        if (lost) {
          lost = false
          throw new Error("acknowledgement lost")
        }
        return result
      },
    } as unknown as ConvexReactClient
    const controller = new DeckMetadataWriteController(
      client,
      new DeckSyncWriteRepository("owner", local),
    )
    const stop = controller.start()

    controller.update(id, { name: "Renamed once" })
    await flush()
    const operationId = controller.getSnapshot().pending[0].operationId
    stop()
    const restarted = new DeckMetadataWriteController(
      client,
      new DeckSyncWriteRepository("owner", local),
    )
    expect(restarted.getSnapshot().pending[0].operationId).toBe(operationId)
    const stopRestarted = restarted.start()
    await flush()

    expect(restarted.getSnapshot().metadata).toMatchObject([
      { deckId: id, revision: 1, name: "Renamed once" },
    ])
    const stored = await t.run(async (ctx) => ctx.db.get(id))
    expect(stored).toMatchObject({ name: "Renamed once", syncRevision: 1 })
    expect(restarted.getSnapshot().pending).toEqual([])
    stopRestarted()
  })
})
