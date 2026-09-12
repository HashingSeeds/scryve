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
    expect(created.id).toBe(args.id)
    await expect(owner.mutation(api.decks.syncWrite, args)).resolves.toEqual(created)
    const updated = await owner.mutation(api.decks.syncWrite, {
      ...args,
      id: args.id.toUpperCase(),
      operationId: "bcdefabc-bcde-4bcd-8bcd-bcdefabcdefa",
      expectedRevision: 1,
      name: "Renamed",
    })
    expect(updated).toMatchObject({ deckId: created.deckId, revision: 2, name: "Renamed" })
  })

  it("creates once and replays the original receipt after later edits and deletion", async () => {
    const t = convexTest(schema, modules)
    const actor = await synced(t, "replay-owner")
    const createArgs = writeArgs(firstSyncId, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")

    const created = await actor.mutation(api.decks.syncWrite, createArgs)
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
    expect(otherDeck.deckId).not.toBe(ownerDeck.deckId)

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
