import { likelyCardNamesTopFirst } from "./cardScan"

describe("likelyCardNamesTopFirst", () => {
  it("ranks a Magic card's name first and drops mana, numbers, and repeats", () => {
    expect(
      likelyCardNamesTopFirst([
        "Sol Ring {1}",
        "Artifact\n{T}: Add {C}{C}.",
        "0217 C\nCMM • EN",
        "Sol Ring",
      ]),
    ).toEqual(["Sol Ring", "Artifact"])
  })

  it("keeps punctuation that card names use", () => {
    expect(
      likelyCardNamesTopFirst([
        "Urza's Saga",
        "Circle of Protection: Red",
        "Blue-Eyes White Dragon!",
      ]),
    ).toEqual(["Urza's Saga", "Circle of Protection: Red", "Blue-Eyes White Dragon!"])
  })

  it("returns nothing when no line reads as words", () => {
    expect(likelyCardNamesTopFirst(["", "12/24", "HP"])).toEqual([])
  })
})
