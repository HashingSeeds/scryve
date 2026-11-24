import { catalogDb } from "@/storage/catalogDb"
import type { CatalogPrice, CatalogPrinting } from "@/storage/catalogDbTypes"
import { localCardDb } from "@/storage/localDb"
import type { StoredCollectionEntry } from "@/storage/localDbTypes"

import { valueCollectionEntries } from "./catalogSync"
import { computeDeckOwnership } from "./deckOwnership"

describe("collection SQLite scale benchmark (30,000 cards)", () => {
  beforeEach(() => {
    localCardDb.clearAll()
    catalogDb.clearAll()
  })

  it("queries, values, and checks 100-card deck ownership against 30,000 stored cards smoothly", () => {
    const totalEntries = 30_000
    const now = Date.now()
    const entries: StoredCollectionEntry[] = new Array(totalEntries)
    const printings: CatalogPrinting[] = new Array(2_000)
    const prices: CatalogPrice[] = new Array(2_000)

    for (let i = 0; i < 2_000; i += 1) {
      printings[i] = {
        game: "mtg",
        printingId: `p-${i}`,
        cardId: `card-${i}`,
        name: `Card ${i}`,
        nameNormalized: `card ${i}`,
        setCode: i % 2 === 0 ? "fdn" : "cmm",
        collectorNumber: String(i + 1),
        finishes: ["nonfoil"],
      }
      prices[i] = {
        game: "mtg",
        printingId: `p-${i}`,
        finish: "nonfoil",
        source: "tcgplayer",
        currency: "USD",
        retailCents: 100 + (i % 500),
        updatedAt: "2026-11-24T00:00:00Z",
      }
    }
    catalogDb.replacePrintings("mtg", printings, "bench-v1")
    catalogDb.replacePrices("mtg", prices, "2026-11-24T00:00:00Z")

    for (let i = 0; i < totalEntries; i += 1) {
      const cardIndex = i % 2_000
      entries[i] = {
        id: `entry-${i}`,
        game: "mtg",
        cardId: `card-${cardIndex}`,
        printingId: `p-${cardIndex}`,
        name: `Card ${cardIndex}`,
        setCode: cardIndex % 2 === 0 ? "fdn" : "cmm",
        collectorNumber: String(cardIndex + 1),
        finish: "nonfoil",
        condition: "NM",
        language: "en",
        quantity: 1,
        binderId: i < 5_000 ? "binder-1" : undefined,
        createdAt: now,
        updatedAt: now - i,
      }
    }
    localCardDb.upsertCollectionEntries(entries)

    const tBinderStart = performance.now()
    const binderRows = localCardDb.listCollectionEntries({ game: "mtg", binderId: "binder-1" })
    const tBinderMs = performance.now() - tBinderStart
    expect(binderRows).toHaveLength(5_000)
    expect(tBinderMs).toBeLessThan(250)

    const allRows = localCardDb.listCollectionEntries({ game: "mtg" })
    const tValueStart = performance.now()
    const valued = valueCollectionEntries("mtg", allRows)
    const tValueMs = performance.now() - tValueStart
    expect(valued.items).toHaveLength(totalEntries)
    expect(valued.totals.cards).toBe(totalEntries)
    expect(valued.totals.retailCents).toBeGreaterThan(0)
    expect(tValueMs).toBeLessThan(250)

    const deckCards = Array.from({ length: 100 }, (_, i) => ({
      name: `Card ${i}`,
      quantity: 1,
      oracleId: `card-${i}`,
      scryfallId: `p-${i}`,
    }))
    const tOwnStart = performance.now()
    const ownership = computeDeckOwnership("mtg", deckCards)
    const tOwnMs = performance.now() - tOwnStart

    expect(ownership.totalCards).toBe(100)
    expect(ownership.ownedCards).toBe(100)
    expect(ownership.missingCards).toBe(0)
    expect(tOwnMs).toBeLessThan(50)
  })
})
