import type { FunctionReturnType } from "convex/server"
import { convexTest } from "convex-test"

import { api, internal } from "./_generated/api"
import schema from "./schema"

const modules = {
  "./_generated/api.ts": async () => jest.requireActual("./_generated/api"),
  "./_generated/server.ts": async () => jest.requireActual("./_generated/server"),
  "./decks.ts": async () => jest.requireActual("./decks"),
  "./entitlements.ts": async () => jest.requireActual("./entitlements"),
  "./integrationManifest.ts": async () => jest.requireActual("./integrationManifest"),
  "./users.ts": async () => jest.requireActual("./users"),
}

const firstSyncId = "11111111-1111-4111-8111-111111111111"
const secondSyncId = "22222222-2222-4222-8222-222222222222"
const thirdSyncId = "33333333-3333-4333-8333-333333333333"

async function synced(t: ReturnType<typeof convexTest>, subject: string) {
  const actor = t.withIdentity({ subject })
  await actor.mutation(api.users.syncCurrent, { displayName: subject })
  return actor
}

function writeArgs(
  id: string,
  operationId: string,
  expectedRevision = 0,
  overrides: Partial<{
    name: string
    format: string
    game: string
    note: string
    deleted: boolean
  }> = {},
) {
  return {
    id,
    operationId,
    expectedRevision,
    name: "Offline deck",
    format: "commander",
    game: "mtg",
    note: "",
    deleted: false,
    ...overrides,
  }
}

