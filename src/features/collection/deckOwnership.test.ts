import { catalogDb } from "@/storage/catalogDb"
import { localCardDb } from "@/storage/localDb"

import { addCollectionCard, createBinder } from "./collectionStore"
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
    catalogDb.replacePrices("mtg", [
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
    ])

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

    const scanSession = createBinder({ kind: "scan_session", name: "Inbox Scan", game: "mtg" })
    addCollectionCard({
      game: "mtg",
      cardId: "ora-bolt",
      printingId: "scry-bolt",
      name: "Lightning Bolt",
      setCode: "fdn",
      collectorNumber: "100",
      quantity: 4,
      binderId: scanSession.id,
    })

    const summary = computeDeckOwnership("mtg", [
      { name: "Lightning Bolt", quantity: 4, oracleId: "ora-bolt", scryfallId: "scry-bolt" },
      { name: "Sol Ring", quantity: 1, oracleId: "ora-sol", scryfallId: "scry-sol" },
    ])

    expect(summary.totalCards).toBe(5)
    expect(summary.ownedCards).toBe(3)
    expect(summary.missingCards).toBe(2)
    expect(summary.estimatedMissingCents).toBe(400)

    const fallbackPrinting = computeDeckOwnership("mtg", [
      {
        name: "Lightning Bolt",
        quantity: 3,
        oracleId: "ora-bolt",
        scryfallId: "unknown-printing-id",
      },
    ])
    expect(fallbackPrinting.missingCards).toBe(1)
    expect(fallbackPrinting.estimatedMissingCents).toBe(200)
  })

  it("counts owned copies of a deck card that has only a name", () => {
    addCollectionCard({
      game: "mtg",
      cardId: "name:sol ring",
      printingId: "scan:sol ring",
      name: "Sol Ring",
      setCode: "",
      collectorNumber: "",
      quantity: 1,
    })
    catalogDb.replacePrintings(
      "mtg",
      [
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
    addCollectionCard({
      game: "mtg",
      cardId: "ora-sol",
      printingId: "scry-sol",
      name: "Sol Ring",
      setCode: "cmm",
      collectorNumber: "410",
      quantity: 2,
    })

    const summary = computeDeckOwnership("mtg", [{ name: "Sol Ring", quantity: 4 }])

    expect(summary.ownedCards).toBe(3)
    expect(summary.missingCards).toBe(1)
  })
})
