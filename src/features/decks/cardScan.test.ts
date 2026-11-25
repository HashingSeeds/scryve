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

  it("ignores same-line copyright years and preserves alphabetic collector suffixes", () => {
    expect(collectorHintFromCardBottom(["BLB EN 0014 © 2024"])).toEqual({
      setCode: "blb",
      collectorNumber: "14",
      language: "en",
    })
    expect(collectorHintFromCardBottom(["BLB EN © 2024"])).toEqual({
      setCode: "blb",
      language: "en",
    })
    expect(collectorHintFromCardBottom(["BLB EN 14a"])).toEqual({
      setCode: "blb",
      collectorNumber: "14a",
      language: "en",
    })
  })

  it("parses glued set+language OCR and exposes standalone uppercase set candidates", () => {
    expect(collectorHintFromCardBottom(["TRK ENZoLIAN Bonos"])).toEqual({
      setCode: "trk",
      language: "en",
    })
    expect(collectorHintFromCardBottom(["Stop tn", "with", "TRK"])).toEqual({
      candidateSetCodes: ["trk"],
    })
  })

  it("ignores lowercase English rules text and creature power/toughness", () => {
    expect(
      collectorHintFromCardBottom([
        "will defend",
        "stop it",
        "cards from",
        "2/3",
        "4/4",
        "2026 Wizards of the Coast",
      ]),
    ).toEqual({})
  })

  it("returns empty object for empty or unreadable lines", () => {
    expect(collectorHintFromCardBottom(["", "Artist Name"])).toEqual({})
  })
})
