import { convexTest } from "convex-test"

import { api, internal } from "./_generated/api"
import { RECEIPT_PRUNE_BATCH_SIZE, RECEIPT_RETENTION_MS } from "./crons"
import schema from "./schema"

const modules = {
  "./_generated/api.ts": async () => jest.requireActual("./_generated/api"),
  "./_generated/server.ts": async () => jest.requireActual("./_generated/server"),
  "./crons.ts": async () => jest.requireActual("./crons"),
  "./decks.ts": async () => jest.requireActual("./decks"),
  "./entitlements.ts": async () => jest.requireActual("./entitlements"),
  "./games.ts": async () => jest.requireActual("./games"),
  "./integrationManifest.ts": async () => jest.requireActual("./integrationManifest"),
  "./users.ts": async () => jest.requireActual("./users"),
}

const DAY_MS = 24 * 60 * 60 * 1000
const startedAt = Date.UTC(2026, 0, 1)

const deckWrite = (operationId: string, expectedRevision: number, name: string) => ({
  id: "11111111-1111-4111-8111-111111111111",
  operationId,
  expectedRevision,
  name,
  format: "commander",
  game: "mtg",
  note: "",
  deleted: false,
})

describe("receipt pruning", () => {
  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(startedAt)
  })
  afterEach(() => jest.useRealTimers())

  it("deletes expired receipts in bounded batches and keeps recent ones and webhook events", async () => {
    const t = convexTest(schema, modules)
    const insertReceipts = (count: number, prefix: string) =>
      t.run(async (ctx) => {
        const now = Date.now()
        const ownerUserId = await ctx.db.insert("users", {
          clerkUserId: `${prefix}-owner`,
          displayName: prefix,
          createdAt: now,
          updatedAt: now,
        })
        const deckId = await ctx.db.insert("decks", {
          ownerUserId,
          name: "Deck",
          format: "commander",
          createdAt: now,
          updatedAt: now,
        })
        for (let index = 0; index < count; index += 1)
          await ctx.db.insert("deckSyncReceipts", {
            ownerUserId,
            operationId: `${prefix}-${index}`,
            requestKey: "[]",
            result: {
              id: deckId,
              deckId,
              revision: 1,
              name: "Deck",
              format: "commander",
              game: "mtg",
              note: "",
              deleted: false,
              createdAt: now,
              updatedAt: now,
            },
          })
        await ctx.db.insert("revenueCatWebhookEvents", {
          eventId: `${prefix}-event`,
          eventTimestampMs: now,
          processedAt: now,
        })
      })
    await insertReceipts(RECEIPT_PRUNE_BATCH_SIZE + 20, "old")
    jest.setSystemTime(startedAt + RECEIPT_RETENTION_MS + DAY_MS)
    await insertReceipts(2, "recent")

    await expect(t.mutation(internal.crons.pruneOldReceipts, {})).resolves.toEqual({
      deleted: RECEIPT_PRUNE_BATCH_SIZE,
      hasMore: true,
    })
    const afterFirstRun = await t.run(async (ctx) => ({
      receipts: await ctx.db.query("deckSyncReceipts").collect(),
      events: await ctx.db.query("revenueCatWebhookEvents").collect(),
    }))
    expect(afterFirstRun.receipts).toHaveLength(22)
    expect(afterFirstRun.events).toHaveLength(2)

    await t.finishAllScheduledFunctions(() => jest.runAllTimers())
    const remaining = await t.run(async (ctx) => ({
      receipts: await ctx.db.query("deckSyncReceipts").collect(),
      events: await ctx.db.query("revenueCatWebhookEvents").collect(),
    }))
    expect(remaining.receipts.map((receipt) => receipt.operationId)).toEqual([
      "recent-0",
      "recent-1",
    ])
    expect(remaining.events.map((event) => event.eventId)).toEqual(["old-event", "recent-event"])
  })

  it("still deduplicates a retried operation inside the retention window", async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity({ subject: "retry-owner" })
    await owner.mutation(api.users.syncCurrent, { displayName: "retry-owner" })
    const createOperation = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    const created = await owner.mutation(
      api.decks.syncWrite,
      deckWrite(createOperation, 0, "Offline deck"),
    )
    await owner.mutation(
      api.decks.syncWrite,
      deckWrite("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", 1, "Renamed"),
    )

    jest.setSystemTime(startedAt + RECEIPT_RETENTION_MS - DAY_MS)
    await t.mutation(internal.crons.pruneOldReceipts, {})
    await expect(
      owner.mutation(api.decks.syncWrite, deckWrite(createOperation, 0, "Offline deck")),
    ).resolves.toEqual(created)

    jest.setSystemTime(startedAt + RECEIPT_RETENTION_MS + DAY_MS)
    await t.mutation(internal.crons.pruneOldReceipts, {})
    await expect(
      owner.mutation(api.decks.syncWrite, deckWrite(createOperation, 0, "Offline deck")),
    ).rejects.toThrow("Deck changed on another device")
  })

  it("keeps deck version receipts so an old version create still replays once", async () => {
    const t = convexTest(schema, modules)
    const owner = t.withIdentity({ subject: "version-owner" })
    await owner.mutation(api.users.syncCurrent, { displayName: "version-owner" })
    const deckId = await owner.mutation(api.decks.create, { name: "Deck", format: "commander" })
    await t.run(async (ctx) => {
      const deck = await ctx.db.get(deckId)
      if (!deck) throw new Error("expected a deck")
      await ctx.db.insert("userEntitlements", {
        userId: deck.ownerUserId,
        feature: "deck_versions",
        enabled: true,
        source: "test",
        updatedAt: Date.now(),
      })
    })
    const create = {
      deckId,
      operationId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      name: "Snapshot",
      cards: [
        {
          oracleId: "11111111-1111-1111-1111-111111111111",
          scryfallId: "22222222-2222-2222-2222-222222222222",
          name: "Sync card",
          quantity: 1,
          board: "main" as const,
        },
      ],
    }
    const created = await owner.mutation(api.decks.syncCreateVersion, create)

    jest.setSystemTime(startedAt + RECEIPT_RETENTION_MS + DAY_MS)
    await t.mutation(internal.crons.pruneOldReceipts, {})
    await expect(owner.mutation(api.decks.syncCreateVersion, create)).resolves.toEqual(created)
    const versions = await t.run((ctx) =>
      ctx.db
        .query("deckVersions")
        .withIndex("by_deck_and_version_number", (q) => q.eq("deckId", deckId))
        .collect(),
    )
    expect(versions).toHaveLength(2)
  })

  it("turns a game publish or completion retried after pruning into no new writes", async () => {
    const t = convexTest(schema, modules)
    const host = t.withIdentity({ subject: "publish-host" })
    await host.mutation(api.users.syncCurrent, { displayName: "Host" })
    const publish = {
      operationId: "publish-operation-00000001",
      publicId: "published-game-id-00001",
      ruleset: "commander",
      startingLife: 40,
      inviteToken: "t".repeat(43),
      manualCodeCandidates: ["ABC234"],
      hostLocalId: "local-host-player",
      players: [
        {
          localId: "local-host-player",
          seat: 1,
          displayName: "Host",
          color: "#7C3AED",
          currentLife: 40,
        },
        {
          localId: "local-guest-player",
          seat: 2,
          displayName: "Guest",
          color: "#2563EB",
          currentLife: 40,
        },
      ],
    }
    await host.mutation(api.games.publishLocalGame, publish)
    const finish = { publicId: publish.publicId, operationId: "completion-finish-prune-01" }
    const finished = await host.mutation(api.games.finishGameWithOperation, finish)

    jest.setSystemTime(startedAt + RECEIPT_RETENTION_MS + DAY_MS)
    await t.mutation(internal.crons.pruneOldReceipts, {})

    await expect(host.mutation(api.games.publishLocalGame, publish)).rejects.toThrow(
      "Game identifier collision",
    )
    await expect(host.mutation(api.games.finishGameWithOperation, finish)).resolves.toMatchObject({
      summaryId: finished.summaryId,
      superseded: true,
    })
    const stored = await t.run(async (ctx) => ({
      games: await ctx.db.query("games").collect(),
      summaries: await ctx.db.query("gameSummaries").collect(),
    }))
    expect(stored.games).toHaveLength(1)
    expect(stored.summaries).toHaveLength(1)
  })
})
