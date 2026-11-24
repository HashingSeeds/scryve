import { catalogDb } from "@/storage/catalogDb"

import {
  lookupPrintingPrice,
  resolveScannedPrinting,
  syncCatalogPrintingsAndPrices,
} from "./catalogSync"
import { encodeFinishes, encodeRarity } from "../../../convex/lib/cardPricing"

describe("catalogSync", () => {
  beforeEach(() => {
    catalogDb.clearAll()
  })

  it("syncs printings and prices with ETag reuse and resolves scanned printings by set/collector", async () => {
    const mockFetch = jest.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString()
      const ifNoneMatch = (init?.headers as Record<string, string> | undefined)?.["If-None-Match"]
      if (url.endsWith("/datasets/mtg/printings.json")) {
        if (ifNoneMatch === '"p-v1"') return new Response(null, { status: 304 })
        return new Response(
          JSON.stringify({
            version: "2026-11-24",
            sets: { cmm: "Commander Masters", lea: "Limited Edition Alpha" },
            rows: [
              [
                "scry-cmm",
                "ora-sol",
                "Sol Ring",
                "cmm",
                "410",
                encodeRarity("uncommon"),
                encodeFinishes(["nonfoil", "foil"]),
                504123,
                "front/1/2/cmm.jpg",
              ],
              [
                "scry-lea",
                "ora-sol",
                "Sol Ring",
                "lea",
                "269",
                encodeRarity("uncommon"),
                encodeFinishes(["nonfoil"]),
                1001,
                "front/1/2/lea.jpg",
              ],
            ],
          }),
          { status: 200, headers: { etag: '"p-v1"' } },
        )
      }
      if (url.endsWith("/datasets/mtg/prices.json")) {
        if (ifNoneMatch === '"pr-v1"') return new Response(null, { status: 304 })
        return new Response(
          JSON.stringify({
            version: "2026-11-24",
            asOf: 1_764_000_000_000,
            prices: {
              "scry-cmm": [199, 550, null, 150, null, 249, 649, 110, 300],
              "scry-lea": [45000, null, null, null, null, 49999, null, 25000],
            },
          }),
          { status: 200, headers: { etag: '"pr-v1"' } },
        )
      }
      throw new Error(`Unexpected url: ${url}`)
    }) as unknown as typeof fetch

    const first = await syncCatalogPrintingsAndPrices("mtg", { fetcher: mockFetch, now: 1000 })
    expect(first).toEqual({ printingsUpdated: true, pricesUpdated: true })
    expect(catalogDb.countPrintings("mtg")).toBe(2)

    const resolvedExact = resolveScannedPrinting("mtg", "Sol Ring", {
      setCode: "cmm",
      collectorNumber: "410",
      isFoilStar: true,
    })
    expect(resolvedExact.printing?.printingId).toBe("scry-cmm")
    expect(resolvedExact.price.retailCents).toBe(550)
    expect(resolvedExact.price.buylistCents).toBe(300)

    const resolvedLocked = resolveScannedPrinting("mtg", "Sol Ring", {}, { setLock: "lea" })
    expect(resolvedLocked.printing?.printingId).toBe("scry-lea")
    expect(resolvedLocked.price.retailCents).toBe(45000)

    const lpPrice = lookupPrintingPrice("mtg", "scry-cmm", "nonfoil", "LP")
    expect(lpPrice.retailCents).toBe(Math.round(199 * 0.85))

    const second = await syncCatalogPrintingsAndPrices("mtg", {
      fetcher: mockFetch,
      force: true,
      now: 2000,
    })
    expect(second).toEqual({ printingsUpdated: false, pricesUpdated: false })
  })
})
