import {
  createLocalGame,
  undoableTurn,
  withFirstTurn,
  applyLocalTableAction,
  asActorId,
  startTurnOnChange,
} from "./domain"
import { gameLog, withTurnDividers } from "./LifeLog"
import { clockwiseSlots } from "./turnTab"

describe("clockwiseSlots", () => {
  it("walks the grid's edge clockwise", () => {
    expect(
      clockwiseSlots([
        [0, 1],
        [2, 3],
      ]),
    ).toEqual([0, 1, 3, 2])
    expect(clockwiseSlots([[0], [1, 2], [3, 4], [5]])).toEqual([0, 2, 4, 5, 3, 1])
    expect(clockwiseSlots([[0], [1, 2]])).toEqual([0, 2, 1])
  })
})

describe("local turn clock", () => {
  it("starts on the table's first change, whoever makes it", () => {
    const game = createLocalGame({
      players: [
        { name: "Ada", color: "#f00" },
        { name: "Bo", color: "#00f" },
      ],
      startingLife: 20,
      now: 0,
    })
    const [ada] = game.players
    const waiting = applyLocalTableAction(
      game,
      { kind: "turn.set", playerId: ada.id, toPlayerId: ada.id },
      { operationId: "turn-1", now: 1_000 },
    )
    expect(waiting.turn?.waiting).toBe(true)
    const rolled = withFirstTurn(game, ada.id, { operationId: "roll-1", now: 1_000 })
    expect(rolled.turn?.waiting).toBe(true)
    const started = startTurnOnChange(waiting, 3_000)
    expect(started.turn).toMatchObject({
      playerId: ada.id,
      startedAt: 3_000,
      operationId: "turn-1",
    })
    expect(started.turn?.waiting).toBeUndefined()
    expect(started.turnLog).toEqual([
      { operationId: "turn-1", playerId: ada.id, number: 1, at: 3_000 },
    ])
    expect(startTurnOnChange(started, 9_000)).toBe(started)
  })

  it("gives a shared turn to its group, whichever seat is rolled", () => {
    const game = createLocalGame({
      players: ["Ada", "Bo", "Cy"].map((name) => ({ name, color: "#f00" })),
      startingLife: 20,
      now: 0,
    })
    const [ada, bo, cy] = game.players
    const teams = { ...game, turnGroups: [[ada.id, bo.id]] }
    const rolled = withFirstTurn(teams, bo.id, { operationId: "roll-1", now: 1_000 })
    expect(rolled.turn?.playerId).toBe(ada.id)
    const passed = applyLocalTableAction(
      rolled,
      { kind: "turn.passed", playerId: bo.id, toPlayerId: cy.id },
      { operationId: "turn-2", now: 2_000 },
    )
    expect(passed.turn).toMatchObject({ playerId: cy.id, number: 2 })
  })
})

describe("local turns", () => {
  const actor = asActorId("actor_device")
  function started() {
    const game = createLocalGame({
      players: [
        { name: "Ada", color: "#f00" },
        { name: "Bo", color: "#00f" },
      ],
      startingLife: 20,
      now: 0,
    })
    return withFirstTurn(game, game.players[0].id, { operationId: "turn-1", now: 1_000 })
  }

  it("logs each turn start, and an undo takes back the newest", () => {
    const game = started()
    const [ada, bo] = game.players
    const passed = applyLocalTableAction(
      game,
      { kind: "turn.passed", playerId: ada.id, toPlayerId: bo.id },
      { operationId: "turn-2", now: 5_000 },
    )
    expect(passed.turnLog?.map(({ number, playerId }) => [number, playerId])).toEqual([
      [1, ada.id],
      [2, bo.id],
    ])
    expect(undoableTurn(passed, actor)).toEqual({ playerId: ada.id, turnOperationId: "turn-2" })
    const undone = applyLocalTableAction(
      passed,
      { kind: "turn.undone", playerId: ada.id, turnOperationId: "turn-2" },
      { operationId: "undo-1", now: 6_000 },
    )
    expect(undone.turn).toEqual(game.turn)
    expect(undone.turnLog).toEqual(game.turnLog)
  })

  it("heads each turn's changes with its divider in the log", () => {
    const game = started()
    const rows = gameLog(game.players, [])
    const [ada, bo] = game.players
    const log = withTurnDividers(
      [
        { id: "late", playerId: bo.id, delta: -2, life: 18, at: 7_000 },
        { id: "early", playerId: ada.id, delta: -1, life: 19, at: 2_000 },
        ...rows,
      ],
      [
        { operationId: "turn-1", playerId: ada.id, number: 1, at: 1_000 },
        { operationId: "turn-2", playerId: bo.id, number: 2, at: 5_000 },
      ],
    )
    expect(log.map((item) => (item.kind === "turn" ? `turn ${item.number}` : item.id))).toEqual([
      "turn 2",
      "late",
      "turn 1",
      "early",
    ])
  })
})
