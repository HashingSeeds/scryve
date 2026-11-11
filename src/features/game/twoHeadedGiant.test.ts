import {
  applyGameCommand,
  applyLocalTableAction,
  asActorId,
  asDeviceId,
  asGameId,
  asOperationId,
  createLocalGame,
  createRematch,
  localOutReason,
  localStandingWinners,
  teamSeats,
} from "./domain"
import type { CommandContext, LocalGame, PlayerId } from "./types"
import { nextTurnSeat } from "../../../convex/lib/turns"

let sequence = 0
const context: CommandContext = {
  actorId: asActorId("local"),
  deviceId: asDeviceId("device"),
  now: () => 100,
  operationId: () => asOperationId(`op-${++sequence}`),
}

function makeGame(
  count = 4,
  teams = [
    [0, 1],
    [2, 3],
  ],
  format = "limited",
) {
  return createLocalGame({
    gameId: asGameId("game"),
    now: 1,
    startingLife: 30,
    system: "mtg",
    format,
    players: Array.from({ length: count }, (_, index) => ({
      name: `P${index + 1}`,
      color: "#000",
    })),
    teams,
  })
}

const ids = (game: LocalGame) => game.players.map(({ id }) => id)
const lives = (game: LocalGame) => game.players.map(({ life }) => life)

function poison(game: LocalGame, seat: number, delta: number) {
  return applyLocalTableAction(
    game,
    { kind: "counter.changed", playerId: game.players[seat].id, counterId: "poison", delta },
    { operationId: `poison-${++sequence}`, now: 2 },
  )
}

describe("Two-Headed Giant", () => {
  it("makes teams from setup seats and passes the turn team to team", () => {
    const game = makeGame(6, [
      [0, 3],
      [1, 4],
      [2, 5],
    ])
    const [a, b, c, d, e, f] = ids(game)
    expect(game.variant).toBe("twoHeadedGiant")
    expect(game.turnGroups).toEqual([
      [a, d],
      [b, e],
      [c, f],
    ])
    expect(nextTurnSeat([a, d, b, e, c, f], d, () => false, game.turnGroups)).toBe(b)
    expect(teamSeats(createRematch(game))).toEqual([
      [0, 3],
      [1, 4],
      [2, 5],
    ])
    expect(() =>
      makeGame(5, [
        [0, 1],
        [2, 3],
      ]),
    ).toThrow()
    expect(() => makeGame(4, [[0, 1, 2], [3]])).toThrow()
    const pairs = (count: number) =>
      Array.from({ length: count / 2 }, (_, team) => [2 * team, 2 * team + 1])
    expect(makeGame(8, pairs(8)).turnGroups).toHaveLength(4)
    expect(makeGame(10, pairs(10)).turnGroups).toHaveLength(5)
    expect(() => makeGame(12, pairs(12))).toThrow()
  })

  it("shares life between teammates, from either head and from commander damage", () => {
    const game = makeGame(
      4,
      [
        [0, 1],
        [2, 3],
      ],
      "commander",
    )
    const [a, b, c] = ids(game)
    let next = applyGameCommand(game, { type: "life.change", playerId: b, delta: -4 }, context)
    expect(lives(next)).toEqual([26, 26, 30, 30])
    next = applyGameCommand(
      next,
      { type: "commanderDamage.assign", fromPlayerId: c, toPlayerId: a, delta: 5 },
      context,
    )
    expect(lives(next)).toEqual([21, 21, 30, 30])
    next = applyGameCommand(next, { type: "life.undo" }, context)
    expect(lives(next)).toEqual([26, 26, 30, 30])
  })

  it("shares poison and loses the whole team at 15", () => {
    let game = poison(makeGame(), 0, 10)
    expect(game.table?.players[game.players[1].id]?.counters?.poison).toBe(10)
    expect(localOutReason(game, game.players[0].id)).toBeUndefined()
    game = poison(game, 1, 5)
    expect(localOutReason(game, game.players[0].id)).toMatchObject({ cause: "counter", value: 15 })
    expect(localOutReason(game, game.players[1].id)).toMatchObject({ cause: "counter" })
    expect(localStandingWinners(game)).toEqual(ids(game).slice(2))
  })

  it("loses the team at 0 life and at 21 from one commander across both heads", () => {
    const game = makeGame(
      4,
      [
        [0, 1],
        [2, 3],
      ],
      "commander",
    )
    const [a, b, c, d] = ids(game)
    const out = applyGameCommand(game, { type: "life.change", playerId: c, delta: -30 }, context)
    expect(localOutReason(out, d)).toEqual({ cause: "life" })
    expect(localStandingWinners(out)).toEqual([a, b])

    const hit = (current: LocalGame, toPlayerId: PlayerId, delta: number) =>
      applyGameCommand(
        current,
        { type: "commanderDamage.assign", fromPlayerId: c, toPlayerId, delta },
        context,
      )
    const split = hit(hit(game, a, 10), b, 10)
    expect(localOutReason(split, a)).toBeUndefined()
    expect(localOutReason(hit(split, b, 1), a)).toMatchObject({
      cause: "commanderDamage",
      fromPlayerId: c,
      total: 21,
    })
  })
})
