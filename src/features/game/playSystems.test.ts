import {
  counterDeltaFromStartLabel,
  counterHeading,
  counterLabel,
  defaultStartingLife,
  localizedDeckSections,
  PLAY_SYSTEM_IDS,
  playFormatOptions,
  playSystemRules,
  storedPlaySystem,
  supportsCommanderDamage,
  tableItemLabel,
} from "./playSystems"
import { deckFormats, deckSections } from "../../../convex/lib/deckGames"
import { SYSTEMS } from "../../../convex/lib/systems"

describe("play system defaults", () => {
  it("uses one point taps for Magic", () => {
    expect(playSystemRules("mtg").counter.tapStep).toBe(1)
  })

  it("uses Commander life when the format is Commander", () => {
    expect(defaultStartingLife("mtg", "commander")).toBe(40)
    expect(defaultStartingLife("mtg", "standard")).toBe(20)
  })

  it("starts Brawl at 25 life without commander damage", () => {
    expect(defaultStartingLife("mtg", "brawl")).toBe(25)
    expect(defaultStartingLife("mtg", "brawl", 2)).toBe(25)
    expect(defaultStartingLife("mtg", "brawl", 4)).toBe(30)
    expect(defaultStartingLife("mtg", "commander", 4)).toBe(40)
    expect(supportsCommanderDamage("mtg", "brawl")).toBe(false)
    expect(supportsCommanderDamage("mtg", "commander")).toBe(true)
  })

  it("reads a saved game's system as Magic only when it predates systems", () => {
    expect(storedPlaySystem(undefined)).toBe("mtg")
    expect(storedPlaySystem("pokemon")).toBe("pokemon")
    expect(storedPlaySystem("none")).toBeUndefined()
    expect(storedPlaySystem("a-later-system")).toBeUndefined()
  })

  it("reports prizes taken for down counters", () => {
    expect(counterDeltaFromStartLabel("pokemon", 4, 6)).toBe("2 prizes taken")
    expect(counterDeltaFromStartLabel("mtg", 18, 20)).toBe("-2 from start")
  })

  it("keeps other system defaults", () => {
    expect(defaultStartingLife("ygo")).toBe(8000)
    expect(defaultStartingLife("pokemon")).toBe(6)
    expect(defaultStartingLife()).toBe(20)
  })
})

describe("shared system labels", () => {
  it("reads the same English as the shared definitions", () => {
    for (const id of PLAY_SYSTEM_IDS) {
      const { counter, table } = SYSTEMS[id]
      const formats = deckFormats(id)
      expect(counterHeading(id)).toBe(counter.heading)
      expect(counterLabel(id)).toBe(counter.label)
      expect(playFormatOptions(id)).toEqual(
        formats.map(({ id: format, label, blurb }) => ({
          id: format,
          label,
          ...(blurb ? { detail: blurb } : {}),
        })),
      )
      for (const format of formats)
        expect(localizedDeckSections(id, format.id)).toEqual(deckSections(id, format.id))
      for (const item of [...table.counters, ...table.designations])
        expect(tableItemLabel(item)).toBe(item.label)
    }
  })
})
