import {
  counterStanding,
  formatDefinition,
  hasCommandZone,
  identitySection,
  isCounterOut,
  SYSTEM_IDS,
  startingValueRange,
  SYSTEMS,
  tableRules,
} from "."

describe("system definitions", () => {
  it("plays Brawl from the command zone without the 21 commander damage loss", () => {
    expect(formatDefinition("mtg", "brawl")).toMatchObject({
      singleton: true,
      hasCommanderDamage: false,
      startingValue: 25,
    })
    expect(hasCommandZone("mtg", "brawl")).toBe(true)
  })

  it("picks an identity card only in Commander, whose picker checks Commander legality", () => {
    const identities = SYSTEM_IDS.flatMap((system) =>
      SYSTEMS[system].formats.flatMap((format) => {
        const section = identitySection(system, format.id)
        return section ? [`${system}:${format.id}:${section.id}`] : []
      }),
    )
    expect(identities).toEqual(["mtg:commander:commander"])
  })

  it("tracks commander damage only in Commander", () => {
    const formats = SYSTEM_IDS.flatMap((system) =>
      SYSTEMS[system].formats.flatMap((format) =>
        "hasCommanderDamage" in format && format.hasCommanderDamage ? [format.id] : [],
      ),
    )
    expect(formats).toEqual(["commander"])
  })

  it("knocks a survivor out at 0 and ends a race when anyone reaches the goal", () => {
    const life = SYSTEMS.mtg.counter
    expect(isCounterOut(life, 0, [20])).toBe(true)
    expect(isCounterOut(life, 1, [-3])).toBe(false)

    const prizes = SYSTEMS.pokemon.counter
    expect(isCounterOut(prizes, 4, [0])).toBe(true)
    expect(isCounterOut(prizes, 0, [1])).toBe(false)

    const lore = SYSTEMS.lorcana.counter
    expect(isCounterOut(lore, 0, [21])).toBe(true)
    expect(isCounterOut(lore, 20, [19])).toBe(false)
    expect(counterStanding(lore, 12)).toBeGreaterThan(counterStanding(lore, 3))
    expect(counterStanding(prizes, 1)).toBeGreaterThan(counterStanding(prizes, 3))
  })

  it("starts a counting-up race from 0 and short of its goal", () => {
    expect(startingValueRange("lorcana")).toEqual({ min: 0, max: 19 })
    expect(startingValueRange("pokemon")).toMatchObject({ min: 1 })
    expect(startingValueRange("mtg")).toMatchObject({ min: 1 })
    expect(startingValueRange(undefined)).toEqual({ min: 1, max: 999 })
  })

  it("offers experience and commander tax only where a command zone exists, and a Pokémon board only in Pokémon", () => {
    const counterIds = (system: string, format: string) =>
      tableRules(system, format).counters.map(({ id }) => id)
    expect(counterIds("mtg", "commander")).toEqual([
      "poison",
      "energy",
      "experience",
      "commanderTax",
    ])
    expect(counterIds("mtg", "brawl")).toEqual(["poison", "energy", "experience", "commanderTax"])
    expect(counterIds("mtg", "modern")).toEqual(["poison", "energy"])
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
