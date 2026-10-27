import { newGameTabs, newGameTypes } from "./gameTypes"

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

    expect(more.map(({ system }) => system)).toEqual([
      "mtg",
      "ygo",
      "pokemon",
      "lorcana",
      "fab",
      "riftbound",
    ])
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

describe("newGameTabs", () => {
  const tabIds = (tabs: ReturnType<typeof newGameTabs>) => tabs.map((tab) => tab.system ?? "none")
  const formatIds = (tabs: ReturnType<typeof newGameTabs>, system: string) =>
    ids(tabs.find((tab) => (tab.system ?? "none") === system)?.types ?? [])

  it("puts the default game first, then recent games, then the rest, with No system last", () => {
    const tabs = newGameTabs({
      chosen: { system: "pokemon", format: "standard" },
      recent: [
        { system: "ygo", format: "speed" },
        { system: "mtg", format: "pauper" },
      ],
      connected: false,
    })

    expect(tabIds(tabs).slice(0, 3)).toEqual(["pokemon", "ygo", "mtg"])
    expect(tabIds(tabs).at(-1)).toBe("none")
    expect(formatIds(tabs, "ygo")[0]).toBe("ygo-speed")
    expect(formatIds(tabs, "mtg").slice(0, 2)).toEqual(["mtg-pauper", "commander"])
  })

  it("ranks recent formats ahead of the default game's format", () => {
    const tabs = newGameTabs({
      chosen: { system: "mtg", format: "modern" },
      recent: [{ system: "mtg", format: "standard" }],
      connected: false,
    })

    expect(formatIds(tabs, "mtg").slice(0, 2)).toEqual(["mtg-standard", "mtg-modern"])
  })

  it("offers Treachery only when connected", () => {
    expect(formatIds(newGameTabs({ recent: [], connected: false }), "mtg")).not.toContain(
      "treachery",
    )
    expect(formatIds(newGameTabs({ recent: [], connected: true }), "mtg")).toContain("treachery")
  })
})
