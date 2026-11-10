import {
  applyGameCommand,
  applyLocalTableAction,
  asActorId,
  asDeviceId,
  asOperationId,
  createLocalGame,
  localLogPositions,
  withFirstTurn,
} from "./domain"
import { counterLog, gameLog, LIFE_BURST_MS, mergedLog, rowPosition } from "./LifeLog"
import { newestLogUndo } from "./logUndo"
import type { LocalGame } from "./types"
import type { TableAction } from "../../../convex/lib/table"
import { seededRandom } from "../../../test/support/seededRandom"

type Step =
  | { kind: "life"; seat: number; delta: number; at: number }
  | { kind: "counter"; seat: number; counter: "poison" | "Speed"; delta: number; at: number }
  | { kind: "pass"; at: number }

interface Applied {
  operationId: string
  key: string
  at: number
}

function randomSteps(seed: number) {
  const random = seededRandom(seed)
  const seats = random.int(2, 3)
  const lastAt: number[] = []
  const steps: Step[] = []
  for (let index = random.int(4, 28); index > 0; index -= 1) {
    const seat = random.int(0, seats - 1)
    const at =
      lastAt[seat] !== undefined && random.next() < 0.6
        ? lastAt[seat] + random.int(-2_500, 2_500)
        : random.int(0, 120_000)
    lastAt[seat] = at
    const roll = random.next()
    steps.push(
      roll < 0.5
        ? { kind: "life", seat, delta: (random.next() < 0.5 ? -1 : 1) * random.int(1, 3), at }
        : roll < 0.85
          ? {
              kind: "counter",
              seat,
              counter: random.pick(["poison", "Speed"] as const),
              delta: random.next() < 0.7 ? 1 : -1,
              at,
            }
          : { kind: "pass", at },
    )
  }
  return { seats, steps }
}

function play(seats: number, steps: readonly Step[]) {
  let sequence = 0
  const nextId = () => `op-${String(sequence++).padStart(3, "0")}`
  const created = createLocalGame({
    startingLife: 40,
    system: "mtg",
    format: "commander",
    now: 0,
    players: Array.from({ length: seats }, (_, index) => ({ name: `P${index}`, color: "#000" })),
  })
  let game: LocalGame = withFirstTurn(created, created.players[0].id, {
    operationId: "turn-first",
    now: 0,
  })
  const applied: Applied[] = []
  for (const step of steps) {
    const before = game
    const operationId = nextId()
    if (step.kind === "life") {
      const playerId = game.players[step.seat].id
      game = applyGameCommand(
        game,
        { type: "life.change", playerId, delta: step.delta },
        {
          actorId: asActorId("local"),
          deviceId: asDeviceId("device"),
          now: () => step.at,
          operationId: () => asOperationId(operationId),
        },
      )
      if (game !== before) applied.push({ operationId, key: `life:${playerId}`, at: step.at })
      continue
    }
    const turn = game.turn
    const action: TableAction =
      step.kind === "pass"
        ? {
            kind: "turn.passed",
            playerId: turn?.playerId ?? game.players[0].id,
            toPlayerId:
              game.players[(game.players.findIndex(({ id }) => id === turn?.playerId) + 1) % seats]
                .id,
          }
        : step.counter === "poison"
          ? {
              kind: "counter.changed",
              playerId: game.players[step.seat].id,
              counterId: "poison",
              delta: step.delta,
            }
          : {
              kind: "customCounter.changed",
              playerId: game.players[step.seat].id,
              name: "Speed",
              delta: step.delta,
            }
    game = applyLocalTableAction(game, action, { operationId, now: step.at })
    if (game === before) continue
    applied.push({
      operationId,
      key: step.kind === "pass" ? "pass" : `${step.counter}:${action.playerId}`,
      at: step.at,
    })
  }
  return { game, applied }
}

function expectLogLaws(seats: number, steps: readonly Step[], context: string) {
  const { game, applied } = play(seats, steps)
  const sequence = new Map(applied.map(({ operationId }, index) => [operationId, index]))
  const positionOf = localLogPositions(game)
  const rows = mergedLog(
    gameLog(game.players, game.events),
    counterLog(game.counterLog ?? []),
    positionOf,
  )

  const places = rows.map((row) => rowPosition(row, positionOf))
  const inSequence = rows.map((row) =>
    Math.max(...row.operationIds.map((id) => sequence.get(id) ?? -1)),
  )
  expect({ context, places }).toEqual({ context, places: [...places].sort((a, b) => b - a) })
  expect({ context, inSequence }).toEqual({
    context,
    inSequence: [...inSequence].sort((a, b) => b - a),
  })

  for (const row of rows) {
    const members = applied.filter(({ operationId }) => row.operationIds.includes(operationId))
    const sameKey = applied.filter(({ key }) => key === members[0].key)
    for (let index = 1; index < members.length; index += 1) {
      expect({ context, key: members[index].key }).toEqual({ context, key: members[0].key })
      const gap = sameKey.indexOf(members[index]) - sameKey.indexOf(members[index - 1])
      expect({ context, adjacent: gap }).toEqual({ context, adjacent: 1 })
      expect(Math.abs(members[index].at - members[index - 1].at)).toBeLessThanOrEqual(LIFE_BURST_MS)
    }
  }

  const pass = game.turn?.previous ? (sequence.get(game.turn.operationId) ?? -1) : -1
  const newestShown = Math.max(-1, inSequence[0] ?? -1, pass)
  const undo = newestLogUndo(game, { turns: true })
  const undone =
    undo?.kind === "turn"
      ? (sequence.get(undo.turnOperationId) ?? -1)
      : Math.max(-1, ...(undo?.operationIds ?? []).map((id) => sequence.get(id) ?? -1))
  expect({ context, undone }).toEqual({ context, undone: newestShown })
}

describe("the local log's order", () => {
  it("is the sequence, folds only neighbors, and undoes the newest change, for any clocks", () => {
    for (let seed = 1; seed <= 400; seed += 1) {
      const { seats, steps } = randomSteps(seed)
      expectLogLaws(seats, steps, `seed ${seed}`)
    }
  })

  it("takes back the newer counter tap though the clock read earlier for it", () => {
    expectLogLaws(
      2,
      [
        { kind: "counter", seat: 1, counter: "poison", delta: 1, at: 60_000 },
        { kind: "counter", seat: 1, counter: "poison", delta: 1, at: 11_000 },
      ],
      "counter taps at 60000 then 11000",
    )
  })
})
