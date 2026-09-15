import type { ConvexReactClient } from "convex/react"
import { getFunctionName } from "convex/server"

import {
  DeckVersionCacheController,
  DeckVersionCacheRepository,
  type DeckVersionCacheStorage,
} from "./deckVersionsCache"
import type { Id } from "../../../convex/_generated/dataModel"

class MemoryStorage implements DeckVersionCacheStorage {
  values = new Map<string, string>()

  getString(key: string) {
    return this.values.get(key)
  }

  set(key: string, value: string) {
    this.values.set(key, value)
  }

  delete(key: string) {
    this.values.delete(key)
  }
}

const deckId = "deck-1" as Id<"decks">
const flush = async (rounds = 3) => {
  for (let round = 0; round < rounds; round++) await new Promise(setImmediate)
}

const versionRow = (overrides: Record<string, unknown> = {}) => ({
  deckId,
  versionId: "version-1" as Id<"deckVersions">,
  revision: 1,
  versionNumber: 1,
  name: "Main",
  note: "",
  fingerprint: "f1",
  cardCount: 1,
  cardQuantity: 1,
  deleted: false,
  updatedAt: 1,
  ...overrides,
})

const cardRow = {
  _id: "card-1" as Id<"deckCards">,
  _creationTime: 0,
  deckVersionId: "version-1" as Id<"deckVersions">,
  name: "Sol Ring",
  quantity: 1,
}

interface QueryHandlers {
  versionsPull?: (args: { deckId: string; paginationOpts: { cursor: string | null } }) => unknown
  readVersion?: (args: { deckId: string; versionId: string }) => unknown
}

function fakeClient(handlers: QueryHandlers) {
  return {
    url: "https://test-deployment.convex.cloud",
    query: jest.fn(async (reference: unknown, args: never) => {
      const name = getFunctionName(reference as never)
      if (name === "decks:versionsPull") return handlers.versionsPull?.(args)
      if (name === "decks:readVersion") return handlers.readVersion?.(args)
      throw new Error("Unexpected query")
    }),
  } as unknown as ConvexReactClient
}

