import {
  applyGameCommand,
  asActorId,
  asDeviceId,
  asGameId,
  asOperationId,
  asPlayerId,
  createLocalGame,
  createClientId,
  reduceGameEvent,
  validatePlayerNames,
} from "./domain"
import type { CommandContext, GameEvent, LifeDelta } from "./types"

function makeContext(actor = "local") {
  let now = 100
  let sequence = 0
  const context: CommandContext = {
    actorId: asActorId(actor),
    deviceId: asDeviceId("device"),
    now: () => ++now,
    operationId: () => asOperationId(`op-${++sequence}`),
  }
  return context
}

function makeGame(count = 2, startingLife = 20) {
  return createLocalGame({
    gameId: asGameId("game"),
    now: 1,
    startingLife,
    players: Array.from({ length: count }, (_, i) => ({ name: `Player ${i + 1}`, color: "#000" })),
  })
}

describe("local game domain", () => {
  it("uses independent secure UUID entropy even at the same timestamp", () => {
    const first = createClientId("operation", 123, () => "00000000-0000-4000-8000-000000000001")
    const second = createClientId("operation", 123, () => "00000000-0000-4000-8000-000000000002")
    expect(first).not.toBe(second)
    expect(first).toBe("operation_00000000000040008000000000000001")
  })

  it.each([2, 3, 4, 5, 6])("creates a valid %i-player game", (count) => {
    const game = makeGame(count, 40)
    expect(game.players).toHaveLength(count)
    expect(game.players.every(({ life }) => life === 40)).toBe(true)
  })

  it("rejects invalid player counts and starting life", () => {
    expect(() => makeGame(1)).toThrow("2–6")
    expect(() => makeGame(7)).toThrow("2–6")
    expect(() => makeGame(2, 0)).toThrow("1 to 999")
  })

  it("normalizes valid player names and rejects blank, duplicate, or overlong seats", () => {
    expect(validatePlayerNames([" Ada ", "Grace"])).toEqual({
      valid: true,
      names: ["Ada", "Grace"],
      errors: [undefined, undefined],
    })
    expect(validatePlayerNames([" ", "Ada", "ada", "x".repeat(25)])).toEqual({
      valid: false,
      names: ["", "Ada", "ada", "x".repeat(25)],
      errors: [
        "Enter a player name.",
        "Player names must be unique.",
        "Player names must be unique.",
        "Use 24 characters or fewer.",
      ],
    })
  })

  it("allows life below zero and applies preset or custom additive deltas", () => {
    const context = makeContext()
    let game = makeGame(2, 1)
    const playerId = game.players[0].id
    for (const delta of [-5, -1, 1, 5, 17] as LifeDelta[]) {
      game = applyGameCommand(game, { type: "life.change", playerId, delta }, context)
    }
    game = applyGameCommand(game, { type: "life.change", playerId, delta: -23 }, context)
    expect(game.players[0].life).toBe(-5)
  })

  it("deduplicates operation IDs", () => {
    const game = makeGame()
    const event: GameEvent = {
      type: "life.changed",
      gameId: game.id,
      playerId: game.players[0].id,
      delta: 5,
      actorId: asActorId("actor"),
      deviceId: asDeviceId("device"),
      operationId: asOperationId("same"),
      clientCreatedAt: 2,
    }
    const once = reduceGameEvent(game, event)
    expect(reduceGameEvent(once, event)).toBe(once)
    expect(once.players[0].life).toBe(25)
  })

  it("undoes the latest actor change with a compensating event and preserves history", () => {
    const context = makeContext("actor-a")
    let game = makeGame()
    game = applyGameCommand(
      game,
      { type: "life.change", playerId: game.players[0].id, delta: -5 },
      context,
    )
    const original = game.events[0]
    game = applyGameCommand(game, { type: "life.undo" }, context)
    expect(game.players[0].life).toBe(20)
    expect(game.events).toHaveLength(2)
    expect(game.events[0]).toBe(original)
    expect(game.events[1]).toMatchObject({
      type: "life.changed",
      delta: 5,
      compensatesOperationId: original.operationId,
    })
    expect(applyGameCommand(game, { type: "life.undo" }, context)).toBe(game)
  })

  it("does not undo another actor's action", () => {
    const actorA = makeContext("actor-a")
    const actorB = makeContext("actor-b")
    let game = makeGame()
    game = applyGameCommand(
      game,
      { type: "life.change", playerId: game.players[1].id, delta: 1 },
      actorA,
    )
    expect(applyGameCommand(game, { type: "life.undo" }, actorB)).toBe(game)
  })

  it("matches life totals to the sum of a deterministic property-style event stream", () => {
    const context = makeContext()
    let game = makeGame(6, 30)
    const expected = Array(6).fill(30) as number[]
    const deltas: LifeDelta[] = [-5, -1, 1, 5]
    for (let index = 0; index < 240; index += 1) {
      const playerIndex = (index * 17) % 6
      const delta = deltas[(index * 7) % deltas.length]
      expected[playerIndex] += delta
      game = applyGameCommand(
        game,
        { type: "life.change", playerId: game.players[playerIndex].id, delta },
        context,
      )
    }
    expect(game.players.map(({ life }) => life)).toEqual(expected)
  })

  it("records the winners chosen when a game is finished", () => {
    const game = makeGame(3)
    const winner = game.players[1].id
    const ended = applyGameCommand(
      game,
      { type: "game.finish", result: { kind: "win", winnerPlayerIds: [winner] } },
      makeContext(),
    )
    expect(ended.result).toEqual({ kind: "win", winnerPlayerIds: [winner] })
    expect(ended.events.at(-1)).toMatchObject({
      type: "game.finished",
      result: { kind: "win", winnerPlayerIds: [winner] },
    })
  })

  it("records a draw and leaves an unreported result off the game", () => {
    const game = makeGame()
    expect(
      applyGameCommand(game, { type: "game.finish", result: { kind: "draw" } }, makeContext())
        .result,
    ).toEqual({ kind: "draw" })
    expect(applyGameCommand(game, { type: "game.finish" }, makeContext()).result).toBeUndefined()
  })

  it("drops winners who never played and deduplicates the rest", () => {
    const game = makeGame(3)
    const winner = game.players[0].id
    const ended = applyGameCommand(
      game,
      {
        type: "game.finish",
        result: { kind: "win", winnerPlayerIds: [winner, winner, asPlayerId("stranger")] },
      },
      makeContext(),
    )
    expect(ended.result).toEqual({ kind: "win", winnerPlayerIds: [winner] })
  })

  it("treats a win with no surviving winners as no result recorded", () => {
    const game = makeGame()
    const ended = applyGameCommand(
      game,
      { type: "game.finish", result: { kind: "win", winnerPlayerIds: [asPlayerId("stranger")] } },
      makeContext(),
    )
    expect(ended.status).toBe("finished")
    expect(ended.result).toBeUndefined()
  })

  it("freezes life changes after finish or abandon", () => {
    const context = makeContext()
    for (const command of [{ type: "game.finish" }, { type: "game.abandon" }] as const) {
      const active = makeGame()
      const ended = applyGameCommand(active, command, context)
      expect(ended.status).toBe(command.type === "game.finish" ? "finished" : "abandoned")
      expect(
        applyGameCommand(
          ended,
          { type: "life.change", playerId: ended.players[0].id, delta: 1 },
          context,
        ),
      ).toBe(ended)
    }
  })
})
