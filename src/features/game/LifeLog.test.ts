import {
  applyGameCommand,
  asActorId,
  asDeviceId,
  asGameId,
  asOperationId,
  createLocalGame,
} from "./domain"
import { lifeLog, localLifeChanges } from "./LifeLog"
import type { CommandContext, GameCommand } from "./types"

let sequence = 0
const context: CommandContext = {
  actorId: asActorId("local"),
  deviceId: asDeviceId("device"),
  now: () => 100 + sequence,
  operationId: () => asOperationId(`op-${++sequence}`),
}

describe("life log", () => {
  it("runs a seat's changes up from the starting total, leaving out undone changes and other seats", () => {
    const duel = createLocalGame({
      gameId: asGameId("game"),
      system: "ygo",
      startingLife: 8000,
      players: [
        { name: "Yugi", color: "#000" },
        { name: "Kaiba", color: "#fff" },
      ],
    })
    const [yugi, kaiba] = duel.players.map(({ id }) => id)
    const commands: GameCommand[] = [
      { type: "life.change", playerId: yugi, delta: -2000 },
      { type: "life.change", playerId: kaiba, delta: -500 },
      { type: "life.change", playerId: yugi, delta: -1200 },
      { type: "life.change", playerId: yugi, delta: -300 },
      { type: "life.undo" },
      { type: "life.change", playerId: yugi, delta: 1000 },
    ]
    const game = commands.reduce(
      (state, command) => applyGameCommand(state, command, context),
      duel,
    )

    const steps = lifeLog(game.startingLife, localLifeChanges(game.events, yugi))

    expect(steps.map(({ delta, life }) => [delta, life])).toEqual([
      [undefined, 8000],
      [-2000, 6000],
      [-1200, 4800],
      [1000, 5800],
    ])
    expect(steps.at(-1)?.life).toBe(game.players[0].life)
  })
})
