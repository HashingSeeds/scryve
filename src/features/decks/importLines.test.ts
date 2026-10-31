import { lineCardName, pastedLines } from "./importLines"

describe("pastedLines", () => {
  it("keeps the copies and section the misspelled line asked for", () => {
    const list = "Deck\n4 Lightnig Bolt\n\nSideboard\n2 Pyroblsat\nSB: 1 Negaet"
    expect(pastedLines(list, "Lightnig Bolt")).toEqual([{ quantity: 4, board: "main" }])
    expect(pastedLines(list, "Pyroblsat")).toEqual([{ quantity: 2, board: "sideboard" }])
    expect(pastedLines(list, "Negaet")).toEqual([{ quantity: 1, board: "sideboard" }])
  })

  it("keeps every copy when the same misspelling is in more than one section", () => {
    expect(pastedLines("2 Lightnig Bolt\nSideboard\n1 Lightnig Bolt", "Lightnig Bolt")).toEqual([
      { quantity: 2, board: "main" },
      { quantity: 1, board: "sideboard" },
    ])
  })

  it("finds printed lines by their full reference", () => {
    expect(
      pastedLines("Commander\n1 Captian America (SLD) 12 *F*", "Captian America (SLD) 12 *F*"),
    ).toEqual([{ quantity: 1, board: "commander" }])
  })

  it("counts a companion that is also in the sideboard once, like the importer", () => {
    const list =
      "Companion\n1 Lurus of the Dream-Den\n\nDeck\n4 Lightning Bolt\n\nSideboard\n1 Lurus of the Dream-Den"
    expect(pastedLines(list, "Lurus of the Dream-Den")).toEqual([
      { quantity: 1, board: "sideboard" },
    ])
  })

  it("skips zero-copy lines the importer reports as invalid", () => {
    expect(pastedLines("4 Lightnig Bolt\nSideboard\n0 Lightnig Bolt", "Lightnig Bolt")).toEqual([
      { quantity: 4, board: "main" },
    ])
  })

  it("keeps an invalid printed line apart from the valid line it resembles", () => {
    const list = "4 Island (M21) 265\nSideboard\n0 Island (M21) 265"
    expect(pastedLines(list, "0 Island (M21) 265")).toEqual([{ quantity: 1, board: "main" }])
  })

  it("keeps different lines that share a printing apart", () => {
    const list = "Deck\n2 Delver of Secrets (ISD) 999\nSideboard\n3 Insectile Aberration (ISD) 999"
    expect(pastedLines(list, "Delver of Secrets (ISD) 999")).toEqual([
      { quantity: 2, board: "main" },
    ])
    expect(pastedLines(list, "Insectile Aberration (ISD) 999")).toEqual([
      { quantity: 3, board: "sideboard" },
    ])
  })

  it("counts every line the importer merged into the reported printing", () => {
    expect(pastedLines("1 Island (M21) 265 *F*\n1 Island (m21) 265", "Island (m21) 265")).toEqual([
      { quantity: 2, board: "main" },
    ])
  })

  it("adds one copy to the main deck when the line is not in the text", () => {
    expect(pastedLines("1 Sol Ring", "Swrods to Plowshare")).toEqual([
      { quantity: 1, board: "main" },
    ])
  })
})

describe("lineCardName", () => {
  it("drops the set, collector number, and finish", () => {
    expect(lineCardName("Swrods to Plowshare (STA) 10 *F*")).toBe("Swrods to Plowshare")
    expect(lineCardName("Swrods to Plowshare")).toBe("Swrods to Plowshare")
  })
})
