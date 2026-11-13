import { type ConvexTestHarness, makeConvexTest, signedIn } from "../test/convexTest"
import { api } from "./_generated/api"

const rematch = (number: number) => ({
  publicId: `match-game-public-id-${number}`,
  inviteToken: String(number).repeat(43),
  manualCodeCandidates: [`REM23${number}`],
})

async function matchGame(t: ConvexTestHarness) {
  const host = await signedIn(t, "match-host", "Host")
  const joiner = await signedIn(t, "match-joiner", "Joiner")
  const { publicId } = await host.mutation(api.games.createLobby, {
    publicId: "match-game-public-id-1",
    playerCount: 2,
    startingLife: 20,
    ruleset: "standard",
    matchBestOf: 3,
    inviteToken: "t".repeat(43),
    manualCodeCandidates: ["ABC234"],
    hostDisplayName: "Host",
    hostColor: "#7C3AED",
  })
  await joiner.mutation(api.games.claimSeat, {
    token: "t".repeat(43),
    displayName: "Joiner",
    color: "#2563EB",
  })
  await host.mutation(api.games.startGame, { publicId })
  const board = (id: string) => joiner.query(api.games.lobbyProjection, { publicId: id })
  const hostWins = async (id: string, next?: number) => {
    const { players } = await board(id)
    return await host.mutation(api.games.finishGame, {
      publicId: id,
      result: { kind: "win", winnerPlayerIds: [players[0].playerId] },
      ...(next ? { rematch: rematch(next) } : {}),
    })
  }
  return { host, joiner, publicId, board, hostWins }
}

describe("a match in a hosted game", () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it("carries the score into each rematch and ends when a seat wins enough games", async () => {
    const game = await matchGame(makeConvexTest())
    expect((await game.board(game.publicId)).match).toMatchObject({ bestOf: 3, gameNumber: 1 })

    await game.hostWins(game.publicId, 2)
    expect((await game.board(rematch(2).publicId)).match).toMatchObject({
      gameNumber: 2,
      status: "active",
      seats: [
        { seat: 1, gamesWon: 1, gamesDrawn: 0 },
        { seat: 2, gamesWon: 0, gamesDrawn: 0 },
      ],
    })

    await game.hostWins(rematch(2).publicId, 3)
    expect((await game.board(rematch(2).publicId)).match).toMatchObject({
      status: "finished",
      seats: [
        { seat: 1, gamesWon: 2, outcome: "win" },
        { seat: 2, gamesWon: 0, outcome: "loss" },
      ],
    })
    expect((await game.board(rematch(3).publicId)).match).toMatchObject({
      gameNumber: 1,
      status: "active",
      seats: [{ gamesWon: 0 }, { gamesWon: 0 }],
    })

    const history = await game.joiner.query(api.history.entries, {
      paginationOpts: { numItems: 10, cursor: null },
    })
    expect(
      history.page.map((entry) => entry.kind === "game" && [entry.matchGameNumber, entry.match]),
    ).toEqual([
      [2, expect.objectContaining({ status: "finished", outcome: "loss", bestOf: 3 })],
      [1, expect.objectContaining({ status: "finished", outcome: "loss" })],
    ])
  })

  it("lets only the host call the match early, once a game has finished", async () => {
    const game = await matchGame(makeConvexTest())
    const drawn = [
      { seat: 1, outcome: "draw" as const },
      { seat: 2, outcome: "draw" as const },
    ]
    await expect(
      game.host.mutation(api.games.endMatch, { publicId: game.publicId, seats: drawn }),
    ).rejects.toMatchObject({ data: { code: "match_needs_game" } })
    expect((await game.board(game.publicId)).status).toBe("active")

    await game.hostWins(game.publicId, 2)
    const second = rematch(2).publicId
    expect((await game.board(second)).match).not.toHaveProperty("canEnd")
    expect(
      (await game.host.query(api.games.lobbyProjection, { publicId: second })).match,
    ).toMatchObject({ canEnd: true })
    await expect(
      game.joiner.mutation(api.games.endMatch, { publicId: second, seats: drawn }),
    ).rejects.toThrow()
    await expect(
      game.host.mutation(api.games.endMatch, { publicId: game.publicId, seats: drawn }),
    ).rejects.toMatchObject({ data: { code: "match_moved_on" } })
    await expect(
      game.host.mutation(api.games.endMatch, { publicId: second, seats: drawn }),
    ).rejects.toThrow("most game wins")

    await game.host.mutation(api.games.endMatch, {
      publicId: second,
      seats: [
        { seat: 1, outcome: "win" },
        { seat: 2, outcome: "loss" },
      ],
    })
    expect(await game.board(second)).toMatchObject({
      status: "active",
      match: { gameNumber: 1, status: "active", seats: [{ gamesWon: 0 }, { gamesWon: 0 }] },
    })
    const history = await game.host.query(api.history.entries, {
      paginationOpts: { numItems: 10, cursor: null },
    })
    expect(history.page.map((entry) => entry.kind === "game" && entry.match)).toEqual([
      expect.objectContaining({ status: "finished", outcome: "win" }),
    ])

    await game.host.mutation(api.games.changeLife, {
      publicId: second,
      playerId: (await game.board(second)).players[0].playerId,
      operationId: "operation-match-life-1",
      delta: -1,
      deviceId: "device-host-0001",
      clientCreatedAt: 1_700_000_000_000,
    })
    await game.hostWins(second, 3)
    await expect(
      game.host.mutation(api.games.endMatch, { publicId: rematch(3).publicId, seats: drawn }),
    ).rejects.toThrow("most game wins")
    await game.host.mutation(api.games.changeLife, {
      publicId: rematch(3).publicId,
      playerId: (await game.board(rematch(3).publicId)).players[0].playerId,
      operationId: "operation-match-life-2",
      delta: -1,
      deviceId: "device-host-0001",
      clientCreatedAt: 1_700_000_000_000,
    })
    await expect(
      game.host.mutation(api.games.endMatch, { publicId: rematch(3).publicId, seats: drawn }),
    ).rejects.toMatchObject({ data: { code: "match_game_in_progress" } })
  })
})
