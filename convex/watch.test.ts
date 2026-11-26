import { makeConvexTest, signedIn, type ConvexTestHarness } from "../test/convexTest"
import { api } from "./_generated/api"

const token = "w".repeat(43)

async function activeGame(t: ConvexTestHarness) {
  const host = await signedIn(t, "host-subject", "Host")
  const { publicId } = await host.mutation(api.games.createLobby, {
    publicId: "public-game-id-123456",
    playerCount: 2,
    startingLife: 40,
    ruleset: "commander",
    inviteToken: token,
    manualCodeCandidates: ["ABC234"],
    hostDisplayName: "Host",
    hostColor: "#7C3AED",
    deviceId: "device-host-0001",
  })
  const joiner = await signedIn(t, "joiner-subject", "Joiner")
  await joiner.mutation(api.games.claimSeat, { token, displayName: "Joiner", color: "#2563EB" })
  await host.mutation(api.games.startGame, { publicId })
  await t.run(async (ctx) => {
    await ctx.db.patch(host.userId, { username: "host_name" })
    await ctx.db.patch(joiner.userId, { username: "joiner_name" })
  })
  const { players } = await host.query(api.games.lobbyProjection, { publicId })
  return {
    host,
    joiner,
    publicId,
    hostPlayerId: players[0].playerId,
    joinerId: players[1].playerId,
  }
}

describe("Watch link", () => {
  // why: a rematch schedules its own cleanup, which a real timer would leave running past the test.
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it("gives only the host one code, which a signed-out viewer reads the live board with", async () => {
    const t = makeConvexTest()
    const game = await activeGame(t)
    const stranger = await signedIn(t, "stranger-subject", "Stranger")
    await expect(
      game.joiner.mutation(api.games.watchCode, { publicId: game.publicId }),
    ).rejects.toThrow("Game unavailable")
    await expect(
      stranger.mutation(api.games.watchCode, { publicId: game.publicId }),
    ).rejects.toThrow("Game unavailable")
    await expect(t.mutation(api.games.watchCode, { publicId: game.publicId })).rejects.toThrow()

    const code = await game.host.mutation(api.games.watchCode, { publicId: game.publicId })
    await expect(
      game.host.mutation(api.games.watchCode, { publicId: game.publicId }),
    ).resolves.toBe(code)
    await game.host.mutation(api.games.changeLife, {
      publicId: game.publicId,
      playerId: game.hostPlayerId,
      operationId: "operation-watch-0001",
      delta: -3,
      deviceId: "device-host-0001",
      clientCreatedAt: 1_700_000_000_000,
    })
    await t.run(async (ctx) => {
      const { _id: gameId } = (await ctx.db
        .query("games")
        .withIndex("by_public_id", (q) => q.eq("publicId", game.publicId))
        .unique())!
      await ctx.db.insert("gameCommanderDamage", {
        gameId,
        fromPlayerId: game.joinerId,
        toPlayerId: game.hostPlayerId,
        total: 7,
        updatedAt: 1,
      })
      await ctx.db.patch(game.joinerId, { role: "traitor", roleRevealed: false })
    })

    const board = await t.query(api.games.watchBoard, { code: code.toLowerCase() })
    expect(board).toEqual({
      status: "active",
      system: "mtg",
      format: "commander",
      players: [
        {
          playerId: game.hostPlayerId,
          seat: 1,
          name: "host_name",
          color: "#7C3AED",
          shape: expect.any(String),
          life: 37,
        },
        {
          playerId: game.joinerId,
          seat: 2,
          name: "joiner_name",
          color: "#2563EB",
          shape: expect.any(String),
          life: 40,
        },
      ],
      commanderDamage: [{ fromPlayerId: game.joinerId, toPlayerId: game.hostPlayerId, total: 7 }],
    })
  })

  it("follows the table into its rematch under the same code", async () => {
    const t = makeConvexTest()
    const game = await activeGame(t)
    const code = await game.host.mutation(api.games.watchCode, { publicId: game.publicId })
    await game.host.mutation(api.games.finishGame, {
      publicId: game.publicId,
      result: { kind: "win", winnerPlayerIds: [game.hostPlayerId] },
      rematch: {
        publicId: "rematch-public-game-123",
        inviteToken: "r".repeat(43),
        manualCodeCandidates: ["REM234"],
      },
    })

    await expect(t.query(api.games.watchBoard, { code })).resolves.toMatchObject({
      status: "active",
      players: [
        { name: "host_name", life: 40 },
        { name: "joiner_name", life: 40 },
      ],
    })
    await expect(
      game.host.mutation(api.games.watchCode, { publicId: "rematch-public-game-123" }),
    ).resolves.toBe(code)
  })

  it("shows nothing for a code no game holds", async () => {
    const t = makeConvexTest()
    await expect(t.query(api.games.watchBoard, { code: "23456789" })).resolves.toBeNull()
    await expect(t.query(api.games.watchBoard, { code: "not a code" })).resolves.toBeNull()
  })
})
