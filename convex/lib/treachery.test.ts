import { dealTreacheryRoles, treacheryOutcome, type TreacheryRole } from "./treachery"

const table = (...seats: [TreacheryRole, boolean][]) =>
  seats.map(([role, inGame], index) => ({ playerId: `seat ${index + 1}`, role, inGame }))

describe("Treachery", () => {
  it("deals the creator's role deck for 4–6 seats and nothing else", () => {
    const sorted = (count: number) => [...dealTreacheryRoles(count)].sort()

    expect(sorted(4)).toEqual(["assassin", "assassin", "leader", "traitor"])
    expect(sorted(5)).toEqual(["assassin", "assassin", "guardian", "leader", "traitor"])
    expect(sorted(6)).toEqual(["assassin", "assassin", "assassin", "guardian", "leader", "traitor"])
    for (const count of [2, 3, 7]) expect(() => dealTreacheryRoles(count)).toThrow("4–6 seats")
  })

  it("shuffles which seat gets which role", () => {
    expect(dealTreacheryRoles(4, () => 0)).toEqual(["traitor", "assassin", "assassin", "leader"])
    expect(dealTreacheryRoles(4, () => 0.99)).toEqual(["leader", "traitor", "assassin", "assassin"])
  })

  it("waits while the Leader has an opponent left", () => {
    expect(
      treacheryOutcome(
        table(["leader", true], ["guardian", false], ["assassin", false], ["traitor", true]),
      ),
    ).toBeUndefined()
  })

  it("lets the Leader's team win together once every opponent is out", () => {
    expect(
      treacheryOutcome(
        table(["leader", true], ["guardian", false], ["assassin", false], ["traitor", false]),
      ),
    ).toEqual({ kind: "win", winnerPlayerIds: ["seat 1", "seat 2"] })
  })

  it("gives the Assassins the win when the Leader falls while one of them is in", () => {
    expect(
      treacheryOutcome(
        table(["leader", false], ["assassin", false], ["assassin", true], ["traitor", true]),
      ),
    ).toEqual({ kind: "win", winnerPlayerIds: ["seat 2", "seat 3"] })
  })

  it("gives the Traitor the win when the Leader falls after every Assassin", () => {
    expect(
      treacheryOutcome(
        table(["leader", false], ["guardian", true], ["assassin", false], ["traitor", true]),
      ),
    ).toEqual({ kind: "win", winnerPlayerIds: ["seat 4"] })
  })

  it("is a draw when the Leader falls and no Assassin or Traitor is left", () => {
    expect(
      treacheryOutcome(
        table(["leader", false], ["guardian", true], ["assassin", false], ["traitor", false]),
      ),
    ).toEqual({ kind: "draw" })
  })
})
