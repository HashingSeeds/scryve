import type { ConvexReactClient } from "convex/react"
import { ConvexError } from "convex/values"
import { convexTest } from "convex-test"

import {
  DeckVersionWriteRepository,
  DECK_VERSION_CONFLICT_REASON,
  DECK_VERSION_QUEUE_CONFLICT_REASON,
  DeckVersionWriteController,
  getDeckVersionWriteController,
  type PendingVersionWrite,
} from "./decksVersionWrites"
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
const pendingWrite = (): PendingVersionWrite => ({
  schemaVersion: 1,
  ownerId: "owner",
  deckId,
  versionId,
  operationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  expectedRevision: 0,
  cards: [{ name: "Sol Ring", quantity: 1 }],
  queuedAt: 1,
  attempts: 0,
})

const cachedRemoteCard = {
  _id: "card-remote" as Id<"deckCards">,
  _creationTime: 0,
  deckVersionId: versionId,
  name: "Sol Ring",
  quantity: 1,
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

describe("deck version card writes", () => {
  it("keeps pending and failed card writes inside their account and Convex deployment", async () => {
    const local = new MemoryStorage()
    const oldDeployment = new DeckVersionWriteRepository(
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
      cards: [{ name: "Kept offline", quantity: 3 }],
    })

    const reopened = new DeckVersionWriteRepository(
      "owner",
      local,
      "https://old-deployment.convex.cloud",
    )
    expect(reopened.loadFailed()).toHaveLength(1)
    expect(reopened.loadPending()).toMatchObject([{ cards: [{ name: "Kept offline" }] }])

    const otherOwner = new DeckVersionWriteRepository("someone-else", local)
    expect(otherOwner.loadFailed()).toEqual([])
    expect(otherOwner.loadPending()).toEqual([])

    const mutation = jest.fn()
    const controller = new DeckVersionWriteController(
      { mutation } as unknown as ConvexReactClient,
      new DeckVersionWriteRepository("owner", local, "https://new-deployment.convex.cloud"),
    )
    const stop = controller.start()
    await flush()
    expect(mutation).not.toHaveBeenCalled()
    expect(reopened.loadFailed()).toHaveLength(1)
    expect(reopened.loadPending()).toMatchObject([{ cards: [{ name: "Kept offline" }] }])
    stop()
  })

  it("chains quick edits onto the in-flight revision while keeping each payload intact", async () => {
    const local = new MemoryStorage()
    const mutation = jest.fn().mockRejectedValue(new Error("connection stalled"))
    const controller = new DeckVersionWriteController(
      { mutation } as unknown as ConvexReactClient,
      new DeckVersionWriteRepository("owner", local),
      () => 1,
    )
    controller.update(deckId, versionId, [{ name: "Sol Ring", quantity: 2 }], 0)
    controller.update(deckId, versionId, [{ name: "Sol Ring", quantity: 5 }], 1)
    expect(controller.getSnapshot().pending.map((action) => action.expectedRevision)).toEqual([
      0, 1,
    ])
    expect(controller.getSnapshot().pending[0].cards[0].quantity).toBe(2)
    expect(controller.getSnapshot().pending[1].cards[0].quantity).toBe(5)
  })

  it("keeps fixed revisions and the exact operation through an uncertain retry", async () => {
    const local = new MemoryStorage()
    const sent: object[] = []
    const client = {
      mutation: jest.fn(async (_reference, args) => {
        sent.push(args)
        if (sent.length === 1) throw new Error("connection lost after send")
        return { revision: 1 }
      }),
    } as unknown as ConvexReactClient
    const controller = new DeckVersionWriteController(
      client,
      new DeckVersionWriteRepository("owner", local),
    )
    const stop = controller.start()

    controller.update(deckId, versionId, [{ name: "Sol Ring", quantity: 2 }], 0)
    await flush()
    const pending = controller.getSnapshot().pending[0]
    expect(pending).toMatchObject({ expectedRevision: 0, attempts: 1 })

    await controller.drain()
    expect(sent).toHaveLength(2)
    expect(sent[1]).toEqual(sent[0])
    expect(controller.getSnapshot()).toMatchObject({ pending: [], failures: [] })
    stop()
  })

  it("parks a returned conflict and lets reapply replay against the reported revision", async () => {
    const local = new MemoryStorage()
    const repository = new DeckVersionWriteRepository("owner", local)
    const client = {
      mutation: jest
        .fn()
        .mockResolvedValueOnce({ status: "conflict" as const, version: versionSnapshot(4) })
        .mockResolvedValueOnce({ ...versionSnapshot(5), revision: 5 }),
    } as unknown as ConvexReactClient
    const controller = new DeckVersionWriteController(client, repository)
    const stop = controller.start()

    controller.update(deckId, versionId, [{ name: "Sol Ring", quantity: 2 }], 3)
    await flush()
    expect(jest.mocked(client.mutation).mock.calls[0][1]).toMatchObject({ returnConflict: true })
    expect(controller.getSnapshot()).toMatchObject({
      pending: [],
      failures: [{ reason: DECK_VERSION_CONFLICT_REASON }],
    })
    expect(repository.cache.loadVersions(deckId)).toMatchObject([{ versionId, revision: 4 }])
    expect(repository.cache.loadCards(versionId)).toBeUndefined()

    const failedId = controller.getSnapshot().failures[0].action.operationId
    controller.reapplyFailure(failedId)
    await flush()
    expect(jest.mocked(client.mutation).mock.calls[1][1]).toMatchObject({
      deckId,
      versionId,
      expectedRevision: 4,
      cards: [{ name: "Sol Ring", quantity: 2 }],
    })
    expect(controller.getSnapshot()).toMatchObject({ pending: [], failures: [] })
    const cached = repository.cache.loadCards(versionId)
    expect(cached).toMatchObject({ revision: 5 })
    stop()
  })

  it("streams no dependent tail to transport while an earlier version edit is parked", async () => {
    const local = new MemoryStorage()
    const repository = new DeckVersionWriteRepository("owner", local)
    repository.cache.mergeVersions(deckId, [versionSnapshot(1)])
    const client = {
      mutation: jest
        .fn()
        .mockResolvedValueOnce({ status: "conflict" as const, version: versionSnapshot(1) })
        .mockResolvedValue({ ...versionSnapshot(2), revision: 2 }),
    } as unknown as ConvexReactClient
    const controller = new DeckVersionWriteController(client, repository, () => 1)
    const stop = controller.start()
    controller.update(deckId, versionId, [{ name: "Sol Ring", quantity: 2 }], 0)
    controller.update(deckId, versionId, [{ name: "Sol Ring", quantity: 5 }], 1)
    await flush()
    stop()

    expect(jest.mocked(client.mutation)).toHaveBeenCalledTimes(1)
    expect(controller.getSnapshot()).toMatchObject({
      pending: [],
      failures: [
        { reason: DECK_VERSION_CONFLICT_REASON },
        { reason: DECK_VERSION_QUEUE_CONFLICT_REASON, action: { cards: [{ quantity: 5 }] } },
      ],
    })
  })

  it("recovers a guarded tail after restart by keeping mine with the latest payload", async () => {
    const local = new MemoryStorage()
    const repository = new DeckVersionWriteRepository("owner", local)
    repository.cache.mergeVersions(deckId, [versionSnapshot(1)])
    const client = {
      mutation: jest
        .fn()
        .mockResolvedValueOnce({ status: "conflict" as const, version: versionSnapshot(1) })
        .mockResolvedValue({ ...versionSnapshot(2), revision: 2 }),
    } as unknown as ConvexReactClient
    const first = new DeckVersionWriteController(client, repository, () => 1)
    const stopFirst = first.start()
    first.update(deckId, versionId, [{ name: "Sol Ring", quantity: 2 }], 0)
    first.update(deckId, versionId, [{ name: "Sol Ring", quantity: 5 }], 1)
    await flush()
    stopFirst()

    const restarted = new DeckVersionWriteController(client, repository)
    const stopRestarted = restarted.start()
    expect(restarted.getSnapshot()).toMatchObject({
      pending: [],
      failures: [{ action: { expectedRevision: 0 } }, { action: { expectedRevision: 1 } }],
    })
    restarted.reapplyFailure(restarted.getSnapshot().failures[0].action.operationId)
    await flush()
    stopRestarted()
    const replayedCalls = jest.mocked(client.mutation).mock.calls
    expect(replayedCalls).toHaveLength(2)
    expect(replayedCalls[1][1]).toMatchObject({
      expectedRevision: 1,
      cards: [{ name: "Sol Ring", quantity: 5 }],
    })
    expect(restarted.getSnapshot()).toMatchObject({ pending: [], failures: [] })
    expect(repository.cache.loadCards(versionId)).toMatchObject({ revision: 2 })
  })

  it("discards a rejected card edit without poisoning the confirmed cache", async () => {
    const local = new MemoryStorage()
    const repository = new DeckVersionWriteRepository("owner", local)
    repository.cache.mergeVersions(deckId, [versionSnapshot(2)])
    repository.cache.saveCards(versionId, 2, [cachedRemoteCard])
    const client = {
      mutation: jest
        .fn()
        .mockResolvedValueOnce({ status: "conflict" as const, version: versionSnapshot(3) }),
    } as unknown as ConvexReactClient
    const controller = new DeckVersionWriteController(client, repository)
    controller.update(deckId, versionId, [{ name: "Sol Ring", quantity: 9 }], 2)
    const stop = controller.start()
    await flush()
    stop()

    const operationId = controller.getSnapshot().failures[0].action.operationId
    controller.discardFailure(operationId)
    expect(controller.getSnapshot()).toMatchObject({ pending: [], failures: [] })
    expect(repository.cache.loadCards(versionId)).toMatchObject({ revision: 2 })
    expect(repository.cache.loadVersions(deckId)).toMatchObject([{ versionId, revision: 3 }])
  })

  it("does not accept more edits while a card edit is rejected", () => {
    const local = new MemoryStorage()
    const repository = new DeckVersionWriteRepository("owner", local)
    const action = pendingWrite()
    repository.enqueue(action)
    repository.failAction(action, DECK_VERSION_CONFLICT_REASON, 2, [], repository.loadPending())
    const controller = new DeckVersionWriteController(
      { mutation: jest.fn() } as unknown as ConvexReactClient,
      repository,
    )
    expect(() => controller.update(deckId, versionId, [], 3)).toThrow(
      "Resolve the saved card edit before making another change",
    )
  })

  it("leaves no version row in the cache when the offline queue rejects a create", () => {
    class FullOutboxRepository extends DeckVersionWriteRepository {
      override enqueue() {
        return { accepted: false, reason: "record_limit" as const, pending: [] }
      }
    }
    const repository = new FullOutboxRepository("owner", new MemoryStorage())
    const controller = new DeckVersionWriteController(
      { mutation: jest.fn() } as unknown as ConvexReactClient,
      repository,
    )
    expect(() => controller.createVersion(deckId, "Offline Draft", "", [cachedRemoteCard])).toThrow(
      /offline card queue is full/i,
    )
    expect(repository.cache.loadVersions(deckId)).toEqual([])
    expect(controller.getSnapshot().pending).toEqual([])
  })

  it("lands queued card edits under the mapped server id when a created draft syncs", async () => {
    const local = new MemoryStorage()
    const serverVersionId = "server-1"
    const syncedResult = (
      revision: number,
      cards: readonly { name: string; quantity: number }[],
    ) => ({
      deckId,
      versionId: serverVersionId,
      revision,
      versionNumber: 2,
      name: "Offline Draft",
      note: "",
      fingerprint: "f" + revision,
      cardCount: cards.length,
      cardQuantity: cards.reduce((total, card) => total + card.quantity, 0),
      deleted: false,
      updatedAt: 2 + revision,
    })
    const client = {
      mutation: async (
        _reference: unknown,
        args: {
          name?: string
          cards?: readonly { name: string; quantity: number }[]
          expectedRevision?: number
        },
      ) =>
        args.expectedRevision === undefined
          ? syncedResult(1, args.cards ?? [])
          : syncedResult((args.expectedRevision ?? 0) + 1, args.cards ?? []),
    } as unknown as ConvexReactClient
    const repository = new DeckVersionWriteRepository("owner", local)
    const controller = new DeckVersionWriteController(client, repository)
    const stop = controller.start()
    const provisionalId = controller.createVersion(deckId, "Offline Draft", "", [
      { name: "Sol Ring", quantity: 1 },
    ])
    controller.update(deckId, provisionalId, [{ name: "Kept offline", quantity: 3 }], 1)
    await flush()
    stop()

    expect(repository.cache.mappedVersionId(provisionalId)).toBe(serverVersionId)
    expect(repository.cache.loadCards(provisionalId)).toBeUndefined()
    const confirmed = repository.cache.loadCards(serverVersionId)
    expect(confirmed).toMatchObject({ revision: 2 })
    expect(confirmed?.cards).toEqual([{ name: "Kept offline", quantity: 3 }])
    const versions = repository.cache.loadVersions(deckId)
    expect(versions.find((version) => version.versionId === serverVersionId)).toMatchObject({
      revision: 2,
      cardCount: 1,
    })
  })

  it("reapplies a conflicted tail after its offline create mapped to the server id", async () => {
    const local = new MemoryStorage()
    const serverVersionId = "server-1"
    const syncedResult = (revision: number) => ({
      deckId,
      versionId: serverVersionId,
      revision,
      versionNumber: 2,
      name: "Offline Draft",
      note: "",
      fingerprint: "f" + revision,
      cardCount: 1,
      cardQuantity: 3,
      deleted: false,
      updatedAt: 2 + revision,
    })
    const sent: Array<{ versionId?: string; expectedRevision?: number }> = []
    const client = {
      mutation: jest.fn(async (_reference: unknown, args: { expectedRevision?: number }) => {
        sent.push(args)
        if (sent.length === 1) return syncedResult(1)
        if (sent.length === 2) return { status: "conflict" as const, version: syncedResult(4) }
        return syncedResult(5)
      }),
    } as unknown as ConvexReactClient
    const repository = new DeckVersionWriteRepository("owner", local)
    const controller = new DeckVersionWriteController(client, repository)
    const stop = controller.start()
    const provisionalId = controller.createVersion(deckId, "Offline Draft", "", [
      { name: "Sol Ring", quantity: 1 },
    ])
    controller.update(deckId, provisionalId, [{ name: "Kept offline", quantity: 3 }], 1)
    await flush()

    expect(repository.cache.mappedVersionId(provisionalId)).toBe(serverVersionId)
    expect(controller.getSnapshot()).toMatchObject({
      pending: [],
      failures: [{ reason: DECK_VERSION_CONFLICT_REASON }],
    })

    const failedId = controller.getSnapshot().failures[0].action.operationId
    expect(() => controller.reapplyFailure(failedId)).not.toThrow()
    expect(controller.getSnapshot().pending[0]).toMatchObject({
      versionId: provisionalId,
      expectedRevision: 4,
    })
    await flush()

    expect(sent[2]).toMatchObject({ versionId: serverVersionId, expectedRevision: 4 })
    expect(controller.getSnapshot()).toMatchObject({ pending: [], failures: [] })
    expect(repository.cache.loadCards(serverVersionId)).toMatchObject({ revision: 5 })
    stop()
  })

  it("keeps account-only queued writes pending and unreplayed across sessions", async () => {
    const local = new MemoryStorage()
    const mutation = jest
      .fn()
      .mockRejectedValue(new ConvexError({ code: "sync_owner_changed", message: "unauthorized" }))
    const controller = new DeckVersionWriteController(
      { mutation } as unknown as ConvexReactClient,
      new DeckVersionWriteRepository("owner", local),
    )
    controller.update(deckId, versionId, [{ name: "Offline Draft", quantity: 1 }], 0)
    const stop = controller.start()
    await flush()
    stop()
    await controller.drain()
    expect(mutation).toHaveBeenCalledTimes(1)
    expect(controller.getSnapshot()).toMatchObject({
      pending: [{ cards: [{ name: "Offline Draft" }] }],
      failures: [],
    })
    expect(new DeckVersionWriteRepository("other-owner", local).loadPending()).toEqual([])
  })

  it("replays the same persisted operation against the real backend after acknowledgement loss", async () => {
    const t = convexTest(schema, modules)
    const actor = t.withIdentity({ subject: "owner" })
    await actor.mutation(api.users.syncCurrent, { displayName: "Owner" })
    const id = await actor.mutation(api.decks.create, { name: "Original", format: "commander" })
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
    const page = await actor.query(api.decks.versionsPull, {
      deckId: id,
      paginationOpts: { numItems: 100, cursor: null },
    })
    const version = page.page[0]
    const local = new MemoryStorage()
    let lost = true
    const client = {
      mutation: async (
        reference: typeof api.decks.syncVersionWrite,
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
    const controller = new DeckVersionWriteController(
      client,
      new DeckVersionWriteRepository("owner", local),
    )
    const stop = controller.start()

    controller.update(
      id,
      version.versionId,
      [
        {
          name: "Sol Ring",
          quantity: 4,
          oracleId: "11111111-1111-4111-8111-111111111111",
          scryfallId: "22222222-2222-4222-8222-222222222222",
        },
      ],
      version.revision,
    )
    await flush()
    const operationId = controller.getSnapshot().pending[0].operationId
    stop()

    const restarted = new DeckVersionWriteController(
      client,
      new DeckVersionWriteRepository("owner", local),
    )
    expect(restarted.getSnapshot().pending[0].operationId).toBe(operationId)
    const stopRestarted = restarted.start()
    await flush()
    stopRestarted()

    expect(restarted.getSnapshot().pending).toEqual([])
    const stored = await t.run(async (ctx) => ctx.db.get(version.versionId))
    expect(stored).toMatchObject({ syncRevision: version.revision + 1 })
    const cards = await t.run(async (ctx) =>
      ctx.db
        .query("deckCards")
        .withIndex("by_deck_version", (q) => q.eq("deckVersionId", version.versionId))
        .take(10),
    )
    for (const card of cards) expect(card).toMatchObject({ name: "Sol Ring", quantity: 4 })
    const repository = new DeckVersionWriteRepository("owner", local)
    const cached = repository.cache.loadCards(version.versionId)
    expect(cached).toMatchObject({ revision: version.revision + 1 })
  })

  it("keeps the server revision on an actual no-op acknowledgement and rebases a queued tail", async () => {
    const t = convexTest(schema, modules)
    const actor = t.withIdentity({ subject: "owner" })
    await actor.mutation(api.users.syncCurrent, { displayName: "Owner" })
    const id = await actor.mutation(api.decks.create, { name: "Original", format: "commander" })
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
    const page = await actor.query(api.decks.versionsPull, {
      deckId: id,
      paginationOpts: { numItems: 100, cursor: null },
    })
    const version = page.page[0]
    const local = new MemoryStorage()
    const sent: Array<Parameters<typeof actor.mutation>[1]> = []
    let releaseFirst: (() => void) | undefined
    const firstGate = new Promise((release) => {
      releaseFirst = release as () => void
    })
    const calls: Array<{ reference: typeof api.decks.syncVersionWrite }> = []
    const clientTyped = {
      mutation: async (
        reference: typeof api.decks.syncVersionWrite,
        args: Parameters<typeof actor.mutation>[1],
      ) => {
        if (calls.length === 0) await firstGate
        calls.push({ reference })
        sent.push(args)
        return await actor.mutation(reference, args)
      },
    } as unknown as ConvexReactClient
    const controller = new DeckVersionWriteController(
      clientTyped,
      new DeckVersionWriteRepository("owner", local),
    )
    const stop = controller.start()
    controller.update(
      id,
      version.versionId,
      [
        {
          name: "Sol Ring",
          quantity: 1,
          oracleId: "11111111-1111-4111-8111-111111111111",
          scryfallId: "22222222-2222-4222-8222-222222222222",
        },
      ],
      version.revision,
    )
    await flush()
    controller.update(
      id,
      version.versionId,
      [
        {
          name: "Sol Ring",
          quantity: 7,
          oracleId: "11111111-1111-4111-8111-111111111111",
          scryfallId: "22222222-2222-4222-8222-222222222222",
        },
      ],
      version.revision + 1,
    )
    releaseFirst?.()
    await flush()
    await flush()
    await flush()
    stop()

    expect(controller.getSnapshot()).toMatchObject({ pending: [], failures: [] })
    expect(sent[0]).toMatchObject({ expectedRevision: version.revision })
    expect(sent[1]).toMatchObject({
      expectedRevision: version.revision,
      cards: [{ name: "Sol Ring", quantity: 7 }],
    })
    const stored = await t.run(async (ctx) => ctx.db.get(version.versionId))
    expect(stored).toMatchObject({ syncRevision: version.revision + 1 })
    const repository = new DeckVersionWriteRepository("owner", local)
    const cached = repository.cache.loadCards(version.versionId)
    expect(cached).toMatchObject({ revision: version.revision + 1 })
  })

  it("drains from the shared controller after detail unmount while the session stays mounted", async () => {
    const client = {
      mutation: jest.fn().mockResolvedValue({ ...versionSnapshot(1), revision: 1 }),
      url: "http://localhost:3210",
      query: jest.fn(),
      watchQuery: jest.fn(),
    } as unknown as ConvexReactClient
    const controller = getDeckVersionWriteController(client, "lifetime-owner")
    const stopSession = controller.start()
    const stopDetail = controller.start()
    stopDetail()

    controller.update(deckId, versionId, [{ name: "After detail unmount", quantity: 3 }], 0)
    await flush()

    expect(client.mutation).toHaveBeenCalledTimes(1)
    expect(controller.getSnapshot()).toMatchObject({ pending: [], failures: [] })
    stopSession()
  })

  it("scopes default write controllers to the client's deployment URL", () => {
    const client = (url: string) =>
      ({
        url,
        mutation: jest.fn(),
        query: jest.fn(),
        watchQuery: jest.fn(),
      }) as unknown as ConvexReactClient
    const oldUrl = "http://localhost:3210"
    const controller = getDeckVersionWriteController(client(oldUrl), "factory-write-owner")
    controller.update(deckId, versionId, [{ name: "Offline cards", quantity: 1 }], 0)

    expect(controller.getSnapshot().pending).toHaveLength(1)
    expect(
      getDeckVersionWriteController(
        client("http://localhost:3211"),
        "factory-write-owner",
      ).getSnapshot().pending,
    ).toEqual([])
  })
})
