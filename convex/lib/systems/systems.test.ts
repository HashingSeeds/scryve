import { formatDefinition, hasCommandZone, SYSTEM_IDS, SYSTEMS, tableRules } from "."

describe("system definitions", () => {
  it("plays Brawl from the command zone without the 21 commander damage loss", () => {
    expect(formatDefinition("mtg", "brawl")).toMatchObject({
      singleton: true,
      hasCommanderDamage: false,
      startingValue: 25,
    })
    expect(hasCommandZone("mtg", "brawl")).toBe(true)
  })

  it("tracks commander damage only in Commander", () => {
    const formats = SYSTEM_IDS.flatMap((system) =>
      SYSTEMS[system].formats.flatMap((format) =>
        "hasCommanderDamage" in format && format.hasCommanderDamage ? [format.id] : [],
      ),
    )
    expect(formats).toEqual(["commander"])
  })

  it("counts Pokémon prizes down and other systems open", () => {
    expect(SYSTEMS.pokemon.counter.direction).toBe("down")
    expect(SYSTEMS.mtg.counter.direction).toBe("open")
    expect(SYSTEMS.ygo.counter.direction).toBe("open")
  })

  it("offers commander tax only where a command zone exists, and a Pokémon board only in Pokémon", () => {
    const counterIds = (system: string, format: string) =>
      tableRules(system, format).counters.map(({ id }) => id)
    expect(counterIds("mtg", "commander")).toEqual(["poison", "commanderTax"])
    expect(counterIds("mtg", "brawl")).toEqual(["poison", "commanderTax"])
    expect(counterIds("mtg", "modern")).toEqual(["poison"])
    expect(tableRules("mtg", "modern").designations.map(({ id }) => id)).toEqual([
      "monarch",
      "initiative",
    ])
    expect(tableRules("pokemon", "standard").pokemon).toEqual({ benchSize: 5, damageStep: 10 })
    expect(tableRules("ygo", "advanced")).toEqual({ counters: [], designations: [] })
    expect(tableRules("mtg", "commander")).toBe(tableRules("mtg", "commander"))
  })

  it("keeps each default format inside its system", () => {
    for (const system of SYSTEM_IDS) {
      const { deck, play } = SYSTEMS[system].defaultFormat
      expect(formatDefinition(system, deck)).toBeDefined()
      expect(formatDefinition(system, play)).toBeDefined()
    }
  })
})
