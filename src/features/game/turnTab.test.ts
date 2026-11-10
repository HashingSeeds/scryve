import {
  applyGameCommand,
  createLocalGame,
  localLogPositions,
  undoableTurn,
  withFirstTurn,
  applyLocalTableAction,
  asActorId,
  asDeviceId,
  asOperationId,
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
        { id: "late", playerId: bo.id, delta: -2, life: 18, at: 7_000, operationIds: ["late"] },
        { id: "early", playerId: ada.id, delta: -1, life: 19, at: 2_000, operationIds: ["early"] },
        ...rows,
      ],
      [
        { operationId: "turn-1", playerId: ada.id, number: 1, at: 1_000 },
        { operationId: "turn-2", playerId: bo.id, number: 2, at: 5_000 },
      ],
      (operationId) => ["turn-1", "early", "turn-2", "late"].indexOf(operationId),
    )
    expect(log.map((item) => (item.kind === "turn" ? `turn ${item.number}` : item.id))).toEqual([
      "turn 2",
      "late",
      "turn 1",
      "early",
    ])
  })
})

describe("the local log without a full logOrder", () => {
  it("places every change and loses no row when an older build dropped or never wrote logOrder", () => {
    const created = createLocalGame({
      startingLife: 40,
      now: 0,
      players: [
        { name: "Ada", color: "#000" },
        { name: "Bo", color: "#111" },
      ],
    })
    const [ada, bo] = created.players
    let game = withFirstTurn(created, ada.id, { operationId: "turn-1", now: 0 })
    const tap = (operationId: string, playerId: typeof ada.id, at: number) => {
      game = applyGameCommand(
        game,
        { type: "life.change", playerId, delta: -1 },
        {
          actorId: asActorId("local"),
          deviceId: asDeviceId("device"),
          now: () => at,
          operationId: () => asOperationId(operationId),
        },
      )
    }
    tap("hit-1", ada.id, 5_000)
    game = applyLocalTableAction(
      game,
      { kind: "turn.passed", playerId: ada.id, toPlayerId: bo.id },
      { operationId: "turn-2", now: 6_000 },
    )
    tap("hit-2", bo.id, 9_000)
    const rolledBack = { ...game, logOrder: game.logOrder }
    tap("hit-3", bo.id, 1_000)
    const partial = { ...game, logOrder: rolledBack.logOrder }
    const missing = { ...game, logOrder: undefined }

    for (const saved of [partial, missing]) {
      const positionOf = localLogPositions(saved)
      const ids = [...saved.events.map(({ operationId }) => operationId), "turn-2"]
      expect(ids.every((id) => positionOf(id) !== undefined)).toBe(true)
      const order = ["hit-1", "turn-2", "hit-2", "hit-3"].map((id) => positionOf(id)!)
      expect(order).toEqual([...order].sort((left, right) => left - right))
      const rows = gameLog(saved.players, saved.events)
      const items = withTurnDividers(rows, saved.turnLog ?? [], positionOf)
      expect(items.filter((item) => item.kind !== "turn")).toHaveLength(rows.length)
    }
  })
})

describe("a long-lived local board", () => {
  it("keeps logOrder to the changes its lists still hold, and Undo still picks the newest", () => {
    const created = createLocalGame({
      startingLife: 40,
      system: "mtg",
      format: "commander",
      modeSetup: { planechase: {} },
      now: 0,
      players: [
        { name: "Ada", color: "#000" },
        { name: "Bo", color: "#111" },
      ],
    })
    const [ada, bo] = created.players
    const actor = asActorId("local")
    let game = withFirstTurn(created, ada.id, { operationId: "turn-first", now: 0 })
    let at = 0
    const tap = (playerId: typeof ada.id) => {
      at += 1
      game = applyGameCommand(
        game,
        { type: "life.change", playerId, delta: -1 },
        {
          actorId: actor,
          deviceId: asDeviceId("device"),
          now: () => at,
          operationId: () => asOperationId(`operation-hit-${String(at).padStart(6, "0")}`),
        },
      )
    }
    const table = (action: Parameters<typeof applyLocalTableAction>[1], operationId: string) => {
      at += 1
      game = applyLocalTableAction(game, action, { operationId, now: at })
    }

    for (let round = 0; round < 300; round += 1) {
      tap(ada.id)
      tap(bo.id)
      table(
        {
          kind: "counter.changed",
          playerId: bo.id,
          counterId: "commanderTax",
          delta: round % 2 ? -2 : 2,
        },
        `counter-${round}`,
      )
      table({ kind: "planar.rolled", playerId: ada.id, face: "blank" }, `roll-${round}`)
      table({ kind: "turn.passed", playerId: ada.id, toPlayerId: bo.id }, `turn-pass-${round}`)
      table(
        { kind: "turn.undone", playerId: ada.id, turnOperationId: `turn-pass-${round}` },
        `turn-undo-${round}`,
      )
    }

    const held = new Set<string>([
      ...game.events.map(({ operationId }) => operationId),
      ...(game.turnLog ?? []).map(({ operationId }) => operationId),
      ...(game.counterLog ?? []).map(({ operationId }) => operationId),
      ...(game.table?.modes?.log ?? []).flatMap(({ operationId }) => operationId ?? []),
    ])
    expect(game.events.length).toBeGreaterThan(500)
    expect(game.logOrder?.every((id) => held.has(id))).toBe(true)
    expect(game.logOrder?.length).toBeLessThanOrEqual(held.size)
    expect(game.logOrder).toContain("counter-299")
    expect(game.logOrder).toContain("roll-299")

    table({ kind: "turn.passed", playerId: ada.id, toPlayerId: bo.id }, "turn-pass-last")
    expect(undoableTurn(game, actor)).toEqual({
      playerId: ada.id,
      turnOperationId: "turn-pass-last",
    })
    tap(bo.id)
    expect(undoableTurn(game, actor)).toBeUndefined()
  })
})
