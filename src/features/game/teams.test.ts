import { teamChoices, teamIncoming, teamName, winnerNames } from "./teams"

const players = ["Ada", "Grace", "Kim", "Lin"].map((name) => ({ id: name.toLowerCase(), name }))

describe("teams", () => {
  it("names a team by its players in seat order, and a single seat by its player", () => {
    expect(teamName(players, [["grace", "ada"]], "grace")).toBe("Ada & Grace")
    expect(teamName(players, [["lin"], ["ada", "grace", "kim"]], "kim")).toBe("Ada, Grace & Kim")
    expect(teamName(players, [["ada", "grace"]], "lin")).toBe("Lin")
  })

  it("offers each team once and names each winning team once", () => {
    const groups = [["lin"], ["ada", "grace", "kim"]]
    expect(teamChoices(players, groups).map(({ id }) => id)).toEqual(["ada", "lin"])
    expect(winnerNames(players, groups, ["ada", "grace", "kim"])).toEqual(["Ada, Grace & Kim"])
    expect(winnerNames(players, undefined, ["ada", "lin"])).toEqual(["Ada", "Lin"])
  })

  it("sums a commander's damage across both heads and leaves teammates out", () => {
    const dealt: Record<string, Record<string, number>> = {
      ada: { grace: 0, kim: 5, lin: 0 },
      grace: { ada: 0, kim: 4, lin: 2 },
    }
    const incoming = teamIncoming(
      [
        ["ada", "grace"],
        ["kim", "lin"],
      ],
      (to: string) => dealt[to] ?? {},
    )
    expect(incoming("ada")).toEqual({ kim: 9, lin: 2 })
    expect(incoming("grace")).toEqual({ kim: 9, lin: 2 })
  })
})
