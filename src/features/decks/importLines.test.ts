import { lineCardName, pastedLine } from "./importLines"

describe("pastedLine", () => {
  it("keeps the copies and section the misspelled line asked for", () => {
    const list = "Deck\n4 Lightnig Bolt\n\nSideboard\n2 Pyroblsat\nSB: 1 Negaet"
    expect(pastedLine(list, "Lightnig Bolt")).toEqual({ quantity: 4, board: "main" })
    expect(pastedLine(list, "Pyroblsat")).toEqual({ quantity: 2, board: "sideboard" })
    expect(pastedLine(list, "Negaet")).toEqual({ quantity: 1, board: "sideboard" })
  })

  it("finds printed lines by their full reference", () => {
    expect(
      pastedLine("Commander\n1 Captian America (SLD) 12 *F*", "Captian America (SLD) 12"),
    ).toEqual({ quantity: 1, board: "commander" })
  })

  it("adds one copy to the main deck when the line is not in the text", () => {
    expect(pastedLine("1 Sol Ring", "Swrods to Plowshare")).toEqual({ quantity: 1, board: "main" })
  })
})

describe("lineCardName", () => {
  it("drops the set, collector number, and finish", () => {
    expect(lineCardName("Swrods to Plowshare (STA) 10 *F*")).toBe("Swrods to Plowshare")
    expect(lineCardName("Swrods to Plowshare")).toBe("Swrods to Plowshare")
  })
})
