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
  const undo: LogUndo | undefined = newestLogUndo(current, actor, { turns })
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
    expect(newestLogUndo(current, actor, { turns: true })).toBeUndefined()
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
    expect(newestLogUndo(passedLast, actor, { turns: true })).toMatchObject({ kind: "turn" })
    expect(newestLogUndo(passedLast, actor, { turns: false })).toMatchObject({ kind: "counter" })

    const counterLast = table(table(base, pass, 2_000), poison, 5_000)
    expect(newestLogUndo(counterLast, actor, { turns: true })).toMatchObject({
      kind: "counter",
      counterId: "poison",
    })
  })
})

describe("log undo in Two-Headed Giant", () => {
  it("takes shared poison back from both heads", () => {
    const created = createLocalGame({
      startingLife: 30,
      system: "mtg",
      format: "limited",
      now: 0,
      players: ["Ada", "Bo", "Cy", "Dee"].map((name) => ({ name, color: "#000" })),
      teams: [
        [0, 1],
        [2, 3],
      ],
    })
    const [ada, bo] = created.players
    const poison: TableAction = {
      kind: "counter.changed",
      playerId: ada.id,
      counterId: "poison",
      delta: 2,
    }
    const poisoned = applyLocalTableAction(created, poison, at(1_000))
    const undo = newestLogUndo(poisoned, actor, { turns: true })
    if (!undo || undo.kind === "turn") throw new Error("expected a counter row")
    const after = undoLogRow(poisoned, undo, context)
    expect(after.table?.players[ada.id]?.counters?.poison ?? 0).toBe(0)
    expect(after.table?.players[bo.id]?.counters?.poison ?? 0).toBe(0)
  })
})
