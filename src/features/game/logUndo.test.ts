import {
  applyGameCommand,
  applyLocalTableAction,
  asActorId,
  asDeviceId,
  asOperationId,
  createLocalGame,
  withFirstTurn,
} from "./domain"
import { newestLogUndo, undoLogRow, type LogUndo } from "./logUndo"
import type { CommandContext, LocalGame } from "./types"
import type { TableAction } from "../../../convex/lib/table"

const actor = asActorId("local")
let clock = 1_000
let sequence = 0
const context: CommandContext = {
  actorId: actor,
  deviceId: asDeviceId("device"),
  now: () => clock,
  operationId: () => asOperationId(`op-${++sequence}`),
}
const at = (now: number) => {
  clock = now
  return { operationId: `op-${++sequence}`, now }
}

function game() {
  const created = createLocalGame({
    startingLife: 40,
    system: "mtg",
    format: "commander",
    now: 0,
    players: [
      { name: "Ada", color: "#000" },
      { name: "Bo", color: "#111" },
    ],
  })
  return withFirstTurn(created, created.players[0].id, { operationId: "turn-1", now: 500 })
}

const table = (current: LocalGame, action: TableAction, now: number) =>
  applyLocalTableAction(current, action, at(now))

function undoNewest(current: LocalGame, turns = true) {
  const undo: LogUndo | undefined = newestLogUndo(current, { turns })
  if (!undo || undo.kind === "turn") throw new Error(`expected a row, got ${undo?.kind}`)
  return undoLogRow(current, undo, context)
}

describe("the game log's Undo", () => {
  it("takes back the newest row whatever it is, a folded burst at once", () => {
    let current = game()
    const [ada, bo] = current.players
    clock = 1_000
    current = applyGameCommand(
      current,
      { type: "life.change", playerId: bo.id, delta: -3 },
      context,
    )
    current = table(
      current,
      { kind: "counter.changed", playerId: bo.id, counterId: "poison", delta: 1 },
      4_000,
    )
    current = table(
      current,
      { kind: "counter.changed", playerId: bo.id, counterId: "poison", delta: 1 },
      4_500,
    )
    current = table(
      current,
      { kind: "customCounter.changed", playerId: ada.id, name: "Speed", delta: 1 },
      8_000,
    )

    current = undoNewest(current)
    expect(current.table?.players[ada.id]).toEqual({})
    current = undoNewest(current)
    expect(current.table?.players[bo.id].counters).toEqual({ poison: 0 })
    expect(current.counterLog).toBeUndefined()
    current = undoNewest(current)
    expect(current.players[1].life).toBe(40)
    expect(newestLogUndo(current, { turns: true })).toBeUndefined()
  })

  it("takes back a pass only when it is the newest thing the log shows", () => {
    const base = game()
    const [ada, bo] = base.players
    const pass: TableAction = { kind: "turn.passed", playerId: ada.id, toPlayerId: bo.id }
    const poison: TableAction = {
      kind: "counter.changed",
      playerId: bo.id,
      counterId: "poison",
      delta: 1,
    }

    const passedLast = table(table(base, poison, 2_000), pass, 5_000)
    expect(newestLogUndo(passedLast, { turns: true })).toMatchObject({ kind: "turn" })
    expect(newestLogUndo(passedLast, { turns: false })).toMatchObject({ kind: "counter" })

    const counterLast = table(table(base, pass, 2_000), poison, 5_000)
    expect(newestLogUndo(counterLast, { turns: true })).toMatchObject({
      kind: "counter",
      counterId: "poison",
    })
  })

  it("takes back a pass when the only taps after it cancel out", () => {
    const base = game()
    const [ada, bo] = base.players
    const counted = table(
      base,
      { kind: "counter.changed", playerId: bo.id, counterId: "poison", delta: 1 },
      1_000,
    )
    let current = table(
      counted,
      { kind: "turn.passed", playerId: ada.id, toPlayerId: bo.id },
      2_000,
    )
    clock = 3_000
    current = applyGameCommand(
      current,
      { type: "life.change", playerId: bo.id, delta: -1 },
      context,
    )
    clock = 3_200
    current = applyGameCommand(current, { type: "life.change", playerId: bo.id, delta: 1 }, context)

    expect(newestLogUndo(current, { turns: true })).toMatchObject({
      kind: "turn",
      playerId: ada.id,
    })
  })
})
