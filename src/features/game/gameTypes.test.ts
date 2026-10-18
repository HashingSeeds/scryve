import { newGameTypes } from "./gameTypes"

const ids = (types: readonly { id: string }[]) => types.map((type) => type.id)
const moreIds = (more: ReturnType<typeof newGameTypes>["more"]) =>
  ids(more.flatMap(({ types }) => types))

describe("newGameTypes", () => {
  it("suggests the first featured format, then No system", () => {
    const { suggested, more } = newGameTypes({ connected: false })

    expect(ids(suggested)).toEqual(["commander", "none"])
    expect(moreIds(more)).toContain("mtg-standard")
    expect(moreIds(more)).not.toContain("treachery")
  })

  it("suggests the format picked at onboarding", () => {
    const { suggested, more } = newGameTypes({
      chosen: { system: "ygo", format: "speed" },
      connected: false,
    })

    expect(ids(suggested)).toEqual(["ygo-speed", "none"])
    expect(moreIds(more)).not.toContain("ygo-speed")
  })

  it("gives the only slot to the recent row", () => {
    const { suggested, more } = newGameTypes({
      recent: { system: "ygo", format: "speed" },
      connected: false,
    })

    expect(ids(suggested)).toEqual(["none"])
    expect(moreIds(more)).toContain("ygo-speed")
  })

  it("saves the slot for a recent row the form did not open from", () => {
    expect(ids(newGameTypes({ recentRow: true, connected: false }).suggested)).toEqual(["none"])
  })

  it("groups the rest by game, each game's headline format first", () => {
    const { more } = newGameTypes({ connected: false })

    expect(more.map(({ system }) => system)).toEqual(["mtg", "ygo", "pokemon", "lorcana", "fab"])
    expect(ids(more.find(({ system }) => system === "ygo")?.types ?? [])).toEqual([
      "ygo-advanced",
      "ygo-traditional",
      "ygo-rush",
      "ygo-speed",
    ])
    expect(ids(more.find(({ system }) => system === "pokemon")?.types ?? [])[0]).toBe(
      "pokemon-standard",
    )
  })

  it("offers Treachery on the Connected tab only", () => {
    expect(moreIds(newGameTypes({ connected: true }).more)).toContain("treachery")
    expect(
      ids(
        newGameTypes({
          recent: { system: "mtg", format: "commander", variant: "treachery" },
          connected: true,
        }).suggested,
      ),
    ).toEqual(["none"])
  })
})
