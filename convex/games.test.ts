import { convexTest } from "convex-test"

import { api, internal } from "./_generated/api"
import schema from "./schema"

const modules = {
  "./_generated/api.ts": async () => jest.requireActual("./_generated/api"),
  "./_generated/server.ts": async () => jest.requireActual("./_generated/server"),
  "./games.ts": async () => jest.requireActual("./games"),
  "./users.ts": async () => jest.requireActual("./users"),
}
const token = "t".repeat(43)

async function synced(t: ReturnType<typeof convexTest>, subject: string, name: string) {
  const actor = t.withIdentity({ subject })
  await actor.mutation(api.users.syncCurrent, { displayName: name })
  return actor
}

async function lobby(t: ReturnType<typeof convexTest>) {
  const host = await synced(t, "host-subject", "Host")
  const created = await host.mutation(api.games.createLobby, {
    publicId: "public-game-id-123456",
    playerCount: 2,
    startingLife: 40,
    ruleset: "commander",
    inviteToken: token,
    manualCodeCandidates: ["ABC234", "DEF567"],
    hostDisplayName: "Host",
    hostColor: "#7C3AED",
    deviceId: "device-host-0001",
  })
  return { host, created }
}

describe("Convex connected-game authorization", () => {
  it("rejects unauthenticated creation and nonmember projection without disclosure", async () => {
    const t = convexTest(schema, modules)
    await expect(
      t.mutation(api.games.createLobby, {
        publicId: "public-game-id-123456",
        playerCount: 2,
        startingLife: 20,
        ruleset: "standard",
        inviteToken: token,
        manualCodeCandidates: ["ABC234"],
        hostDisplayName: "Nope",
        hostColor: "#000000",
      }),
    ).rejects.toThrow("Authentication required")
    await lobby(t)
    const stranger = await synced(t, "stranger", "Stranger")
    await expect(
      stranger.query(api.games.lobbyProjection, { publicId: "public-game-id-123456" }),
    ).rejects.toThrow("Game unavailable")
    await expect(
      stranger.query(api.games.lobbyProjection, { publicId: "does-not-exist-123" }),
    ).rejects.toThrow("Game unavailable")
    await expect(
      stranger.query(api.games.lobbyProjection, { publicId: "x".repeat(65) }),
    ).rejects.toThrow("Invalid public game identifier")
  })

  it("claims one seat idempotently and prevents a full-lobby race", async () => {
    const t = convexTest(schema, modules)
    const { created } = await lobby(t)
    const joiner = await synced(t, "joiner", "Joiner")
    await expect(
      joiner.mutation(api.games.resolveInvite, { manualCode: "ABC234" }),
    ).resolves.toEqual({ valid: true })
    await expect(
      joiner.mutation(api.games.claimSeat, {
        manualCode: "ABC234",
        displayName: "Joiner",
        color: "#2563EB",
      }),
    ).resolves.toEqual({ publicId: created.publicId, seat: 2 })
    await expect(
      joiner.mutation(api.games.claimSeat, { token, displayName: "Joiner", color: "#2563EB" }),
    ).resolves.toEqual({ publicId: created.publicId, seat: 2 })
    const late = await synced(t, "late", "Late")
    await expect(
      late.mutation(api.games.claimSeat, { token, displayName: "Late", color: "#112233" }),
    ).rejects.toThrow("Lobby is full")
  })

  it("prevents a host from accumulating simultaneous lobbies", async () => {
    const t = convexTest(schema, modules)
    const { host } = await lobby(t)

    await expect(
      host.mutation(api.games.createLobby, {
        publicId: "second-public-game-123456",
        playerCount: 2,
        startingLife: 20,
        ruleset: "standard",
        inviteToken: "s".repeat(43),
        manualCodeCandidates: ["NEW234"],
        hostDisplayName: "Host",
        hostColor: "#7C3AED",
        deviceId: "device-host-0001",
      }),
    ).rejects.toThrow("already host a lobby")
  })

  it("claims separate seats for separate devices on the same signed-in account", async () => {
    const t = convexTest(schema, modules)
    const { host, created } = await lobby(t)

    await expect(
      host.mutation(api.games.claimSeat, {
        manualCode: "ABC234",
        displayName: "Second device",
        color: "#2563EB",
        deviceId: "device-joiner-0002",
      }),
    ).resolves.toEqual({ publicId: created.publicId, seat: 2 })
    await expect(
      host.mutation(api.games.claimSeat, {
        token,
        displayName: "Second device retry",
        color: "#2563EB",
        deviceId: "device-joiner-0002",
      }),
    ).resolves.toEqual({ publicId: created.publicId, seat: 2 })

    const projection = await host.query(api.games.lobbyProjection, {
      publicId: created.publicId,
      deviceId: "device-host-0001",
    })
    expect(projection.players).toHaveLength(2)
    expect(projection.players.map((player: any) => player.controlledByMe)).toEqual([true, false])
    await expect(
      host.mutation(api.games.startGame, { publicId: created.publicId }),
    ).resolves.toEqual({ publicId: created.publicId })
    await host.mutation(api.games.finishGame, { publicId: created.publicId })
    const history = await host.query(api.games.connectedHistory, {
      paginationOpts: { cursor: null, numItems: 10 },
    })
    expect(history.page.map((game: any) => game.publicId)).toEqual([created.publicId])
  })

  it("enforces host-only start and requires all configured seats", async () => {
    const t = convexTest(schema, modules)
    const { host, created } = await lobby(t)
    await expect(
      host.mutation(api.games.startGame, { publicId: created.publicId }),
    ).rejects.toThrow("All configured seats")
    const joiner = await synced(t, "joiner", "Joiner")
    await joiner.mutation(api.games.claimSeat, { token, displayName: "Joiner", color: "#2563EB" })
    await expect(
      host.mutation(api.games.updateMySeat, {
        publicId: created.publicId,
        seat: 2,
        displayName: "Hijacked",
        color: "#000000",
      }),
    ).rejects.toThrow("Seat-owner permission")
    await expect(
      joiner.mutation(api.games.updateMySeat, {
        publicId: created.publicId,
        seat: 2,
        displayName: "Joiner updated",
        color: "#123456",
      }),
    ).resolves.toBeNull()
    await expect(
      joiner.mutation(api.games.startGame, { publicId: created.publicId }),
    ).rejects.toThrow("Host permission")
    await expect(
      host.mutation(api.games.startGame, { publicId: created.publicId }),
    ).resolves.toEqual({ publicId: created.publicId })
    const hostProjection = await host.query(api.games.lobbyProjection, {
      publicId: created.publicId,
    })
    const joinerProjection = await joiner.query(api.games.lobbyProjection, {
      publicId: created.publicId,
    })
    expect(hostProjection.players.map(({ controlledByMe: _, ...player }: any) => player)).toEqual(
      joinerProjection.players.map(({ controlledByMe: _, ...player }: any) => player),
    )
    expect(hostProjection.players.map((player: any) => player.controlledByMe)).toEqual([
      true,
      false,
    ])
    expect(joinerProjection.players.map((player: any) => player.controlledByMe)).toEqual([
      false,
      true,
    ])
    expect(hostProjection.status).toBe(joinerProjection.status)
    expect(hostProjection.players.map((player: any) => player.currentLife)).toEqual([40, 40])
  })

  it("enforces invite revocation and manual-code collisions", async () => {
    const t = convexTest(schema, modules)
    const { host, created } = await lobby(t)
    const joiner = await synced(t, "joiner", "Joiner")
    await t.run(async (ctx) => {
      const invite = await ctx.db
        .query("invitations")
        .withIndex("by_token", (q) => q.eq("token", token))
        .unique()
      await ctx.db.patch(invite!._id, { expiresAt: Date.now() - 1 })
    })
    await expect(
      joiner.mutation(api.games.claimSeat, { token, displayName: "Joiner", color: "#2563EB" }),
    ).rejects.toThrow("invalid, expired, or revoked")
    await t.run(async (ctx) => {
      const invite = await ctx.db
        .query("invitations")
        .withIndex("by_token", (q) => q.eq("token", token))
        .unique()
      await ctx.db.patch(invite!._id, { expiresAt: Date.now() + 10_000 })
    })
    await host.mutation(api.games.revokeInvite, { publicId: created.publicId })
    await expect(
      joiner.mutation(api.games.claimSeat, { token, displayName: "Joiner", color: "#2563EB" }),
    ).rejects.toThrow("invalid, expired, or revoked")
    const secondHost = await synced(t, "second-host", "Second host")
    await expect(
      secondHost.mutation(api.games.createLobby, {
        publicId: "second-public-game-123",
        playerCount: 2,
        startingLife: 20,
        ruleset: "standard",
        inviteToken: "u".repeat(43),
        manualCodeCandidates: ["ABC234"],
        hostDisplayName: "Second host",
        hostColor: "#7C3AED",
      }),
    ).rejects.toThrow("Manual code collision")
  })

  it("rate-limits authenticated invite enumeration", async () => {
    const t = convexTest(schema, modules)
    const actor = await synced(t, "scanner", "Scanner")
    for (let index = 0; index < 10; index += 1) {
      await expect(
        actor.mutation(api.games.resolveInvite, {
          manualCode: `ZZZ${String(index).padStart(3, "0")}`,
        }),
      ).resolves.toEqual({ valid: false })
    }
    await expect(actor.mutation(api.games.resolveInvite, { manualCode: "YYY999" })).rejects.toThrow(
      "Too many join attempts",
    )
  })

  it("rejects oversized rulesets and manual-code candidate payloads before database work", async () => {
    const t = convexTest(schema, modules)
    const host = await synced(t, "bounded-host", "Host")
    const base = {
      publicId: "bounded-public-game-id",
      playerCount: 2,
      startingLife: 20,
      ruleset: "standard",
      inviteToken: token,
      manualCodeCandidates: ["ABC234"],
      hostDisplayName: "Host",
      hostColor: "#7C3AED",
    }
    await expect(
      host.mutation(api.games.createLobby, { ...base, ruleset: "x".repeat(33) }),
    ).rejects.toThrow("Ruleset must be 1–32")
    await expect(
      host.mutation(api.games.createLobby, {
        ...base,
        publicId: "invalid.prefix.game",
      }),
    ).rejects.toThrow("Invalid public game identifier")
    await expect(
      host.mutation(api.games.createLobby, {
        ...base,
        manualCodeCandidates: Array.from({ length: 9 }, (_, index) => `ABC23${index}`),
      }),
    ).rejects.toThrow("Provide 1–8 manual code candidates")
    await expect(
      host.mutation(api.games.createLobby, {
        ...base,
        manualCodeCandidates: ["A".repeat(17)],
      }),
    ).rejects.toThrow("Manual code candidates must be 6–16")
    expect(await t.run((ctx) => ctx.db.query("games").collect())).toEqual([])
  })
})

