import type { FunctionArgs } from "convex/server"

import { makeConvexTest, signedIn, type ConvexTestHarness } from "../test/convexTest"
import { api, internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"

const localId = "00000000-0000-4000-8000-000000000001"
function card(name: string, id: number, quantity = 1) {
  const hex = id.toString(16).padStart(12, "0")
  return {
    name,
    quantity,
    oracleId: `00000000-0000-4000-8000-${hex}`,
    scryfallId: `00000000-0000-4000-9000-${hex}`,
  }
}
const bolt = [card("Lightning Bolt", 1, 4)]
const shock = [card("Shock", 2, 4)]
const burn = [card("Lava Spike", 3, 4)]

function guest(
  versions: { name: string; note?: string; cards: ReturnType<typeof card>[] }[],
  overrides: Partial<FunctionArgs<typeof api.decks.importGuest>> = {},
): FunctionArgs<typeof api.decks.importGuest> {
  return {
    localId,
    localUpdatedAt: 1,
    name: "Burn",
    format: "modern",
    cards: versions[versions.length - 1].cards,
    versions,
    ...overrides,
  }
}

async function imported(
  actor: Awaited<ReturnType<typeof signedIn>>,
  args: FunctionArgs<typeof api.decks.importGuest>,
) {
  const result = await actor.mutation(api.decks.importGuest, args)
  if (result.status !== "imported") throw new Error(`Expected import, got ${result.status}`)
  return result.deckId
}

async function storedVersions(t: ConvexTestHarness, deckId: Id<"decks">) {
  return t.run(async (ctx) => {
    const versions = await ctx.db
      .query("deckVersions")
      .withIndex("by_deck_and_version_number", (q) => q.eq("deckId", deckId))
      .collect()
    return Promise.all(
      versions.map(async (version) => ({
        id: version._id,
        number: version.versionNumber,
        name: version.name,
        note: version.note,
        archived: version.archivedAt !== undefined,
        cards: (
          await ctx.db
            .query("deckCards")
            .withIndex("by_deck_version", (q) => q.eq("deckVersionId", version._id))
            .collect()
        ).map((row) => row.name),
      })),
    )
  })
}

async function expectedVersions(actor: Awaited<ReturnType<typeof signedIn>>, deckId: Id<"decks">) {
  const { versions } = await actor.query(api.decks.detail, { deckId })
  return versions.map((version) => ({ id: version._id, updatedAt: version.updatedAt }))
}

describe("importGuest with versions", () => {
  it("writes every version in order", async () => {
    const t = makeConvexTest()
    const actor = await signedIn(t, "owner")
    const deckId = await imported(
      actor,
      guest([
        { name: "Current", cards: bolt },
        { name: "Tuned", note: "More reach", cards: shock },
      ]),
    )
    expect(await storedVersions(t, deckId)).toEqual([
      expect.objectContaining({ number: 1, name: "Current", cards: ["Lightning Bolt"] }),
      expect.objectContaining({ number: 2, name: "Tuned", note: "More reach", cards: ["Shock"] }),
    ])
  })

  it("writes nothing when a later version fails", async () => {
    const t = makeConvexTest()
    const actor = await signedIn(t, "owner")
    await expect(
      actor.mutation(
        api.decks.importGuest,
        guest([
          { name: "Current", cards: bolt },
          { name: " ", cards: shock },
        ]),
      ),
    ).rejects.toThrow("Version name")
    await t.run(async (ctx) => {
      expect(await ctx.db.query("decks").collect()).toEqual([])
      expect(await ctx.db.query("deckVersions").collect()).toEqual([])
      expect(await ctx.db.query("deckCards").collect()).toEqual([])
    })
  })

  it("refuses versions past the account limit and writes nothing", async () => {
    const t = makeConvexTest()
    const actor = await signedIn(t, "owner")
    await expect(
      actor.mutation(
        api.decks.importGuest,
        guest([
          { name: "One", cards: bolt },
          { name: "Two", cards: shock },
          { name: "Three", cards: burn },
        ]),
      ),
    ).resolves.toEqual({
      status: "version_limit",
      capacity: { used: 3, limit: 2, premium: false, canCreate: false },
    })
    await t.run(async (ctx) => {
      expect(await ctx.db.query("decks").collect()).toEqual([])
      expect(await ctx.db.query("deckVersions").collect()).toEqual([])
    })
    await t.mutation(internal.entitlements.setUserFeature, {
      clerkUserId: "owner",
      feature: "deck_versions",
      enabled: true,
      source: "test",
    })
    await expect(
      actor.mutation(
        api.decks.importGuest,
        guest([
          { name: "One", cards: bolt },
          { name: "Two", cards: shock },
          { name: "Three", cards: burn },
        ]),
      ),
    ).resolves.toMatchObject({ status: "imported" })
  })

  it("rejects versions that do not end with the current cards", async () => {
    const t = makeConvexTest()
    const actor = await signedIn(t, "owner")
    await expect(
      actor.mutation(api.decks.importGuest, {
        ...guest([{ name: "Current", cards: bolt }]),
        cards: shock,
      }),
    ).rejects.toThrow('"code":"invalid_versions"')
  })

  it("replaces a revived deck's versions, keeping the id of an unchanged one", async () => {
    const t = makeConvexTest()
    const actor = await signedIn(t, "owner")
    const deckId = await imported(
      actor,
      guest([
        { name: "Current", cards: bolt },
        { name: "Tuned", cards: shock },
      ]),
    )
    const [kept] = await storedVersions(t, deckId)
    const versions = await expectedVersions(actor, deckId)
    await actor.mutation(api.decks.moveToDevice, {
      deckId,
      expectedRevision: 0,
      expectedVersion: versions[versions.length - 1],
      expectedVersions: versions,
    })
    const revived = await imported(
      actor,
      guest(
        [
          { name: "Renamed", cards: bolt },
          { name: "Burn", cards: burn },
        ],
        { deckKey: localId, movedFromAccount: true, localUpdatedAt: 2 },
      ),
    )
    expect(revived).toBe(deckId)
    expect(await storedVersions(t, deckId)).toEqual([
      expect.objectContaining({ id: kept.id, number: 1, name: "Renamed", archived: false }),
      expect.objectContaining({ number: 2, name: "Tuned", archived: true }),
      expect.objectContaining({ number: 3, name: "Burn", cards: ["Lava Spike"], archived: false }),
    ])
    expect((await actor.query(api.decks.detail, { deckId })).cards).toEqual([
      expect.objectContaining({ name: "Lava Spike" }),
    ])
  })

  it("matches a live deck only when every version matches", async () => {
    const t = makeConvexTest()
    const actor = await signedIn(t, "owner")
    const both = [
      { name: "Current", cards: bolt },
      { name: "Tuned", cards: shock },
    ]
    await imported(actor, guest(both, { deckKey: "burn" }))
    const otherDevice = { deckKey: "burn", localId: "00000000-0000-4000-8000-000000000002" }
    await expect(
      actor.mutation(api.decks.importGuest, guest(both, { ...otherDevice, localUpdatedAt: 5 })),
    ).resolves.toMatchObject({ status: "already_imported", localUpdatedAt: 5 })
    await expect(
      actor.mutation(
        api.decks.importGuest,
        guest([{ name: "Tuned", cards: shock }], { ...otherDevice, localUpdatedAt: 5 }),
      ),
    ).resolves.toMatchObject({ status: "already_imported", localUpdatedAt: null })
  })
})

describe("importGuest without versions", () => {
  it("keeps the single-list behavior installed clients rely on", async () => {
    const t = makeConvexTest()
    const actor = await signedIn(t, "owner")
    const deckId = await imported(
      actor,
      guest(
        [
          { name: "Current", cards: bolt },
          { name: "Tuned", cards: shock },
        ],
        { deckKey: "burn" },
      ),
    )
    const legacy = { ...guest([{ name: "Current", cards: shock }]), versions: undefined }
    await expect(
      actor.mutation(api.decks.importGuest, {
        ...legacy,
        deckKey: "burn",
        localId: "00000000-0000-4000-8000-000000000002",
        localUpdatedAt: 5,
      }),
    ).resolves.toMatchObject({ status: "already_imported", localUpdatedAt: 5 })

    const fresh = await imported(actor, {
      ...legacy,
      localId: "00000000-0000-4000-8000-000000000003",
    })
    expect(await storedVersions(t, fresh)).toEqual([
      expect.objectContaining({ number: 1, name: "Current", cards: ["Shock"] }),
    ])
    expect(deckId).not.toBe(fresh)
  })
})

describe("moveToDevice", () => {
  async function twoVersions(t: ConvexTestHarness) {
    const actor = await signedIn(t, "owner")
    const deckId = await imported(
      actor,
      guest([
        { name: "Current", cards: bolt },
        { name: "Tuned", cards: shock },
      ]),
    )
    const versions = await expectedVersions(actor, deckId)
    jest.spyOn(Date, "now").mockReturnValue(versions[0].updatedAt + 1)
    await actor.mutation(api.decks.saveVersion, { deckId, versionId: versions[0].id, cards: burn })
    jest.restoreAllMocks()
    return { actor, deckId, versions }
  }

  it("fails when an older version changed after the device read it", async () => {
    const t = makeConvexTest()
    const { actor, deckId, versions } = await twoVersions(t)
    await expect(
      actor.mutation(api.decks.moveToDevice, {
        deckId,
        expectedRevision: 0,
        expectedVersion: versions[1],
        expectedVersions: versions,
      }),
    ).rejects.toThrow('"code":"sync_conflict"')
    expect((await t.run(async (ctx) => ctx.db.get(deckId)))?.archivedAt).toBeUndefined()
  })

  it("still checks only the latest version for installed clients", async () => {
    const t = makeConvexTest()
    const { actor, deckId, versions } = await twoVersions(t)
    await expect(
      actor.mutation(api.decks.moveToDevice, {
        deckId,
        expectedRevision: 0,
        expectedVersion: versions[1],
      }),
    ).resolves.toMatchObject({ deleted: true })
  })
})
