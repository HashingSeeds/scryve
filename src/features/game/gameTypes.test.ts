import { newGameTypes } from "./gameTypes"

const ids = (types: readonly { id: string }[]) => types.map((type) => type.id)
const moreIds = (more: ReturnType<typeof newGameTypes>["more"]) =>
  ids(more.flatMap(({ types }) => types))

describe("newGameTypes", () => {
  it("falls back to the featured order, capped, with No system last", () => {
    const { suggested, more } = newGameTypes({ connected: false })

    expect(ids(suggested)).toEqual(["commander", "mtg-standard", "ygo-advanced", "none"])
    expect(moreIds(more)).toContain("pokemon-standard")
    expect(moreIds(more)).not.toContain("treachery")
  })

  it("leads with the format picked at onboarding, then that system's featured formats", () => {
    const { suggested, more } = newGameTypes({
      chosen: { system: "ygo", format: "speed" },
      connected: false,
    })

    expect(ids(suggested)).toEqual(["ygo-speed", "ygo-advanced", "commander", "none"])
    expect(moreIds(more)).not.toContain("ygo-speed")
  })

  it("leaves the recent format to its own row and favors its system", () => {
    const { suggested, more } = newGameTypes({
      recent: { system: "ygo", format: "speed" },
      connected: false,
    })

    expect(ids(suggested)).toEqual(["ygo-advanced", "commander", "mtg-standard", "none"])
    expect(moreIds(more)).toContain("ygo-speed")
  })

  it("groups the rest by game, each game's headline format first", () => {
    const { more } = newGameTypes({ connected: false })

    expect(more.map(({ system }) => system)).toEqual(["mtg", "ygo", "pokemon", "lorcana", "fab"])
    expect(ids(more.find(({ system }) => system === "ygo")?.types ?? [])).toEqual([
      "ygo-traditional",
      "ygo-rush",
      "ygo-speed",
    ])
    expect(ids(more.find(({ system }) => system === "pokemon")?.types ?? [])[0]).toBe(
      "pokemon-standard",
    )
  })

  it("offers Treachery on the Connected tab only", () => {
    expect(ids(newGameTypes({ connected: true }).suggested)).toContain("treachery")
    expect(
      ids(
        newGameTypes({
          recent: { system: "mtg", format: "commander", variant: "treachery" },
          connected: true,
        }).suggested,
      ),
    ).toEqual(["commander", "mtg-standard", "ygo-advanced", "none"])
  })
})
