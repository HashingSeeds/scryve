import { convexTest } from "convex-test"

import { api, internal } from "./_generated/api"
import schema from "./schema"

const modules = {
  "./_generated/api.ts": async () => jest.requireActual("./_generated/api"),
  "./_generated/server.ts": async () => jest.requireActual("./_generated/server"),
  "./decks.ts": async () => jest.requireActual("./decks"),
  "./entitlements.ts": async () => jest.requireActual("./entitlements"),
  "./games.ts": async () => jest.requireActual("./games"),
  "./users.ts": async () => jest.requireActual("./users"),
}

const inviteToken = "t".repeat(43)
const hostDeviceId = "device-host-0001"

async function synced(t: ReturnType<typeof convexTest>, subject: string, name: string) {
  const actor = t.withIdentity({ subject })
  await actor.mutation(api.users.syncCurrent, { displayName: name })
  return actor
}

describe("premium deck tracking", () => {
  it("creates an imported deck and its first version atomically", async () => {
    const t = convexTest(schema, modules)
    const actor = await synced(t, "import-owner", "Import Owner")
    const deckId = await actor.mutation(api.decks.importResolved, {
      name: "Imported Commander",
      format: "commander",
      cards: [
        {
          oracleId: "11111111-1111-1111-1111-111111111111",
          scryfallId: "22222222-2222-2222-2222-222222222222",
          name: "Imported Card",
          imageUrl: "https://cards.scryfall.io/example.jpg",
          smallImageUrl: "https://cards.scryfall.io/small/example.jpg",
          quantity: 1,
          board: "commander",
        },
      ],
    })
    await expect(actor.query(api.decks.detail, { deckId })).resolves.toMatchObject({
      deck: { name: "Imported Commander", format: "commander" },
      version: { versionNumber: 1 },
      cards: [
        {
          name: "Imported Card",
          board: "commander",
          quantity: 1,
          imageUrl: "https://cards.scryfall.io/example.jpg",
          smallImageUrl: "https://cards.scryfall.io/small/example.jpg",
        },
      ],
    })
    await expect(actor.query(api.decks.listMine)).resolves.toMatchObject({
      decks: [{ coverImageUrl: "https://cards.scryfall.io/small/example.jpg" }],
    })
  })

  it("keeps one deck free and unlocks additional decks through server entitlements", async () => {
    const t = convexTest(schema, modules)
    const actor = await synced(t, "deck-owner", "Deck Owner")
    await expect(
      actor.mutation(api.decks.create, { name: "First", format: "commander" }),
    ).resolves.toBeDefined()
    await expect(actor.query(api.decks.listMine)).resolves.toMatchObject({
      capacity: { used: 1, limit: 1, premium: false, canCreate: false },
    })
    await expect(
      actor.mutation(api.decks.create, { name: "Second", format: "commander" }),
    ).rejects.toMatchObject({
      data: { code: "deck_limit_reached", message: "Premium is required for additional decks" },
    })
    await t.mutation(internal.entitlements.setUserFeature, {
      clerkUserId: "deck-owner",
      feature: "unlimited_decks",
      enabled: true,
      source: "test",
    })
    await expect(
      actor.mutation(api.decks.create, { name: "Second", format: "commander" }),
    ).resolves.toBeDefined()
    await expect(actor.query(api.decks.listMine)).resolves.toMatchObject({
      decks: [{ game: "mtg" }, { game: "mtg" }],
      capacity: { used: 2, premium: true, canCreate: true },
    })
  })

  it("frees capacity when a deck is deleted and refuses further edits", async () => {
    const t = convexTest(schema, modules)
    const actor = await synced(t, "archive-owner", "Archive Owner")
    const deckId = await actor.mutation(api.decks.create, { name: "Retired", format: "commander" })
    await expect(actor.mutation(api.decks.archive, { deckId })).resolves.toBeNull()
    await expect(actor.query(api.decks.listMine)).resolves.toMatchObject({
      decks: [],
      capacity: { used: 0, canCreate: true },
    })
    await expect(actor.mutation(api.decks.archive, { deckId })).rejects.toMatchObject({
      data: { code: "deck_already_archived" },
    })
    await expect(
      actor.mutation(api.decks.saveVersion, {
        deckId,
        cards: [
          {
            oracleId: "11111111-1111-1111-1111-111111111111",
            scryfallId: "22222222-2222-2222-2222-222222222222",
            name: "Retired Card",
            quantity: 1,
            board: "commander",
          },
        ],
      }),
    ).rejects.toMatchObject({ data: { code: "deck_archived" } })
  })

  it("snapshots a selected deck version and records an explicit winning result", async () => {
    const t = convexTest(schema, modules)
    const host = await synced(t, "host", "Host")
    const joiner = await synced(t, "joiner", "Joiner")
    const deckId = await host.mutation(api.decks.create, { name: "Dragons", format: "commander" })
    const deckVersionId = await host.mutation(api.decks.saveVersion, {
      deckId,
      cards: [
        {
          oracleId: "11111111-1111-1111-1111-111111111111",
          scryfallId: "22222222-2222-2222-2222-222222222222",
          name: "Dragon Test Card",
          quantity: 1,
          board: "commander",
        },
      ],
    })
    const created = await host.mutation(api.games.createLobby, {
      publicId: "deck-game-public-1234",
      playerCount: 2,
      startingLife: 40,
      ruleset: "commander",
      inviteToken,
      manualCodeCandidates: ["ABC234"],
      hostDisplayName: "Host",
      hostColor: "#7C3AED",
      deviceId: hostDeviceId,
    })
    await joiner.mutation(api.games.claimSeat, {
      token: inviteToken,
      displayName: "Joiner",
      color: "#2563EB",
    })
    await host.mutation(api.decks.selectForSeat, {
      publicId: created.publicId,
      seat: 1,
      deckVersionId,
    })
    const lobby = await host.query(api.games.lobbyProjection, {
      publicId: created.publicId,
      deviceId: hostDeviceId,
    })
    const hostPlayer = lobby.players.find((player) => player.seat === 1)!
    await host.mutation(api.games.startGame, { publicId: created.publicId })
    await host.mutation(api.games.finishGame, {
      publicId: created.publicId,
      result: { kind: "win", winnerPlayerIds: [hostPlayer.playerId] },
    })
    const summary = await host.query(api.games.connectedSummary, { publicId: created.publicId })
    expect(summary?.players.find((player) => player.seat === 1)).toMatchObject({
      deckId,
      deckVersionId,
      deckNameAtFinish: "Dragons",
      deckVersionNumber: 1,
      outcome: "win",
    })
    expect(summary?.players.find((player) => player.seat === 2)?.outcome).toBe("loss")
    await expect(host.query(api.decks.stats, { deckId })).resolves.toEqual({ locked: true })
    await t.mutation(internal.entitlements.setUserFeature, {
      clerkUserId: "host",
      feature: "deck_analytics",
      enabled: true,
      source: "test",
    })
    await expect(host.query(api.decks.stats, { deckId })).resolves.toMatchObject({
      locked: false,
      games: 1,
      wins: 1,
      losses: 0,
    })
  })

  it("accepts authoritative Clerk username projections", async () => {
    const t = convexTest(schema, modules)
    await t.mutation(internal.users.syncFromClerk, {
      clerkUserId: "clerk-user",
      displayName: "Ada Lovelace",
      username: "ada_lovelace",
      avatarUrl: "https://example.test/ada.png",
    })
    const user = await t.run(
      async (ctx) =>
        await ctx.db
          .query("users")
          .withIndex("by_clerk_user", (q) => q.eq("clerkUserId", "clerk-user"))
          .unique(),
    )
    expect(user).toMatchObject({
      displayName: "Ada Lovelace",
      username: "ada_lovelace",
      usernameNormalized: "ada_lovelace",
    })
  })

  it("limits free history while preserving older games for a later premium unlock", async () => {
    const t = convexTest(schema, modules)
    const actor = await synced(t, "history-owner", "History Owner")
    await t.run(async (ctx) => {
      const user = await ctx.db
        .query("users")
        .withIndex("by_clerk_user", (q) => q.eq("clerkUserId", "history-owner"))
        .unique()
      for (let index = 0; index < 11; index += 1) {
        const gameId = await ctx.db.insert("games", {
          publicId: `history-game-${String(index).padStart(16, "0")}`,
          hostUserId: user!._id,
          mode: "connected",
          status: "finished",
          playerCount: 2,
          startingLife: 20,
          ruleset: "standard",
          createdAt: index,
          updatedAt: index,
        })
        const summaryId = await ctx.db.insert("gameSummaries", {
          gameId,
          publicId: `history-game-${String(index).padStart(16, "0")}`,
          terminalStatus: "finished",
          startingLife: 20,
          ruleset: "standard",
          eventCount: 0,
          finishedAt: index,
          players: [],
        })
        await ctx.db.insert("gameHistoryEntries", {
          userId: user!._id,
          gameId,
          summaryId,
          finishedAt: index,
          outcome: "unknown",
        })
      }
    })
    const freeHistory = await actor.query(api.games.connectedHistory, {
      paginationOpts: { cursor: null, numItems: 20 },
    })
    expect(freeHistory.page).toHaveLength(10)
    expect(freeHistory).toMatchObject({ premium: false, hasLockedHistory: true, isDone: true })
    await t.mutation(internal.entitlements.setUserFeature, {
      clerkUserId: "history-owner",
      feature: "full_history",
      enabled: true,
      source: "test",
    })
    const premiumHistory = await actor.query(api.games.connectedHistory, {
      paginationOpts: { cursor: null, numItems: 20 },
    })
    expect(premiumHistory.page).toHaveLength(11)
    expect(premiumHistory).toMatchObject({ premium: true, hasLockedHistory: false, isDone: true })
  })
})
