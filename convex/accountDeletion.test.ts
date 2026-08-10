import { convexTest } from "convex-test"

import { api, internal } from "./_generated/api"
import schema from "./schema"

const modules = {
  "./_generated/api.ts": async () => jest.requireActual("./_generated/api"),
  "./_generated/server.ts": async () => jest.requireActual("./_generated/server"),
  "./accountDeletion.ts": async () => jest.requireActual("./accountDeletion"),
  "./accountDeletionActions.ts": async () => jest.requireActual("./accountDeletionActions"),
  "./games.ts": async () => jest.requireActual("./games"),
  "./users.ts": async () => jest.requireActual("./users"),
}

const inviteToken = "d".repeat(43)

describe("account deletion", () => {
  const previousClerkSecret = process.env.CLERK_SECRET_KEY

  beforeAll(() => {
    process.env.CLERK_SECRET_KEY = "sk_test_account_deletion"
  })
  afterAll(() => {
    if (previousClerkSecret === undefined) delete process.env.CLERK_SECRET_KEY
    else process.env.CLERK_SECRET_KEY = previousClerkSecret
  })
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    jest.clearAllTimers()
    jest.useRealTimers()
  })

  it("unlinks one account while preserving anonymized history for the other player", async () => {
    const t = convexTest(schema, modules)
    const host = t.withIdentity({ subject: "deleting-host" })
    const otherPlayer = t.withIdentity({ subject: "remaining-player" })
    await host.mutation(api.users.syncCurrent, {
      displayName: "Alice",
      avatarUrl: "https://images.example.test/alice.png",
    })
    await otherPlayer.mutation(api.users.syncCurrent, { displayName: "Bob" })
    await host.mutation(api.games.createLobby, {
      publicId: "deletion-game-123456",
      playerCount: 2,
      startingLife: 40,
      ruleset: "commander",
      inviteToken,
      manualCodeCandidates: ["DEL234"],
      hostDisplayName: "Alice",
      hostColor: "#7C3AED",
      deviceId: "device-alice-001",
    })
    await otherPlayer.mutation(api.games.claimSeat, {
      token: inviteToken,
      displayName: "Bob",
      color: "#2563EB",
      deviceId: "device-bob-0001",
    })
    await host.mutation(api.games.startGame, { publicId: "deletion-game-123456" })
    const projection = await host.query(api.games.lobbyProjection, {
      publicId: "deletion-game-123456",
      deviceId: "device-alice-001",
    })
    const alice = projection.players.find((player) => player.displayName === "Alice")!
    await host.mutation(api.games.changeLife, {
      publicId: "deletion-game-123456",
      playerId: alice.playerId,
      operationId: "deletion-operation-0001",
      delta: -5,
      deviceId: "device-alice-001",
      clientCreatedAt: 1_700_000_000_000,
    })
    await host.mutation(api.games.finishGame, { publicId: "deletion-game-123456" })

    const request = await host.mutation(api.accountDeletion.requestCurrentAccountDeletion, {
      confirmation: "DELETE",
    })
    await t.mutation(internal.accountDeletion.processMemberships, {
      requestId: request.requestId,
    })
    await t.mutation(internal.accountDeletion.processMemberships, {
      requestId: request.requestId,
    })
    await t.mutation(internal.accountDeletion.processEvents, { requestId: request.requestId })
    await t.mutation(internal.accountDeletion.processEvents, { requestId: request.requestId })
    await t.mutation(internal.accountDeletion.finalizeAppData, { requestId: request.requestId })

    const databaseState = await t.run(async (ctx) => ({
      users: await ctx.db.query("users").collect(),
      game: await ctx.db
        .query("games")
        .withIndex("by_public_id", (q) => q.eq("publicId", "deletion-game-123456"))
        .unique(),
      players: await ctx.db.query("gamePlayers").collect(),
      events: await ctx.db.query("gameEvents").collect(),
      summary: await ctx.db
        .query("gameSummaries")
        .withIndex("by_public_id", (q) => q.eq("publicId", "deletion-game-123456"))
        .unique(),
    }))
    expect(databaseState.users.map((user) => user.displayName)).toEqual(["Bob"])
    expect(databaseState.game?.hostUserId).toBeUndefined()
    const deletedPlayer = databaseState.players.find((player) => player.seat === 1)!
    const remainingPlayer = databaseState.players.find((player) => player.seat === 2)!
    expect(deletedPlayer).toMatchObject({
      displayName: "Deleted player",
      resumable: false,
    })
    expect(deletedPlayer.userId).toBeUndefined()
    expect(deletedPlayer.avatarUrl).toBeUndefined()
    expect(deletedPlayer.deviceId).toBeUndefined()
    expect(deletedPlayer.deletedAt).toEqual(expect.any(Number))
    expect(remainingPlayer.userId).toBeDefined()
    expect(databaseState.events[0]).toMatchObject({ playerId: deletedPlayer._id, delta: -5 })
    expect(databaseState.events[0].actorUserId).toBeUndefined()
    expect(databaseState.events[0].deviceId).toBeUndefined()
    expect(databaseState.summary?.players).toEqual([
      expect.objectContaining({
        playerId: deletedPlayer._id,
        displayName: "Deleted player",
        deletedAt: expect.any(Number),
        finalLife: 35,
      }),
      expect.objectContaining({ playerId: remainingPlayer._id, displayName: "Bob", finalLife: 40 }),
    ])

    const history = await otherPlayer.query(api.games.connectedHistory, {
      paginationOpts: { cursor: null, numItems: 10 },
    })
    expect(history.page).toHaveLength(1)
    expect(history.page[0].players[0]).toMatchObject({ displayName: "Deleted player" })
    const summary = await otherPlayer.query(api.games.connectedSummary, {
      publicId: "deletion-game-123456",
    })
    expect(summary?.players[0]).toMatchObject({ displayName: "Deleted player" })
    await expect(
      host.query(api.games.connectedHistory, {
        paginationOpts: { cursor: null, numItems: 10 },
      }),
    ).rejects.toThrow("Account deletion is in progress")
  })

  it("accepts deletion for a Clerk identity that has no Count projection", async () => {
    const t = convexTest(schema, modules)
    const actor = t.withIdentity({ subject: "clerk-only-user" })
    const result = await actor.mutation(api.accountDeletion.requestCurrentAccountDeletion, {
      confirmation: "DELETE",
    })
    expect(result.status).toBe("identity_pending")
    await expect(
      actor.query(api.accountDeletion.currentAccountDeletion, {}),
    ).resolves.toMatchObject({ status: "identity_pending" })
  })

  it("fails before changing data when Clerk deletion is not configured", async () => {
    delete process.env.CLERK_SECRET_KEY
    const t = convexTest(schema, modules)
    const actor = t.withIdentity({ subject: "configuration-check-user" })
    await actor.mutation(api.users.syncCurrent, { displayName: "Configured later" })
    await expect(
      actor.mutation(api.accountDeletion.requestCurrentAccountDeletion, {
        confirmation: "DELETE",
      }),
    ).rejects.toThrow("temporarily unavailable")
    expect(await t.run((ctx) => ctx.db.query("users").collect())).toHaveLength(1)
    expect(await t.run((ctx) => ctx.db.query("accountDeletionRequests").collect())).toHaveLength(0)
    process.env.CLERK_SECRET_KEY = "sk_test_account_deletion"
  })
})
