import {
  applyTurnAction,
  bankLeft,
  isValidTurnGroups,
  startedByChange,
  nextTurnSeat,
  turnTimeSpent,
  type Turn,
  type TurnAction,
  type TurnGroups,
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
    ).toEqual({ playerId: "ada", number: 1, startedAt: 5, operationId: "op-5", waiting: true })
  })

  it("passes only from the seat holding the turn, and banks its time", () => {
    const turn = play([
      [{ kind: "turn.set", playerId: "ada", toPlayerId: "ada" }, 0],
      [{ kind: "turn.started", playerId: "ada" }, 0],
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

describe("waiting first turn", () => {
  const first = applyTurnAction(
    undefined,
    { kind: "turn.set", playerId: "ada", toPlayerId: "ada" },
    at(0),
  )!

  it("starts on the table's first change, and later changes leave it running", () => {
    expect(turnTimeSpent(first, "ada", 60_000)).toBe(0)
    const started = startedByChange(first, 5_000)!
    expect(started).toMatchObject({ playerId: "ada", number: 1, startedAt: 5_000 })
    expect(started.waiting).toBeUndefined()
    expect(turnTimeSpent(started, "ada", 65_000)).toBe(60_000)
    expect(startedByChange(started, 9_000)).toBeUndefined()
    expect(startedByChange(undefined, 9_000)).toBeUndefined()
  })

  it("starts on a tap, and a later tap changes nothing", () => {
    const start = { kind: "turn.started", playerId: "ada" } as const
    const started = applyTurnAction(first, start, at(7_000))!
    expect(started).toMatchObject({ startedAt: 7_000 })
    expect(applyTurnAction(started, start, at(9_000))).toBe(started)
    expect(applyTurnAction(undefined, start, at(7_000))).toBeNull()
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

describe("turn groups", () => {
  const teams: TurnGroups = [
    ["ada", "bo"],
    ["cy", "dee"],
  ]
  const table = new Set(["ada", "bo", "cy", "dee"])
  const grouped = (now: number, operationId = `op-${now}`) => ({
    operationId,
    now,
    isSeat: (id: string) => table.has(id),
    groups: teams,
  })
  const first = applyTurnAction(
    undefined,
    { kind: "turn.set", playerId: "bo", toPlayerId: "bo" },
    grouped(0),
  )!

  it("gives the turn to the group's first seat, and any seat in the group may pass it", () => {
    expect(first).toMatchObject({ playerId: "ada", number: 1 })
    const passed = applyTurnAction(
      { ...first, waiting: undefined },
      { kind: "turn.passed", playerId: "bo", toPlayerId: "dee" },
      grouped(60_000),
    )!
    expect(passed).toMatchObject({ playerId: "cy", number: 2, startedAt: 60_000 })
    expect(turnTimeSpent(passed, "ada", 60_000)).toBe(60_000)
    expect(
      applyTurnAction(
        passed,
        { kind: "turn.passed", playerId: "ada", toPlayerId: "bo" },
        grouped(1),
      ),
    ).toBeNull()
  })

  it("lets any seat of the group that passed take it back, and no one else", () => {
    const passed = applyTurnAction(
      first,
      { kind: "turn.passed", playerId: "ada", toPlayerId: "cy" },
      grouped(5_000, "pass-1"),
    )!
    const undo = { kind: "turn.undone", turnOperationId: "pass-1" } as const
    expect(applyTurnAction(passed, { ...undo, playerId: "dee" }, grouped(6_000))).toBeNull()
    expect(applyTurnAction(passed, { ...undo, playerId: "bo" }, grouped(6_000))).toEqual(first)
  })

  it("ignores a hand-off inside the group and refuses a claim for another group", () => {
    expect(
      applyTurnAction(
        first,
        { kind: "turn.passed", playerId: "ada", toPlayerId: "bo" },
        grouped(1),
      ),
    ).toBeNull()
    expect(
      applyTurnAction(first, { kind: "turn.set", playerId: "bo", toPlayerId: "ada" }, grouped(1)),
    ).toBe(first)
    expect(
      applyTurnAction(
        undefined,
        { kind: "turn.set", playerId: "ada", toPlayerId: "cy" },
        grouped(1),
      ),
    ).toBeNull()
  })

  it("orders groups by their first seat clockwise, and skips a group only when all of it is out", () => {
    const order = ["ada", "cy", "bo", "dee"]
    expect(nextTurnSeat(order, "bo", undefined, teams)).toBe("cy")
    expect(nextTurnSeat(order, "dee", undefined, teams)).toBe("ada")
    expect(nextTurnSeat(order, "ada", (id) => id === "cy", teams)).toBe("cy")
    expect(nextTurnSeat(order, "ada", (id) => id === "cy" || id === "dee", teams)).toBeUndefined()
    const archenemy: TurnGroups = [["boss"], ["ada", "bo", "cy"]]
    expect(nextTurnSeat(["boss", "ada", "bo", "cy"], "boss", undefined, archenemy)).toBe("ada")
    expect(nextTurnSeat(["boss", "ada", "bo", "cy"], "bo", undefined, archenemy)).toBe("boss")
  })

  it("treats a seat in no group as its own group", () => {
    const pair: TurnGroups = [["ada", "bo"]]
    expect(nextTurnSeat(["ada", "bo", "cy"], "bo", undefined, pair)).toBe("cy")
    expect(nextTurnSeat(["ada", "bo", "cy"], "cy", undefined, pair)).toBe("ada")
  })

  it("accepts only groups of known seats, each seat in one group", () => {
    expect(isValidTurnGroups(teams, table)).toBe(true)
    expect(isValidTurnGroups([["ada"], ["ada", "bo"]], table)).toBe(false)
    expect(isValidTurnGroups([["zed"]], table)).toBe(false)
    expect(isValidTurnGroups([[]], table)).toBe(false)
    expect(isValidTurnGroups("ada", table)).toBe(false)
  })
})
