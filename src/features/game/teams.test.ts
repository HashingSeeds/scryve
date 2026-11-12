import {
  opposingTeamTotals,
  teamChoices,
  teamColors,
  teamIncoming,
  teamName,
  winnerNames,
} from "./teams"

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

  it("shows each opposing team as its stronger commander, or its attacker's own", () => {
    const teams = [
      ["ada", "grace"],
      ["kim", "lin"],
      ["max", "noa"],
    ]
    const first = { kim: 9, lin: 14, max: 3, noa: 0 }
    const partner = { lin: 16, max: 2 }
    expect(opposingTeamTotals(teams, "ada", first, partner)).toEqual({
      first: { kim: 14, max: 3 },
      partner: { kim: 16, max: 2 },
    })
    expect(opposingTeamTotals(teams, "grace", first, partner, "kim")).toEqual({
      first: { kim: 9, max: 3 },
      partner: { max: 2 },
    })
  })

  it("keeps chosen team colors and gives every other team its lead's color unless a team holds it", () => {
    expect(teamColors(["#B85636", "#41476E", "#39755C"], [undefined, "#B85636"])).toEqual([
      "#41476E",
      "#B85636",
      "#39755C",
    ])
  })
})
