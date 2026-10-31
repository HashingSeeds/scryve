import { readPastedDeckList } from "./pastedDeckList"

describe("readPastedDeckList", () => {
  it("parses common exported formats and preserves deck sections", () => {
    expect(
      readPastedDeckList(`
Commander
1 Atraxa, Praetors' Voice (2X2) 186

Mainboard:
1x Sol Ring
2 Island (M21) 265

Sideboard
1 Swan Song *F*
`),
    ).toEqual({
      entries: [
        {
          name: "Atraxa, Praetors' Voice",
          quantity: 1,
          board: "commander",
          setCode: "2x2",
          collectorNumber: "186",
          originalReference: "Atraxa, Praetors' Voice (2X2) 186",
        },
        { name: "Sol Ring", quantity: 1, board: "main" },
        {
          name: "Island",
          quantity: 2,
          board: "main",
          setCode: "m21",
          collectorNumber: "265",
          originalReference: "Island (M21) 265",
        },
        { name: "Swan Song", quantity: 1, board: "sideboard" },
      ],
      invalidLines: [],
    })
  })

  it("combines duplicate entries and reports malformed lines", () => {
    expect(readPastedDeckList("1 Sol Ring\n2 Sol Ring\nSol Ring")).toEqual({
      entries: [{ name: "Sol Ring", quantity: 3, board: "main" }],
      invalidLines: ["Sol Ring"],
    })
  })

  it("keeps distinct printings and supports inline sideboard entries", () => {
    const result = readPastedDeckList(
      "1 Island (M21) 265\n2 Island (m21) 265\n1 Island (M21) 266 *F*\nSB: 2 Island (M21) 265\n1 Island",
    )
    expect(result.invalidLines).toEqual([])
    expect(result.entries).toMatchObject([
      { name: "Island", quantity: 3, board: "main", setCode: "m21", collectorNumber: "265" },
      { name: "Island", quantity: 1, board: "main", setCode: "m21", collectorNumber: "266" },
      { name: "Island", quantity: 2, board: "sideboard", setCode: "m21", collectorNumber: "265" },
      { name: "Island", quantity: 1, board: "main" },
    ])
  })

  it("reads MTG Arena exports with About and Companion sections", () => {
    const result = readPastedDeckList(`About
Name Mono Red Lurrus

Companion
1 Lurrus of the Dream-Den (IKO) 226

Deck
4 Lightning Bolt (STA) 42
20 Mountain (ZNR) 381

Sideboard
1 Lurrus of the Dream-Den (IKO) 226
2 Pyroblast (EMA) 142
`)
    expect(result.invalidLines).toEqual([])
    expect(result.entries).toMatchObject([
      { name: "Lightning Bolt", quantity: 4, board: "main" },
      { name: "Mountain", quantity: 20, board: "main" },
      { name: "Lurrus of the Dream-Den", quantity: 1, board: "sideboard" },
      { name: "Pyroblast", quantity: 2, board: "sideboard" },
    ])
    expect(
      readPastedDeckList("Companion\n1 Lurrus of the Dream-Den\n\nDeck\n4 Lightning Bolt"),
    ).toEqual({
      entries: [
        { name: "Lightning Bolt", quantity: 4, board: "main" },
        { name: "Lurrus of the Dream-Den", quantity: 1, board: "sideboard" },
      ],
      invalidLines: [],
    })
  })

  it("reads the block after the only blank line as the sideboard", () => {
    const mtgo = readPastedDeckList(
      "4 Lightning Bolt\r\n20 Mountain\r\n\r\n3 Pyroblast\r\n2 Smash to Smithereens\r\n",
    )
    expect(mtgo.entries.map(({ name, board }) => [name, board])).toEqual([
      ["Lightning Bolt", "main"],
      ["Mountain", "main"],
      ["Pyroblast", "sideboard"],
      ["Smash to Smithereens", "sideboard"],
    ])
    const goldfish = readPastedDeckList(
      "4 Lightning Bolt (STA) 42\n20 Mountain (ZNR) 381\n\n\n4 Lightning Bolt (STA) 42\n\n",
    )
    expect(goldfish).toMatchObject({
      entries: [
        { name: "Lightning Bolt", quantity: 4, board: "main", setCode: "sta" },
        { name: "Mountain", quantity: 20, board: "main" },
        { name: "Lightning Bolt", quantity: 4, board: "sideboard", setCode: "sta" },
      ],
      invalidLines: [],
    })
  })

  it("reads a trailing block that completes 100 cards as the commander", () => {
    expect(
      readPastedDeckList("1 Sol Ring\n98 Island\n\n1 Atraxa, Praetors' Voice").entries,
    ).toEqual([
      { name: "Sol Ring", quantity: 1, board: "main" },
      { name: "Island", quantity: 98, board: "main" },
      { name: "Atraxa, Praetors' Voice", quantity: 1, board: "commander" },
    ])
  })

  it("keeps blank-line groups in the main deck unless the list is two plain blocks", () => {
    const boards = (list: string) => readPastedDeckList(list).entries.map((entry) => entry.board)
    expect(boards("1 Sol Ring\n\n1 Island\n\n1 Forest")).toEqual(["main", "main", "main"])
    expect(boards("Creatures\n1 Llanowar Elves\n\nLands\n1 Forest")).toEqual(["main", "main"])
    expect(boards("# Creatures\n4 Llanowar Elves\n\n# Lands\n20 Forest")).toEqual(["main", "main"])
    expect(boards("1 Sol Ring\nSB: 1 Island\n\n1 Forest")).toEqual(["main", "sideboard", "main"])
  })

  it("ignores maybeboard and token sections", () => {
    expect(readPastedDeckList("1 Forest\nMaybeboard\n1 Island\nTokens\n1 Treasure Token")).toEqual({
      entries: [{ name: "Forest", quantity: 1, board: "main" }],
      invalidLines: [],
    })
  })
})
