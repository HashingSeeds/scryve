import { asPlayerId } from "@/features/game/domain"
import { gameLog, LIFE_BURST_MS, rowPosition, type GameLogRow } from "@/features/game/LifeLog"

import {
  connectedLogEvents,
  connectedLogInputs,
  connectedLogUndo,
  logPositions,
} from "./connectedLog"
import type { PendingLifeAction } from "./model"
import type { ConnectedLogEvent } from "../../../convex/lib/gameLog"
import { seededRandom, type SeededRandom } from "../../../test/support/seededRandom"

const GAME = "game-log-property"

interface Operation {
  operationId: string
  playerId: string
  delta: number
  at: number
  mine: boolean
  confirmed: boolean
}

function randomOperations(seed: number) {
  const random = seededRandom(seed)
  const seats = ["ada", "bo", "cy"].slice(0, random.int(2, 3))
  const count = random.int(4, 24)
  const unsentFrom = random.int(0, count)
  const lastAt = new Map<string, number>()
  const operations: Operation[] = []
  for (let index = 0; index < count; index += 1) {
    const playerId = seats[random.int(0, seats.length - 1)]
    const confirmed = index < unsentFrom
    const previous = lastAt.get(playerId)
    const at =
      previous !== undefined && random.next() < 0.6
        ? previous + random.int(-2_500, 2_500)
        : random.int(0, 120_000)
    lastAt.set(playerId, at)
    operations.push({
      operationId: `op-${String(index).padStart(3, "0")}`,
      playerId,
      delta: (random.next() < 0.5 ? -1 : 1) * random.int(1, 3),
      at,
      mine: !confirmed || random.next() < 0.5,
      confirmed,
    })
  }
  return { seats, operations, shuffle: random }
}

function feed({
  seats,
  operations,
  shuffle,
}: {
  seats: readonly string[]
  operations: readonly Operation[]
  shuffle: SeededRandom
}) {
  const confirmed: ConnectedLogEvent[] = operations
    .filter(({ confirmed: isConfirmed }) => isConfirmed)
    .map(({ operationId, playerId, delta, at, mine }) => ({
      operationId,
      playerId,
      kind: "life.changed",
      delta,
      clientCreatedAt: at,
      ...(mine ? { mine: true as const } : {}),
    }))
  const pending = operations
    .filter(({ confirmed: isConfirmed }) => !isConfirmed)
    .map(
      ({ operationId, playerId, delta, at }, sequence) =>
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
          sequence,
          attempts: 0,
        }) as PendingLifeAction,
    )
  const queued = [...pending].sort(() => shuffle.next() - 0.5)
  const events = connectedLogEvents(confirmed, queued, GAME)
  const players = seats.map((id) => ({ id: asPlayerId(id), life: 40 }))
  return { events, players }
}

function expectLogLaws(operations: readonly Operation[], seed: number) {
  const generated = { seats: [...new Set(operations.map(({ playerId }) => playerId))], operations }
  const { events, players } = feed({ ...generated, shuffle: seededRandom(seed) })
  const sequence = new Map(operations.map(({ operationId }, index) => [operationId, index]))
  const byId = new Map(operations.map((operation) => [operation.operationId, operation]))
  const positionOf = logPositions(events)
  const rows = gameLog(players, connectedLogInputs(events, GAME, undefined).events)
  const context = `seed ${seed}`
  expectSequenceOrder(events, rows, operations, sequence, positionOf, context)
  for (const row of rows) expectFoldedNeighbors(row, operations, sequence, byId, context)
  expectUndoOfNewestShown(events, players, rows, sequence, byId, context)
}

function expectSequenceOrder(
  events: readonly ConnectedLogEvent[],
  rows: readonly GameLogRow[],
  operations: readonly Operation[],
  sequence: ReadonlyMap<string, number>,
  positionOf: (operationId: string) => number | undefined,
  context: string,
) {
  const order = events.map(({ operationId }) => sequence.get(operationId))
  expect({ context, order }).toEqual({ context, order: operations.map((_, index) => index) })
  const places = rows.map((row) => rowPosition(row, positionOf))
  expect({ context, places }).toEqual({ context, places: [...places].sort((a, b) => b - a) })
}

function expectUndoOfNewestShown(
  events: readonly ConnectedLogEvent[],
  players: Parameters<typeof connectedLogUndo>[1],
  rows: readonly GameLogRow[],
  sequence: ReadonlyMap<string, number>,
  byId: ReadonlyMap<string, Operation>,
  context: string,
) {
  const mineShown = rows.flatMap((row) =>
    row.operationIds.filter((id) => byId.get(id)?.mine).map((id) => sequence.get(id) ?? -1),
  )
  const undo = connectedLogUndo(events, players, GAME, undefined, { turns: true })
  if (undo?.kind === "life") {
    const newest = Math.max(
      ...undo.changes.map(({ operationId }) => sequence.get(operationId) ?? -1),
    )
    expect({ context, newest }).toEqual({ context, newest: Math.max(...mineShown) })
  }
  const newestRow = rows.find((row) => row.operationIds.some((id) => byId.get(id)?.mine))
  if (newestRow && newestRow.operationIds.every((id) => byId.get(id)?.mine))
    expect({ context, undo: undo?.kind }).toEqual({ context, undo: "life" })
}

function expectFoldedNeighbors(
  row: GameLogRow,
  operations: readonly Operation[],
  sequence: ReadonlyMap<string, number>,
  byId: ReadonlyMap<string, Operation>,
  context: string,
) {
  const members = [...row.operationIds].sort(
    (left, right) => (sequence.get(left) ?? 0) - (sequence.get(right) ?? 0),
  )
  const seat = byId.get(members[0])?.playerId
  const seatSequence = operations.filter(({ playerId }) => playerId === seat)
  for (let index = 1; index < members.length; index += 1) {
    const older = byId.get(members[index - 1])
    const newer = byId.get(members[index])
    expect({ context, seat: newer?.playerId }).toEqual({ context, seat })
    const gap = seatSequence.indexOf(newer!) - seatSequence.indexOf(older!)
    expect({ context, members, adjacent: gap }).toEqual({ context, members, adjacent: 1 })
    expect(Math.abs(newer!.at - older!.at)).toBeLessThanOrEqual(LIFE_BURST_MS)
  }
}

describe("the connected log's order", () => {
  it("is the sequence, folds only neighbors, and undoes the newest change, for any clocks", () => {
    for (let seed = 1; seed <= 400; seed += 1) {
      const generated = randomOperations(seed)
      expectLogLaws(generated.operations, seed)
    }
  })

  it("keeps offline changes A, B, C in the order they were made though C's clock reads before B's", () => {
    const at = (operationId: string, playerId: string, time: number, confirmed = false) => ({
      operationId,
      playerId,
      delta: -1,
      at: time,
      mine: true,
      confirmed,
    })
    expectLogLaws(
      [
        at("other-seat", "bo", 500, true),
        at("a", "ada", 1_000),
        at("b", "ada", 11_000),
        at("between", "bo", 11_500),
        at("c", "ada", 1_200),
      ],
      0,
    )
  })
})
