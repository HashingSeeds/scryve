import { catalogDb } from "./catalogDb"

describe("local catalog SQLite database", () => {
  beforeEach(() => {
    catalogDb.clearAll()
  })

  it("indexes and queries MTG printings by set+collector number, name, and cardId", () => {
    catalogDb.replacePrintings(
      "mtg",
      [
        {
          game: "mtg",
          printingId: "sol-cmm-412",
          cardId: "oracle-sol-ring",
          name: "Sol Ring",
          nameNormalized: "sol ring",
          setCode: "CMM",
          setName: "Commander Masters",
          collectorNumber: "412",
          rarity: "uncommon",
          finishes: ["normal", "foil"],
          tcgplayerId: 500001,
          imageUrl: "https://cards.scryfall.io/normal/front/a/b/sol-cmm-412.jpg",
          smallImageUrl: "https://cards.scryfall.io/small/front/a/b/sol-cmm-412.jpg",
        },
        {
          game: "mtg",
          printingId: "sol-fdn-259",
          cardId: "oracle-sol-ring",
          name: "Sol Ring",
          nameNormalized: "sol ring",
          setCode: "FDN",
          setName: "Foundations",
          collectorNumber: "0259",
          rarity: "uncommon",
          finishes: ["normal", "foil", "etched"],
        },
      ],
      "2026-11-24",
    )

    expect(catalogDb.hasPrintings("mtg")).toBe(true)
    expect(catalogDb.getMeta("printings:mtg:version")).toBe("2026-11-24")
    expect(catalogDb.findPrintingBySetNumber("mtg", "cmm", "0412")?.printingId).toBe("sol-cmm-412")
    expect(catalogDb.findPrintingBySetNumber("mtg", "FDN", "0259")?.printingId).toBe("sol-fdn-259")
    expect(catalogDb.findPrintingsByCardId("mtg", "oracle-sol-ring")).toHaveLength(2)
    expect(catalogDb.findPrintingsByName("mtg", "sol ring").map((p) => p.setCode)).toEqual([
      "cmm",
      "fdn",
    ])
  })

  it("stores multi-market retail and buylist prices and generalizes across games", () => {
    catalogDb.replacePrintings(
      "pokemon",
      [
        {
          game: "pokemon",
          printingId: "sv01-081",
          cardId: "sv01-081",
          name: "Miraidon ex",
          nameNormalized: "miraidon ex",
          setCode: "sv01",
          collectorNumber: "081",
          rarity: "Double Rare",
          finishes: ["holofoil", "reverse_holo"],
        },
      ],
      "v1",
    )
    catalogDb.replacePrintings(
      "ygo",
      [
        {
          game: "ygo",
          printingId: "LOB-EN001:ultra",
          cardId: "89631139",
          name: "Blue-Eyes White Dragon",
          nameNormalized: "blue eyes white dragon",
          setCode: "LOB",
          collectorNumber: "EN001",
          rarity: "Ultra Rare",
          finishes: ["ultra_rare", "qcsr"],
        },
      ],
      "v1",
    )
    catalogDb.replacePrices("mtg", [
      {
        game: "mtg",
        printingId: "sol-cmm-412",
        finish: "normal",
        source: "tcgplayer",
        currency: "USD",
        retailCents: 185,
        updatedAt: "2026-11-24",
      },
      {
        game: "mtg",
        printingId: "sol-cmm-412",
        finish: "normal",
        source: "cardkingdom",
        currency: "USD",
        retailCents: 249,
        buylistCents: 95,
        updatedAt: "2026-11-24",
      },
    ])

    expect(catalogDb.findPrintingBySetNumber("pokemon", "sv01", "081")?.finishes).toEqual([
      "holofoil",
      "reverse_holo",
    ])
    expect(catalogDb.findPrintingBySetNumber("ygo", "lob", "en001")?.rarity).toBe("Ultra Rare")
    const batch = catalogDb.getPricesBatch("mtg", ["sol-cmm-412", "missing"])
    expect(batch.get("sol-cmm-412")).toHaveLength(2)
    expect(batch.get("missing")).toBeUndefined()
  })

  it("finishes imports that start at the same time", async () => {
    await Promise.all([
      catalogDb.replacePricesAsync("mtg", [
        {
          game: "mtg",
          printingId: "sol",
          finish: "normal",
          source: "tcgplayer",
          currency: "USD",
          retailCents: 100,
          updatedAt: "2026-11-25",
        },
      ]),
      catalogDb.replaceLocalCardsAsync(
        "mtg",
        [
          {
            cardId: "sol",
            nameKey: "sol ring",
            json: JSON.stringify({ cardId: "sol", name: "Sol Ring" }),
          },
        ],
        "v1",
      ),
    ])
    expect(catalogDb.getPricesForPrinting("mtg", "sol")).toHaveLength(1)
    expect(catalogDb.searchLocalCards("mtg", "sol", 3)).toHaveLength(1)
  })

  it("finds offline cards by exact name, then whole word, then name prefix, then word start, more played first", async () => {
    const row = (cardId: string, nameKey: string, rank?: number) => ({
      cardId,
      nameKey,
      rank,
      json: JSON.stringify({ cardId, name: nameKey }),
    })
    await catalogDb.replaceLocalCardsAsync(
      "mtg",
      [
        row("bolt-bend", "lightning bolt", 2),
        row("helix", "lightning helix", 1),
        row("lightning", "lightning"),
        row("ball", "ball lightning", 0),
        row("glint", "glint hawk"),
        row("wave", "boltwave", 3),
      ],
      "v1",
    )

    const names = (key: string) =>
      catalogDb.searchLocalCards("mtg", key, 5).map((card) => card.name)
    expect(names("lightning")).toEqual([
      "lightning",
      "lightning helix",
      "lightning bolt",
      "ball lightning",
    ])
    expect(names("light")).toEqual([
      "lightning helix",
      "lightning bolt",
      "lightning",
      "ball lightning",
    ])
    expect(catalogDb.searchLocalCards("mtg", "bolt", 1).map((card) => card.name)).toEqual([
      "lightning bolt",
    ])
    expect(names("ight")).toEqual([])
    expect(catalogDb.searchLocalCards("pokemon", "light", 5)).toEqual([])
    expect(catalogDb.getMeta("localCards:mtg:version")).toBe("v1")
  })
})
