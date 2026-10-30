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

  it("reads the block after the only blank line as the sideboard, like the importer", () => {
    const list = "4 Lightning Bolt\n4 Lightnig Helix\n\n2 Pyroblsat"
    expect(pastedLines(list, "Lightnig Helix")).toEqual([{ quantity: 4, board: "main" }])
    expect(pastedLines(list, "Pyroblsat")).toEqual([{ quantity: 2, board: "sideboard" }])
  })

  it("reads a trailing block that completes 100 cards as the commander", () => {
    expect(pastedLines("98 Plains\n1 Sol Ring\n\n1 Captian America", "Captian America")).toEqual([
      { quantity: 1, board: "commander" },
    ])
  })

  it("skips sections the importer skips", () => {
    expect(pastedLines("Maybeboard\n3 Swrods\n\nDeck\n1 Swrods", "Swrods")).toEqual([
      { quantity: 1, board: "main" },
    ])
  })

  it("finds printed lines by their full reference", () => {
    expect(
      pastedLines("Commander\n1 Captian America (SLD) 12 *F*", "Captian America (SLD) 12 *F*"),
    ).toEqual([{ quantity: 1, board: "commander" }])
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