async function activeGame(t: ReturnType<typeof convexTest>) {
  const { host, created } = await lobby(t)
  const joiner = await synced(t, "active-joiner", "Joiner")
  await joiner.mutation(api.games.claimSeat, {
    token,
    displayName: "Joiner",
    color: "#2563EB",
  })
  await host.mutation(api.games.startGame, { publicId: created.publicId })
  const hostProjection = await host.query(api.games.lobbyProjection, { publicId: created.publicId })
  return {
    host,
    joiner,
    publicId: created.publicId,
    hostPlayerId: hostProjection.players[0].playerId,
    joinerPlayerId: hostProjection.players[1].playerId,
  }
}

function lifeArgs(
  publicId: string,
  playerId: any,
  operationId: string,
  delta: number,
  deviceId = "device-host-0001",
) {
  return { publicId, playerId, operationId, delta, deviceId, clientCreatedAt: 1_700_000_000_000 }
}

describe("Convex realtime life writes", () => {
  it("paginates a staged migration and discovers an older active game past 100 finished memberships", async () => {
    const t = convexTest(schema, modules)
    const actor = await synced(t, "legacy-member", "Legacy")
    await t.run(async (ctx) => {
      const user = await ctx.db
        .query("users")
        .withIndex("by_clerk_user", (q) => q.eq("clerkUserId", "legacy-member"))
        .unique()
      await ctx.db.patch(user!._id, { membershipMigrationVersion: undefined })
      for (let index = 0; index < 105; index += 1) {
        const status = index === 0 ? "active" : "finished"
        const gameId = await ctx.db.insert("games", {
          publicId: `legacy_game_${String(index).padStart(16, "0")}`,
          hostUserId: user!._id,
          mode: "connected",
          status,
          playerCount: 2,
          startingLife: 20,
          ruleset: "standard",
          createdAt: index,
          ...(status === "active" ? { startedAt: index } : {}),
          updatedAt: index,
          eventSequence: 0,
        })
        await ctx.db.insert("gamePlayers", {
          gameId,
          seat: 1,
          userId: user!._id,
          displayName: "Legacy",
          color: "#123456",
          currentLife: 20,
          joinedAt: index,
        })
      }
    })
    let cursor: string | null = null
    let isDone = false
    let migrated = 0
    while (!isDone) {
      const result: {
        continueCursor: string
        isDone: boolean
        migratedCount: number
      } = await actor.mutation(api.games.migrateMyGameMemberships, { cursor })
      cursor = result.continueCursor
      isDone = result.isDone
      migrated += result.migratedCount
    }
    expect(migrated).toBe(105)
    await expect(
      actor.mutation(api.games.migrateMyGameMemberships, { cursor: null }),
    ).resolves.toMatchObject({ migratedCount: 0, isDone: true, alreadyComplete: true })
    const active = await actor.query(api.games.activeConnectedGames, {
      paginationOpts: { cursor: null, numItems: 10 },
    })
    expect(active.page.map((game: any) => game.publicId)).toEqual(["legacy_game_0000000000000000"])
    const resumable = await t.run((ctx) =>
      ctx.db
        .query("gamePlayers")
        .filter((q) => q.eq(q.field("resumable"), true))
        .collect(),
    )
    expect(resumable).toHaveLength(1)
  })

  it("rejects unauthenticated, nonmember, cross-seat, and invalid delta/operation writes", async () => {
    const t = convexTest(schema, modules)
    const game = await activeGame(t)
    await expect(
      t.mutation(
        api.games.changeLife,
        lifeArgs(game.publicId, game.hostPlayerId, "operation-unauth-0001", 1),
      ),
    ).rejects.toThrow("Authentication required")
    const stranger = await synced(t, "write-stranger", "Stranger")
    await expect(
      stranger.mutation(
        api.games.changeLife,
        lifeArgs(game.publicId, game.hostPlayerId, "operation-strange-001", 1),
      ),
    ).rejects.toThrow("Game membership required")
    await expect(
      game.host.mutation(
        api.games.changeLife,
        lifeArgs(game.publicId, game.joinerPlayerId, "operation-cross-seat1", 1),
      ),
    ).rejects.toThrow("Seat-owner permission required")
    await expect(
      game.host.mutation(
        api.games.changeLife,
        lifeArgs(game.publicId, game.hostPlayerId, "operation-bad-delta-1", 0),
      ),
    ).rejects.toThrow("Life delta")
    await expect(
      game.host.mutation(
        api.games.changeLife,
        lifeArgs(game.publicId, game.hostPlayerId, "short", 1),
      ),
    ).rejects.toThrow("Invalid operation")
    await expect(
      game.host.mutation(
        api.games.changeLife,
        lifeArgs("x".repeat(65), game.hostPlayerId, "operation-bad-public1", 1),
      ),
    ).rejects.toThrow("Invalid public game identifier")
    await expect(
      game.host.mutation(api.games.changeLife, {
        ...lifeArgs(game.publicId, game.hostPlayerId, "operation-time-fraction", 1),
        clientCreatedAt: 1.5,
      }),
    ).rejects.toThrow("Invalid client timestamp")
    await expect(
      game.host.mutation(api.games.changeLife, {
        ...lifeArgs(game.publicId, game.hostPlayerId, "operation-time-unsafe1", 1),
        clientCreatedAt: Number.MAX_VALUE,
      }),
    ).rejects.toThrow("Invalid client timestamp")
  })

  it("atomically updates totals and an immutable log for simultaneous same/different-player deltas", async () => {
    const t = convexTest(schema, modules)
    const game = await activeGame(t)
    const gameRowBefore = await t.run((ctx) =>
      ctx.db
        .query("games")
        .withIndex("by_public_id", (q) => q.eq("publicId", game.publicId))
        .unique(),
    )
    await Promise.all([
      game.host.mutation(
        api.games.changeLife,
        lifeArgs(game.publicId, game.hostPlayerId, "operation-same-host-1", 17),
      ),
      game.host.mutation(
        api.games.changeLife,
        lifeArgs(game.publicId, game.hostPlayerId, "operation-same-host-2", -1),
      ),
    ])
    await Promise.all([
      game.host.mutation(
        api.games.changeLife,
        lifeArgs(game.publicId, game.hostPlayerId, "operation-different-1", 1),
      ),
      game.joiner.mutation(
        api.games.changeLife,
        lifeArgs(
          game.publicId,
          game.joinerPlayerId,
          "operation-different-2",
          -5,
          "device-joiner-001",
        ),
      ),
    ])
    const projection = await game.host.query(api.games.lobbyProjection, { publicId: game.publicId })
    expect(projection.players.map((player: any) => player.currentLife)).toEqual([57, 35])
    expect(projection.eventSequence).toBe(4)
    const allEvents = await t.run((ctx) => ctx.db.query("gameEvents").collect())
    expect(allEvents).toHaveLength(4)
    expect(allEvents[0]).toMatchObject({ kind: "life.changed", delta: 17 })
    expect(allEvents[0].sequence).toBeUndefined()
    const gameRowAfter = await t.run((ctx) => ctx.db.get(gameRowBefore!._id))
    expect(gameRowAfter).toEqual(gameRowBefore)
    const playerRows = await t.run((ctx) =>
      ctx.db
        .query("gamePlayers")
        .withIndex("by_game", (q) => q.eq("gameId", gameRowBefore!._id))
        .collect(),
    )
    expect(playerRows.map((player) => player.eventCount).sort()).toEqual([1, 3])
  })

  it("deduplicates lost acknowledgements and duplicate/reordered replay exactly once", async () => {
    const t = convexTest(schema, modules)
    const game = await activeGame(t)
    const second = lifeArgs(game.publicId, game.hostPlayerId, "operation-replay-0002", -1)
    const first = lifeArgs(game.publicId, game.hostPlayerId, "operation-replay-0001", 5)
    await game.host.mutation(api.games.changeLife, second)
    await game.host.mutation(api.games.changeLife, first)
    const duplicateFirst = await game.host.mutation(api.games.changeLife, first)
    const duplicateSecond = await game.host.mutation(api.games.changeLife, second)
    expect(duplicateFirst).toMatchObject({ deduplicated: true, operationId: first.operationId })
    expect(duplicateSecond).toMatchObject({ deduplicated: true, operationId: second.operationId })
    const projection = await game.host.query(api.games.lobbyProjection, { publicId: game.publicId })
    expect(projection.players[0].currentLife).toBe(44)
    expect(projection.eventSequence).toBe(2)
    expect(await t.run((ctx) => ctx.db.query("gameEvents").collect())).toHaveLength(2)
    await expect(
      game.host.mutation(api.games.changeLife, {
        ...first,
        clientCreatedAt: first.clientCreatedAt + 1,
      }),
    ).rejects.toThrow("reused with different data")
  })

  it("finishes only online through the host transition, preserves summary/history, and rejects new writes", async () => {
    const t = convexTest(schema, modules)
    const game = await activeGame(t)
    const committed = lifeArgs(game.publicId, game.hostPlayerId, "operation-before-finish", -5)
    await game.host.mutation(api.games.changeLife, committed)
    await expect(
      game.joiner.mutation(api.games.finishGame, { publicId: game.publicId }),
    ).rejects.toThrow("Host permission")
    await game.host.mutation(api.games.finishGame, { publicId: game.publicId })
    await expect(
      game.host.mutation(
        api.games.changeLife,
        lifeArgs(game.publicId, game.hostPlayerId, "operation-after-finish1", 1),
      ),
    ).rejects.toThrow("Game is not active")
    await expect(game.host.mutation(api.games.changeLife, committed)).resolves.toMatchObject({
      deduplicated: true,
    })
    await expect(
      game.host.mutation(api.games.finishGame, { publicId: game.publicId }),
    ).rejects.toThrow("Only an active game")
    const summary = await game.joiner.query(api.games.connectedSummary, { publicId: game.publicId })
    expect(summary).toMatchObject({ eventCount: 1 })
    expect(summary!.players.map((player: any) => player.finalLife)).toEqual([35, 40])
    const history = await game.host.query(api.games.connectedHistory, {
      paginationOpts: { numItems: 1, cursor: null },
    })
    expect(history.page).toHaveLength(1)
    const events = await game.host.query(api.games.connectedEvents, {
      publicId: game.publicId,
      paginationOpts: { numItems: 1, cursor: null },
    })
    expect(events.page).toHaveLength(1)
    expect(events.page[0]).toMatchObject({ operationId: committed.operationId, delta: -5 })
    const active = await game.host.query(api.games.activeConnectedGames, {
      paginationOpts: { numItems: 10, cursor: null },
    })
    expect(active.page).toEqual([])
  })
})

