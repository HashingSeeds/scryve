import { applyGameCommand, asActorId, asDeviceId, asOperationId, createLocalGame } from "./domain"
import { gameShape } from "./gameShape"
import type { GameCommand, LocalGame } from "./types"

const start = createLocalGame({
  now: 0,
  startingLife: 40,
  system: "mtg",
  format: "commander",
  players: [
    { name: "A", color: "#000" },
    { name: "B", color: "#fff" },
  ],
})

function play(commands: GameCommand[], times: number[]) {
  let sequence = 0
  let game: LocalGame = start
  commands.forEach((command, index) => {
    game = applyGameCommand(game, command, {
      actorId: asActorId("local"),
      deviceId: asDeviceId("device"),
      now: () => times[index],
      operationId: () => asOperationId(`op-${++sequence}`),
    })
  })
  return game
}

it("measures play from the first life change, idle time before the end, undos, and the lowest seat", () => {
  const [a, b] = start.players
  const game = play(
    [
      { type: "life.change", playerId: a.id, delta: -30 },
      { type: "life.change", playerId: b.id, delta: -1 },
      { type: "life.undo" },
      {
        type: "commanderDamage.assign",
        fromPlayerId: a.id,
        toPlayerId: b.id,
        delta: 5,
      },
      { type: "game.finish", result: { kind: "win", winnerPlayerIds: [b.id] } },
    ],
    [60_000, 70_000, 80_000, 90_000, 900_000],
  )

  expect(gameShape(game)).toEqual({
    duration_ms: 840_000,
    idle_ms: 810_000,
    result: "win",
    change_count: 3,
    undo_count: 1,
    lowest_life_pct: 25,
    seat_out: false,
    commander_damage_used: true,
    counters_used: false,
    clock_used: false,
  })
})
