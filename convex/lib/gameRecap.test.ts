import { buildRecap, fittedRecap, MAX_RECAP_ROWS, recapOuts } from "./gameRecap"

const seats = [
  { id: "a", startingLife: 20, life: 20 },
  { id: "b", startingLife: 20, life: 20 },
]
const change = (id: string, playerId: string, delta: number, undoOf?: string) => ({
  id,
  playerId,
  delta,
  ...(undoOf ? { undoOf } : {}),
})

describe("buildRecap", () => {
  it("draws one row per swing, folding a run of taps on one seat in one direction", () => {
    const recap = buildRecap({
      seats: [
        { id: "a", startingLife: 20, life: 17 },
        { id: "b", startingLife: 20, life: 22 },
      ],
      changes: [
        change("1", "a", -1),
        change("2", "a", -1),
        change("3", "a", -1),
        change("4", "b", 2),
        change("5", "a", 1),
        change("6", "a", -1),
      ],
    })
    expect(recap?.lives).toEqual([
      [20, 20],
      [17, 20],
      [17, 22],
      [18, 22],
      [17, 22],
    ])
  })

  it("starts a new row when the turn or the commander changes, and records both", () => {
    const recap = buildRecap({
      seats: [
        { id: "a", startingLife: 20, life: 11 },
        { id: "b", startingLife: 20, life: 20 },
      ],
      changes: [
        { ...change("1", "a", -2), turn: 2 },
        { ...change("2", "a", -1), turn: 2 },
        { ...change("3", "a", -3), turn: 3 },
        { ...change("4", "a", -3), turn: 3, from: "b" },
      ],
      finishTurn: 3,
    })
    expect(recap).toEqual({
      lives: [
        [20, 20],
        [17, 20],
        [14, 20],
        [11, 20],
      ],
      steps: [
        { seat: 0, turn: 2 },
        { seat: 0, turn: 3 },
        { seat: 0, turn: 3, from: 1 },
      ],
      finishTurn: 3,
    })
  })

  it("leaves out an undone change and its undo", () => {
    const recap = buildRecap({
      seats: [
        { id: "a", startingLife: 20, life: 15 },
        { id: "b", startingLife: 20, life: 20 },
      ],
      changes: [change("1", "b", -7), change("2", "a", -5), change("3", "b", 7, "1")],
    })
    expect(recap?.lives).toEqual([
      [20, 20],
      [15, 20],
    ])
  })

  it("moves teammates together when they share life", () => {
    const team = [
      { id: "a", startingLife: 30, life: 26 },
      { id: "b", startingLife: 30, life: 26 },
      { id: "c", startingLife: 30, life: 30 },
      { id: "d", startingLife: 30, life: 30 },
    ]
    const recap = buildRecap({
      seats: team,
      changes: [change("1", "a", -4)],
      teams: [
        ["a", "b"],
        ["c", "d"],
      ],
    })
    expect(recap?.lives?.at(-1)).toEqual([26, 26, 30, 30])
  })

  it("draws nothing when the changes do not explain the final lives", () => {
    expect(
      buildRecap({
        seats: [
          { id: "a", startingLife: 20, life: 3 },
          { id: "b", startingLife: 20, life: 20 },
        ],
        changes: [change("1", "a", -5)],
      }),
    ).toBeUndefined()
  })

  it("keeps the outs when the life series cannot be drawn", () => {
    const outs = [{ seat: 1, cause: "counter" as const, counterId: "poison", value: 10 }]
    expect(buildRecap({ seats, changes: [], outs })).toEqual({ outs })
  })

  it("thins a long game to evenly spaced rows that keep the start and the end", () => {
    const changes = Array.from({ length: 1_000 }, (_, index) =>
      change(String(index), index % 2 ? "a" : "b", -1),
    )
    const recap = buildRecap({
      seats: [
        { id: "a", startingLife: 1_000, life: 500 },
        { id: "b", startingLife: 1_000, life: 500 },
      ],
      changes,
    })
    expect(recap?.lives).toHaveLength(MAX_RECAP_ROWS)
    expect(recap?.steps).toBeUndefined()
    expect(recap?.lives?.[0]).toEqual([1_000, 1_000])
    expect(recap?.lives?.at(-1)).toEqual([500, 500])
  })
})

describe("recapOuts", () => {
  it("records a seat that ran out of life, so its line can end there", () => {
    expect(recapOuts(["a", "b"], ["b"], () => ({ cause: "life" }))).toEqual([
      { seat: 1, cause: "life" },
    ])
  })
})

describe("fittedRecap", () => {
  it("drops the parts that do not fit the game instead of rejecting it", () => {
    expect(
      fittedRecap(
        {
          lives: [[20, 20], [20]],
          outs: [
            { seat: 1, cause: "commanderDamage", from: 0, total: 21 },
            { seat: 1, cause: "counter", counterId: "poison", value: 10 },
            { seat: 4, cause: "counter", counterId: "poison", value: 10 },
            { seat: 0, cause: "life" },
          ],
        },
        [20, 20],
      ),
    ).toEqual({
      outs: [
        { seat: 1, cause: "commanderDamage", from: 0, total: 21 },
        { seat: 0, cause: "life" },
      ],
    })
    expect(fittedRecap({ lives: "oops" }, [20, 20])).toBeUndefined()
  })

  it("keeps steps only when each one names a seat for a drawn row", () => {
    const lives = [
      [40, 40],
      [37, 40],
    ]
    expect(fittedRecap({ lives, steps: [{ seat: 0, turn: 2 }] }, [37, 40])).toEqual({
      lives,
      steps: [{ seat: 0, turn: 2 }],
    })
    expect(fittedRecap({ lives, steps: [{ seat: 0, from: 0 }] }, [37, 40])).toEqual({ lives })
    expect(fittedRecap({ lives, steps: [] }, [37, 40])).toEqual({ lives })
  })

  it("keeps lives only when their last row is the game's final lives", () => {
    const lives = [
      [40, 40],
      [37, 40],
    ]
    expect(fittedRecap({ lives }, [37, 40])).toEqual({ lives })
    expect(fittedRecap({ lives }, [1, 40])).toBeUndefined()
  })
})
