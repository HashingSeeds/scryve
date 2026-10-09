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

  it("deletes expired receipts in bounded batches and keeps recent ones", async () => {
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
    expect(remaining.events.map((event) => event.eventId)).toEqual(["recent-event"])
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
})
