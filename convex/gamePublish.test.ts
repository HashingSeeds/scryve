import { convexTest } from "convex-test"

import { api } from "./_generated/api"
import schema from "./schema"

const modules = {
  "./_generated/api.ts": async () => jest.requireActual("./_generated/api"),
  "./_generated/server.ts": async () => jest.requireActual("./_generated/server"),
  "./games.ts": async () => jest.requireActual("./games"),
  "./users.ts": async () => jest.requireActual("./users"),
}
const token = "t".repeat(43)

const hostDevice = "device-host-0001"
const joinerDevice = "device-joiner-0002"

async function signedIn(t: ReturnType<typeof convexTest>, subject: string, name: string) {
  const actor = t.withIdentity({ subject })
  await actor.mutation(api.users.syncCurrent, { displayName: name })
  return actor
}

const baseSnapshot = {
  operationId: "publish-operation-00000001",
  publicId: "published-game-id-00001",
  system: "mtg",
  format: "commander",
  ruleset: "commander",
  startingLife: 40,
  inviteToken: token,
  manualCodeCandidates: ["ABC234", "DEF567"],
  hostLocalId: "local-host-player",
  players: [
    {
      localId: "local-host-player",
      seat: 1,
      displayName: "Host",
      color: "#7C3AED",
      shape: "circle",
      currentLife: 33,
    },
    {
      localId: "local-guest-player",
      seat: 2,
      displayName: "Guest",
      color: "#2563EB",
      shape: "triangle",
      currentLife: 17,
    },
  ],
  commanderTotals: [{ fromSeat: 1, toSeat: 2, total: 7 }],
}

function snapshotArgs(overrides: Partial<typeof baseSnapshot> = {}) {
  return { ...baseSnapshot, ...overrides }
}

async function published(
  t: ReturnType<typeof convexTest>,
  overrides: Partial<typeof baseSnapshot> = {},
) {
  const host = await signedIn(t, "host-subject", "Host")
  const created = await host.mutation(api.games.publishLocalGame, snapshotArgs(overrides))
  return { host, created }
}

