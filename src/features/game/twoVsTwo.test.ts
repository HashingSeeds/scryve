import {
  applyGameCommand,
  applyLocalTableAction,
  asActorId,
  asDeviceId,
  asGameId,
  asOperationId,
  createLocalGame,
  createRematch,
  localStandingWinners,
} from "./domain"
import { newGameTabs } from "./gameTypes"
import type { CommandContext, LocalGame } from "./types"
import { SYSTEM_IDS, systemDefinition } from "../../../convex/lib/systems"

let sequence = 0
const context: CommandContext = {
  actorId: asActorId("local"),
  deviceId: asDeviceId("device"),
  now: () => 100,
  operationId: () => asOperationId(`operation-test-000-${++sequence}`),
}

const makeGame = (count = 4) =>
  createLocalGame({
    gameId: asGameId("game"),
    now: 1,
    startingLife: 0,
    system: "riftbound",
    format: "constructed",
    players: Array.from({ length: count }, (_, index) => ({
      name: `P${index + 1}`,
      color: `#00000${index}`,
    })),
    teams: [
      [0, 1],
      [2, 3],
    ],
    teamVariant: "twoVsTwo",
  })

const ids = (game: LocalGame) => game.players.map(({ id }) => id)
const points = (game: LocalGame) => game.players.map(({ life }) => life)
const score = (game: LocalGame, seat: number, delta: number) =>
  applyGameCommand(game, { type: "life.change", playerId: game.players[seat].id, delta }, context)

describe("Riftbound 2v2", () => {
  it("shares one point total across a team and wins it at 11, not 8", () => {
    const game = makeGame()
    expect(game.variant).toBe("twoVsTwo")
    const [a, b] = ids(game)
    const eight = score(score(game, 0, 5), 1, 3)
    expect(points(eight)).toEqual([8, 8, 0, 0])
    expect(localStandingWinners(eight)).toBeUndefined()
    const eleven = score(eight, 1, 3)
    expect(points(eleven)).toEqual([11, 11, 0, 0])
    expect(localStandingWinners(eleven)).toEqual([a, b])
  })

  it("keeps XP per player", () => {
    const game = makeGame()
    const next = applyLocalTableAction(
      game,
      { kind: "counter.changed", playerId: game.players[0].id, counterId: "xp", delta: 3 },
      { operationId: "operation-0000-xp-1", now: 2 },
    )
    expect(ids(next).map((id) => next.table?.players[id]?.counters?.xp ?? 0)).toEqual([3, 0, 0, 0])
  })

  it("plays only at 4 seats and keeps 2v2 for a rematch", () => {
    expect(() => makeGame(6)).toThrow("2v2 needs 4 seats")
    expect(createRematch(makeGame()).variant).toBe("twoVsTwo")
  })

  it("is offered by Riftbound only", () => {
    expect(SYSTEM_IDS.filter((id) => systemDefinition(id)?.variants.includes("twoVsTwo"))).toEqual([
      "riftbound",
    ])
    const offered = newGameTabs({ recent: [], connected: false }).flatMap(({ types }) =>
      types.filter(({ variant }) => variant === "twoVsTwo"),
    )
    expect(offered).toEqual([
      { id: "riftbound-2v2", system: "riftbound", format: "constructed", variant: "twoVsTwo" },
    ])
  })
})
