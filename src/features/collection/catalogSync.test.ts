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
    expect(catalogDb.hasPrintings("mtg")).toBe(true)

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

    const lockedOverridesFooter = resolveScannedPrinting(
      "mtg",
      "Sol Ring",
      { setCode: "cmm", collectorNumber: "410" },
      { setLock: "lea" },
    )
    expect(lockedOverridesFooter.printing?.printingId).toBe("scry-lea")

    const lockedMissingSet = resolveScannedPrinting(
      "mtg",
      "Sol Ring",
      { setCode: "cmm", collectorNumber: "410" },
      { setLock: "fdn" },
    )
    expect(lockedMissingSet.printing).toBeUndefined()

    const lpPrice = lookupPrintingPrice("mtg", "scry-cmm", "nonfoil", "LP")
    expect(lpPrice.retailCents).toBe(Math.round(199 * 0.85))
    expect(lookupPrintingPrice("mtg", "scry-lea", "foil", "NM").retailCents).toBeUndefined()
    expect(lookupPrintingPrice("mtg", "scry-lea", "foil", "NM").buylistCents).toBeUndefined()

    const second = await syncCatalogPrintingsAndPrices("mtg", {
      fetcher: mockFetch,
      force: true,
      now: 2000,
    })
    expect(second).toEqual({ printingsUpdated: false, pricesUpdated: false })
  })

  it("falls back to preview origin when prod returns 404 in prerelease builds", async () => {
    const requestedUrls: string[] = []
    const mockFetch = jest.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString()
      requestedUrls.push(url)
      if (url.startsWith("https://ygo-images.scryve.sow.care/")) {
        return new Response("Not found", { status: 404 })
      }
      if (url.endsWith("/datasets/mtg/printings.json")) {
        return new Response(
          JSON.stringify({
            version: "2026-11-24",
            sets: { fdn: "Foundations" },
            rows: [
              [
                "scry-fdn",
                "ora-bolt",
                "Lightning Bolt",
                "fdn",
                "100",
                encodeRarity("uncommon"),
                encodeFinishes(["nonfoil"]),
                1234,
                "front/1/2/fdn.jpg",
              ],
            ],
          }),
          { status: 200 },
        )
      }
      return new Response(
        JSON.stringify({
          version: "2026-11-24",
          asOf: 1_764_000_000_000,
          prices: { "scry-fdn": [250] },
        }),
        { status: 200 },
      )
    }) as unknown as typeof fetch

    const synced = await syncCatalogPrintingsAndPrices("mtg", { fetcher: mockFetch, now: 1000 })
    expect(synced).toEqual({ printingsUpdated: true, pricesUpdated: true })
    expect(requestedUrls.some((url) => url.includes("multigame-preview"))).toBe(true)
    expect(catalogDb.getPrinting("mtg", "scry-fdn")?.setCode).toBe("fdn")
  })

  it("matches zero-padded stored collector numbers when queried without leading zeroes", () => {
    catalogDb.replacePrintings(
      "mtg",
      [
        {
          game: "mtg",
          printingId: "fdn-0001",
          cardId: "ora-plains",
          name: "Plains",
          nameNormalized: "plains",
          setCode: "fdn",
          collectorNumber: "0001",
          finishes: ["nonfoil"],
        },
        {
          game: "mtg",
          printingId: "fdn-0002",
          cardId: "ora-plains",
          name: "Plains",
          nameNormalized: "plains",
          setCode: "fdn",
          collectorNumber: "0002",
          finishes: ["nonfoil"],
        },
      ],
      "v1",
    )

    const resolved = resolveScannedPrinting("mtg", "Plains", {
      setCode: "fdn",
      collectorNumber: "2",
    })
    expect(resolved.printing?.printingId).toBe("fdn-0002")
  })

  it("prefers a printing supporting the requested finish and normalizes unsupported finishes", () => {
    catalogDb.replacePrintings(
      "mtg",
      [
        {
          game: "mtg",
          printingId: "lea-sol",
          cardId: "ora-sol",
          name: "Sol Ring",
          nameNormalized: "sol ring",
          setCode: "lea",
          collectorNumber: "269",
          finishes: ["nonfoil"],
        },
        {
          game: "mtg",
          printingId: "cmm-sol",
          cardId: "ora-sol",
          name: "Sol Ring",
          nameNormalized: "sol ring",
          setCode: "cmm",
          collectorNumber: "410",
          finishes: ["nonfoil", "foil"],
        },
      ],
      "v1",
    )

    const foilScan = resolveScannedPrinting("mtg", "Sol Ring", {}, { finish: "foil" })
    expect(foilScan.printing?.printingId).toBe("cmm-sol")
    expect(foilScan.finish).toBe("foil")

    const lockedAlphaFoil = resolveScannedPrinting(
      "mtg",
      "Sol Ring",
      {},
      { setLock: "lea", finish: "foil" },
    )
    expect(lockedAlphaFoil.printing?.printingId).toBe("lea-sol")
    expect(lockedAlphaFoil.finish).toBe("nonfoil")

    const candidateMatch = resolveScannedPrinting("mtg", "Sol Ring", {
      candidateSetCodes: ["noise", "cmm"],
    })
    expect(candidateMatch.printing?.printingId).toBe("cmm-sol")

    catalogDb.replacePrintings(
      "mtg",
      [
        {
          game: "mtg",
          printingId: "10e-mind",
          cardId: "ora-mind",
          name: "Mind Stone",
          nameNormalized: "mind stone",
          setCode: "10e",
          collectorNumber: "335",
          finishes: ["nonfoil"],
        },
        {
          game: "mtg",
          printingId: "40k-mind",
          cardId: "ora-mind",
          name: "Mind Stone",
          nameNormalized: "mind stone",
          setCode: "40k",
          collectorNumber: "242",
          finishes: ["nonfoil"],
        },
      ],
      "v2",
    )
    const fuzzyMatch = resolveScannedPrinting("mtg", "Mind Stone", { setCode: "30k" })
    expect(fuzzyMatch.printing?.printingId).toBe("40k-mind")
  })

  it("keeps the catalog and retries later when a pack arrives empty", async () => {
    catalogDb.replacePrintings(
      "mtg",
      [
        {
          game: "mtg",
          printingId: "cmm-sol",
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
    const emptyPack = jest.fn(
      async () =>
        new Response(JSON.stringify({ version: "v2", sets: {}, rows: [] }), { status: 200 }),
    ) as unknown as typeof fetch

    await expect(
      syncCatalogPrintingsAndPrices("mtg", { fetcher: emptyPack, now: 1000 }),
    ).rejects.toThrow("empty")
    expect(catalogDb.getPrinting("mtg", "cmm-sol")).toBeDefined()
    expect(catalogDb.getMeta("mtg:printings_checked_at")).toBeUndefined()
  })
})