describe("publishLocalGame", () => {
  it("requires authentication", async () => {
    const t = convexTest(schema, modules)
    await expect(t.mutation(api.games.publishLocalGame, snapshotArgs())).rejects.toThrow(
      "Authentication required",
    )
  })

  it("preserves the full local snapshot state and returns the exact seat mapping", async () => {
    const t = convexTest(schema, modules)
    const { host, created } = await published(t)
    expect(created.players).toEqual([
      { localId: "local-host-player", seat: 1, playerId: created.players[0].playerId },
      { localId: "local-guest-player", seat: 2, playerId: created.players[1].playerId },
    ])
    const projection = await host.query(api.games.lobbyProjection, {
      publicId: created.publicId,
      deviceId: hostDevice,
    })
    expect(projection.status).toBe("active")
    expect(projection.system).toBe("mtg")
    expect(projection.format).toBe("commander")
    expect(projection.ruleset).toBe("commander")
    expect(projection.startingLife).toBe(40)
    expect(projection.isHost).toBe(true)
    expect(projection.players).toEqual([
      expect.objectContaining({
        playerId: created.players[0].playerId,
        seat: 1,
        displayName: "Player 1",
        color: "#7C3AED",
        shape: "circle",
        currentLife: 33,
        controlledByMe: true,
      }),
      expect.objectContaining({
        playerId: created.players[1].playerId,
        seat: 2,
        displayName: "Guest",
        color: "#2563EB",
        shape: "triangle",
        currentLife: 17,
        eliminatedByCommanderDamage: false,
        controlledByMe: true,
      }),
    ])
    const allPlayers = await t.run(async (ctx) => {
      const gameId = (await ctx.db
        .query("games")
        .withIndex("by_public_id", (q) => q.eq("publicId", created.publicId))
        .unique())!._id
      return await ctx.db
        .query("gamePlayers")
        .withIndex("by_game", (q) => q.eq("gameId", gameId))
        .take(7)
    })
    expect(allPlayers.map((player) => player.displayName)).toEqual(["Host", "Guest"])
    expect(projection.commanderDamage?.totals).toEqual([
      {
        fromPlayerId: created.players[0].playerId,
        toPlayerId: created.players[1].playerId,
        total: 7,
      },
    ])
  })

  it("retries the same immutable payload idempotently and rejects a mismatched reuse", async () => {
    const t = convexTest(schema, modules)
    const { host, created } = await published(t)
    await expect(host.mutation(api.games.publishLocalGame, snapshotArgs())).resolves.toEqual(
      created,
    )
    await expect(
      host.mutation(
        api.games.publishLocalGame,
        snapshotArgs({ players: baseSnapshot.players.map((p) => ({ ...p, currentLife: 1 })) }),
      ),
    ).rejects.toThrow("Operation identifier was reused with different data")
    const games = await t.run((ctx) => ctx.db.query("games").collect())
    expect(games).toHaveLength(1)
  })

  it("enforces host capacity and public id collisions like createLobby", async () => {
    const t = convexTest(schema, modules)
    const { host, created } = await published(t)
    await expect(
      host.mutation(
        api.games.publishLocalGame,
        snapshotArgs({
          operationId: "publish-operation-00000002",
          publicId: created.publicId,
        }),
      ),
    ).rejects.toThrow("You already host a lobby or active game")
    const other = await signedIn(t, "other-subject", "Other")
    await expect(
      other.mutation(
        api.games.publishLocalGame,
        snapshotArgs({
          operationId: "publish-operation-00000003",
          publicId: created.publicId,
        }),
      ),
    ).rejects.toThrow("Game identifier collision; retry")
  })

  it("validates snapshot trust boundaries before any write", async () => {
    const t = convexTest(schema, modules)
    const host = await signedIn(t, "host-subject", "Host")
    await expect(
      host.mutation(
        api.games.publishLocalGame,
        snapshotArgs({ commanderTotals: [{ fromSeat: 1, toSeat: 2, total: 120 }] }),
      ),
    ).rejects.toThrow("Commander damage total must be between 0 and 99")
    await expect(
      host.mutation(
        api.games.publishLocalGame,
        snapshotArgs({ commanderTotals: [{ fromSeat: 1, toSeat: 3, total: 5 }] }),
      ),
    ).rejects.toThrow("must reference distinct snapshot seats")
    await expect(
      host.mutation(
        api.games.publishLocalGame,
        snapshotArgs({
          players: baseSnapshot.players.map((p) => ({ ...p, currentLife: 2_000_000 })),
        }),
      ),
    ).rejects.toThrow("Snapshot life must be a whole number")
    await expect(
      host.mutation(
        api.games.publishLocalGame,
        snapshotArgs({ players: baseSnapshot.players.slice(0, 1) }),
      ),
    ).rejects.toThrow("2–6 seats")
    await expect(
      host.mutation(api.games.publishLocalGame, snapshotArgs({ hostLocalId: "missing-local" })),
    ).rejects.toThrow("Host seat must be one of the snapshot players")
    await expect(
      host.mutation(
        api.games.publishLocalGame,
        snapshotArgs({
          system: undefined,
          commanderTotals: [{ fromSeat: 1, toSeat: 2, total: 3 }],
        }),
      ),
    ).rejects.toThrow("Commander damage totals are only supported in Commander games")
    const games = await t.run((ctx) => ctx.db.query("games").collect())
    expect(games).toHaveLength(0)
  })
})

