import { makeConvexTest, signedIn, type ConvexTestHarness } from "../test/convexTest"
import { api } from "./_generated/api"

const token = "f".repeat(43)
const publicId = "cloud-first-player-game-0001"
const rematch = {
  publicId: "cloud-first-player-game-0002",
  inviteToken: "r".repeat(43),
  manualCodeCandidates: ["REM234"],
}

async function cloudGame(
  t: ConvexTestHarness,
  options: { firstPlayerMode?: "roll" | "pick"; freeMulligans?: "none" | "first" | "all" },
  system: { system?: string; ruleset: string; startingLife: number } = {
    ruleset: "modern",
    startingLife: 20,
  },
) {
  const host = await signedIn(t, "host", "Host")
  const guest = await signedIn(t, "guest", "Guest")
  await host.mutation(api.games.createLobby, {
    publicId,
    playerCount: 2,
    ...system,
    ...options,
    inviteToken: token,
    manualCodeCandidates: ["ABC234"],
    hostDisplayName: "Host",
    hostColor: "#123456",
  })
  await guest.mutation(api.games.claimSeat, { token, displayName: "Guest", color: "#654321" })
  return { host, guest }
}

async function start(host: Awaited<ReturnType<typeof signedIn>>) {
  await host.mutation(api.games.startGame, { publicId })
  const { players } = await host.query(api.games.lobbyProjection, { publicId })
  return players.map(({ playerId }) => playerId)
}

describe("first player in a cloud game", () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it("rolls once for every device, and the first roll stands", async () => {
    const t = makeConvexTest()
    const { host, guest } = await cloudGame(t, { firstPlayerMode: "roll" })
    const [hostSeat, guestSeat] = await start(host)
    await guest.mutation(api.games.rollFirstPlayer, { publicId })
    const first = (await guest.query(api.games.lobbyProjection, { publicId })).firstPlayer
    const rolls = first?.rolls ?? {}
    const winner = (rolls[hostSeat] ?? 0) > (rolls[guestSeat] ?? 0) ? hostSeat : guestSeat
    expect(first).toEqual({
      mode: "roll",
      playerId: winner,
      rolls: { [hostSeat]: expect.any(Number), [guestSeat]: expect.any(Number) },
    })
    expect(rolls[hostSeat]).not.toBe(rolls[guestSeat])
    await host.mutation(api.games.rollFirstPlayer, { publicId })
    expect((await host.query(api.games.lobbyProjection, { publicId })).firstPlayer).toEqual(first)
  })

  it("lets the flip winner choose in a two-player coin-flip system", async () => {
    const t = makeConvexTest()
    const { host, guest } = await cloudGame(
      t,
      { firstPlayerMode: "roll" },
      { system: "pokemon", ruleset: "standard", startingLife: 6 },
    )
    const [hostSeat, guestSeat] = await start(host)
    jest.spyOn(Math, "random").mockReturnValue(0.7)
    await host.mutation(api.games.rollFirstPlayer, { publicId })
    expect((await host.query(api.games.lobbyProjection, { publicId })).firstPlayer).toEqual({
      mode: "roll",
      chooser: { playerId: guestSeat, reason: "flip" },
    })
    await expect(
      host.mutation(api.games.chooseFirstPlayer, { publicId, playerId: hostSeat }),
    ).rejects.toThrow(/chooses who goes first/)
    await guest.mutation(api.games.chooseFirstPlayer, { publicId, playerId: hostSeat })
    expect((await host.query(api.games.lobbyProjection, { publicId })).firstPlayer).toEqual({
      mode: "roll",
      playerId: hostSeat,
    })
  })

  it("takes the first pick, records who went first, and hands the rematch to the loser", async () => {
    const t = makeConvexTest()
    const { host, guest } = await cloudGame(t, { firstPlayerMode: "pick" })
    const [hostSeat, guestSeat] = await start(host)
    await guest.mutation(api.games.chooseFirstPlayer, { publicId, playerId: guestSeat })
    await host.mutation(api.games.chooseFirstPlayer, { publicId, playerId: hostSeat })
    await host.mutation(api.games.finishGame, {
      publicId,
      result: { kind: "win", winnerPlayerIds: [hostSeat] },
      rematch,
    })
    const summary = await t.run((ctx) => ctx.db.query("gameSummaries").first())
    expect(summary?.firstPlayerId).toBe(guestSeat)

    const next = await guest.query(api.games.lobbyProjection, { publicId: rematch.publicId })
    expect(next.firstPlayer).toEqual({
      mode: "pick",
      chooser: { playerId: next.players[1].playerId, reason: "loss" },
    })
  })

  it("refuses a pick in a game set to roll, and a roll in a game set to pick", async () => {
    const t = makeConvexTest()
    const { host } = await cloudGame(t, { firstPlayerMode: "pick" })
    const [hostSeat] = await start(host)
    await expect(host.mutation(api.games.rollFirstPlayer, { publicId })).rejects.toThrow()

    const other = makeConvexTest()
    const { host: rollHost } = await cloudGame(other, { firstPlayerMode: "roll" })
    await start(rollHost)
    await expect(
      rollHost.mutation(api.games.chooseFirstPlayer, { publicId, playerId: hostSeat }),
    ).rejects.toThrow()
  })
})

describe("mulligans in a cloud game", () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it("keeps the seat owner's mulligans once and records the kept hand on their deck", async () => {
    const t = makeConvexTest()
    const { host, guest } = await cloudGame(t, { freeMulligans: "first" })
    const deckId = await host.mutation(api.decks.create, {
      name: "Burn",
      format: "modern",
      deckKey: "burn",
    })
    const deckVersionId = await host.mutation(api.decks.saveVersion, { deckId, cards: [] })
    await host.mutation(api.decks.selectForSeat, { publicId, seat: 1, deckVersionId })
    const [hostSeat] = await start(host)

    await expect(
      guest.mutation(api.games.keepHand, { publicId, seat: 1, mulligans: 1 }),
    ).rejects.toThrow()
    await expect(
      guest.mutation(api.games.keepHand, { publicId, seat: 2, mulligans: 1 }),
    ).rejects.toThrow(/doesn't track mulligans/)
    await host.mutation(api.games.keepHand, { publicId, seat: 1, mulligans: 2 })
    await host.mutation(api.games.keepHand, { publicId, seat: 1, mulligans: 0 })
    const board = await guest.query(api.games.lobbyProjection, { publicId })
    expect(board.freeMulligans).toBe("first")
    expect(board.players.map((player) => player.mulligans)).toEqual([2, undefined])

    await host.mutation(api.games.finishGame, {
      publicId,
      result: { kind: "win", winnerPlayerIds: [hostSeat] },
    })
    const results = await t.run((ctx) => ctx.db.query("deckResults").collect())
    expect(
      results.map(({ deckKey, mulligans, keptHand }) => [deckKey, mulligans, keptHand]),
    ).toEqual(
      expect.arrayContaining([
        ["burn", 2, 6],
        [undefined, undefined, undefined],
      ]),
    )
  })
})
