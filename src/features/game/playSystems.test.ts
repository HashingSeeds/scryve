import {
  counterDeltaFromStartLabel,
  defaultStartingLife,
  playSystemRules,
  supportsCommanderDamage,
} from "./playSystems"

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
    expect(supportsCommanderDamage("mtg", "brawl")).toBe(false)
    expect(supportsCommanderDamage("mtg", "commander")).toBe(true)
  })

  it("reports prizes taken for down counters", () => {
    expect(counterDeltaFromStartLabel("pokemon", 4, 6)).toBe("2 taken")
    expect(counterDeltaFromStartLabel("mtg", 18, 20)).toBe("-2 from start")
  })

  it("keeps other system defaults", () => {
    expect(defaultStartingLife("ygo")).toBe(8000)
    expect(defaultStartingLife("pokemon")).toBe(6)
    expect(defaultStartingLife()).toBe(20)
  })
})