describe("claimImportedSeat", () => {
  it("claims an unclaimed imported seat without resetting state and transfers authority", async () => {
    const t = convexTest(schema, modules)
    const { host, created } = await published(t)
    const guest = await signedIn(t, "guest-subject", "Guest")
    await expect(
      guest.mutation(api.games.claimImportedSeat, {
        publicId: created.publicId,
        seat: 2,
        manualCode: created.manualCode,
        deviceId: joinerDevice,
      }),
    ).resolves.toEqual({ publicId: created.publicId, seat: 2 })
    const guestView = await guest.query(api.games.lobbyProjection, {
      publicId: created.publicId,
      deviceId: joinerDevice,
    })
    expect(guestView.players[1]).toEqual(
      expect.objectContaining({
        displayName: "Player 2",
        color: "#2563EB",
        shape: "triangle",
        currentLife: 17,
        controlledByMe: true,
      }),
    )
    await guest.mutation(api.games.changeLife, {
      publicId: created.publicId,
      playerId: created.players[1].playerId,
      operationId: "guest-life-operation-00001",
      delta: -2,
      deviceId: joinerDevice,
      clientCreatedAt: 1,
    })
    await expect(
      host.mutation(api.games.changeLife, {
        publicId: created.publicId,
        playerId: created.players[1].playerId,
        operationId: "host-life-operation-000001",
        delta: -1,
        deviceId: hostDevice,
        clientCreatedAt: 2,
      }),
    ).rejects.toThrow("Seat-owner permission required")
    await expect(
      guest.mutation(api.games.claimImportedSeat, {
        publicId: created.publicId,
        seat: 2,
        manualCode: created.manualCode,
      }),
    ).resolves.toEqual({ publicId: created.publicId, seat: 2 })
    const after = await guest.query(api.games.lobbyProjection, {
      publicId: created.publicId,
      deviceId: joinerDevice,
    })
    expect(after.players[1].currentLife).toBe(15)
  })

  it("keeps unclaimed imported seats under host control", async () => {
    const t = convexTest(schema, modules)
    const { host, created } = await published(t)
    await host.mutation(api.games.changeLife, {
      publicId: created.publicId,
      playerId: created.players[1].playerId,
      operationId: "host-controls-unclaimed-1",
      delta: 5,
      deviceId: hostDevice,
      clientCreatedAt: 1,
    })
    const projection = await host.query(api.games.lobbyProjection, {
      publicId: created.publicId,
      deviceId: hostDevice,
    })
    expect(projection.players[1].currentLife).toBe(22)
    expect(projection.players[1].controlledByMe).toBe(true)
  })

  it("rejects strangers, stale invites, claimed seats, and never touches normal connected games", async () => {
    const t = convexTest(schema, modules)
    const { host, created } = await published(t)
    await host.mutation(api.games.claimImportedSeat, {
      publicId: created.publicId,
      seat: 2,
      manualCode: created.manualCode,
      deviceId: hostDevice,
    })
    const stranger = await signedIn(t, "stranger-subject", "Stranger")
    await expect(
      stranger.mutation(api.games.claimImportedSeat, {
        publicId: created.publicId,
        seat: 2,
        manualCode: created.manualCode,
      }),
    ).rejects.toThrow("Seat already claimed")
    await expect(
      stranger.mutation(api.games.claimImportedSeat, {
        publicId: created.publicId,
        seat: 2,
        manualCode: "ZZZ999",
      }),
    ).rejects.toThrow("Invite is invalid, expired, or revoked")

    const legacyHost = await signedIn(t, "legacy-host-subject", "LegacyHost")
    const legacy = await legacyHost.mutation(api.games.createLobby, {
      publicId: "legacy-lobby-id-000001",
      playerCount: 2,
      startingLife: 20,
      ruleset: "standard",
      inviteToken: "l".repeat(43),
      manualCodeCandidates: ["LEG234"],
      hostDisplayName: "LegacyHost",
      hostColor: "#41476E",
    })
    await expect(
      stranger.mutation(api.games.claimImportedSeat, {
        publicId: legacy.publicId,
        seat: 2,
        token: "l".repeat(43),
      }),
    ).rejects.toThrow("Invite is invalid, expired, or revoked")
    await stranger.mutation(api.games.claimSeat, {
      manualCode: "LEG234",
      displayName: "Stranger",
      color: "#39755C",
    })
    await legacyHost.mutation(api.games.startGame, { publicId: legacy.publicId })
    await expect(
      stranger.mutation(api.games.resolveInvite, { manualCode: "LEG234" }),
    ).resolves.toEqual({ valid: false })
    const legacyProjection = await stranger.query(api.games.lobbyProjection, {
      publicId: legacy.publicId,
    })
    await expect(
      legacyHost.mutation(api.games.changeLife, {
        publicId: legacy.publicId,
        playerId: legacyProjection.players[1].playerId,
        operationId: "legacy-host-foreign-seat-1",
        delta: 1,
        deviceId: hostDevice,
        clientCreatedAt: 1,
      }),
    ).rejects.toThrow("Seat-owner permission required")
    await expect(
      host.query(api.games.lobbyProjection, { publicId: created.publicId }),
    ).resolves.toMatchObject({ status: "active" })
  })
})

