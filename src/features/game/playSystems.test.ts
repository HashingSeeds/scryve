import { defaultStartingLife, playSystemRules } from "./playSystems"

describe("play system defaults", () => {
  it("uses one point taps for Magic", () => {
    expect(playSystemRules("mtg").counter.tapStep).toBe(1)
  })

  it("uses Commander life when the format is Commander", () => {
    expect(defaultStartingLife("mtg", "commander")).toBe(40)
    expect(defaultStartingLife("mtg", "standard")).toBe(20)
  })

  it("keeps other system defaults", () => {
    expect(defaultStartingLife("ygo")).toBe(8000)
    expect(defaultStartingLife("pokemon")).toBe(6)
    expect(defaultStartingLife()).toBe(20)
  })
})
