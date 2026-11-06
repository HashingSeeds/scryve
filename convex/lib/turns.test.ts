import {
  applyTurnAction,
  bankLeft,
  nextTurnSeat,
  turnTimeSpent,
  type Turn,
  type TurnAction,
} from "./turns"

const seats = new Set(["ada", "bo", "cy"])
const at = (now: number, operationId = `op-${now}`) => ({
  operationId,
  now,
  isSeat: (id: string) => seats.has(id),
})

function play(steps: [TurnAction, number][], start?: Turn) {
  return steps.reduce<Turn | undefined | null>(
    (turn, [action, now]) => (turn === null ? null : applyTurnAction(turn, action, at(now))),
    start,
  )
}

describe("applyTurnAction", () => {
  it("starts turn 1 only for the seat that sends it", () => {
    expect(
      applyTurnAction(undefined, { kind: "turn.set", playerId: "bo", toPlayerId: "ada" }, at(0)),
    ).toBeNull()
    expect(
      applyTurnAction(undefined, { kind: "turn.passed", playerId: "ada", toPlayerId: "bo" }, at(0)),
    ).toBeNull()
    expect(
      applyTurnAction(undefined, { kind: "turn.set", playerId: "ada", toPlayerId: "ada" }, at(5)),
    ).toEqual({ playerId: "ada", number: 1, startedAt: 5, operationId: "op-5" })
  })

  it("passes only from the seat holding the turn, and banks its time", () => {
    const turn = play([
      [{ kind: "turn.set", playerId: "ada", toPlayerId: "ada" }, 0],
      [{ kind: "turn.passed", playerId: "ada", toPlayerId: "bo" }, 60_000],
    ])
    expect(turn).toMatchObject({ playerId: "bo", number: 2, startedAt: 60_000 })
    expect(turn && turnTimeSpent(turn, "ada", 90_000)).toBe(60_000)
    expect(turn && turnTimeSpent(turn, "bo", 90_000)).toBe(30_000)
    expect(
      applyTurnAction(turn!, { kind: "turn.passed", playerId: "ada", toPlayerId: "cy" }, at(1)),
    ).toBeNull()
  })

  it("undoes a pass back to the passer's turn, start time and all, but only for the passer", () => {
    const started = play([[{ kind: "turn.set", playerId: "ada", toPlayerId: "ada" }, 0]])!
    const passed = applyTurnAction(
      started,
      { kind: "turn.passed", playerId: "ada", toPlayerId: "bo" },
      at(10_000, "pass-1"),
    )!
    const undo = { kind: "turn.undone", turnOperationId: "pass-1" } as const
    expect(applyTurnAction(passed, { ...undo, playerId: "bo" }, at(12_000))).toBeNull()
    expect(applyTurnAction(passed, { ...undo, playerId: "ada" }, at(12_000))).toEqual(started)
    expect(
      applyTurnAction(started, { ...undo, playerId: "ada", turnOperationId: "op-0" }, at(1)),
    ).toBeNull()
  })

  it("hands the turn on without counting a new one", () => {
    expect(
      play([
        [{ kind: "turn.set", playerId: "ada", toPlayerId: "ada" }, 0],
        [{ kind: "turn.passed", playerId: "ada", toPlayerId: "bo" }, 1],
        [{ kind: "turn.set", playerId: "bo", toPlayerId: "cy" }, 2],
      ]),
    ).toMatchObject({ playerId: "cy", number: 2, previous: { playerId: "bo", number: 2 } })
  })

  it("refuses a seat that is not in the game", () => {
    expect(
      play([
        [{ kind: "turn.set", playerId: "ada", toPlayerId: "ada" }, 0],
        [{ kind: "turn.passed", playerId: "ada", toPlayerId: "zed" }, 1],
      ]),
    ).toBeNull()
  })
})

describe("chess bank", () => {
  it("starts every seat full when set mid-game, survives a pass and its undo, and runs out", () => {
    const minute = 60_000
    const started = play([
      [{ kind: "turn.set", playerId: "ada", toPlayerId: "ada" }, 0],
      [{ kind: "turn.passed", playerId: "ada", toPlayerId: "bo" }, 5 * minute],
      [{ kind: "turn.clock", playerId: "cy", bankMs: 10 * minute }, 6 * minute],
    ])!
    expect(bankLeft(started, "ada", 6 * minute)).toBe(10 * minute)
    expect(bankLeft(started, "bo", 8 * minute)).toBe(8 * minute)
    const passed = applyTurnAction(
      started,
      { kind: "turn.passed", playerId: "bo", toPlayerId: "cy" },
      at(9 * minute, "pass-bo"),
    )!
    const undone = applyTurnAction(
      passed,
      { kind: "turn.undone", playerId: "bo", turnOperationId: "pass-bo" },
      at(9 * minute),
    )!
    expect(undone.bank).toEqual(started.bank)
    expect(bankLeft(undone, "bo", 17 * minute)).toBe(-minute)
    expect(
      applyTurnAction(undone, { kind: "turn.clock", playerId: "ada", bankMs: 5 }, at(0)),
    ).toBeNull()
    expect(
      applyTurnAction(undone, { kind: "turn.clock", playerId: "ada" }, at(0))?.bank,
    ).toBeUndefined()
  })
})

describe("nextTurnSeat", () => {
  it("goes around the order and skips seats that are out", () => {
    expect(nextTurnSeat(["ada", "bo", "cy"], "cy")).toBe("ada")
    expect(nextTurnSeat(["ada", "bo", "cy"], "ada", (id) => id === "bo")).toBe("cy")
    expect(nextTurnSeat(["ada", "bo"], "ada", (id) => id === "bo")).toBeUndefined()
  })
})