describe("imported game invite renewal and discovery", () => {
  it("rotates the invite on an active imported game and rejects the revoked token", async () => {
    const t = convexTest(schema, modules)
    const { host, created } = await published(t)
    const renewed = await host.mutation(api.games.rotateInvite, {
      publicId: created.publicId,
      inviteToken: "n".repeat(43),
      manualCodeCandidates: ["GHI789", "JKL012"],
    })
    const guest = await signedIn(t, "guest-subject", "Guest")
    await expect(
      guest.mutation(api.games.claimableSeats, { manualCode: created.manualCode }),
    ).rejects.toThrow("Invite is invalid, expired, or revoked")
    await expect(
      guest.mutation(api.games.claimImportedSeat, {
        publicId: created.publicId,
        seat: 2,
        manualCode: created.manualCode,
      }),
    ).rejects.toThrow("Invite is invalid, expired, or revoked")
    await expect(
      guest.mutation(api.games.claimableSeats, { manualCode: renewed.manualCode }),
    ).resolves.toEqual({ publicId: created.publicId, mode: "connected", seats: [2] })
    await expect(
      guest.mutation(api.games.claimImportedSeat, {
        publicId: created.publicId,
        seat: 2,
        manualCode: renewed.manualCode,
        deviceId: joinerDevice,
      }),
    ).resolves.toEqual({ publicId: created.publicId, seat: 2 })
  })

  it("discovers unclaimed seats without identity data and enforces boundaries", async () => {
    const t = convexTest(schema, modules)
    const { created } = await published(t)
    const guest = await signedIn(t, "guest-subject", "Guest")
    await expect(
      guest.mutation(api.games.claimableSeats, { manualCode: created.manualCode }),
    ).resolves.toEqual({ publicId: created.publicId, mode: "connected", seats: [2] })
    await expect(
      t.mutation(api.games.claimableSeats, { manualCode: created.manualCode }),
    ).rejects.toThrow("Authentication required")
    await expect(
      guest.mutation(api.games.claimableSeats, { manualCode: "ZZZ999" }),
    ).rejects.toThrow("Invite is invalid, expired, or revoked")
    await guest.mutation(api.games.claimImportedSeat, {
      publicId: created.publicId,
      seat: 2,
      manualCode: created.manualCode,
    })
    await expect(
      guest.mutation(api.games.claimableSeats, { manualCode: created.manualCode }),
    ).resolves.toEqual({ publicId: created.publicId, mode: "connected", seats: [] })
  })

  it("discovers and claims using only the invite payload, then the returned publicId", async () => {
    const t = convexTest(schema, modules)
    const { created } = await published(t)
    const guest = await signedIn(t, "guest-subject", "Guest")
    const byCode = await guest.mutation(api.games.claimableSeats, {
      manualCode: created.manualCode,
    })
    expect(byCode).toEqual({ publicId: created.publicId, mode: "connected", seats: [2] })
    await expect(
      guest.mutation(api.games.claimImportedSeat, {
        publicId: byCode.publicId,
        seat: byCode.seats[0],
        manualCode: created.manualCode,
        deviceId: joinerDevice,
      }),
    ).resolves.toEqual({ publicId: byCode.publicId, seat: byCode.seats[0] })

    const secondHost = await signedIn(t, "second-host-subject", "SecondHost")
    const second = await secondHost.mutation(
      api.games.publishLocalGame,
      snapshotArgs({
        operationId: "publish-operation-00000002",
        publicId: "published-game-id-00002",
        inviteToken: "u".repeat(43),
        manualCodeCandidates: ["UVW234"],
      }),
    )
    const other = await signedIn(t, "other-subject", "Other")
    const byToken = await other.mutation(api.games.claimableSeats, { token: "u".repeat(43) })
    expect(byToken).toEqual({ publicId: second.publicId, mode: "connected", seats: [2] })
    await expect(
      other.mutation(api.games.claimImportedSeat, {
        publicId: byToken.publicId,
        seat: byToken.seats[0],
        token: "u".repeat(43),
      }),
    ).resolves.toEqual({ publicId: byToken.publicId, seat: byToken.seats[0] })
  })

  it("blocks blocked invitees from seat discovery and claiming", async () => {
    const t = convexTest(schema, modules)
    const { created } = await published(t)
    const guest = await signedIn(t, "guest-subject", "Guest")
    const hostUser = await t.run((ctx) =>
      ctx.db
        .query("users")
        .withIndex("by_clerk_user", (q) => q.eq("clerkUserId", "host-subject"))
        .unique(),
    )
    const guestUser = await t.run((ctx) =>
      ctx.db
        .query("users")
        .withIndex("by_clerk_user", (q) => q.eq("clerkUserId", "guest-subject"))
        .unique(),
    )
    await t.run((ctx) =>
      ctx.db.insert("userBlocks", {
        blockerUserId: hostUser!._id,
        blockedUserId: guestUser!._id,
        createdAt: 1,
      }),
    )
    await expect(
      guest.mutation(api.games.claimableSeats, { manualCode: created.manualCode }),
    ).rejects.toThrow("You cannot join a game with a player you blocked or who blocked you")
    await expect(
      guest.mutation(api.games.claimImportedSeat, {
        publicId: created.publicId,
        seat: 2,
        manualCode: created.manualCode,
      }),
    ).rejects.toThrow("You cannot join a game with a player you blocked or who blocked you")
  })

  it("restores the legacy no-username display fallback for owned seats", async () => {
    const t = convexTest(schema, modules)
    const legacyHost = await signedIn(t, "legacy-host-subject", "LegacyHost")
    const legacy = await legacyHost.mutation(api.games.createLobby, {
      publicId: "legacy-fallback-id-0001",
      playerCount: 2,
      startingLife: 20,
      ruleset: "standard",
      inviteToken: "f".repeat(43),
      manualCodeCandidates: ["FAL234"],
      hostDisplayName: "LegacyHost",
      hostColor: "#41476E",
    })
    const projection = await legacyHost.query(api.games.lobbyProjection, {
      publicId: legacy.publicId,
    })
    expect(projection.players.map((player) => player.displayName)).toEqual(["Player 1"])
  })

  it("does not bypass authorization when a pre-claim operation is retried after a claim", async () => {
    const t = convexTest(schema, modules)
    const { host, created } = await published(t)
    const write = {
      publicId: created.publicId,
      playerId: created.players[1].playerId,
      operationId: "pre-claim-retry-op-00001",
      delta: 5,
      deviceId: hostDevice,
      clientCreatedAt: 1,
    }
    await host.mutation(api.games.changeLife, write)
    const guest = await signedIn(t, "guest-subject", "Guest")
    await guest.mutation(api.games.claimImportedSeat, {
      publicId: created.publicId,
      seat: 2,
      manualCode: created.manualCode,
      deviceId: joinerDevice,
    })
    await expect(host.mutation(api.games.changeLife, write)).rejects.toThrow(
      "Seat-owner permission required",
    )
    const projection = await host.query(api.games.lobbyProjection, {
      publicId: created.publicId,
      deviceId: hostDevice,
    })
    expect(projection.players[1].currentLife).toBe(22)
  })
})
