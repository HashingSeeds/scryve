import { lastStanding, outReason, type OutState } from "./outReason"
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
      commanderDamage: [{ fromPlayerId: "b", toPlayerId: "a", total: 21 }],
    })
    expect(outReason(state, "a")).toEqual({
      cause: "commanderDamage",
      fromPlayerId: "b",
      total: 21,
    })
    expect(outReason({ ...state, commanderDamage: [] }, "a")).toEqual({
      cause: "counter",
      counterId: "poison",
      value: 10,
    })
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
    expect(lastStanding(state)).toBe("a")
  })
})