describe("deck version cache", () => {
  it("restores cached version contents on a fresh controller after a restart", async () => {
    const storage = new MemoryStorage()
    const repository = new DeckVersionCacheRepository("owner-a", storage)
    const online = new DeckVersionCacheController(
      fakeClient({
        versionsPull: () => ({
          deckId,
          page: [versionRow()],
          isDone: true,
          continueCursor: null,
        }),
        readVersion: () => ({ version: versionRow(), cards: [cardRow] }),
      }),
      repository,
    )
    const stopOnline = online.start()
    online.ensure(deckId, undefined)
    await flush()
    stopOnline()

    const restored = new DeckVersionCacheController(
      fakeClient({
        versionsPull: () => {
          throw new Error("Offline")
        },
      }),
      new DeckVersionCacheRepository("owner-a", storage),
    )
    const stop = restored.start()
    restored.ensure(deckId, undefined)
    await flush()
    expect(restored.getSnapshot().get(deckId)).toMatchObject({
      version: { versionId: "version-1", revision: 1 },
      cards: [{ name: "Sol Ring", quantity: 1 }],
    })
    stop()
  })

  it("does not restore cached contents for another account or deployment", () => {
    const storage = new MemoryStorage()
    new DeckVersionCacheRepository("owner-a", storage).saveCards("version-1", 1, [cardRow])
    new DeckVersionCacheRepository("owner-a", storage).mergeVersions(deckId, [versionRow()])

    expect(new DeckVersionCacheRepository("owner-b", storage).loadVersions(deckId)).toEqual([])
    expect(
      new DeckVersionCacheRepository("owner-b", storage).loadCards("version-1"),
    ).toBeUndefined()
    expect(
      new DeckVersionCacheRepository("owner-a", storage, "https://other.convex.cloud").loadVersions(
        deckId,
      ),
    ).toEqual([])
  })

  it("keeps newer cached cards when a stale revision responds", async () => {
    const storage = new MemoryStorage()
    const repository = new DeckVersionCacheRepository("owner-a", storage)
    repository.saveCards("version-1", 3, [{ ...cardRow, name: "Updated" }])
    const controller = new DeckVersionCacheController(
      fakeClient({
        versionsPull: () => ({
          deckId,
          page: [versionRow({ revision: 3 })],
          isDone: true,
          continueCursor: null,
        }),
        readVersion: () => ({ version: versionRow({ revision: 1 }), cards: [cardRow] }),
      }),
      repository,
    )
    const stop = controller.start()
    controller.ensure(deckId, "version-1")
    await flush()

    expect(repository.loadCards("version-1")).toMatchObject({
      revision: 3,
      cards: [{ name: "Updated" }],
    })
    stop()
  })

  it("keeps the newer version row when a stale metadata page responds", () => {
    const storage = new MemoryStorage()
    const repository = new DeckVersionCacheRepository("owner-a", storage)
    repository.mergeVersions(deckId, [versionRow({ revision: 5, note: "newest" })])

    const merged = repository.mergeVersions(deckId, [versionRow({ revision: 2 })])
    expect(merged).toEqual([versionRow({ revision: 5, note: "newest" })])
  })

  it("renders stale cached cards as unavailable while keeping them for a later refresh", () => {
    const storage = new MemoryStorage()
    const repository = new DeckVersionCacheRepository("owner-a", storage)
    repository.saveCards("version-1", 1, [cardRow])
    repository.mergeVersions(deckId, [versionRow({ revision: 2 })])

    const controller = new DeckVersionCacheController(
      fakeClient({
        versionsPull: () => {
          throw new Error("Offline")
        },
      }),
      repository,
    )
    const stop = controller.start()
    controller.ensure(deckId, "version-1")
    const snapshot = controller.getSnapshot().get(deckId)
    expect(snapshot).toMatchObject({
      version: { versionId: "version-1", revision: 2 },
      cards: undefined,
    })
    expect(repository.loadCards("version-1")).toMatchObject({ revision: 1 })
    stop()
  })

  it("treats a corrupted payload as uncached so a same-revision refetch repairs it", async () => {
    const storage = new MemoryStorage()
    const repository = new DeckVersionCacheRepository("owner-a", storage)
    repository.saveCards("version-1", 1, [cardRow])
    repository.mergeVersions(deckId, [versionRow()])
    storage.set(
      "scryve.decks.versionCards.v1.owner-a.version-1",
      JSON.stringify({
        schemaVersion: 1,
        revision: 1,
        cards: [{ name: "Sol Ring", quantity: 1 }, { quantity: 1 }],
      }),
    )
    expect(repository.loadCards("version-1")).toBeUndefined()

    const controller = new DeckVersionCacheController(
      fakeClient({
        versionsPull: () => ({
          deckId,
          page: [versionRow()],
          isDone: true,
          continueCursor: null,
        }),
        readVersion: () => ({ version: versionRow(), cards: [cardRow] }),
      }),
      repository,
    )
    const stop = controller.start()
    controller.ensure(deckId, "version-1")
    await flush()

    const snapshot = controller.getSnapshot().get(deckId)
    expect(snapshot).toMatchObject({
      version: { versionId: "version-1", revision: 1 },
      cards: [{ name: "Sol Ring", quantity: 1 }],
    })
    expect(repository.loadCards("version-1")).toMatchObject({
      revision: 1,
      cards: [{ name: "Sol Ring", quantity: 1 }],
    })
    stop()
  })

  it("treats a cached empty version as cached and an unfetched one as uncached", () => {
    const storage = new MemoryStorage()
    const repository = new DeckVersionCacheRepository("owner-a", storage)
    repository.saveCards("version-1", 1, [])
    repository.mergeVersions(deckId, [versionRow()])

    expect(repository.loadCards("version-1")).toMatchObject({ revision: 1, cards: [] })
    expect(repository.loadCards("version-missing")).toBeUndefined()
  })

  it("purges confirmed tombstones with their card bytes and renders them uncached", () => {
    const storage = new MemoryStorage()
    const repository = new DeckVersionCacheRepository("owner-a", storage)
    repository.mergeVersions(deckId, [versionRow()])
    repository.saveCards("version-2", 3, [
      { ...cardRow, deckVersionId: "version-2" as Id<"deckVersions"> },
    ])
    expect(repository.loadCards("version-2")).toBeDefined()

    // A later pull confirms version-2 was archived server-side.
    const retained = repository.mergeVersions(deckId, [
      versionRow(),
      versionRow({ versionId: "version-2", versionNumber: 2, deleted: true, revision: 4 }),
    ])
    expect(retained.map((version) => version.versionId)).toEqual(["version-1"])
    expect(repository.loadCards("version-2")).toBeUndefined()

    const controller = new DeckVersionCacheController(
      fakeClient({
        versionsPull: () => {
          throw new Error("Offline")
        },
      }),
      repository,
    )
    const stop = controller.start()
    controller.ensure(deckId, undefined)
    expect(controller.getSnapshot().get(deckId)).toMatchObject({
      version: { versionId: "version-1" },
      cards: undefined,
    })

    // Explicitly selecting the purged tombstone falls back to explicit uncached.
    controller.ensure(deckId, "version-2")
    expect(controller.getSnapshot().get(deckId)).toMatchObject({
      version: undefined,
      cards: undefined,
    })
    stop()
  })

  it("reconciles an authoritative complete pull but keeps rows across a partial one", () => {
    const storage = new MemoryStorage()
    const repository = new DeckVersionCacheRepository("owner-a", storage)
    repository.mergeVersions(deckId, [
      versionRow(),
      versionRow({ versionId: "version-2", versionNumber: 2 }),
    ])
    repository.saveCards("version-2", 1, [
      { ...cardRow, deckVersionId: "version-2" as Id<"deckVersions"> },
    ])

    // Partial pull (e.g. capped pages, offline stall) must not reconcile rows away.
    repository.mergeVersions(deckId, [versionRow()])
    expect(repository.loadVersions(deckId).map((version) => version.versionId)).toEqual([
      "version-1",
      "version-2",
    ])
    expect(repository.loadCards("version-2")).toBeDefined()

    // An authoritative complete pull that no longer lists version-2 drops its row and bytes.
    const retained = repository.mergeVersions(deckId, [versionRow()], true)
    expect(retained.map((version) => version.versionId)).toEqual(["version-1"])
    expect(repository.loadCards("version-2")).toBeUndefined()
  })

  it("serves a selected previously cached version while offline", async () => {
    const storage = new MemoryStorage()
    const repository = new DeckVersionCacheRepository("owner-a", storage)
    repository.mergeVersions(deckId, [
      versionRow(),
      versionRow({ versionId: "version-2", versionNumber: 2 }),
    ])
    repository.saveCards("version-2", 1, [
      { ...cardRow, deckVersionId: "version-2" as Id<"deckVersions">, name: "Counterspell" },
    ])
    const controller = new DeckVersionCacheController(
      fakeClient({
        versionsPull: () => {
          throw new Error("Offline")
        },
      }),
      repository,
    )
    const stop = controller.start()
    controller.ensure(deckId, "version-2")
    await flush()

    expect(controller.getSnapshot().get(deckId)).toMatchObject({
      version: { versionId: "version-2" },
      cards: [{ name: "Counterspell" }],
    })
    controller.ensure(deckId, "version-1")
    await flush()
    expect(controller.getSnapshot().get(deckId)).toMatchObject({
      version: { versionId: "version-1" },
      cards: undefined,
    })
    stop()
  })

  it("discards reads that finish after the owner stops watching", async () => {
    const storage = new MemoryStorage()
    const repository = new DeckVersionCacheRepository("owner-a", storage)
    const controller = new DeckVersionCacheController(
      fakeClient({
        versionsPull: () => ({
          deckId,
          page: [versionRow()],
          isDone: true,
          continueCursor: null,
        }),
        readVersion: () => ({ version: versionRow(), cards: [cardRow] }),
      }),
      repository,
    )
    const stop = controller.start()
    controller.ensure(deckId, undefined)
    stop()
    await flush()

    expect(repository.loadVersions(deckId)).toEqual([])
    expect(repository.loadCards("version-1")).toBeUndefined()
  })

  it("fences a superseded per-deck refresh so a stale tombstone/complete pull wins", async () => {
    const storage = new MemoryStorage()
    const repository = new DeckVersionCacheRepository("owner-a", storage)
    let pageCalls = 0
    const readCalls: string[] = []
    let releaseStalePull: (value: unknown) => void = () => {}
    const stalePull = new Promise((resolve) => {
      releaseStalePull = resolve
    })
    const controller = new DeckVersionCacheController(
      fakeClient({
        versionsPull: () => {
          pageCalls++
          if (pageCalls === 1) return stalePull
          return {
            deckId,
            page: [
              versionRow(),
              versionRow({ versionId: "version-2", versionNumber: 2, deleted: true, revision: 4 }),
            ],
            isDone: true,
            continueCursor: null,
          }
        },
        readVersion: (args: { deckId: string; versionId: string }) => {
          readCalls.push(args.versionId)
          return { version: versionRow({ versionId: args.versionId }), cards: [cardRow] }
        },
      }),
      repository,
    )
    const stop = controller.start()
    controller.ensure(deckId, "version-1")
    controller.ensure(deckId, undefined)
    await flush()

    expect(repository.loadVersions(deckId).map((version) => version.versionId)).toEqual([
      "version-1",
    ])
    expect(repository.loadCards("version-2")).toBeUndefined()

    releaseStalePull({
      deckId,
      page: [versionRow(), versionRow({ versionId: "version-2", versionNumber: 2 })],
      isDone: true,
      continueCursor: null,
    })
    await flush()

    expect(repository.loadVersions(deckId).map((version) => version.versionId)).toEqual([
      "version-1",
    ])
    expect(repository.loadCards("version-2")).toBeUndefined()
    expect(new Set(readCalls)).toEqual(new Set(["version-1"]))
    stop()
  })

  it("does not re-query a selected version dropped from authoritative metadata", async () => {
    const storage = new MemoryStorage()
    const repository = new DeckVersionCacheRepository("owner-a", storage)
    repository.mergeVersions(deckId, [
      versionRow(),
      versionRow({ versionId: "version-2", versionNumber: 2 }),
    ])
    repository.saveCards("version-2", 1, [
      { ...cardRow, deckVersionId: "version-2" as Id<"deckVersions"> },
    ])
    const readCalls: string[] = []
    const controller = new DeckVersionCacheController(
      fakeClient({
        versionsPull: () => ({
          deckId,
          page: [versionRow()],
          isDone: true,
          continueCursor: null,
        }),
        readVersion: (args: { deckId: string; versionId: string }) => {
          readCalls.push(args.versionId)
          return { version: versionRow({ versionId: args.versionId }), cards: [cardRow] }
        },
      }),
      repository,
    )
    const stop = controller.start()
    controller.ensure(deckId, "version-2")
    await flush()

    expect(repository.loadVersions(deckId).map((version) => version.versionId)).toEqual([
      "version-1",
    ])
    expect(repository.loadCards("version-2")).toBeUndefined()
    expect(readCalls).toEqual([])
    stop()
  })

  it("serves the latest selection after rapid A-B-A switching", async () => {
    const storage = new MemoryStorage()
    const repository = new DeckVersionCacheRepository("owner-a", storage)
    const readRequests: string[] = []
    const controller = new DeckVersionCacheController(
      fakeClient({
        versionsPull: () => ({
          deckId,
          page: [versionRow(), versionRow({ versionId: "version-2", versionNumber: 2 })],
          isDone: true,
          continueCursor: null,
        }),
        readVersion: (args: { deckId: string; versionId: string }) => {
          readRequests.push(args.versionId)
          return { version: versionRow({ versionId: args.versionId }), cards: [cardRow] }
        },
      }),
      repository,
    )
    const stop = controller.start()
    controller.ensure(deckId, "version-1")
    controller.ensure(deckId, "version-2")
    controller.ensure(deckId, "version-1")
    await flush()

    expect(controller.getSnapshot().get(deckId)).toMatchObject({
      version: { versionId: "version-1" },
      cards: [{ name: "Sol Ring" }],
    })
    expect(new Set(readRequests)).toEqual(new Set(["version-1"]))
    stop()
  })

  it("keeps another consumer's in-flight reads alive when one consumer stops", async () => {
    const storage = new MemoryStorage()
    const repository = new DeckVersionCacheRepository("owner-a", storage)
    const controller = new DeckVersionCacheController(
      fakeClient({
        versionsPull: () => ({
          deckId,
          page: [versionRow()],
          isDone: true,
          continueCursor: null,
        }),
        readVersion: () => ({ version: versionRow(), cards: [cardRow] }),
      }),
      repository,
    )
    const stopFirst = controller.start()
    const stopSecond = controller.start()
    controller.ensure(deckId, undefined)
    stopFirst()
    await flush()

    expect(repository.loadVersions(deckId)).toHaveLength(1)
    expect(repository.loadCards("version-1")).toMatchObject({ revision: 1 })
    stopSecond()
  })

  it("refetches after a reconnect drops stalled offline reads", async () => {
    const storage = new MemoryStorage()
    const repository = new DeckVersionCacheRepository("owner-a", storage)
    let stalled = true
    const controller = new DeckVersionCacheController(
      fakeClient({
        versionsPull: () =>
          stalled
            ? new Promise(() => undefined)
            : { deckId, page: [versionRow()], isDone: true, continueCursor: null },
        readVersion: () => ({ version: versionRow(), cards: [cardRow] }),
      }),
      repository,
    )
    const stop = controller.start()
    controller.ensure(deckId, undefined)
    await flush()
    expect(repository.loadVersions(deckId)).toEqual([])

    controller.resume()
    stalled = false
    controller.ensure(deckId, undefined)
    await flush()
    expect(controller.getSnapshot().get(deckId)).toMatchObject({
      version: { versionId: "version-1" },
      cards: [{ name: "Sol Ring" }],
    })
    stop()
  })

  it("seeds version cards from live reads without regressing newer revisions", () => {
    const storage = new MemoryStorage()
    const repository = new DeckVersionCacheRepository("owner-a", storage)
    repository.mergeVersions(deckId, [versionRow({ revision: 2 })])
    const controller = new DeckVersionCacheController(
      fakeClient({
        versionsPull: () => {
          throw new Error("Offline")
        },
      }),
      repository,
    )
    const stop = controller.start()
    controller.ensure(deckId, "version-1")

    controller.record(deckId, "version-1", 3, [{ ...cardRow, name: "Live" }])
    expect(repository.loadCards("version-1")).toMatchObject({
      revision: 3,
      cards: [{ name: "Live" }],
    })
    expect(controller.getSnapshot().get(deckId)).toMatchObject({
      cards: [{ name: "Live" }],
    })

    controller.record(deckId, "version-1", 2, [cardRow])
    expect(repository.loadCards("version-1")).toMatchObject({
      revision: 3,
      cards: [{ name: "Live" }],
    })
    stop()
  })

  it("republishes the persisted capacity hint once detail supplies it", () => {
    const storage = new MemoryStorage()
    const repository = new DeckVersionCacheRepository("owner-a", storage)
    const controller = new DeckVersionCacheController(
      fakeClient({
        versionsPull: () => {
          throw new Error("Offline")
        },
      }),
      repository,
    )
    const stop = controller.start()
    controller.ensure(deckId, undefined)
    expect(controller.getSnapshot().get(deckId)?.capacity).toBeUndefined()

    controller.recordCapacity(deckId, { limit: 5, premium: true })

    expect(controller.getSnapshot().get(deckId)?.capacity).toEqual({ limit: 5, premium: true })
    expect(repository.loadCapacity(deckId)).toEqual({ limit: 5, premium: true })
    stop()
  })

  it("ignores version payloads addressed to a different deck", async () => {
    const storage = new MemoryStorage()
    const repository = new DeckVersionCacheRepository("owner-a", storage)
    const controller = new DeckVersionCacheController(
      fakeClient({
        versionsPull: () => ({
          deckId: "deck-other" as Id<"decks">,
          page: [versionRow({ deckId: "deck-other" })],
          isDone: true,
          continueCursor: null,
        }),
      }),
      repository,
    )
    const stop = controller.start()
    controller.ensure(deckId, undefined)
    await flush()

    expect(repository.loadVersions(deckId)).toEqual([])
    stop()
  })
})
