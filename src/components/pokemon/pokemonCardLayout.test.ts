import {
  benchMenuClearance,
  contentInsetsFor,
  heroFontSize,
  knockoutMessage,
  MENU_CLEARANCE,
  parseHp,
} from "./pokemonCardLayout"

describe("pokemonCardLayout", () => {
  it("maps screen insets onto the turned seat so the bench stays on the inner edge", () => {
    const insets = { top: 50, right: 0, bottom: 34, left: 0 }
    expect(contentInsetsFor(0, insets)).toEqual(insets)
    expect(contentInsetsFor(180, insets)).toEqual({ top: 34, right: 0, bottom: 50, left: 0 })
    expect(contentInsetsFor(90, insets)).toEqual({ top: 0, right: 34, bottom: 0, left: 50 })
    expect(contentInsetsFor(-90, insets)).toEqual({ top: 0, right: 50, bottom: 0, left: 34 })
  })

  it("drops the bench below a centered menu and shortens it beside a corner menu", () => {
    const none = { top: 0, left: 0, right: 0 }
    expect(benchMenuClearance(0, undefined, "top")).toEqual({ ...none, top: MENU_CLEARANCE })
    expect(benchMenuClearance(180, undefined, "bottom")).toEqual({ ...none, top: MENU_CLEARANCE })
    expect(benchMenuClearance(180, undefined, "top")).toEqual(none)
    // why: a corner at the inner edge sits on the bench's left or right in content space.
    expect(benchMenuClearance(0, "topLeft", undefined)).toEqual({ ...none, left: MENU_CLEARANCE })
    expect(benchMenuClearance(0, "topRight", undefined)).toEqual({ ...none, right: MENU_CLEARANCE })
    expect(benchMenuClearance(0, "bottomLeft", undefined)).toEqual(none)
    expect(benchMenuClearance(90, "topRight", undefined)).toEqual({ ...none, left: MENU_CLEARANCE })
    expect(benchMenuClearance(90, "bottomRight", undefined)).toEqual({
      ...none,
      right: MENU_CLEARANCE,
    })
    expect(benchMenuClearance(90, "topLeft", undefined)).toEqual(none)
    expect(benchMenuClearance(-90, "bottomLeft", undefined)).toEqual({
      ...none,
      left: MENU_CLEARANCE,
    })
    expect(benchMenuClearance(180, "bottomRight", undefined)).toEqual({
      ...none,
      left: MENU_CLEARANCE,
    })
  })

  it("keeps the hero number legible when the seat leaves it no room", () => {
    expect(heroFontSize({ width: 420, height: -20, digits: 3, fontScale: 1 })).toBe(30)
    expect(heroFontSize({ width: 390, height: 260, digits: 3, fontScale: 1 })).toBe(96)
  })

  it("accepts only whole HP values a printed card could carry", () => {
    expect(parseHp(" 330 ")).toBe(330)
    expect(parseHp("0")).toBeUndefined()
    expect(parseHp("1000")).toBeUndefined()
    expect(parseHp("3o")).toBeUndefined()
  })

  it("leaves the taker out of the knockout message when nobody scored", () => {
    expect(
      knockoutMessage({ pokemon: { name: "Pikachu" }, takerName: "Grace", prizesTaken: 1 }),
    ).toBe("Pikachu knocked out. Grace takes 1 prize.")
    expect(knockoutMessage({ pokemon: {}, prizesTaken: 0 })).toBe("Pokémon knocked out.")
  })
})
