import type { ConvexReactClient } from "convex/react"
import { ConvexError } from "convex/values"
import { convexTest } from "convex-test"

import {
  DeckVersionWriteRepository,
  DECK_VERSION_LAST_REASON,
  DeckVersionWriteController,
} from "./decksVersionWrites"
import { DeckVersionCacheController } from "./deckVersionsCache"
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
const versionId = "version-1" as Id<"deckVersions">
const card = { name: "Sol Ring", quantity: 1 }
const acceptedCreate = {
  deckId,
  versionId: "server-version-1" as Id<"deckVersions">,
  revision: 1,
  versionNumber: 2,
  name: "Offline Draft",
  note: "",
  fingerprint: "f1",
  cardCount: 1,
  cardQuantity: 1,
  deleted: false,
  updatedAt: 1,
}

const versionSnapshot = (revision: number) => ({
  deckId,
  versionId,
  revision,
  versionNumber: 1,
  name: "Main",
  note: "",
  fingerprint: `f${revision}`,
  cardCount: 1,
  cardQuantity: 1,
  deleted: false,
  updatedAt: revision,
})

const flush = () => new Promise(setImmediate)

describe("deck version lifecycle", () => {
  it("queues a create, keeps the provisional identity for later edits, and maps their transport", async () => {
    const local = new MemoryStorage()
    const repository = new DeckVersionWriteRepository("owner", local)
    const calls: Array<{ args: Record<string, unknown> }> = []
    const client = {
      mutation: jest.fn(async (_reference: unknown, args: Record<string, unknown>) => {
        calls.push({ args })
        return acceptedCreate
      }),
    } as unknown as ConvexReactClient
    const controller = new DeckVersionWriteController(client, repository, () => 1)
    const stop = controller.start()

    const provisionalId = controller.createVersion(deckId, "Offline Draft", "kept", [card])
    const created = controller.getSnapshot().pending[0]
    expect(created).toMatchObject({ op: "create", expectedRevision: 0, name: "Offline Draft" })
    await flush()
    controller.update(deckId, provisionalId, [{ name: "Sol Ring", quantity: 2 }], 1)
    await flush()
    stop()

    expect(calls[0].args).toMatchObject({
      deckId,
      operationId: created.operationId,
      name: "Offline Draft",
      note: "kept",
      cards: [card],
    })
    expect(calls[1].args).toMatchObject({
      versionId: "server-version-1",
      expectedRevision: 1,
      cards: [{ name: "Sol Ring", quantity: 2 }],
    })
    expect(controller.getSnapshot()).toMatchObject({ pending: [], failures: [] })
    expect(repository.cache.loadCards("server-version-1" as Id<"deckVersions">)).toMatchObject({
      revision: 1,
    })
    expect(repository.cache.resolveMapped(deckId, provisionalId)?.versionId).toBe(
      "server-version-1",
    )
  })

  it("keeps the provisional draft across a lost create acknowledgement and replays after restart", async () => {
    const t = convexTest(schema, modules)
    const actor = t.withIdentity({ subject: "owner" })
    await actor.mutation(api.users.syncCurrent, { displayName: "Owner" })
    const id = await actor.mutation(api.decks.create, { name: "Original", format: "commander" })
    await t.run(async (ctx) => {
      const decks = await ctx.db.query("decks").take(10)
      const deck = decks[0]
      if (!deck) throw new Error("expected a deck")
      await ctx.db.insert("userEntitlements", {
        userId: deck.ownerUserId,
        feature: "deck_versions",
        enabled: true,
        source: "test",
        updatedAt: Date.now(),
      })
    })
    await actor.mutation(api.decks.saveVersion, {
      deckId: id,
      cards: [
        {
          name: "Sol Ring",
          quantity: 1,
          oracleId: "11111111-1111-4111-8111-111111111111",
          scryfallId: "22222222-2222-4222-8222-222222222222",
        },
      ],
    })
    const local = new MemoryStorage()
    let dropped = true
    const client = {
      mutation: async (
        reference: Parameters<typeof actor.mutation>[0],
        args: Parameters<typeof actor.mutation>[1],
      ) => {
        const result = await actor.mutation(reference, args)
        if (dropped) {
          dropped = false
          throw new Error("acknowledgement lost")
        }
        return result
      },
    } as unknown as ConvexReactClient
    const controller = new DeckVersionWriteController(
      client,
      new DeckVersionWriteRepository("owner", local),
    )
    const stop = controller.start()
    const provisionalId = controller.createVersion(id as string, "Offline Draft", "", [
      {
        name: "Kept Card",
        quantity: 2,
        oracleId: "33333333-3333-4333-8333-333333333333",
        scryfallId: "44444444-4444-4444-8444-444444444444",
      },
    ])
    await flush()
    const operationId = controller.getSnapshot().pending[0]?.operationId
    expect(operationId).toBeTruthy()
    stop()

    const repository = new DeckVersionWriteRepository("owner", local)
    expect(repository.cache.loadVersions(id as string)).toMatchObject([
      { versionId: provisionalId, local: true, name: "Offline Draft" },
    ])
    const restarted = new DeckVersionWriteController(client, repository)
    expect(restarted.getSnapshot().pending[0]).toMatchObject({ operationId, op: "create" })
    const stopRestarted = restarted.start()
    await flush()
    stopRestarted()

    expect(restarted.getSnapshot()).toMatchObject({ pending: [], failures: [] })
    const stored = await t.run(async (ctx) => ctx.db.query("deckVersions").take(10))
    const created = stored.find((version) => version.name === "Offline Draft")
    expect(created).toMatchObject({ cardCount: 1, syncRevision: 1 })
    expect(repository.resolveVersion(provisionalId)).toBe(created?._id as string)
    expect(repository.cache.resolveMapped(id as string, provisionalId)?.versionId).toBe(
      created?._id,
    )
  })

  it("parks a cards/rename/delete chain on one conflict and keeps later tails guarded", async () => {
    const local = new MemoryStorage()
    const repository = new DeckVersionWriteRepository("owner", local)
    repository.cache.mergeVersions(deckId, [
      versionSnapshot(1),
      { ...versionSnapshot(2), versionId: "version-2" as Id<"deckVersions">, versionNumber: 2 },
    ])
    const client = {
      mutation: jest
        .fn()
        .mockResolvedValueOnce({ status: "conflict" as const, version: versionSnapshot(1) })
        .mockResolvedValue({ ...versionSnapshot(2), revision: 2 }),
    } as unknown as ConvexReactClient
    const controller = new DeckVersionWriteController(client, repository, () => 1)
    const stop = controller.start()
    controller.update(deckId, versionId, [{ name: "Sol Ring", quantity: 2 }], 0)
    controller.renameVersion(deckId, versionId, { name: "Renamed" }, 1)
    controller.deleteVersion(deckId, versionId, 2)
    await flush()
    stop()

    expect(controller.getSnapshot()).toMatchObject({
      pending: [],
      failures: [
        { reason: "Deck cards changed on another device. Choose which card list to keep." },
        { action: { op: "rename", name: "Renamed" } },
        { action: { op: "delete" } },
      ],
    })
    // Refusing the tail keeps the rename/delete off transport until the head is resolved.
    expect(jest.mocked(client.mutation)).toHaveBeenCalledTimes(1)

    await flush()
    // Discarding one version tail clears the whole guarded version chain (D3 semantics).
    expect(controller.getSnapshot().failures.map((failure) => failure.action.op)).toEqual([
      undefined,
      "rename",
      "delete",
    ])
    controller.discardFailure(controller.getSnapshot().failures[1].action.operationId)
    await flush()
    stop()
    expect(controller.getSnapshot()).toMatchObject({ pending: [], failures: [] })
    expect(repository.cache.loadVersions(deckId)).toHaveLength(2)
  })

  it("keeps local intent when a create hits the version limit and discarding removes the draft", async () => {
    const local = new MemoryStorage()
    const repository = new DeckVersionWriteRepository("owner", local)
    repository.cache.mergeVersions(deckId, [versionSnapshot(1)])
    const client = {
      mutation: jest.fn().mockRejectedValue(
        new ConvexError({
          code: "version_limit_reached",
          message: "A deck may hold at most 5 versions",
        }),
      ),
    } as unknown as ConvexReactClient
    const controller = new DeckVersionWriteController(client, repository, () => 1)
    const stop = controller.start()
    const provisionalId = controller.createVersion(deckId, "Too Many", "", [card])
    await flush()
    expect(controller.getSnapshot()).toMatchObject({
      failures: [{ action: { op: "create", versionId: provisionalId } }],
    })
    expect(repository.cache.loadVersions(deckId)).toHaveLength(2)
    expect(repository.cache.loadVersions(deckId)).toMatchObject([
      { name: "Main" },
      { local: true, name: "Too Many", versionNumber: 2 },
    ])
    controller.discardFailure(controller.getSnapshot().failures[0].action.operationId)
    expect(controller.getSnapshot()).toMatchObject({ pending: [], failures: [] })
    expect(repository.cache.loadVersions(deckId)).toHaveLength(1)
    expect(repository.cache.loadVersions(deckId)[0]?.versionId).toBe(versionId)
    stop()
  })

  it("refuses to delete the last visible version locally without any server round trip", () => {
    const local = new MemoryStorage()
    const repository = new DeckVersionWriteRepository("owner", local)
    repository.cache.mergeVersions(deckId, [versionSnapshot(1)])
    const controller = new DeckVersionWriteController(
      { mutation: jest.fn() } as unknown as ConvexReactClient,
      repository,
    )
    expect(() => controller.deleteVersion(deckId, versionId, 1)).toThrow(DECK_VERSION_LAST_REASON)
    expect(controller.getSnapshot().pending).toHaveLength(0)
  })

  it("keeps offline version lifecycle writes scoped to the account and deployment", async () => {
    const local = new MemoryStorage()
    const mutation = jest
      .fn()
      .mockRejectedValue(new ConvexError({ code: "sync_owner_changed", message: "unauthorized" }))
    const controller = new DeckVersionWriteController(
      { mutation } as unknown as ConvexReactClient,
      new DeckVersionWriteRepository("owner", local),
    )
    controller.createVersion(deckId, "Offline Draft", "", [card])
    controller.renameVersion(deckId, versionId, { name: "Renamed" }, 0)
    const stop = controller.start()
    await flush()
    stop()
    await controller.drain()
    expect(controller.getSnapshot()).toMatchObject({
      pending: [{ op: "create" }, { op: "rename" }],
    })
    expect(new DeckVersionWriteRepository("other-owner", local).loadPending()).toEqual([])
  })

  it("resolves a selected provisional version to its mapped server row in the cache snapshot", () => {
    const local = new MemoryStorage()
    const repository = new DeckVersionWriteRepository("owner", local)
    repository.cache.mergeVersions(deckId, [{ ...versionSnapshot(1), versionNumber: 1 }])
    repository.cache.saveDraft(deckId, {
      ...versionSnapshot(0),
      versionId: "draft-1" as Id<"deckVersions">,
      versionNumber: 2,
      name: "Offline Draft",
      local: true,
    })
    repository.recordVersion("draft-1", versionId)
    const cache = new DeckVersionCacheController(
      { query: jest.fn() } as unknown as ConvexReactClient,
      repository.cache,
    )
    const stopCache = cache.start()
    cache.ensure(deckId, "draft-1")
    const snapshot = cache.getSnapshot().get(deckId)
    expect(snapshot?.version?.versionId).toBe(versionId)
    expect(snapshot?.versions).toHaveLength(2)
    stopCache()
  })

  it("keeps draft rows through tombstone and authoritative refreshes", () => {
    const local = new MemoryStorage()
    const repository = new DeckVersionWriteRepository("owner", local)
    repository.cache.mergeVersions(deckId, [
      { ...versionSnapshot(1), versionNumber: 1, deleted: false },
    ])
    repository.cache.saveDraft(deckId, {
      ...versionSnapshot(0),
      versionId: "draft-1" as Id<"deckVersions">,
      versionNumber: 2,
      name: "Offline Draft",
      local: true,
    })
    repository.cache.mergeVersions(
      deckId,
      [
        { ...versionSnapshot(1), versionNumber: 1 },
        {
          ...versionSnapshot(5),
          versionId: "server-version-1" as Id<"deckVersions">,
          versionNumber: 3,
        },
      ],
      true,
    )
    expect(repository.cache.loadVersions(deckId).map((version) => version.versionId)).toEqual([
      versionId,
      "draft-1",
      "server-version-1",
    ])
  })
})
