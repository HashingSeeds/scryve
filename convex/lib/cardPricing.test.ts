import {
  compressScryfallImagePath,
  decodeFinishes,
  decodeMtgPricesPack,
  decodeMtgPrintingsPack,
  encodeFinishes,
  encodeRarity,
  expandScryfallImageUrls,
  parsePriceCents,
  priceCentsForFinish,
  trimPriceTuple,
} from "./cardPricing"

describe("cardPricing", () => {
  it("encodes and decodes finishes bitmasks and image paths", () => {
    const mask = encodeFinishes(["nonfoil", "foil", "etched"])
    expect(decodeFinishes(mask)).toEqual(["nonfoil", "foil", "etched"])
    expect(decodeFinishes(encodeFinishes([]))).toEqual(["nonfoil"])

    const compressed = compressScryfallImagePath(
      "https://cards.scryfall.io/normal/front/a/b/abcd.jpg?1234",
    )
    expect(compressed).toBe("front/a/b/abcd.jpg?1234")
    expect(expandScryfallImageUrls(compressed)).toEqual({
      imageUrl: "https://cards.scryfall.io/normal/front/a/b/abcd.jpg?1234",
      smallImageUrl: "https://cards.scryfall.io/small/front/a/b/abcd.jpg?1234",
    })
  })

  it("decodes printings and prices packs and adjusts prices by finish and condition", () => {
    const printings = decodeMtgPrintingsPack({
      version: "2026-11-24",
      sets: { cmm: "Commander Masters" },
      rows: [
        [
          "scry-1",
          "ora-1",
          "Sol Ring",
          "cmm",
          "410",
          encodeRarity("uncommon"),
          encodeFinishes(["nonfoil", "foil"]),
          504123,
          "front/1/2/scry-1.jpg",
        ],
      ],
    })
    expect(printings.printings).toEqual([
      {
        printingId: "scry-1",
        cardId: "ora-1",
        name: "Sol Ring",
        setCode: "cmm",
        setName: "Commander Masters",
        collectorNumber: "410",
        rarity: "uncommon",
        finishes: ["nonfoil", "foil"],
        tcgplayerId: 504123,
        imageUrl: "https://cards.scryfall.io/normal/front/1/2/scry-1.jpg",
        smallImageUrl: "https://cards.scryfall.io/small/front/1/2/scry-1.jpg",
      },
    ])

    const tuple = trimPriceTuple([
      parsePriceCents("2.00"),
      parsePriceCents("5.00"),
      undefined,
      parsePriceCents("1.50"),
      undefined,
      parsePriceCents("2.49"),
      parsePriceCents("5.99"),
      parsePriceCents("1.10"),
      parsePriceCents("2.75"),
    ])
    expect(tuple).toEqual([200, 500, null, 150, null, 249, 599, 110, 275])

    const decoded = decodeMtgPricesPack({
      version: "2026-11-24",
      asOf: 1_700_000_000_000,
      prices: { "scry-1": tuple! },
    })
    const price = decoded.prices[0]
    expect(printings.splitCardIds).toEqual([])
    expect(decoded.ckOutOfStock).toEqual([])
    expect(priceCentsForFinish(price, "nonfoil", "NM", "tcgplayer")).toBe(200)
    expect(priceCentsForFinish(price, "nonfoil", "LP", "tcgplayer")).toBe(170)
    expect(priceCentsForFinish(price, "foil", "NM", "tcgplayer")).toBe(500)
    expect(priceCentsForFinish(price, "nonfoil", "NM", "cardkingdom")).toBe(249)
    expect(priceCentsForFinish(price, "foil", "NM", "cardkingdom_buylist")).toBe(275)
    expect(priceCentsForFinish(price, "nonfoil", "NM", "cardmarket")).toBe(150)
    expect(priceCentsForFinish(price, "etched", "NM", "tcgplayer")).toBeUndefined()
    expect(priceCentsForFinish(price, "foil", "NM", "cardmarket")).toBeUndefined()
  })
})
