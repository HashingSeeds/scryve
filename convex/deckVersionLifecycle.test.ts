import { convexTest } from "convex-test"

import { api } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import schema from "./schema"

const modules = {
  "./_generated/api.ts": async () => jest.requireActual("./_generated/api"),
  "./_generated/server.ts": async () => jest.requireActual("./_generated/server"),
  "./decks.ts": async () => jest.requireActual("./decks"),
  "./entitlements.ts": async () => jest.requireActual("./entitlements"),
  "./integrationManifest.ts": async () => jest.requireActual("./integrationManifest"),
  "./users.ts": async () => jest.requireActual("./users"),
}

const syncCard = {
  oracleId: "11111111-1111-1111-1111-111111111111",
  scryfallId: "22222222-2222-2222-2222-222222222222",
  name: "Sync card",
  quantity: 1,
  board: "main" as const,
}

const otherCard = { ...syncCard, name: "Other card", quantity: 2 }

async function synced(t: ReturnType<typeof convexTest>, subject: string) {
  const actor = t.withIdentity({ subject })
  await actor.mutation(api.users.syncCurrent, { displayName: subject })
  return actor
}

describe("deck version lifecycle sync", () => {
  async function seedDeck(t: ReturnType<typeof convexTest>, subject: string) {
    const actor = await synced(t, subject)
    const deckId = await actor.mutation(api.decks.create, { name: "Deck", format: "commander" })
    await grantPremium(t, deckId)
    return { actor, deckId }
  }
  async function grantPremium(t: ReturnType<typeof convexTest>, deckId: Id<"decks">) {
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
  }

  it("replays a create once per operation ID without consuming capacity twice", async () => {
    const t = convexTest(schema, modules)
    const { actor, deckId } = await seedDeck(t, "lifecycle-create-owner")
    const args = {
      deckId,
      operationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "Snapshot",
      cards: [syncCard],
    }
    const first = await actor.mutation(api.decks.syncCreateVersion, args)
    expect(first).toMatchObject({ deckId, versionNumber: 2, name: "Snapshot", revision: 1 })
    await expect(actor.mutation(api.decks.syncCreateVersion, args)).resolves.toEqual(first)
    const stored = await t.run(async (ctx) => ({
      versions: await ctx.db
        .query("deckVersions")
        .withIndex("by_deck_and_version_number", (q) => q.eq("deckId", deckId))
        .collect(),
      receipts: await ctx.db.query("deckVersionSyncReceipts").collect(),
    }))
    expect(stored.versions).toHaveLength(2)
    expect(stored.receipts).toHaveLength(1)
  })

  it("rejects a reused operation ID with a changed payload", async () => {
    const t = convexTest(schema, modules)
    const { actor, deckId } = await seedDeck(t, "lifecycle-mismatch-owner")
    const args = {
      deckId,
      operationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      name: "Snapshot",
      cards: [syncCard],
    }
    await actor.mutation(api.decks.syncCreateVersion, args)
    await expect(
      actor.mutation(api.decks.syncCreateVersion, { ...args, cards: [otherCard] }),
    ).rejects.toMatchObject({ data: { code: "sync_operation_mismatch" } })
  })

  it("keeps ownership boundaries for create, update, and delete", async () => {
    const t = convexTest(schema, modules)
    const { actor, deckId } = await seedDeck(t, "lifecycle-realtor")
    const saved = await actor.mutation(api.decks.syncCreateVersion, {
      deckId,
      operationId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      name: "Owned",
      cards: [syncCard],
    })
    const versionId = saved.versionId
    const stranger = await synced(t, "lifecycle-stranger")
    await expect(
      stranger.mutation(api.decks.syncCreateVersion, {
        deckId,
        operationId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        name: "Stolen",
        cards: [],
      }),
    ).rejects.toMatchObject({ data: { code: "deck_not_found" } })
    await expect(
      stranger.mutation(api.decks.syncUpdateVersion, {
        versionId,
        operationId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
        expectedRevision: 1,
        name: "Hijacked",
      }),
    ).rejects.toMatchObject({ data: { code: "deck_not_found" } })
    await expect(
      stranger.mutation(api.decks.syncDeleteVersion, {
        versionId,
        operationId: "ffffffff-ffff-4fff-8fff-ffffffffffff",
        expectedRevision: 1,
      }),
    ).rejects.toMatchObject({ data: { code: "deck_not_found" } })
  })

  it("refuses an update on a stale revision and reports the current version", async () => {
    const t = convexTest(schema, modules)
    const { actor, deckId } = await seedDeck(t, "lifecycle-conflict-owner")
    const saved = await actor.mutation(api.decks.syncCreateVersion, {
      deckId,
      operationId: "aaaaaa02-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "Conflicted",
      cards: [syncCard],
    })
    const versionId = saved.versionId
    const stale = {
      versionId,
      operationId: "aaaaaa03-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      expectedRevision: 0,
    }
    await expect(
      actor.mutation(api.decks.syncUpdateVersion, { ...stale, name: "Late rename" }),
    ).rejects.toMatchObject({ data: { code: "sync_conflict" } })
    await expect(
      actor.mutation(api.decks.syncUpdateVersion, { ...stale, returnConflict: true, note: "hi" }),
    ).resolves.toMatchObject({ status: "conflict", version: { revision: 1, name: "Conflicted" } })
    const stored = await t.run(async (ctx) => await ctx.db.get(versionId))
    expect(stored).toMatchObject({ name: "Conflicted", syncRevision: 1 })
  })

  it("replays rename and delete receipts with the preserved result after later state", async () => {
    const t = convexTest(schema, modules)
    const { actor, deckId } = await seedDeck(t, "lifecycle-replay-owner")
    const saved = await actor.mutation(api.decks.syncCreateVersion, {
      deckId,
      operationId: "aaaaaa04-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "Snapshot",
      cards: [syncCard],
    })
    const versionId = saved.versionId
    const renameArgs = {
      versionId,
      operationId: "aaaaaa05-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      expectedRevision: 1,
      name: "Renamed",
    }
    const renamed = await actor.mutation(api.decks.syncUpdateVersion, renameArgs)
    expect(renamed).toMatchObject({ versionId, revision: 2, name: "Renamed" })
    const deleteArgs = {
      versionId,
      operationId: "aaaaaa06-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      expectedRevision: 2,
    }
    const deleted = await actor.mutation(api.decks.syncDeleteVersion, deleteArgs)
    expect(deleted).toMatchObject({ versionId, revision: 3, deleted: true })
    await expect(
      actor.mutation(api.decks.syncUpdateVersion, {
        ...renameArgs,
        name: "Renamed",
        note: undefined,
      }),
    ).resolves.toEqual({ ...renamed })
    await expect(actor.mutation(api.decks.syncDeleteVersion, deleteArgs)).resolves.toEqual(deleted)
    const stored = await t.run(async (ctx) => ({
      version: await ctx.db.get(versionId),
      receipts: await ctx.db.query("deckVersionSyncReceipts").collect(),
    }))
    expect(stored.version).toMatchObject({ syncRevision: 3, archivedAt: expect.any(Number) })
    expect(stored.receipts).toHaveLength(3)
    await expect(
      actor.mutation(api.decks.syncUpdateVersion, {
        versionId,
        operationId: "aaaaaa07-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        expectedRevision: 0,
        name: "Resurrected",
        returnConflict: true,
      }),
    ).resolves.toMatchObject({ status: "conflict", version: { deleted: true, revision: 3 } })
  })

  it("guards the last version and version capacity", async () => {
    const t = convexTest(schema, modules)
    const { actor, deckId } = await seedDeck(t, "lifecycle-guard-owner")
    const detail = await actor.query(api.decks.detail, { deckId })
    const versionId = detail.versions[0]._id
    await expect(
      actor.mutation(api.decks.syncDeleteVersion, {
        versionId,
        operationId: "aaaaaa08-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        expectedRevision: 1,
      }),
    ).rejects.toMatchObject({ data: { code: "last_version" } })
    const saved = await actor.mutation(api.decks.syncCreateVersion, {
      deckId,
      operationId: "aaaaaa09-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "Second",
      cards: [syncCard],
    })
    const stored = await t.run(async (ctx) => await ctx.db.get(saved.versionId))
    expect(stored).toMatchObject({ syncRevision: 1 })
  })

  it("stops creations once the version capacity is reached", async () => {
    const t = convexTest(schema, modules)
    const { actor, deckId } = await seedDeck(t, "lifecycle-capacity-owner")
    for (let index = 0; index < 4; index++)
      await actor.mutation(api.decks.syncCreateVersion, {
        deckId,
        operationId: `aaaaaa0${index}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`,
        name: `Snapshot ${index}`,
        cards: [syncCard],
      })
    await expect(
      actor.mutation(api.decks.syncCreateVersion, {
        deckId,
        operationId: "aaaa00aa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        name: "Over the line",
        cards: [syncCard],
      }),
    ).rejects.toMatchObject({ data: { code: "version_limit_reached" } })
  })

  it("coexists with legacy calls and revisions stay coherent", async () => {
    const t = convexTest(schema, modules)
    const { actor, deckId } = await seedDeck(t, "lifecycle-mixed-owner")
    const saved = await actor.mutation(api.decks.syncCreateVersion, {
      deckId,
      operationId: "aaaa01aa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      name: "Mixed",
      cards: [syncCard],
    })
    const versionId = saved.versionId
    await actor.mutation(api.decks.updateVersion, { versionId, name: "Legacy rename" })
    const legacy = await t.run(async (ctx) => await ctx.db.get(versionId))
    expect(legacy).toMatchObject({ syncRevision: 2 })
    await expect(
      actor.mutation(api.decks.syncUpdateVersion, {
        versionId,
        operationId: "aaaaaa0b-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        expectedRevision: 2,
        note: "Synced note",
      }),
    ).resolves.toMatchObject({ revision: 3, note: "Synced note" })
    await actor.mutation(api.decks.deleteVersion, { versionId })
    await expect(
      actor.mutation(api.decks.syncDeleteVersion, {
        versionId,
        operationId: "aaaaaa0c-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        expectedRevision: 2,
        returnConflict: true,
      }),
    ).resolves.toMatchObject({ status: "conflict", version: { deleted: true, revision: 4 } })
  })
})
