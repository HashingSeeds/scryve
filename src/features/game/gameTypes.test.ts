import { newGameTypes } from "./gameTypes"

const ids = (types: readonly { id: string }[]) => types.map((type) => type.id)

describe("newGameTypes", () => {
  it("falls back to the featured order, capped, with No system last", () => {
    const { suggested, more } = newGameTypes({ connected: false })

    expect(ids(suggested)).toEqual(["commander", "mtg-standard", "ygo-advanced", "none"])
    expect(ids(more)).toContain("pokemon-standard")
    expect(ids(more)).not.toContain("treachery")
  })

  it("leads with the format picked at onboarding, then that system's featured formats", () => {
    const { suggested, more } = newGameTypes({
      chosen: { system: "ygo", format: "speed" },
      connected: false,
    })

    expect(ids(suggested)).toEqual(["ygo-speed", "ygo-advanced", "commander", "none"])
    expect(ids(more)).not.toContain("ygo-speed")
  })

  it("leaves the recent format to its own row and favors its system", () => {
    const { suggested, more } = newGameTypes({
      recent: { system: "ygo", format: "speed" },
      connected: false,
    })

    expect(ids(suggested)).toEqual(["ygo-advanced", "commander", "mtg-standard", "none"])
    expect(ids(more)).toContain("ygo-speed")
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
