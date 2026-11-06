import { isGroupOut, outReason, standingWinners, type OutState } from "./outReason"
import { systemDefinition, tableRules } from "./systems"

function commander(overrides: Partial<OutState> = {}): OutState {
  return {
    counter: systemDefinition("mtg")?.counter,
    tableRules: tableRules("mtg", "commander"),
    lives: [
      { playerId: "a", life: 40 },
      { playerId: "b", life: 40 },
      { playerId: "c", life: 40 },
    ],
    ...overrides,
  }
}

describe("outReason", () => {
  it("reads a seat at 0 life as out on life", () => {
    const state = commander({
      lives: [
        { playerId: "a", life: 0 },
        { playerId: "b", life: 1 },
      ],
    })
    expect(outReason(state, "a")).toEqual({ cause: "life" })
    expect(outReason(state, "b")).toBeUndefined()
  })

  it("prefers commander damage, then counters, over life", () => {
    const state = commander({
      lives: [{ playerId: "a", life: 0 }],
      table: { players: { a: { counters: { poison: 10 } } }, designations: {} },
      commanderDamage: { lethal: 21, totals: [{ fromPlayerId: "b", toPlayerId: "a", total: 21 }] },
    })
    expect(outReason(state, "a")).toEqual({
      cause: "commanderDamage",
      fromPlayerId: "b",
      total: 21,
    })
    expect(outReason({ ...state, commanderDamage: undefined }, "a")).toEqual({
      cause: "counter",
      counterId: "poison",
      value: 10,
    })
  })

  it("knocks a seat out at the format's own lethal commander damage", () => {
    const at = (total: number) =>
      outReason(
        commander({
          commanderDamage: { lethal: 16, totals: [{ fromPlayerId: "b", toPlayerId: "a", total }] },
        }),
        "a",
      )
    expect(at(15)).toBeUndefined()
    expect(at(16)).toEqual({ cause: "commanderDamage", fromPlayerId: "b", total: 16 })
  })

  it("knocks out everyone else once a race game's seat reaches the goal", () => {
    const state: OutState = {
      counter: systemDefinition("lorcana")?.counter,
      tableRules: tableRules("lorcana", undefined),
      lives: [
        { playerId: "a", life: 20 },
        { playerId: "b", life: 12 },
      ],
    }
    expect(outReason(state, "b")).toEqual({ cause: "life" })
    expect(standingWinners(state)).toEqual(["a"])
  })
})

describe("groups", () => {
  const lives = (values: Record<string, number>): OutState => ({
    counter: systemDefinition("mtg")?.counter,
    tableRules: tableRules("mtg", undefined),
    lives: Object.entries(values).map(([playerId, life]) => ({ playerId, life })),
    groups: [["boss"], ["ada", "bo", "cy"]],
  })

  it("puts a group out only once every seat in it is out", () => {
    const state = lives({ boss: 20, ada: 0, bo: 0, cy: 3 })
    expect(outReason(state, "ada")).toEqual({ cause: "life" })
    expect(isGroupOut(state, "ada")).toBe(false)
    expect(isGroupOut(lives({ boss: 20, ada: 0, bo: 0, cy: 0 }), "cy")).toBe(true)
    expect(isGroupOut(state, "boss")).toBe(false)
  })

  it("names the last group standing as the winners, fallen teammates included", () => {
    expect(standingWinners(lives({ boss: 0, ada: 0, bo: 4, cy: 9 }))).toEqual(["ada", "bo", "cy"])
    expect(standingWinners(lives({ boss: 7, ada: 0, bo: 0, cy: 0 }))).toEqual(["boss"])
    expect(standingWinners(lives({ boss: 7, ada: 0, bo: 1, cy: 0 }))).toBeUndefined()
  })
})