describe("deck sync", () => {
  it("canonicalizes UUID casing for deck identity and operation replay", async () => {
    const t = convexTest(schema, modules)
    const owner = await synced(t, "uuid-owner")
    const args = writeArgs(
      "aabbccdd-aabb-4aab-8aab-aabbccddeeff",
      "abcdefab-abcd-4abc-8abc-abcdefabcdef",
    )
    const created = await owner.mutation(api.decks.syncWrite, {
      ...args,
      id: args.id.toUpperCase(),
      operationId: args.operationId.toUpperCase(),
    })
    if ("status" in created) throw new Error("expected successful sync write")
    expect(created.id).toBe(args.id)
    await expect(owner.mutation(api.decks.syncWrite, args)).resolves.toEqual(created)
    const updated = await owner.mutation(api.decks.syncWrite, {
      ...args,
      id: args.id.toUpperCase(),
      operationId: "bcdefabc-bcde-4bcd-8bcd-bcdefabcdefa",
      expectedRevision: 1,
      name: "Renamed",
    })
    if ("status" in updated) throw new Error("expected successful sync write")
    expect(updated).toMatchObject({ deckId: created.deckId, revision: 2, name: "Renamed" })
  })

  it("creates once and replays the original receipt after later edits and deletion", async () => {
    const t = convexTest(schema, modules)
    const actor = await synced(t, "replay-owner")
    const createArgs = writeArgs(firstSyncId, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")

    const created = await actor.mutation(api.decks.syncWrite, createArgs)
    if ("status" in created) throw new Error("expected successful sync write")
    expect(created).toMatchObject({
      id: firstSyncId,
      revision: 1,
      name: "Offline deck",
      format: "commander",
      game: "mtg",
      note: "",
      deleted: false,
      createdAt: expect.any(Number),
      updatedAt: expect.any(Number),
    })
    await actor.mutation(
      api.decks.syncWrite,
      writeArgs(firstSyncId, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", 1, {
        name: "Renamed",
      }),
    )
    await actor.mutation(
      api.decks.syncWrite,
      writeArgs(firstSyncId, "cccccccc-cccc-4ccc-8ccc-cccccccccccc", 2, {
        name: "Renamed",
        deleted: true,
      }),
    )

    await expect(actor.mutation(api.decks.syncWrite, createArgs)).resolves.toEqual(created)
    const stored = await t.run(async (ctx) => {
      const decks = await ctx.db.query("decks").collect()
      const versions = await ctx.db
        .query("deckVersions")
        .withIndex("by_deck_and_version_number", (q) => q.eq("deckId", created.deckId))
        .collect()
      const receipts = await ctx.db.query("deckSyncReceipts").collect()
      return { decks, versions, receipts }
    })
    expect(stored.decks).toHaveLength(1)
    expect(stored.versions).toHaveLength(1)
    expect(stored.receipts).toHaveLength(3)
  })

  it("projects legacy decks at revision zero and detects update and archive conflicts", async () => {
    const t = convexTest(schema, modules)
    const actor = await synced(t, "legacy-owner")
    const deckId = await actor.mutation(api.decks.create, {
      name: "Legacy",
      format: "commander",
    })

    const updated = await actor.mutation(
      api.decks.syncWrite,
      writeArgs(deckId, "dddddddd-dddd-4ddd-8ddd-dddddddddddd", 0, { name: "Updated" }),
    )
    expect(updated).toMatchObject({ id: deckId, deckId, revision: 1, name: "Updated" })
    await expect(
      actor.mutation(
        api.decks.syncWrite,
        writeArgs(deckId, "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", 0, { name: "Stale" }),
      ),
    ).rejects.toMatchObject({ data: { code: "sync_conflict" } })
    await expect(
      actor.mutation(api.decks.syncWrite, {
        ...writeArgs(deckId, "12121212-1212-4212-8212-121212121212", 0, { name: "Stale" }),
        returnConflict: true,
      }),
    ).resolves.toMatchObject({ status: "conflict", deck: { deckId, revision: 1, name: "Updated" } })
    await expect(actor.query(api.decks.detail, { deckId })).resolves.toMatchObject({
      deck: { name: "Updated" },
    })
    await expect(
      actor.mutation(
        api.decks.syncWrite,
        writeArgs(deckId, "ffffffff-ffff-4fff-8fff-ffffffffffff", 1, {
          name: "Updated",
          deleted: true,
        }),
      ),
    ).resolves.toMatchObject({ id: deckId, revision: 2, deleted: true })

    const stored = await t.run(async (ctx) => await ctx.db.get(deckId))
    expect(stored).not.toHaveProperty("syncId")
    expect(stored).toMatchObject({ syncRevision: 2, archivedAt: expect.any(Number) })

    const legacyId = await actor.mutation(api.decks.create, {
      name: "Old client",
      format: "commander",
    })
    const pending = writeArgs(legacyId, "abababab-abab-4bab-8bab-abababababab")
    await actor.mutation(api.decks.update, { deckId: legacyId, name: "Online edit" })
    await expect(actor.mutation(api.decks.syncWrite, pending)).rejects.toMatchObject({
      data: { code: "sync_conflict" },
    })
    await actor.mutation(api.decks.archive, { deckId: legacyId })
    await expect(
      actor.mutation(api.decks.syncWrite, { ...pending, expectedRevision: 1 }),
    ).rejects.toMatchObject({ data: { code: "sync_conflict" } })
  })

  it("isolates identifiers and operations by owner and requires authentication", async () => {
    const t = convexTest(schema, modules)
    const owner = await synced(t, "first-owner")
    const other = await synced(t, "second-owner")
    const operationId = "12121212-1212-4212-8212-121212121212"
    const ownerDeck = await owner.mutation(api.decks.syncWrite, writeArgs(firstSyncId, operationId))
    const otherDeck = await other.mutation(api.decks.syncWrite, writeArgs(firstSyncId, operationId))
    if ("status" in ownerDeck || "status" in otherDeck)
      throw new Error("expected successful sync write")
    expect(otherDeck.deckId).not.toBe(ownerDeck.deckId)
    await expect(
      other.mutation(api.decks.syncWrite, {
        ...writeArgs(firstSyncId, "14141414-1414-4414-8414-141414141414", 1),
        expectedOwnerId: "first-owner",
      }),
    ).rejects.toMatchObject({ data: { code: "sync_owner_changed" } })
    const otherPage = await other.query(api.decks.syncPage, {
      paginationOpts: { numItems: 10, cursor: null },
    })
    expect(otherPage.ownerId).toBe("second-owner")
    expect((await other.query(api.decks.listMine, {})).ownerId).toBe("second-owner")

    await expect(
      other.mutation(
        api.decks.syncWrite,
        writeArgs(ownerDeck.deckId, "13131313-1313-4313-8313-131313131313"),
      ),
    ).rejects.toMatchObject({ data: { code: "deck_not_found" } })
    await expect(
      owner.mutation(api.decks.syncWrite, {
        ...writeArgs(firstSyncId, operationId),
        name: "Changed",
      }),
    ).rejects.toMatchObject({ data: { code: "sync_operation_mismatch" } })
    await expect(
      t.query(api.decks.syncPage, { paginationOpts: { numItems: 10, cursor: null } }),
    ).rejects.toMatchObject({ data: { code: "unauthenticated" } })
  })

  it("keeps decks archived before sync support deleted", async () => {
    const t = convexTest(schema, modules)
    const owner = await synced(t, "archived-legacy-owner")
    const deckId = await owner.mutation(api.decks.create, {
      name: "Archived legacy deck",
      format: "commander",
    })
    await t.run((ctx) => ctx.db.patch(deckId, { archivedAt: Date.now() }))
    await expect(
      owner.mutation(
        api.decks.syncWrite,
        writeArgs(deckId, "15151515-1515-4515-8515-151515151515"),
      ),
    ).rejects.toMatchObject({ data: { code: "deck_archived" } })
    const page = await owner.query(api.decks.syncPage, {
      paginationOpts: { numItems: 10, cursor: null },
    })
    expect(page.page).toMatchObject([{ deckId, revision: 0, deleted: true }])
  })

  it("paginates a stable owner-only feed that includes tombstones", async () => {
    const t = convexTest(schema, modules)
    const owner = await synced(t, "page-owner")
    const other = await synced(t, "page-other")
    const ids = [firstSyncId, secondSyncId, thirdSyncId]
    for (const [index, id] of ids.entries()) {
      await owner.mutation(
        api.decks.syncWrite,
        writeArgs(id, `44444444-4444-4444-8444-44444444444${index}`, 0, {
          name: `Deck ${index}`,
        }),
      )
      if (index < 2)
        await owner.mutation(
          api.decks.syncWrite,
          writeArgs(id, `55555555-5555-4555-8555-55555555555${index}`, 1, {
            name: `Deck ${index}`,
            deleted: true,
          }),
        )
    }
    await other.mutation(
      api.decks.syncWrite,
      writeArgs(firstSyncId, "77777777-7777-4777-8777-777777777777"),
    )

    const rows: FunctionReturnType<typeof api.decks.syncPage>["page"] = []
    let cursor: string | null = null
    let done = false
    while (!done) {
      const result: FunctionReturnType<typeof api.decks.syncPage> = await owner.query(
        api.decks.syncPage,
        {
          paginationOpts: { numItems: 1, cursor },
        },
      )
      rows.push(...result.page)
      cursor = result.continueCursor
      done = result.isDone
    }
    expect(rows.map((row) => row.id)).toEqual(ids)
    expect(rows.map((row) => row.deleted)).toEqual([true, true, false])
    await expect(
      owner.query(api.decks.syncPage, { paginationOpts: { numItems: 101, cursor: null } }),
    ).rejects.toBeDefined()
  })

  it.each([
    {
      label: "sync ID",
      args: writeArgs("NOT-A-UUID", "88888888-8888-4888-8888-888888888888"),
      code: "invalid_sync_id",
    },
    {
      label: "operation ID",
      args: writeArgs(firstSyncId, "NOT-A-UUID"),
      code: "invalid_operation_id",
    },
    {
      label: "negative revision",
      args: writeArgs(firstSyncId, "89898989-8989-4989-8989-898989898989", -1),
      code: "invalid_revision",
    },
    {
      label: "fractional revision",
      args: writeArgs(firstSyncId, "90909090-9090-4090-8090-909090909090", 1.5),
      code: "invalid_revision",
    },
    {
      label: "missing deleted deck",
      args: writeArgs(firstSyncId, "91919191-9191-4191-8191-919191919191", 0, {
        deleted: true,
      }),
      code: "deck_not_found",
    },
  ])("rejects malformed $label", async ({ args, code }) => {
    const t = convexTest(schema, modules)
    const actor = await synced(t, `invalid-${code}`)
    await expect(actor.mutation(api.decks.syncWrite, args)).rejects.toMatchObject({
      data: { code },
    })
  })

  it("reuses deck capacity and released-game validation", async () => {
    const t = convexTest(schema, modules)
    const owner = await synced(t, "limited-owner")
    await owner.mutation(
      api.decks.syncWrite,
      writeArgs(firstSyncId, "abababab-abab-4bab-8bab-abababababab"),
    )
    const lastSlot = writeArgs(secondSyncId, "acacacac-acac-4cac-8cac-acacacacacac")
    const created = await owner.mutation(api.decks.syncWrite, lastSlot)
    if ("status" in created) throw new Error("expected successful sync write")
    await expect(owner.mutation(api.decks.syncWrite, lastSlot)).resolves.toEqual(created)
    await expect(
      owner.mutation(
        api.decks.syncWrite,
        writeArgs(thirdSyncId, "adadadad-adad-4dad-8dad-adadadadadad"),
      ),
    ).rejects.toMatchObject({ data: { code: "deck_limit_reached" } })

    const gated = await synced(t, "gated-owner")
    await t.mutation(internal.integrationManifest.setCapabilityOverride, {
      game: "ygo",
      capability: "deckImport",
      release: "disabled",
      note: "Sync gate test",
    })
    await expect(
      gated.mutation(
        api.decks.syncWrite,
        writeArgs(thirdSyncId, "aeaeaeae-aeae-4eae-8eae-aeaeaeaeaeae", 0, {
          game: "ygo",
          format: "advanced",
        }),
      ),
    ).rejects.toMatchObject({ data: { code: "capability_unavailable" } })
  })
})

