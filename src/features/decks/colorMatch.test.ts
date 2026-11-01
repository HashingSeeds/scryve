import { matchesColors, toggleColor } from "./colorMatch"

describe("matchesColors", () => {
  it.each([
    ["within", "WU", true],
    ["within", "W", true],
    ["within", "", true],
    ["within", "WUB", false],
    ["additional", "WU", true],
    ["additional", "WUB", true],
    ["additional", "W", false],
    ["exact", "WU", true],
    ["exact", "WUB", false],
    ["exact", "W", false],
  ] as const)("%s Azorius picks an identity of %p: %p", (match, identity, expected) => {
    expect(matchesColors(identity, ["W", "U"], match)).toBe(expected)
  })

  it("matches colorless only for an empty identity", () => {
    expect(matchesColors("", ["C"], "within")).toBe(true)
    expect(matchesColors("G", ["C"], "additional")).toBe(false)
    expect(matchesColors(undefined, ["C"], "exact")).toBe(false)
  })

  it("never matches an unknown identity once a color is picked", () => {
    expect(matchesColors(undefined, ["G"], "within")).toBe(false)
    expect(matchesColors(undefined, [], "within")).toBe(true)
  })

  it("lets a commander that chooses its color miss one picked color", () => {
    expect(matchesColors("W", ["W", "U"], "exact", true)).toBe(true)
    expect(matchesColors("W", ["W", "U", "B"], "exact", true)).toBe(false)
  })
})

describe("toggleColor", () => {
  it("keeps colorless apart from the colors", () => {
    expect(toggleColor(["W", "U"], "C")).toEqual(["C"])
    expect(toggleColor(["C"], "G")).toEqual(["G"])
    expect(toggleColor(["W", "U"], "W")).toEqual(["U"])
  })
})
