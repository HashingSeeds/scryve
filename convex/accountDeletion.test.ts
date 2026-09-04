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
    const alice = projection.players.find((player) => player.controlledByMe)!
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
      expect.objectContaining({
        playerId: remainingPlayer._id,
        displayName: "Player 2",
        finalLife: 40,
      }),
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

  it("anonymizes moderation-linked data in bounded, retryable phases", async () => {
    const t = convexTest(schema, modules)
    const host = t.withIdentity({ subject: "moderation-deleting-host" })
    const now = 1_700_000_000_000
    const dismissedEvidence = {
      note: "private note",
      matchedTerms: ["term"],
      resolutionNote: "not substantiated",
      autoAction: "held_on_filter" as const,
      gameId: undefined,
    }
    const fixture = await t.run(async (ctx) => {
      const deletingUserId = await ctx.db.insert("users", {
        clerkUserId: "moderation-deleting-host",
        displayName: "Deleting player",
        username: "deleting-player",
        createdAt: now,
        updatedAt: now,
      })
      const remainingUserId = await ctx.db.insert("users", {
        clerkUserId: "moderation-remaining-player",
        displayName: "Remaining player",
        username: "remaining-player",
        createdAt: now,
        updatedAt: now,
      })
      const gameId = await ctx.db.insert("games", {
        publicId: "moderation-deletion-game",
        hostUserId: deletingUserId,
        mode: "connected",
        status: "active",
        playerCount: 2,
        startingLife: 40,
        ruleset: "commander",
        game: "mtg",
        system: "mtg",
        format: "commander",
        createdAt: now,
        updatedAt: now,
      })
      const deletingPlayerId = await ctx.db.insert("gamePlayers", {
        gameId,
        seat: 1,
        userId: deletingUserId,
        deviceId: "device-delete-01",
        displayName: "Deleting player",
        color: "#7C3AED",
        currentLife: 40,
        joinedAt: now,
      })
      const remainingPlayerId = await ctx.db.insert("gamePlayers", {
        gameId,
        seat: 2,
        userId: remainingUserId,
        deviceId: "device-remain-01",
        displayName: "Remaining player",
        color: "#2563EB",
        currentLife: 40,
        joinedAt: now,
      })
      const reporterReportId = await ctx.db.insert("moderationReports", {
        reporterUserId: deletingUserId,
        reportedUserId: remainingUserId,
        reportedUsername: "remaining-player",
        reason: "harassment",
        note: "keep this open evidence",
        status: "open",
        createdAt: now,
      })
      const dismissedReportId = await ctx.db.insert("moderationReports", {
        reporterUserId: remainingUserId,
        reportedUserId: deletingUserId,
        reportedUsername: "deleting-player",
        reason: "other",
        ...dismissedEvidence,
        status: "dismissed",
        resolvedAt: now + 1,
        createdAt: now,
      })
      const upheldReportId = await ctx.db.insert("moderationReports", {
        reporterUserId: remainingUserId,
        reportedUserId: deletingUserId,
        reportedUsername: "deleting-player",
        reason: "impersonation",
        note: "bounded upheld evidence",
        matchedTerms: ["identity"],
        resolutionNote: "confirmed",
        status: "upheld",
        resolvedAt: now + 2,
        createdAt: now,
      })
      await ctx.db.insert("userBlocks", {
        blockerUserId: deletingUserId,
        blockedUserId: remainingUserId,
        createdAt: now,
      })
      await ctx.db.insert("userBlocks", {
        blockerUserId: remainingUserId,
        blockedUserId: deletingUserId,
        createdAt: now,
      })
      const actorClaimId = await ctx.db.insert("gameCommanderClaims", {
        gameId,
        operationId: "claim-actor-deletion",
        fromPlayerId: deletingPlayerId,
        toPlayerId: remainingPlayerId,
        delta: 3,
        status: "confirmed",
        actorUserId: deletingUserId,
        deviceId: "device-delete-01",
        clientCreatedAt: now,
        createdAt: now,
        resolvedAt: now + 3,
        resolvedByUserId: remainingUserId,
      })
      const resolverClaimId = await ctx.db.insert("gameCommanderClaims", {
        gameId,
        operationId: "claim-resolver-deletion",
        fromPlayerId: remainingPlayerId,
        toPlayerId: deletingPlayerId,
        delta: 4,
        status: "declined",
        actorUserId: remainingUserId,
        deviceId: "device-remain-01",
        clientCreatedAt: now,
        createdAt: now,
        resolvedAt: now + 4,
        resolvedByUserId: deletingUserId,
      })
      return {
        deletingUserId,
        remainingUserId,
        reporterReportId,
        dismissedReportId,
        upheldReportId,
        actorClaimId,
        resolverClaimId,
      }
    })

    const request = await host.mutation(api.accountDeletion.requestCurrentAccountDeletion, {
      confirmation: "DELETE",
    })
    for (let phase = 0; phase < 7; phase += 1)
      await t.mutation(internal.accountDeletion.processModerationData, {
        requestId: request.requestId,
      })

    const beforeRetry = await t.run(async (ctx) => ({
      reports: await ctx.db.query("moderationReports").take(10),
      blocks: await ctx.db.query("userBlocks").take(10),
      claims: await ctx.db.query("gameCommanderClaims").take(10),
    }))
    await t.mutation(internal.accountDeletion.processModerationData, {
      requestId: request.requestId,
    })
    const afterRetry = await t.run(async (ctx) => ({
      reports: await ctx.db.query("moderationReports").take(10),
      blocks: await ctx.db.query("userBlocks").take(10),
      claims: await ctx.db.query("gameCommanderClaims").take(10),
    }))
    expect(afterRetry).toEqual(beforeRetry)

    const reports = [...beforeRetry.reports].sort((a, b) => a._id.localeCompare(b._id))
    const reporterReport = reports.find((report) => report._id === fixture.reporterReportId)!
    const dismissedReport = reports.find((report) => report._id === fixture.dismissedReportId)!
    const upheldReport = reports.find((report) => report._id === fixture.upheldReportId)!
    expect(reporterReport).toMatchObject({
      reportedUserId: fixture.remainingUserId,
      note: "keep this open evidence",
    })
    expect(reporterReport.reporterUserId).toBeUndefined()
    expect(dismissedReport).toMatchObject({
      reporterUserId: fixture.remainingUserId,
      reportedUsername: "(deleted account)",
      status: "dismissed",
      retentionExpiresAt: now + 1 + 90 * 24 * 60 * 60 * 1000,
    })
    expect(dismissedReport.reportedUserId).toBeUndefined()
    expect(dismissedReport.note).toBeUndefined()
    expect(dismissedReport.matchedTerms).toBeUndefined()
    expect(dismissedReport.resolutionNote).toBeUndefined()
    expect(dismissedReport.gameId).toBeUndefined()
    expect(dismissedReport.autoAction).toBeUndefined()
    expect(upheldReport).toMatchObject({
      reporterUserId: fixture.remainingUserId,
      status: "upheld",
      retentionExpiresAt: now + 2 + 365 * 24 * 60 * 60 * 1000,
      note: "bounded upheld evidence",
      matchedTerms: ["identity"],
      resolutionNote: "confirmed",
    })
    expect(upheldReport.reportedUserId).toBeUndefined()
    expect(beforeRetry.blocks).toHaveLength(0)

    const actorClaim = beforeRetry.claims.find((claim) => claim._id === fixture.actorClaimId)!
    const resolverClaim = beforeRetry.claims.find((claim) => claim._id === fixture.resolverClaimId)!
    expect(actorClaim.actorUserId).toBeUndefined()
    expect(actorClaim.deviceId).toBeUndefined()
    expect(actorClaim.resolvedByUserId).toBe(fixture.remainingUserId)
    expect(resolverClaim.actorUserId).toBe(fixture.remainingUserId)
    expect(resolverClaim.deviceId).toBe("device-remain-01")
    expect(resolverClaim.resolvedByUserId).toBeUndefined()
  })

  it("accepts deletion for a Clerk identity that has no Scryve projection", async () => {
    const t = convexTest(schema, modules)
    const actor = t.withIdentity({ subject: "clerk-only-user" })
    const result = await actor.mutation(api.accountDeletion.requestCurrentAccountDeletion, {
      confirmation: "DELETE",
    })
    expect(result.status).toBe("identity_pending")
    expect(result.receiptToken).toMatch(/^[0-9a-f]{64}$/)
    await expect(
      actor.query(api.accountDeletion.currentAccountDeletion, {}),
    ).resolves.toMatchObject({
      status: "identity_pending",
      receiptToken: result.receiptToken,
    })
  })

  it("keeps an identifier-free completion receipt readable after identity removal", async () => {
    const t = convexTest(schema, modules)
    const actor = t.withIdentity({ subject: "receipt-owner" })
    const request = await actor.mutation(api.accountDeletion.requestCurrentAccountDeletion, {
      confirmation: "DELETE",
    })

    expect(
      await t.query(api.accountDeletion.deletionReceipt, {
        receiptToken: "0".repeat(64),
      }),
    ).toBeNull()
    await t.mutation(internal.accountDeletion.complete, { requestId: request.requestId })

    const receipt = await t.query(api.accountDeletion.deletionReceipt, {
      receiptToken: request.receiptToken,
    })
    expect(receipt).toMatchObject({ status: "completed", canRetry: false })
    expect(receipt).not.toHaveProperty("clerkUserId")
    expect(receipt).not.toHaveProperty("lastError")
    expect(await t.run((ctx) => ctx.db.get(request.requestId))).toBeNull()

    const storedReceipt = await t.run((ctx) =>
      ctx.db
        .query("accountDeletionReceipts")
        .withIndex("by_token", (q) => q.eq("token", request.receiptToken))
        .unique(),
    )
    expect(storedReceipt).not.toHaveProperty("clerkUserId")
    expect(storedReceipt).not.toHaveProperty("requestId")
  })

  it("publishes a safe failure receipt without the provider error", async () => {
    const t = convexTest(schema, modules)
    const actor = t.withIdentity({ subject: "failed-receipt-owner" })
    const request = await actor.mutation(api.accountDeletion.requestCurrentAccountDeletion, {
      confirmation: "DELETE",
    })
    for (let attempt = 0; attempt < 8; attempt += 1)
      await t.mutation(internal.accountDeletion.recordIdentityFailure, {
        requestId: request.requestId,
        message: "Clerk response included private diagnostics",
      })

    const receipt = await t.query(api.accountDeletion.deletionReceipt, {
      receiptToken: request.receiptToken,
    })
    expect(receipt).toMatchObject({ status: "failed", canRetry: true })
    expect(receipt).not.toHaveProperty("lastError")
    expect(JSON.stringify(receipt)).not.toContain("Clerk")
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