describe("Phase 4.5A lifecycle and API hardening", () => {
  it("validates profile avatar URLs at the user projection boundary", async () => {
    const t = convexTest(schema, modules)
    const actor = t.withIdentity({ subject: "avatar-user" })
    await expect(
      actor.mutation(api.users.syncCurrent, {
        displayName: "Avatar",
        avatarUrl: "http://images.example.test/avatar.png",
      }),
    ).rejects.toThrow("HTTPS")
    await expect(
      actor.mutation(api.users.syncCurrent, {
        displayName: "Avatar",
        avatarUrl: "https://images.example.test/avatar.png",
      }),
    ).resolves.toBeDefined()
  })

  it("reports only joinable invites and rotates the current invite atomically", async () => {
    const t = convexTest(schema, modules)
    const { host, created } = await lobby(t)
    const joiner = await synced(t, "rotation-joiner", "Joiner")
    const rotatedToken = "r".repeat(43)
    await expect(
      host.mutation(api.games.rotateInvite, {
        publicId: created.publicId,
        inviteToken: rotatedToken,
        manualCodeCandidates: ["ROT234"],
      }),
    ).resolves.toMatchObject({ inviteToken: rotatedToken, manualCode: "ROT234" })
    await expect(joiner.mutation(api.games.resolveInvite, { token })).resolves.toEqual({
      valid: false,
    })
    await expect(
      joiner.mutation(api.games.resolveInvite, { token: rotatedToken }),
    ).resolves.toEqual({ valid: true })
    const projection = await host.query(api.games.lobbyProjection, { publicId: created.publicId })
    expect(projection.invitation).toMatchObject({ token: rotatedToken, manualCode: "ROT234" })
    await joiner.mutation(api.games.claimSeat, {
      token: rotatedToken,
      displayName: "Joiner",
      color: "#2563EB",
    })
    const late = await synced(t, "rotation-late", "Late")
    await expect(late.mutation(api.games.resolveInvite, { token: rotatedToken })).resolves.toEqual({
      valid: false,
    })
    await host.mutation(api.games.startGame, { publicId: created.publicId })
    await expect(late.mutation(api.games.resolveInvite, { token: rotatedToken })).resolves.toEqual({
      valid: false,
    })
  })

  it("lets one member leave discovery without changing the game or other memberships", async () => {
    const t = convexTest(schema, modules)
    const game = await activeGame(t)
    const rowBefore = await t.run((ctx) =>
      ctx.db
        .query("games")
        .withIndex("by_public_id", (q) => q.eq("publicId", game.publicId))
        .unique(),
    )
    await expect(
      game.joiner.mutation(api.games.leaveMyGame, { publicId: game.publicId }),
    ).resolves.toMatchObject({ left: true })
    const rows = await t.run((ctx) =>
      ctx.db
        .query("gamePlayers")
        .withIndex("by_game", (q) => q.eq("gameId", rowBefore!._id))
        .collect(),
    )
    expect(rows.sort((a, b) => a.seat - b.seat).map((row) => row.resumable)).toEqual([true, false])
    expect(await t.run((ctx) => ctx.db.get(rowBefore!._id))).toEqual(rowBefore)
  })

  it("does not transfer lobby host authority and allows explicit lobby abandon", async () => {
    const t = convexTest(schema, modules)
    const { host, created } = await lobby(t)
    const joiner = await synced(t, "lobby-policy-joiner", "Joiner")
    await joiner.mutation(api.games.claimSeat, {
      token,
      displayName: "Joiner",
      color: "#2563EB",
    })
    await expect(
      host.mutation(api.games.leaveMyGame, { publicId: created.publicId }),
    ).rejects.toThrow("Hosts must finish or abandon")
    await t.run(async (ctx) => {
      const game = await ctx.db
        .query("games")
        .withIndex("by_public_id", (q) => q.eq("publicId", created.publicId))
        .unique()
      const hostSeat = await ctx.db
        .query("gamePlayers")
        .withIndex("by_game_user", (q) => q.eq("gameId", game!._id).eq("userId", game!.hostUserId))
        .first()
      await ctx.db.patch(hostSeat!._id, { resumable: false })
    })
    const recoverable = await host.query(api.games.activeConnectedGames, {
      paginationOpts: { cursor: null, numItems: 10 },
    })
    expect(recoverable.page).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ publicId: created.publicId, isHost: true, status: "lobby" }),
      ]),
    )
    await expect(
      joiner.mutation(api.games.startGame, { publicId: created.publicId }),
    ).rejects.toThrow("Host permission")
    await expect(
      joiner.mutation(api.games.abandonGame, { publicId: created.publicId }),
    ).rejects.toThrow("Host permission")
    await expect(
      host.mutation(api.games.abandonGame, { publicId: created.publicId }),
    ).resolves.toMatchObject({ publicId: created.publicId })
    const summary = await joiner.query(api.games.connectedSummary, { publicId: created.publicId })
    expect(summary).toMatchObject({ eventCount: 0, terminalStatus: "abandoned" })
  })

  it("abandons lobby/active games idempotently with correct bounded summaries and replay", async () => {
    const t = convexTest(schema, modules)
    const game = await activeGame(t)
    const gameRow = await t.run((ctx) =>
      ctx.db
        .query("games")
        .withIndex("by_public_id", (q) => q.eq("publicId", game.publicId))
        .unique(),
    )
    await t.run((ctx) => ctx.db.patch(gameRow!._id, { eventSequence: 7 }))
    const hostWrite = lifeArgs(game.publicId, game.hostPlayerId, "operation-abandon-host", -1)
    await game.host.mutation(api.games.changeLife, hostWrite)
    await game.joiner.mutation(
      api.games.changeLife,
      lifeArgs(
        game.publicId,
        game.joinerPlayerId,
        "operation-abandon-joiner",
        5,
        "device-joiner-002",
      ),
    )
    await expect(
      game.joiner.mutation(api.games.abandonGame, { publicId: game.publicId }),
    ).rejects.toThrow("Host permission")
    const first = await game.host.mutation(api.games.abandonGame, { publicId: game.publicId })
    const replay = await game.host.mutation(api.games.abandonGame, { publicId: game.publicId })
    expect(replay.summaryId).toBe(first.summaryId)
    await expect(game.host.mutation(api.games.changeLife, hostWrite)).resolves.toMatchObject({
      deduplicated: true,
    })
    const summary = await game.joiner.query(api.games.connectedSummary, { publicId: game.publicId })
    expect(summary).toMatchObject({
      eventCount: 9,
      terminalStatus: "abandoned",
      terminalReason: "host_abandoned",
    })
    expect(summary!.players.map((player: any) => player.finalLife)).toEqual([39, 45])
    const resumable = await t.run((ctx) =>
      ctx.db
        .query("gamePlayers")
        .withIndex("by_game", (q) => q.eq("gameId", gameRow!._id))
        .collect(),
    )
    expect(resumable.every((player) => player.resumable === false)).toBe(true)
  })

  it("orders and paginates history without a global event sequence", async () => {
    const t = convexTest(schema, modules)
    const game = await activeGame(t)
    const gameRow = await t.run((ctx) =>
      ctx.db
        .query("games")
        .withIndex("by_public_id", (q) => q.eq("publicId", game.publicId))
        .unique(),
    )
    for (let index = 1; index <= 3; index += 1) {
      await t.run(async (ctx) => {
        const player: any = await ctx.db.get(game.hostPlayerId)
        await ctx.db.insert("gameEvents", {
          gameId: gameRow!._id,
          playerId: game.hostPlayerId,
          operationId: `operation-history-000${index}`,
          kind: "life.changed",
          delta: 1,
          actorUserId: player!.userId,
          deviceId: "device-history-001",
          clientCreatedAt: index,
          serverCreatedAt: 1_800_000_000_000,
        })
      })
    }
    const rawEvents = await t.run((ctx) =>
      ctx.db
        .query("gameEvents")
        .withIndex("by_game_server_time", (q) => q.eq("gameId", gameRow!._id))
        .collect(),
    )
    expect(rawEvents.map((event) => event.serverCreatedAt)).toEqual([
      1_800_000_000_000, 1_800_000_000_000, 1_800_000_000_000,
    ])
    expect(rawEvents.map((event) => event._creationTime)).toEqual(
      [...rawEvents.map((event) => event._creationTime)].sort((a, b) => a - b),
    )
    const first = await game.host.query(api.games.connectedEvents, {
      publicId: game.publicId,
      paginationOpts: { numItems: 2, cursor: null },
    })
    const second = await game.host.query(api.games.connectedEvents, {
      publicId: game.publicId,
      paginationOpts: { numItems: 2, cursor: first.continueCursor },
    })
    expect(first.page.map((event: any) => event.operationId)).toEqual([
      "operation-history-0003",
      "operation-history-0002",
    ])
    expect(second.page.map((event: any) => event.operationId)).toEqual(["operation-history-0001"])
    expect([...first.page, ...second.page].every((event: any) => event.sequence === null)).toBe(
      true,
    )
    expect(new Set([...first.page, ...second.page].map((event: any) => event.eventId)).size).toBe(3)
  })

  it("abandons stale games in bounded batches and refreshes recently active candidates", async () => {
    const t = convexTest(schema, modules)
    const actor = await synced(t, "stale-host", "Stale Host")
    const now = Date.now()
    const staleAt = now - 31 * 24 * 60 * 60 * 1000
    await t.run(async (ctx) => {
      const user = await ctx.db
        .query("users")
        .withIndex("by_clerk_user", (q) => q.eq("clerkUserId", "stale-host"))
        .unique()
      for (let index = 0; index < 30; index += 1) {
        const gameId = await ctx.db.insert("games", {
          publicId: `stale_game_${String(index).padStart(16, "0")}`,
          hostUserId: user!._id,
          mode: "connected",
          status: "lobby",
          playerCount: 2,
          startingLife: 20,
          ruleset: "standard",
          createdAt: staleAt,
          updatedAt: staleAt,
          eventSequence: 0,
        })
        await ctx.db.insert("gamePlayers", {
          gameId,
          seat: 1,
          userId: user!._id,
          displayName: "Stale Host",
          color: "#123456",
          currentLife: 20,
          eventCount: 0,
          resumable: true,
          joinedAt: staleAt,
        })
      }
    })
    const first = await t.mutation(internal.games.cleanupStaleGames, {})
    expect(first).toMatchObject({ examined: 25, abandoned: 25, batchSizePerStatus: 25 })
    const second = await t.mutation(internal.games.cleanupStaleGames, {})
    expect(second).toMatchObject({ examined: 5, abandoned: 5 })
    await expect(t.mutation(internal.games.cleanupStaleGames, {})).resolves.toMatchObject({
      examined: 0,
      abandoned: 0,
    })
    const active = await actor.query(api.games.activeConnectedGames, {
      paginationOpts: { numItems: 50, cursor: null },
    })
    expect(active.page).toEqual([])

    const recentId = await t.run(async (ctx) => {
      const user = await ctx.db
        .query("users")
        .withIndex("by_clerk_user", (q) => q.eq("clerkUserId", "stale-host"))
        .unique()
      const gameId = await ctx.db.insert("games", {
        publicId: "recent_active_game_0001",
        hostUserId: user!._id,
        mode: "connected",
        status: "active",
        playerCount: 2,
        startingLife: 20,
        ruleset: "standard",
        createdAt: staleAt,
        startedAt: staleAt,
        updatedAt: staleAt,
        eventSequence: 0,
      })
      await ctx.db.insert("gamePlayers", {
        gameId,
        seat: 1,
        userId: user!._id,
        displayName: "Stale Host",
        color: "#123456",
        currentLife: 20,
        eventCount: 1,
        lastEventAt: now,
        resumable: true,
        joinedAt: staleAt,
      })
      return gameId
    })
    await expect(t.mutation(internal.games.cleanupStaleGames, {})).resolves.toMatchObject({
      examined: 1,
      abandoned: 0,
    })
    expect(await t.run((ctx) => ctx.db.get(recentId))).toMatchObject({
      status: "active",
      updatedAt: now,
    })
  })
})
