import { asPlayerId } from "@/features/game/domain"
import { gameLog } from "@/features/game/LifeLog"

import { connectedLogEvents, connectedLogInputs, connectedLogUndo } from "./connectedLog"
import type { PendingLifeAction } from "./model"
import type { ConnectedLogEvent } from "../../../convex/lib/gameLog"
import type { Turn } from "../../../convex/lib/turns"

const GAME = "game-connected-log"
const players = [
  { id: asPlayerId("ada"), life: 34 },
  { id: asPlayerId("bo"), life: 40 },
]
const life = (
  operationId: string,
  playerId: string,
  delta: number,
  at: number,
  extra: Partial<ConnectedLogEvent> = {},
): ConnectedLogEvent => ({
  operationId,
  playerId,
  kind: "life.changed",
  delta,
  clientCreatedAt: at,
  ...extra,
})
const pass = (operationId: string, from: string, to: string, at: number, mine = false) =>
  ({
    operationId,
    playerId: from,
    kind: "turn.passed",
    clientCreatedAt: at,
    action: { kind: "turn.passed", playerId: from, toPlayerId: to },
    ...(mine ? { mine: true } : {}),
  }) satisfies ConnectedLogEvent
const queued = (operationId: string, playerId: string, delta: number, at: number) =>
  ({
    schemaVersion: 1,
    event: {
      type: "life.changed",
      operationId,
      gameId: GAME,
      playerId,
      delta,
      actorId: "me",
      deviceId: "device-me",
      clientCreatedAt: at,
    },
    queuedAt: at,
    attempts: 0,
  }) as PendingLifeAction
const turnOf = (operationId: string, number: number, previous = true): Turn => ({
  playerId: "bo",
  number,
  startedAt: 0,
  operationId,
  ...(previous
    ? { previous: { playerId: "ada", number: number - 1, startedAt: 0, operationId: "older" } }
    : {}),
})

