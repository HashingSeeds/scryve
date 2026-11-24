import { catalogDb } from "@/storage/catalogDb"
import { localCardDb } from "@/storage/localDb"

import { addCollectionCard } from "./collectionStore"
import { computeDeckOwnership } from "./deckOwnership"

describe("deckOwnership", () => {
  beforeEach(() => {
    localCardDb.clearAll()
    catalogDb.clearAll()
  })

  it("computes owned vs missing copies and cost to finish from local collection and prices", () => {
    catalogDb.replacePrintings(
      "mtg",
      [
        {
          game: "mtg",
          printingId: "scry-bolt",
          cardId: "ora-bolt",
          name: "Lightning Bolt",
          nameNormalized: "lightning bolt",
          setCode: "fdn",
          collectorNumber: "100",
          finishes: ["nonfoil"],
        },
        {
          game: "mtg",
          printingId: "scry-sol",
          cardId: "ora-sol",
          name: "Sol Ring",
          nameNormalized: "sol ring",
          setCode: "cmm",
          collectorNumber: "410",
          finishes: ["nonfoil"],
        },
      ],
      "v1",
    )
    catalogDb.replacePrices(
      "mtg",
      [
        {
          game: "mtg",
          printingId: "scry-bolt",
          finish: "nonfoil",
          source: "tcgplayer",
          currency: "USD",
          retailCents: 200,
          updatedAt: "2026-11-24T00:00:00Z",
        },
        {
          game: "mtg",
          printingId: "scry-sol",
          finish: "nonfoil",
          source: "tcgplayer",
          currency: "USD",
          retailCents: 150,
          updatedAt: "2026-11-24T00:00:00Z",
        },
      ],
      "2026-11-24T00:00:00Z",
    )

    addCollectionCard({
      game: "mtg",
      cardId: "ora-bolt",
      printingId: "scry-bolt",
      name: "Lightning Bolt",
      setCode: "fdn",
      collectorNumber: "100",
      quantity: 2,
    })
    addCollectionCard({
      game: "mtg",
      cardId: "ora-sol",
      printingId: "scry-sol",
      name: "Sol Ring",
      setCode: "cmm",
      collectorNumber: "410",
      quantity: 3,
    })

    const summary = computeDeckOwnership("mtg", [
      { name: "Lightning Bolt", quantity: 4, oracleId: "ora-bolt", scryfallId: "scry-bolt" },
      { name: "Sol Ring", quantity: 1, oracleId: "ora-sol", scryfallId: "scry-sol" },
    ])

    expect(summary.totalCards).toBe(5)
    expect(summary.ownedCards).toBe(3)
    expect(summary.missingCards).toBe(2)
    expect(summary.estimatedMissingCents).toBe(400)
  })
})
