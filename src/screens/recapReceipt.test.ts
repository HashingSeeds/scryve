import { localGameRecap } from "@/features/game/localRecap"
import type { GameEvent, LocalGame, PlayerId, TurnLogEntry } from "@/features/game/types"

import { localSummaryModel } from "./gameSummary"
import { recapReceipt } from "./recapReceipt"
import type { GameRecap } from "../../convex/lib/gameRecap"

const START = new Date("2026-11-20T20:00:00Z").getTime()
const SEATS = ["Bea", "Kenrith", "Ari", "Sam"] as const

type Seat = (typeof SEATS)[number]
type Change = { at: number; to: Seat; delta: number; from?: Seat; undoes?: number }

const id = (name: Seat) => name.toLowerCase() as PlayerId

function event(change: Change): GameEvent {
  const base = {
    operationId: `op-${change.at}`,
    gameId: "game-1",
    actorId: "actor-1",
    deviceId: "device-1",
    clientCreatedAt: START + change.at * 1000,
    ...(change.undoes === undefined ? {} : { compensatesOperationId: `op-${change.undoes}` }),
  }
  return (
    change.from
      ? {
          ...base,
          type: "commanderDamage.assigned",
          fromPlayerId: id(change.from),
          toPlayerId: id(change.to),
          delta: -change.delta,
        }
      : { ...base, type: "life.changed", playerId: id(change.to), delta: change.delta }
  ) as GameEvent
}

const BEA_WINS_AT_3: Change[] = [
  { at: 510, to: "Bea", delta: -10 },
  { at: 710, to: "Ari", delta: -40 },
  { at: 810, to: "Bea", delta: -18 },
  { at: 910, to: "Bea", delta: -3, from: "Kenrith" },
  { at: 911, to: "Bea", delta: -3, from: "Kenrith" },
  { at: 912, to: "Bea", delta: -3, from: "Kenrith" },
  { at: 1010, to: "Sam", delta: -40 },
  { at: 1110, to: "Kenrith", delta: -40 },
]

const TURNS: TurnLogEntry[] = Array.from({ length: 11 }, (_, index) => ({
  operationId: `turn-${index + 1}`,
  playerId: id(SEATS[index % SEATS.length]),
  number: index + 1,
  at: START + (index + 1) * 100_000,
}))

function receiptOf(
  changes: Change[],
  turnLog: TurnLogEntry[] | null = TURNS,
  stored = (recap: GameRecap | undefined) => recap,
) {
  const events = changes.map(event)
  const lives = new Map(SEATS.map((name) => [name, 40]))
  for (const change of changes) lives.set(change.to, (lives.get(change.to) ?? 0) + change.delta)
  const game = {
    schemaVersion: 1,
    id: "game-1",
    status: "finished",
    system: "mtg",
    format: "commander",
    startingLife: 40,
    createdAt: START,
    updatedAt: START + 73 * 60_000,
    finishedAt: START + 73 * 60_000,
    players: SEATS.map((name, seat) => ({
      id: id(name),
      name,
      color: "#D28468",
      life: lives.get(name) ?? 0,
      seat,
    })),
    events,
    result: { kind: "win", winnerPlayerIds: [id("Bea")] },
    ...(turnLog ? { turn: { ...TURNS[10], startedAt: TURNS[10].at }, turnLog } : {}),
  } as LocalGame
  return recapReceipt(localSummaryModel(game, stored(localGameRecap(game))))
}

describe("recapReceipt", () => {
  it("claims the win at the winner's life and names the hit that took them lowest", () => {
    const receipt = receiptOf(BEA_WINS_AT_3)

    expect(receipt.claim).toBe("Bea won at 3 life")
    expect(receipt.life).toBe(3)
    expect(receipt.line).toBe("T9 Kenrith hit Bea for 9 · T11 Bea wins")
    expect(receipt.seats.map(({ player, outTurn }) => [player.name, outTurn])).toEqual([
      ["Bea", undefined],
      ["Kenrith", 11],
      ["Ari", 7],
      ["Sam", 10],
    ])
    expect(receipt.caption).toBe("Bea won at 3 life. Bea, Kenrith, Sam & Ari, Commander, turn 11.")
  })

  it("ignores an undone change, even one that would have been the lowest point", () => {
    const receipt = receiptOf([
      ...BEA_WINS_AT_3.slice(0, 6),
      { at: 950, to: "Bea", delta: -20 },
      { at: 951, to: "Bea", delta: 20, undoes: 950 },
      ...BEA_WINS_AT_3.slice(6),
    ])

    expect(receipt.line).toBe("T9 Kenrith hit Bea for 9 · T11 Bea wins")
  })

  it("names a source only when the change recorded one", () => {
    const plain = BEA_WINS_AT_3.map(({ from: _from, ...change }) => change)

    expect(receiptOf(plain).line).toBe("T9 Bea took 9 · T11 Bea wins")
  })

  it("leaves out turns when the game kept none, or only picked a first player", () => {
    for (const turnLog of [null, TURNS.slice(0, 1)]) {
      const receipt = receiptOf(BEA_WINS_AT_3, turnLog)

      expect(receipt.line).toBe("Kenrith hit Bea for 9 · Bea wins")
      expect(receipt.seats.every(({ outTurn }) => outTurn === undefined)).toBe(true)
      expect(receipt.caption).toBe("Bea won at 3 life. Bea, Kenrith, Sam & Ari, Commander.")
    }
  })

  it("reads a recap stored before it kept turns and sources as plain changes", () => {
    const receipt = receiptOf(BEA_WINS_AT_3, TURNS, (recap) =>
      recap?.lives ? { lives: recap.lives, ...(recap.outs ? { outs: recap.outs } : {}) } : recap,
    )

    expect(receipt.line).toBe("Bea took 9 · Bea wins")
    expect(receipt.seats.every(({ outTurn }) => outTurn === undefined)).toBe(true)
  })
})