describe("connected log", () => {
  it("shows an unsent change at once and keeps one row once the authority has it", () => {
    const offline = connectedLogEvents([], [queued("op-unsent-ada-01", "ada", -6, 10)], GAME)
    expect(gameLog(players, connectedLogInputs(offline, GAME, undefined).events)).toMatchObject([
      { playerId: "ada", delta: -6, life: 34 },
    ])
    const synced = connectedLogEvents(
      [life("op-unsent-ada-01", "ada", -6, 10, { mine: true })],
      [queued("op-unsent-ada-01", "ada", -6, 10)],
      GAME,
    )
    expect(synced).toHaveLength(1)
  })

  it("hides a change and its undo, and numbers turns back from the one the table holds", () => {
    const events = [
      life("op-ada-hit-00001", "ada", -2, 1_000),
      pass("op-pass-to-bo-01", "ada", "bo", 2_000),
      life("op-bo-gain-00001", "bo", 3, 3_000, { mine: true }),
      life("op-bo-undo-00001", "bo", -3, 4_000, { mine: true, undoOf: "op-bo-gain-00001" }),
      pass("op-pass-to-ada-1", "bo", "ada", 5_000),
      pass("op-pass-to-bo-02", "ada", "bo", 6_000),
    ]
    const inputs = connectedLogInputs(events, GAME, turnOf("op-pass-to-bo-02", 4))
    expect(gameLog(players, inputs.events)).toMatchObject([{ playerId: "ada", delta: -2 }])
    expect(inputs.turns.map(({ number, playerId }) => [number, playerId])).toEqual([
      [1, "ada"],
      [2, "bo"],
      [3, "ada"],
      [4, "bo"],
    ])
  })

  it("takes back this account's newest burst, but not commander damage or someone else's change", () => {
    const events = [
      life("op-mine-tap-0001", "ada", -1, 1_000, { mine: true }),
      life("op-mine-tap-0002", "ada", -1, 1_500, { mine: true }),
      life("op-their-hit-001", "bo", -4, 9_000),
    ]
    expect(connectedLogUndo(events, players, GAME, undefined, { turns: true })).toEqual({
      kind: "life",
      changes: [
        { operationId: "op-mine-tap-0002", playerId: "ada", delta: -1 },
        { operationId: "op-mine-tap-0001", playerId: "ada", delta: -1 },
      ],
    })
    const commander: ConnectedLogEvent = {
      operationId: "op-commander-0001",
      playerId: "ada",
      kind: "commanderDamage.confirmed",
      delta: 5,
      fromPlayerId: "bo",
      clientCreatedAt: 10_000,
      mine: true,
    }
    expect(
      connectedLogUndo([...events, commander], players, GAME, undefined, { turns: true }),
    ).toBeUndefined()
  })

  it("takes back this account's pass while the table holds it, and leaves it alone with turns hidden", () => {
    const events = [
      life("op-mine-tap-0001", "ada", -1, 1_000, { mine: true }),
      pass("op-my-pass-00001", "ada", "bo", 2_000, true),
    ]
    const turn = turnOf("op-my-pass-00001", 2)
    expect(connectedLogUndo(events, players, GAME, turn, { turns: true })).toEqual({
      kind: "turn",
      playerId: "ada",
      turnOperationId: "op-my-pass-00001",
    })
    expect(connectedLogUndo(events, players, GAME, turn, { turns: false })).toMatchObject({
      kind: "life",
    })
  })

  it("heads the log with the current turn before the change that began it has loaded", () => {
    const page = [life("op-recent-hit-001", "ada", -1, 9_000)]
    expect(connectedLogInputs(page, GAME, turnOf("op-not-on-page-1", 3)).turns).toEqual([
      { operationId: "op-not-on-page-1", playerId: "bo", number: 3, at: 0 },
    ])
  })

  it("reads a seat's quick taps as one change even when another device's change lands between them", () => {
    const events = [
      life("op-ada-tap-00001", "ada", -1, 1_000, { mine: true }),
      life("op-bo-between-01", "bo", -2, 1_200),
      life("op-ada-tap-00002", "ada", -2, 1_500, { mine: true }),
    ]
    expect(gameLog(players, connectedLogInputs(events, GAME, undefined).events)).toMatchObject([
      { playerId: "ada", delta: -3, life: 34 },
      { playerId: "bo", delta: -2, life: 40 },
    ])
  })

  it("heads turn 1 with whoever passed it when the game began with the turn already set", () => {
    const events = [
      life("op-early-hit-0001", "ada", -1, 1_000),
      pass("op-pass-to-bo-01", "ada", "bo", 2_000),
    ]
    expect(
      connectedLogInputs(events, GAME, turnOf("op-pass-to-bo-01", 2)).turns.map(
        ({ number, playerId }) => [number, playerId],
      ),
    ).toEqual([
      [1, "ada"],
      [2, "bo"],
    ])
  })

  it("counts counter rows back from the table, hides an undone tap, and takes back this account's own", () => {
    const poison = (operationId: string, delta: number, at: number, undoOf?: string) =>
      ({
        operationId,
        playerId: "ada",
        kind: "counter.changed",
        delta,
        clientCreatedAt: at,
        action: { kind: "counter.changed", playerId: "ada", counterId: "poison", delta },
        mine: true,
        ...(undoOf ? { undoOf } : {}),
      }) satisfies ConnectedLogEvent
    const events = [
      poison("op-poison-00001", 2, 1_000),
      poison("op-poison-00002", 1, 10_000),
      poison("op-poison-undo-1", -1, 11_000, "op-poison-00002"),
    ]
    const table = {
      players: { ada: { counters: { poison: 2 } } },
      counterKey: (playerId: string, counterId: string) => `${playerId}:${counterId}`,
    }
    expect(connectedLogInputs(events, GAME, undefined, table).counters).toMatchObject([
      { operationId: "op-poison-00001", delta: 2, value: 2 },
    ])
    expect(connectedLogUndo(events, players, GAME, undefined, { turns: true, table })).toEqual({
      kind: "counter",
      changes: [
        {
          operationId: "op-poison-00001",
          action: { kind: "counter.changed", playerId: "ada", counterId: "poison", delta: -2 },
        },
      ],
    })
  })
})
