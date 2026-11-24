import { gunzipSync, gzipSync } from "node:zlib"

import { syncMtgPrintingsAndPrices } from "./mtgPrintingsAndPrices"
import { decodeMtgPricesPack, decodeMtgPrintingsPack } from "../../../convex/lib/cardPricing"

describe("MTG printings and prices sync", () => {
  it("joins Scryfall default-cards and Card Kingdom pricelist and uploads both packs", async () => {
    const bulkJsonl = [
      JSON.stringify({
        id: "scry-sol-1",
        oracle_id: "ora-sol",
        name: "Sol Ring",
        set: "cmm",
        set_name: "Commander Masters",
        collector_number: "410",
        rarity: "uncommon",
        finishes: ["nonfoil", "foil"],
        tcgplayer_id: 504123,
        digital: false,
        layout: "normal",
        image_uris: { normal: "https://cards.scryfall.io/normal/front/1/2/scry-sol-1.jpg" },
        prices: { usd: "1.99", usd_foil: "4.50", eur: "1.25" },
      }),
      JSON.stringify({
        id: "scry-digital",
        oracle_id: "ora-dig",
        name: "Alchemy Card",
        set: "yneo",
        set_name: "Alchemy",
        collector_number: "1",
        rarity: "rare",
        digital: true,
      }),
    ].join("\n")

    const uploads = new Map<string, Uint8Array>()
    const mockFetch: typeof fetch = jest.fn(async (input, init) => {
      const url = typeof input === "string" ? input : input.toString()
      if (url.endsWith("/bulk-data/default-cards")) {
        return Response.json({
          updated_at: "2026-11-24T10:00:00Z",
          jsonl_download_uri: "https://data.scryfall.io/default-cards.jsonl.gz",
        })
      }
      if (url === "https://data.scryfall.io/default-cards.jsonl.gz") {
        return new Response(gzipSync(bulkJsonl))
      }
      if (url.includes("api.cardkingdom.com")) {
        return Response.json({
          data: [
            {
              scryfall_id: "scry-sol-1",
              is_foil: "false",
              price_retail: "2.49",
              price_buy: "1.10",
            },
            {
              scryfall_id: "scry-sol-1",
              is_foil: "true",
              price_retail: "5.99",
              price_buy: "2.50",
            },
          ],
        })
      }
      if (init?.method === "PUT") {
        uploads.set(url, new Uint8Array(init.body as Uint8Array))
        return Response.json({ ok: true })
      }
      throw new Error(`Unexpected fetch: ${url}`)
    })

    const result = await syncMtgPrintingsAndPrices({
      mirrorBaseUrl: "https://preview.example",
      mirrorToken: "secret-token",
      minPrintings: 1,
      minPrices: 1,
      fetch: mockFetch,
      report: () => {},
    })

    expect(result.printings).toBe(1)
    expect(result.prices).toBe(1)

    const printingsRaw = JSON.parse(
      gunzipSync(uploads.get("https://preview.example/datasets/mtg/printings.json")!).toString(),
    )
    const pricesRaw = JSON.parse(
      gunzipSync(uploads.get("https://preview.example/datasets/mtg/prices.json")!).toString(),
    )

    expect(decodeMtgPrintingsPack(printingsRaw).printings).toEqual([
      {
        printingId: "scry-sol-1",
        cardId: "ora-sol",
        name: "Sol Ring",
        setCode: "cmm",
        setName: "Commander Masters",
        collectorNumber: "410",
        rarity: "uncommon",
        finishes: ["nonfoil", "foil"],
        tcgplayerId: 504123,
        imageUrl: "https://cards.scryfall.io/normal/front/1/2/scry-sol-1.jpg",
        smallImageUrl: "https://cards.scryfall.io/small/front/1/2/scry-sol-1.jpg",
      },
    ])
    expect(decodeMtgPricesPack(pricesRaw).prices).toEqual([
      {
        printingId: "scry-sol-1",
        usdCents: 199,
        usdFoilCents: 450,
        usdEtchedCents: undefined,
        eurCents: 125,
        eurFoilCents: undefined,
        ckRetailCents: 249,
        ckFoilCents: 599,
        ckBuylistCents: 110,
        ckFoilBuylistCents: 250,
      },
    ])
  })
})
