import { normalizeYgoDeckFeed } from "./yugiohDecks"

function ids(start: number, count: number) {
  return Array.from({ length: count }, (_, index) => String(start + index))
}

describe("normalizeYgoDeckFeed", () => {
  it("keeps only the fields and sections Scryve imports", () => {
    const main = [...ids(10000, 39), "10000"]
    const result = normalizeYgoDeckFeed([
      {
        deckNum: 42,
        deck_name: "Example deck",
        main_deck: JSON.stringify(main),
        extra_deck: JSON.stringify(["20000", "20000"]),
        side_deck: JSON.stringify(["30000"]),
        tournamentName: "Regional",
        deck_description: "not retained",
      },
    ])

    expect(result).toEqual([
      expect.objectContaining({ externalId: "42", name: "Example deck", kind: "tournament" }),
    ])
    expect(result[0]?.entries).toEqual(
      expect.arrayContaining([
        { providerCardId: "10000", quantity: 2, section: "main" },
        { providerCardId: "20000", quantity: 2, section: "extra" },
        { providerCardId: "30000", quantity: 1, section: "side" },
      ]),
    )
  })

  it("drops malformed and structurally invalid decks", () => {
    expect(normalizeYgoDeckFeed([{ deckNum: 1, deck_name: "Too small", main_deck: "[]" }])).toEqual(
      [],
    )
    expect(normalizeYgoDeckFeed({ data: [] })).toEqual([])
  })

  it("accepts numeric passcodes in deck sections", () => {
    const deck = (deckNum: unknown) => ({
      deckNum,
      deck_name: "Example deck",
      main_deck: JSON.stringify(Array.from({ length: 40 }, (_, index) => 10000 + index)),
    })

    expect(normalizeYgoDeckFeed([deck(42)])).toHaveLength(1)
    expect(normalizeYgoDeckFeed([deck(42)])[0]?.entries).toHaveLength(40)
  })
})
