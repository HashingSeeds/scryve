import { teamChoices, teamName, winnerNames } from "./teams"

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
})
