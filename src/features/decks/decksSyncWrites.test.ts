import type { ConvexReactClient } from "convex/react"
import { ConvexError } from "convex/values"
import { convexTest } from "convex-test"

import { storage } from "@/utils/storage"

import { DeckSyncRepository, type SyncedDeck } from "./decksSync"
import {
  DECK_CONFLICT_REASON,
  DeckMetadataWriteController,
  DeckSyncWriteRepository,
  getDeckMetadataWriteController,
  type PendingDeckWrite,
} from "./decksSyncWrites"
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

const pendingWrite = (): PendingDeckWrite => ({
  schemaVersion: 1,
  ownerId: "owner",
  deckId,
  id: deckId,
  operationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  expectedRevision: 0,
  name: "Offline rename",
  format: "commander",
  game: "mtg",
  note: "",
  deleted: false,
  queuedAt: 1,
  attempts: 0,
})

const flush = () => new Promise(setImmediate)

describe("deck metadata writes", () => {
  it("keeps pending and failed writes inside their Convex deployment", async () => {
    const local = new MemoryStorage()
    const oldDeployment = new DeckSyncWriteRepository(
      "owner",
      local,
      "https://old-deployment.convex.cloud",
    )
    const action = pendingWrite()
    oldDeployment.enqueue(action)
    oldDeployment.failAction(action, "Rejected", 2, [], oldDeployment.loadPending())
    oldDeployment.enqueue({
      ...action,
      operationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      note: "Still pending",
    })

    const reopened = new DeckSyncWriteRepository(
      "owner",
      local,
      "https://old-deployment.convex.cloud",
    )
    expect(reopened.loadFailed()).toHaveLength(1)
    expect(reopened.loadPending()).toMatchObject([{ note: "Still pending" }])
    const newDeployment = new DeckSyncWriteRepository(
      "owner",
      local,
      "https://new-deployment.convex.cloud",
    )
    const mutation = jest.fn()
    const controller = new DeckMetadataWriteController(
      { mutation } as unknown as ConvexReactClient,
      newDeployment,
    )
    const stop = controller.start()
    await flush()
    expect(newDeployment.loadPending()).toEqual([])
    expect(newDeployment.loadFailed()).toEqual([])
    expect(mutation).not.toHaveBeenCalled()
    expect(reopened.loadFailed()).toHaveLength(1)
    expect(reopened.loadPending()).toMatchObject([{ note: "Still pending" }])
    stop()
  })

  it("leaves legacy unscoped writes untouched", () => {
    const local = new MemoryStorage()
    const legacy = new DeckSyncWriteRepository("owner", local)
    legacy.enqueue(pendingWrite())

    const scoped = new DeckSyncWriteRepository(
      "owner",
      local,
      "https://new-deployment.convex.cloud",
    )
    expect(scoped.loadPending()).toEqual([])
    expect(legacy.loadPending()).toHaveLength(1)
  })

  it.each([
    "Deck changed on another device",
    "An earlier edit conflicted. Choose which version to keep.",
  ])("normalizes a persisted conflict reason: %s", (reason) => {
    const local = new MemoryStorage()
    const repository = new DeckSyncWriteRepository("owner", local)
    const action = pendingWrite()
    repository.enqueue(action)
    repository.failAction(action, reason, 2, [], repository.loadPending())

    expect(repository.loadFailed()[0].reason).toBe(DECK_CONFLICT_REASON)
  })

  it("scopes default write controllers to the client's URL", () => {
    const client = (url: string) =>
      ({
        url,
        mutation: jest.fn(),
        query: jest.fn(),
        watchQuery: jest.fn(),
      }) as unknown as ConvexReactClient
    const oldUrl = "http://localhost:3210"
    new DeckSyncRepository("factory-write-owner", storage, oldUrl).mergeMetadata([metadata()])
    getDeckMetadataWriteController(client(oldUrl), "factory-write-owner").update(deckId, {
      note: "Offline edit",
    })

    expect(
      getDeckMetadataWriteController(client(oldUrl), "factory-write-owner").getSnapshot().pending,
    ).toHaveLength(1)
    expect(
      getDeckMetadataWriteController(
        client("http://localhost:3211"),
        "factory-write-owner",
      ).getSnapshot().pending,
    ).toEqual([])
  })

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

  it("pauses at failure capacity and resumes after resolving an edit without dropping work", async () => {
    const local = new MemoryStorage()
    const decks = Array.from({ length: 34 }, (_, index) => ({
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
    expect(controller.getSnapshot().capacityBlocked).toBe(true)
    const calls = jest.mocked(client.mutation).mock.calls.length
    await controller.drain()
    expect(client.mutation).toHaveBeenCalledTimes(calls)
    expect(() => controller.update(decks[33].deckId, { note: "Later" })).toThrow("Sync paused")
    controller.discardFailure(controller.getSnapshot().failures[0].action.operationId)
    await flush()
    expect(controller.getSnapshot()).toMatchObject({ pending: [], capacityBlocked: false })
    jest.mocked(client.mutation).mockResolvedValue({ ...decks[33], revision: 1, note: "Later" })
    controller.update(decks[33].deckId, { note: "Later" })
    await flush()
    expect(controller.getSnapshot().pending).toEqual([])
    expect(
      controller.getSnapshot().metadata.find((deck) => deck.deckId === decks[33].deckId)?.note,
    ).toBe("Later")
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
      failures: [{ action: { note: "Keep this note" }, reason: DECK_CONFLICT_REASON }],
    })

    const operationId = controller.getSnapshot().failures[0].action.operationId
    controller.discardFailure(operationId)
    expect(controller.getSnapshot().failures).toEqual([])
    stop()
  })

  it("preserves the server reason for non-conflict permanent failures", async () => {
    const local = new MemoryStorage()
    new DeckSyncRepository("owner", local).mergeMetadata([metadata()])
    const controller = new DeckMetadataWriteController(
      {
        mutation: jest.fn(async () => {
          throw new ConvexError({ code: "deck_archived", message: "Deck was deleted" })
        }),
      } as unknown as ConvexReactClient,
      new DeckSyncWriteRepository("owner", local),
    )
    controller.update(deckId, { name: "Offline rename" })
    const stop = controller.start()
    await flush()

    expect(controller.getSnapshot().failures).toMatchObject([{ reason: "Deck was deleted" }])
    stop()
  })

  it("hydrates the current deck before parking a returned conflict", async () => {
    const local = new MemoryStorage()
    new DeckSyncRepository("owner", local).mergeMetadata([metadata()])
    const client = {
      mutation: jest.fn(async () => ({
        status: "conflict" as const,
        deck: { ...metadata(1), name: "Other device" },
      })),
    } as unknown as ConvexReactClient
    const controller = new DeckMetadataWriteController(
      client,
      new DeckSyncWriteRepository("owner", local),
    )
    controller.update(deckId, { name: "Offline rename" })
    const stop = controller.start()
    await flush()

    expect(jest.mocked(client.mutation).mock.calls[0][1]).toMatchObject({ returnConflict: true })
    expect(controller.getSnapshot()).toMatchObject({
      metadata: [{ revision: 1, name: "Other device" }],
      pending: [],
      failures: [
        {
          action: { name: "Offline rename" },
          reason: DECK_CONFLICT_REASON,
        },
      ],
    })
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
