import { cardTextLinesTopFirst, collectorHintFromCardBottom } from "./cardScan"

describe("cardTextLinesTopFirst", () => {
  it("ranks a Magic card's name first and drops mana, numbers, and repeats", () => {
    expect(
      cardTextLinesTopFirst([
        "Sol Ring {1}",
        "Artifact\n{T}: Add {C}{C}.",
        "0217 C\nCMM • EN",
        "Sol Ring",
      ]),
    ).toEqual(["Sol Ring", "Artifact"])
  })

  it("keeps punctuation that card names use", () => {
    expect(
      cardTextLinesTopFirst([
        "Urza's Saga",
        "Circle of Protection: Red",
        "Blue-Eyes White Dragon!",
      ]),
    ).toEqual(["Urza's Saga", "Circle of Protection: Red", "Blue-Eyes White Dragon!"])
  })

  it("returns nothing when no line reads as words", () => {
    expect(cardTextLinesTopFirst(["", "12/24", "HP"])).toEqual([])
  })
})

describe("collectorHintFromCardBottom", () => {
  it("parses M15 set code, language, and collector ratio", () => {
    expect(collectorHintFromCardBottom(["0123/0280 R", "FDN • EN  Artist Name"])).toEqual({
      setCode: "fdn",
      collectorNumber: "123",
      language: "en",
    })
  })

  it("detects foil star and 4-digit Commander collector numbers", () => {
    expect(collectorHintFromCardBottom(["0412 U", "CMM ★ EN"])).toEqual({
      setCode: "cmm",
      collectorNumber: "412",
      language: "en",
      isFoilStar: true,
    })
  })

  it("handles non-English codes and ignores copyright tokens", () => {
    expect(collectorHintFromCardBottom(["TM & © 2026 WOTC", "BLB · JA 0014"])).toEqual({
      setCode: "blb",
      collectorNumber: "14",
      language: "ja",
    })
  })

  it("returns empty object for empty or unreadable lines", () => {
    expect(collectorHintFromCardBottom(["", "Artist Name"])).toEqual({})
  })
})