const syncCard = {
  name: "Card",
  oracleId: "11111111-1111-4111-8111-111111111111",
  scryfallId: "22222222-2222-4222-8222-222222222222",
  quantity: 4,
}
const otherCard = { ...syncCard, name: "Other", quantity: 2 }
const oversized = Array.from({ length: 301 }, (unused, index) => ({
  ...syncCard,
  scryfallId: `aaaaaaaa-aaaa-4aaa-8aaa-${(index + 1).toString().padStart(12, "0")}`,
}))

function versionArgs(
  deckId: string,
  versionId: string,
  operationId: string,
  expectedRevision: number,
  overrides: { cards?: (typeof syncCard)[]; returnConflict?: boolean } = {},
) {
  return {
    deckId,
    versionId,
    operationId,
    expectedRevision,
    cards: [syncCard],
    ...overrides,
  }
}

describe("deck version sync", () => {
  async function seedVersion(t: ReturnType<typeof convexTest>, subject: string) {
    const actor = await synced(t, subject)
    const deckId = await actor.mutation(api.decks.create, { name: "Deck", format: "commander" })
    const versionId = await actor.mutation(api.decks.saveVersion, {
      deckId,
      cards: [syncCard],
    })
    return { actor, deckId, versionId }
  }

  it("replays a lost response identically without extra revisions", async () => {
    const t = convexTest(schema, modules)
    const { actor, deckId, versionId } = await seedVersion(t, "version-replay-owner")
    const args = versionArgs(deckId, versionId, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", 2)
    const saved = await actor.mutation(api.decks.syncVersionWrite, args)
    expect(saved).toMatchObject({ deckId, versionId, revision: 2, cardCount: 1 })
    await expect(actor.mutation(api.decks.syncVersionWrite, args)).resolves.toEqual(saved)
    const stored = await t.run(async (ctx) => {
      const version = await ctx.db.get(versionId)
      const receipts = await ctx.db.query("deckVersionSyncReceipts").collect()
      return { version, receipts }
    })
    expect(stored.version).toMatchObject({ syncRevision: 2 })
    expect(stored.receipts).toHaveLength(1)
  })

  it("rejects reused operation IDs with a different payload", async () => {
    const t = convexTest(schema, modules)
    const { actor, deckId, versionId } = await seedVersion(t, "version-mismatch-owner")
    const args = versionArgs(deckId, versionId, "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", 2)
    await actor.mutation(api.decks.syncVersionWrite, { ...args, cards: [otherCard] })
    await expect(actor.mutation(api.decks.syncVersionWrite, args)).rejects.toMatchObject({
      data: { code: "sync_operation_mismatch" },
    })
    const stored = await t.run(async (ctx) => await ctx.db.get(versionId))
    expect(stored).toMatchObject({ syncRevision: 3 })
  })

  it("conflicts on stale revisions after legacy writes and recovers", async () => {
    const t = convexTest(schema, modules)
    const { actor, deckId, versionId } = await seedVersion(t, "version-stale-owner")
    await actor.mutation(api.decks.saveVersion, { deckId, cards: [otherCard] })
    const stale = versionArgs(deckId, versionId, "cccccccc-cccc-4ccc-8ccc-cccccccccccc", 1)
    await expect(actor.mutation(api.decks.syncVersionWrite, stale)).rejects.toMatchObject({
      data: { code: "sync_conflict" },
    })
    await expect(
      actor.mutation(api.decks.syncVersionWrite, { ...stale, returnConflict: true }),
    ).resolves.toMatchObject({ status: "conflict", version: { versionId, revision: 3 } })
    await expect(
      actor.mutation(api.decks.syncVersionWrite, { ...stale, expectedRevision: 3 }),
    ).resolves.toMatchObject({ versionId, revision: 4 })
    await actor.mutation(api.decks.updateVersion, { versionId, name: "Renamed" })
    const kicked = versionArgs(deckId, versionId, "cdcdcdcd-cdcd-4cdd-8cdd-cdcdcdcdcdcd", 1)
    await expect(actor.mutation(api.decks.syncVersionWrite, kicked)).rejects.toMatchObject({
      data: { code: "sync_conflict" },
    })
    await expect(
      actor.mutation(api.decks.syncVersionWrite, {
        ...kicked,
        expectedRevision: 5,
        cards: [otherCard],
      }),
    ).resolves.toMatchObject({ versionId, revision: 6 })
  })

  it("returns a recoverable conflict for saves to archived versions", async () => {
    const t = convexTest(schema, modules)
    const { actor, deckId, versionId } = await seedVersion(t, "version-archived-owner")
    await t.run(async (ctx) => await ctx.db.patch(versionId, { archivedAt: Date.now() }))
    const pending = versionArgs(deckId, versionId, "dddddddd-dddd-4ddd-8ddd-dddddddddddd", 2)
    await expect(actor.mutation(api.decks.syncVersionWrite, pending)).rejects.toMatchObject({
      data: { code: "sync_conflict" },
    })
    await expect(
      actor.mutation(api.decks.syncVersionWrite, { ...pending, returnConflict: true }),
    ).resolves.toMatchObject({ status: "conflict", version: { versionId, deleted: true } })
  })

  it("rejects pending saves to archived decks", async () => {
    const t = convexTest(schema, modules)
    const { actor, deckId, versionId } = await seedVersion(t, "version-deck-gone-owner")
    await actor.mutation(api.decks.archive, { deckId })
    await expect(
      actor.mutation(
        api.decks.syncVersionWrite,
        versionArgs(deckId, versionId, "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", 2),
      ),
    ).rejects.toMatchObject({ data: { code: "deck_archived" } })
  })

  it("isolates version saves by owner and requires authentication", async () => {
    const t = convexTest(schema, modules)
    const { deckId, versionId } = await seedVersion(t, "version-isolated-owner")
    const stranger = await synced(t, "version-owner-second")
    await expect(
      stranger.mutation(
        api.decks.syncVersionWrite,
        versionArgs(deckId, versionId, "12121212-1212-4212-8212-121212121212", 2),
      ),
    ).rejects.toMatchObject({ data: { code: "deck_not_found" } })
    await expect(t.query(api.decks.listMine, {})).rejects.toMatchObject({
      data: { code: "unauthenticated" },
    })
  })

  it("keeps canonical no-op saves from advancing revisions", async () => {
    const t = convexTest(schema, modules)
    const { actor, deckId, versionId } = await seedVersion(t, "version-noop-owner")
    await expect(
      actor.mutation(
        api.decks.syncVersionWrite,
        versionArgs(deckId, versionId, "abababab-abab-4bab-8bab-abababababab", 2),
      ),
    ).resolves.toMatchObject({ versionId, revision: 2, cardCount: 1 })
    const stored = await t.run(async (ctx) => await ctx.db.get(versionId))
    expect(stored).toMatchObject({ syncRevision: 2 })
  })

  it("bounds card payloads and rejects malformed identifiers", async () => {
    const t = convexTest(schema, modules)
    const { actor, deckId, versionId } = await seedVersion(t, "version-bounds-owner")
    await expect(
      actor.mutation(
        api.decks.syncVersionWrite,
        versionArgs(deckId, versionId, "bcbcacad-bcbc-4cbc-8cbc-bcbcbcbcbcba", 2, {
          cards: oversized,
        }),
      ),
    ).rejects.toMatchObject({ data: { code: "deck_too_large" } })
    await expect(
      actor.mutation(
        api.decks.syncVersionWrite,
        versionArgs(deckId, "NOT-A-UUID", "bcbcacab-bcbc-4cbc-8cbc-bcbcbcbcbcbb", 2),
      ),
    ).rejects.toMatchObject({ data: { code: "invalid_version_id" } })
    await expect(
      actor.mutation(
        api.decks.syncVersionWrite,
        versionArgs(
          "unknown-deck",
          "88888888-8888-4888-8888-888888888882",
          "bcbcacac-bcbc-4cbc-8cbc-bcbcbcbcbcbc",
          2,
        ),
      ),
    ).rejects.toMatchObject({ data: { code: "invalid_sync_id" } })
    await expect(
      actor.mutation(
        api.decks.syncVersionWrite,
        versionArgs(deckId, versionId, "bcbcbcbc-bcbc-4cbc-8cbc-bcbcbcbcbcbc", -1),
      ),
    ).rejects.toMatchObject({ data: { code: "invalid_revision" } })
  })
})
