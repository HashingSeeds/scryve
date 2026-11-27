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
      commanderDamage: {
        lethal: 21,
        totals: [{ fromPlayerId: game.joinerId, toPlayerId: game.hostPlayerId, total: 7 }],
      },
    })
  })

  it("shows the result until the table plays its rematch, under the same code", async () => {
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

    const final = await t.query(api.games.watchBoard, { code })
    expect(final).toMatchObject({
      status: "finished",
      players: [{ name: "host_name", won: true }, { name: "joiner_name" }],
    })
    expect(final && "players" in final && final.players[1]).not.toHaveProperty("won")
    const { players } = await game.host.query(api.games.lobbyProjection, {
      publicId: "rematch-public-game-123",
    })
    await game.host.mutation(api.games.changeLife, {
      publicId: "rematch-public-game-123",
      playerId: players[0].playerId,
      operationId: "operation-watch-rematch",
      delta: -2,
      deviceId: "device-host-0001",
      clientCreatedAt: 1_700_000_000_000,
    })
    await expect(t.query(api.games.watchBoard, { code })).resolves.toMatchObject({
      status: "active",
      players: [
        { name: "host_name", life: 38 },
        { name: "joiner_name", life: 40 },
      ],
    })
    await expect(
      game.host.mutation(api.games.watchCode, { publicId: "rematch-public-game-123" }),
    ).resolves.toBe(code)
    await game.host.mutation(api.games.abandonGame, { publicId: "rematch-public-game-123" })
    await expect(t.query(api.games.watchBoard, { code })).resolves.toEqual({ status: "abandoned" })
  })

  it("keeps the result for a code first asked in a rematch the table never plays", async () => {
    const t = makeConvexTest()
    const game = await activeGame(t)
    await game.host.mutation(api.games.finishGame, {
      publicId: game.publicId,
      result: { kind: "draw" },
      rematch: {
        publicId: "rematch-public-game-123",
        inviteToken: "r".repeat(43),
        manualCodeCandidates: ["REM234"],
      },
    })
    const code = await game.host.mutation(api.games.watchCode, {
      publicId: "rematch-public-game-123",
    })
    await game.host.mutation(api.games.abandonGame, { publicId: "rematch-public-game-123" })

    await expect(t.query(api.games.watchBoard, { code })).resolves.toMatchObject({
      status: "finished",
      draw: true,
    })
  })

  it("names a team variant's teams, which win together", async () => {
    const t = makeConvexTest()
    const token = "t".repeat(43)
    const publicId = "riftbound-watch-teams-01"
    const host = await signedIn(t, "host-subject", "Host")
    await host.mutation(api.games.createLobby, {
      publicId,
      playerCount: 4,
      startingLife: 0,
      ruleset: "constructed",
      system: "riftbound",
      format: "constructed",
      variant: "twoVsTwo",
      inviteToken: token,
      manualCodeCandidates: ["ABC234"],
      hostDisplayName: "Host",
      hostColor: "#7C3AED",
      deviceId: "device-host-0001",
    })
    for (const [index, color] of ["#2563EB", "#16A34A", "#DC2626"].entries()) {
      const player = await signedIn(t, `player-${index}`, `Player ${index}`)
      await player.mutation(api.games.claimSeat, {
        token,
        displayName: `Player ${index}`,
        color,
        deviceId: `device-player-${index}`,
        variants: ["twoVsTwo"],
        systems: ["riftbound"],
      })
    }
    await host.mutation(api.games.startGame, { publicId })
    const ids = (await host.query(api.games.lobbyProjection, { publicId })).players.map(
      ({ playerId }) => playerId,
    )
    const code = await host.mutation(api.games.watchCode, { publicId })
    await expect(t.query(api.games.watchBoard, { code })).resolves.toMatchObject({
      teams: [ids.slice(0, 2), ids.slice(2)],
    })

    await host.mutation(api.games.finishGame, {
      publicId,
      result: { kind: "win", winnerPlayerIds: ids.slice(2) },
    })
    const board = await t.query(api.games.watchBoard, { code })
    expect(board && "players" in board && board.players.map(({ won }) => !!won)).toEqual([
      false,
      false,
      true,
      true,
    ])
  })

  it("shows nothing for a code no game holds", async () => {
    const t = makeConvexTest()
    await expect(t.query(api.games.watchBoard, { code: "23456789" })).resolves.toBeNull()
    await expect(t.query(api.games.watchBoard, { code: "not a code" })).resolves.toBeNull()
  })
})
