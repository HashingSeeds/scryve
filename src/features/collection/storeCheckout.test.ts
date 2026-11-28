import { catalogDb } from "@/storage/catalogDb"
import type { CatalogPrice, CatalogPrinting } from "@/storage/catalogDbTypes"
import { localCardDb } from "@/storage/localDb"

import { computeDeckOwnership } from "./deckOwnership"
import { planStoreCheckout } from "./storeCheckout"

function printing(
  printingId: string,
  cardId: string,
  name: string,
  setCode: string,
  tcgplayerId?: number,
): CatalogPrinting {
  return {
    game: "mtg",
    printingId,
    cardId,
    name,
    nameNormalized: name.toLowerCase(),
    setCode,
    collectorNumber: "1",
    finishes: ["nonfoil"],
    tcgplayerId,
  }
}

function price(
  printingId: string,
  source: string,
  retailCents: number,
  finish = "nonfoil",
): CatalogPrice {
  return {
    game: "mtg",
    printingId,
    finish,
    source,
    currency: "USD",
    retailCents,
    updatedAt: "2026-11-28T00:00:00Z",
  }
}

describe("planStoreCheckout", () => {
  beforeEach(() => {
    localCardDb.clearAll()
    catalogDb.clearAll()
    catalogDb.replacePrintings(
      "mtg",
      [
        printing("sol-cmm", "ora-sol", "Sol Ring", "cmm", 1),
        printing("sol-c21", "ora-sol", "Sol Ring", "c21", 2),
        printing("bolt-fdn", "ora-bolt", "Lightning Bolt", "fdn", 3),
        printing("alchemy", "ora-alchemy", "A-Digital Card", "ymid"),
        printing("tower", "ora-tower", "Command Tower", "cmm", 4),
      ],
      "v1",
    )
    catalogDb.replacePrices("mtg", [
      price("sol-cmm", "tcgplayer", 300),
      price("sol-c21", "tcgplayer", 150),
      price("sol-c21", "cardkingdom", 250),
      price("bolt-fdn", "tcgplayer", 100),
      price("alchemy", "cardkingdom", 50),
    ])
  })

  const deck = [
    { name: "Sol Ring", oracleId: "ora-sol", quantity: 1 },
    { name: "Lightning Bolt", oracleId: "ora-bolt", scryfallId: "bolt-fdn", quantity: 4 },
    { name: "A-Digital Card", oracleId: "ora-alchemy", quantity: 1 },
    { name: "Sol Rnig", quantity: 2 },
    { name: "Command Tower", oracleId: "ora-tower", quantity: 1 },
  ]

  it("sends names only, prices each card at its cheapest listed printing, and leaves out what the store lacks", () => {
    const { items } = computeDeckOwnership("mtg", deck)
    const plan = planStoreCheckout("mtg", items, "tcgplayer")

    expect(plan.lines.map(({ item, problem }) => [item.name, problem])).toEqual([
      ["Sol Ring", undefined],
      ["Lightning Bolt", undefined],
      ["A-Digital Card", "not_sold"],
      ["Sol Rnig", "unknown_card"],
      ["Command Tower", undefined],
    ])
    expect(plan.cardCount).toBe(6)
    expect(plan.totalCents).toBe(150 + 4 * 100)
    expect(plan.unpricedCount).toBe(1)
    expect(decodeURIComponent(plan.url ?? "")).toContain(
      "c=1 Sol Ring||4 Lightning Bolt||1 Command Tower",
    )
  })

  it("sends a card one store lacks to the store that lists it", () => {
    const { items } = computeDeckOwnership("mtg", deck)
    const plan = planStoreCheckout("mtg", items, "cardkingdom")

    expect(plan.lines.map(({ problem }) => problem)).toEqual([
      undefined,
      "not_sold",
      undefined,
      "unknown_card",
      "not_sold",
    ])
    expect(plan.totalCents).toBe(250 + 50)
    expect(new URL(plan.url ?? "").searchParams.get("c")).toBe("1 Sol Ring\n1 A-Digital Card")
  })

  it("prices a deck's chosen printing at the store's cheapest, since the store gets only the name", () => {
    catalogDb.replacePrices("mtg", [
      price("sol-cmm", "tcgplayer", 300),
      price("sol-c21", "tcgplayer", 150),
      price("sol-cmm", "cardkingdom", 900),
      price("sol-c21", "cardkingdom", 250),
    ])
    const { items } = computeDeckOwnership("mtg", [
      { name: "Sol Ring", oracleId: "ora-sol", scryfallId: "sol-cmm", quantity: 1 },
    ])
    expect(planStoreCheckout("mtg", items, "tcgplayer").totalCents).toBe(150)
    expect(planStoreCheckout("mtg", items, "cardkingdom").totalCents).toBe(250)
    expect(decodeURIComponent(planStoreCheckout("mtg", items, "tcgplayer").url ?? "")).toContain(
      "c=1 Sol Ring",
    )
  })

  it("prices a printing at its cheapest finish, since the store may fill it with a foil", () => {
    catalogDb.replacePrices("mtg", [
      price("sol-cmm", "tcgplayer", 500),
      price("sol-cmm", "tcgplayer", 100, "foil"),
      price("sol-c21", "tcgplayer", 300),
    ])
    const { items } = computeDeckOwnership("mtg", [
      { name: "Sol Ring", oracleId: "ora-sol", quantity: 1 },
    ])
    expect(planStoreCheckout("mtg", items, "tcgplayer").totalCents).toBe(100)
  })

  it("has no cart when the store can sell none of the missing cards", () => {
    const { items } = computeDeckOwnership("mtg", [{ name: "Sol Rnig", quantity: 1 }])
    expect(planStoreCheckout("mtg", items, "tcgplayer").url).toBeUndefined()
  })
})
