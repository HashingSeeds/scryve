import { useEffect, useState } from "react"

import { prereleaseBuild } from "@/features/updates/appUpdate"
import { catalogDb } from "@/storage/catalogDb"
import type { CatalogPrice, CatalogPrinting } from "@/storage/catalogDbTypes"

import {
  CONDITION_MULTIPLIERS,
  decodeMtgPricesPack,
  decodeMtgPrintingsPack,
  MTG_PRICES_PATH,
  MTG_PRINTINGS_PATH,
  type CardCondition,
  type CardFinish,
  type PriceSource,
} from "../../../convex/lib/cardPricing"
import { systemDefinition } from "../../../convex/lib/systems"
import type { CollectorHint } from "../decks/cardScan"

const PROD_DATASET_ORIGIN = "https://ygo-images.scryve.sow.care"
const PREVIEW_DATASET_ORIGIN =
  "https://scryve-ygo-image-mirror-multigame-preview.mchisolm0.workers.dev"

const PRINTINGS_MAX_AGE_MS = 7 * 86_400_000
const PRICES_MAX_AGE_MS = 12 * 3_600_000

const META_PRINTINGS_ETAG = "printings_etag"
const META_PRINTINGS_CHECKED_AT = "printings_checked_at"
const META_PRICES_ETAG = "prices_etag"
const META_PRICES_CHECKED_AT = "prices_checked_at"
const META_PRICES_UPDATED_AT = "prices_updated_at"

export interface PrintingPriceSummary {
  retailCents?: number
  buylistCents?: number
  ckRetailCents?: number
  eurCents?: number
  updatedAt?: string
}

export interface ResolvedScanPrinting {
  printing?: CatalogPrinting
  alternates: CatalogPrinting[]
  finish: CardFinish
  price: PrintingPriceSummary
}

export function pricingDatasetOrigins(): string[] {
  const override = process.env.EXPO_PUBLIC_PRICING_DATASET_BASE_URL?.trim()
  if (override) return [override.replace(/\/+$/, "")]
  return prereleaseBuild() ? [PROD_DATASET_ORIGIN, PREVIEW_DATASET_ORIGIN] : [PROD_DATASET_ORIGIN]
}

export function pricingDatasetOrigin(): string {
  return pricingDatasetOrigins()[0]
}

export function normalizePrintingName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

function isScryfallSystem(game: string): boolean {
  return systemDefinition(game)?.integration.capabilities.cardCatalog.provider === "scryfall"
}

function metaNumber(key: string): number {
  const raw = catalogDb.getMeta(key)
  if (!raw) return 0
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : 0
}

function metaKey(game: string, suffix: string): string {
  return `${game}:${suffix}`
}

async function fetchJsonFromOrigins(
  origins: readonly string[],
  path: string,
  etag: string | undefined,
  fetcher: typeof fetch,
): Promise<{ status: "not_modified" } | { status: "ok"; data: unknown; etag?: string }> {
  let lastStatus = 0
  for (let index = 0; index < origins.length; index += 1) {
    const url = `${origins[index]}${path}`
    const response = await fetcher(url, etag ? { headers: { "If-None-Match": etag } } : undefined)
    if (response.status === 304) return { status: "not_modified" }
    if (response.ok) {
      return {
        status: "ok",
        data: await response.json(),
        etag: response.headers.get("etag") ?? undefined,
      }
    }
    lastStatus = response.status
    if (response.status !== 404 || index === origins.length - 1) {
      throw new Error(`Catalog fetch failed (${lastStatus})`)
    }
  }
  throw new Error(`Catalog fetch failed (${lastStatus})`)
}

export async function syncCatalogPrintingsAndPrices(
  game: string,
  options: { fetcher?: typeof fetch; force?: boolean; now?: number } = {},
): Promise<{ printingsUpdated: boolean; pricesUpdated: boolean }> {
  if (!isScryfallSystem(game)) return { printingsUpdated: false, pricesUpdated: false }
  const fetcher = options.fetcher ?? fetch
  const now = options.now ?? Date.now()
  const origins = pricingDatasetOrigins()

  let printingsUpdated = false
  let pricesUpdated = false

  const printingsCheckedAt = metaNumber(metaKey(game, META_PRINTINGS_CHECKED_AT))
  const hasPrintings = catalogDb.countPrintings(game) > 0
  if (options.force || !hasPrintings || now - printingsCheckedAt >= PRINTINGS_MAX_AGE_MS) {
    const prevEtag = hasPrintings
      ? catalogDb.getMeta(metaKey(game, META_PRINTINGS_ETAG))
      : undefined
    const response = await fetchJsonFromOrigins(origins, MTG_PRINTINGS_PATH, prevEtag, fetcher)
    if (response.status === "ok") {
      const pack = decodeMtgPrintingsPack(response.data)
      const rows: CatalogPrinting[] = pack.printings.map((item) => ({
        game,
        printingId: item.printingId,
        cardId: item.cardId,
        name: item.name,
        nameNormalized: normalizePrintingName(item.name),
        setCode: item.setCode,
        setName: item.setName,
        collectorNumber: item.collectorNumber,
        rarity: item.rarity,
        finishes: item.finishes,
        tcgplayerId: item.tcgplayerId,
        imageUrl: item.imageUrl,
        smallImageUrl: item.smallImageUrl,
      }))
      await catalogDb.replacePrintingsAsync(game, rows, pack.version)
      if (response.etag) catalogDb.setMeta(metaKey(game, META_PRINTINGS_ETAG), response.etag)
      printingsUpdated = true
    }
    catalogDb.setMeta(metaKey(game, META_PRINTINGS_CHECKED_AT), String(now))
  }

  const pricesCheckedAt = metaNumber(metaKey(game, META_PRICES_CHECKED_AT))
  const hasPrices = catalogDb.countPrices(game) > 0
  if (options.force || !hasPrices || now - pricesCheckedAt >= PRICES_MAX_AGE_MS) {
    const prevEtag = hasPrices ? catalogDb.getMeta(metaKey(game, META_PRICES_ETAG)) : undefined
    const response = await fetchJsonFromOrigins(origins, MTG_PRICES_PATH, prevEtag, fetcher)
    if (response.status === "ok") {
      const pack = decodeMtgPricesPack(response.data)
      const updatedAt = new Date(pack.asOf).toISOString()
      const rows: CatalogPrice[] = []
      for (const entry of pack.prices) {
        if (entry.usdCents !== undefined) {
          rows.push({
            game,
            printingId: entry.printingId,
            finish: "nonfoil",
            source: "tcgplayer",
            currency: "USD",
            retailCents: entry.usdCents,
            updatedAt,
          })
        }
        if (entry.usdFoilCents !== undefined) {
          rows.push({
            game,
            printingId: entry.printingId,
            finish: "foil",
            source: "tcgplayer",
            currency: "USD",
            retailCents: entry.usdFoilCents,
            updatedAt,
          })
        }
        if (entry.usdEtchedCents !== undefined) {
          rows.push({
            game,
            printingId: entry.printingId,
            finish: "etched",
            source: "tcgplayer",
            currency: "USD",
            retailCents: entry.usdEtchedCents,
            updatedAt,
          })
        }
        if (entry.ckRetailCents !== undefined || entry.ckBuylistCents !== undefined) {
          rows.push({
            game,
            printingId: entry.printingId,
            finish: "nonfoil",
            source: "cardkingdom",
            currency: "USD",
            retailCents: entry.ckRetailCents,
            buylistCents: entry.ckBuylistCents,
            updatedAt,
          })
        }
        if (entry.ckFoilCents !== undefined || entry.ckFoilBuylistCents !== undefined) {
          rows.push({
            game,
            printingId: entry.printingId,
            finish: "foil",
            source: "cardkingdom",
            currency: "USD",
            retailCents: entry.ckFoilCents,
            buylistCents: entry.ckFoilBuylistCents,
            updatedAt,
          })
        }
        if (entry.eurCents !== undefined) {
          rows.push({
            game,
            printingId: entry.printingId,
            finish: "nonfoil",
            source: "cardmarket",
            currency: "EUR",
            retailCents: entry.eurCents,
            updatedAt,
          })
        }
        if (entry.eurFoilCents !== undefined) {
          rows.push({
            game,
            printingId: entry.printingId,
            finish: "foil",
            source: "cardmarket",
            currency: "EUR",
            retailCents: entry.eurFoilCents,
            updatedAt,
          })
        }
      }
      await catalogDb.replacePricesAsync(game, rows, updatedAt)
      catalogDb.setMeta(metaKey(game, META_PRICES_UPDATED_AT), updatedAt)
      if (response.etag) catalogDb.setMeta(metaKey(game, META_PRICES_ETAG), response.etag)
      pricesUpdated = true
    }
    catalogDb.setMeta(metaKey(game, META_PRICES_CHECKED_AT), String(now))
  }

  return { printingsUpdated, pricesUpdated }
}

function normalizeFinish(finish: string): "nonfoil" | "foil" | "etched" {
  if (finish === "foil") return "foil"
  if (finish === "etched") return "etched"
  return "nonfoil"
}

function pickPriceCents(
  rows: readonly CatalogPrice[],
  source: PriceSource,
  finish: "nonfoil" | "foil" | "etched",
  field: "retailCents" | "buylistCents",
): number | undefined {
  const sourceKey = source === "cardkingdom_buylist" ? "cardkingdom" : source
  return rows.find(
    (row) => row.source === sourceKey && row.finish === finish && row[field] !== undefined,
  )?.[field]
}

export function summarizePrintingPrices(
  rows: readonly CatalogPrice[],
  finish = "nonfoil",
  condition = "NM",
): PrintingPriceSummary {
  if (rows.length === 0) return {}
  const normalizedFinish = normalizeFinish(finish)
  const multiplier = CONDITION_MULTIPLIERS[condition as CardCondition] ?? 1
  const scale = (cents: number | undefined) =>
    cents !== undefined ? Math.round(cents * multiplier) : undefined

  const tcg = pickPriceCents(rows, "tcgplayer", normalizedFinish, "retailCents")
  const ckRetail = pickPriceCents(rows, "cardkingdom", normalizedFinish, "retailCents")
  const ckBuylist = pickPriceCents(rows, "cardkingdom_buylist", normalizedFinish, "buylistCents")
  const eur = pickPriceCents(rows, "cardmarket", normalizedFinish, "retailCents")
  return {
    retailCents: scale(tcg ?? ckRetail),
    buylistCents: scale(ckBuylist),
    ckRetailCents: scale(ckRetail),
    eurCents: scale(eur),
    updatedAt: rows[0]?.updatedAt,
  }
}

export function lookupPrintingPrice(
  game: string,
  printingId: string,
  finish = "nonfoil",
  condition = "NM",
): PrintingPriceSummary {
  const rows = catalogDb.getPricesForPrinting(game, printingId)
  return summarizePrintingPrices(rows, finish, condition)
}

function supportsFinish(printing: CatalogPrinting, finish: CardFinish): boolean {
  return printing.finishes.length === 0 || printing.finishes.includes(finish)
}

function resolvePrintingFinish(
  printing: CatalogPrinting | undefined,
  requested: CardFinish,
): CardFinish {
  if (!printing || supportsFinish(printing, requested)) return requested
  if (printing.finishes.includes("nonfoil")) return "nonfoil"
  const first = printing.finishes[0]
  return first === "foil" || first === "etched" ? first : "nonfoil"
}

export function resolveScannedPrinting(
  game: string,
  name: string,
  hint: CollectorHint = {},
  options: { setLock?: string; finish?: string; condition?: string } = {},
): ResolvedScanPrinting {
  const normalized = normalizePrintingName(name)
  const allCandidates = catalogDb.findPrintingsByName(game, normalized)
  const lockedSet = options.setLock?.trim().toLowerCase()
  const candidates = lockedSet
    ? allCandidates.filter((candidate) => candidate.setCode === lockedSet)
    : allCandidates
  const requestedFinish = normalizeFinish(options.finish ?? (hint.isFoilStar ? "foil" : "nonfoil"))
  const preferredSet = lockedSet ?? hint.setCode?.toLowerCase()
  const collector = hint.collectorNumber?.toLowerCase()

  const pickFrom = (pool: readonly CatalogPrinting[]) => {
    let found: CatalogPrinting | undefined
    if (preferredSet && collector) {
      found = pool.find(
        (candidate) =>
          candidate.setCode === preferredSet && candidate.collectorNumber === collector,
      )
    }
    if (!found && preferredSet) {
      found = pool.find((candidate) => candidate.setCode === preferredSet)
    }
    if (!found && collector) {
      found = pool.find((candidate) => candidate.collectorNumber === collector)
    }
    if (!found && !lockedSet) {
      found = pool[0]
    }
    return found
  }

  let printing: CatalogPrinting | undefined
  if (hint.setCode && collector && (!lockedSet || hint.setCode.toLowerCase() === lockedSet)) {
    const exact = catalogDb.findPrintingBySetNumber(game, hint.setCode, collector)
    if (exact && exact.nameNormalized === normalized) printing = exact
  }
  if (!printing) {
    const matchingFinish = candidates.filter((candidate) =>
      supportsFinish(candidate, requestedFinish),
    )
    printing = pickFrom(matchingFinish) ?? pickFrom(candidates)
  }

  const finish = resolvePrintingFinish(printing, requestedFinish)
  const price = printing
    ? lookupPrintingPrice(game, printing.printingId, finish, options.condition ?? "NM")
    : {}
  return { printing, alternates: allCandidates, finish, price }
}

const inFlightSyncs = new Map<
  string,
  Promise<{ printingsUpdated: boolean; pricesUpdated: boolean }>
>()

export function ensureCatalogSynced(game: string) {
  let pending = inFlightSyncs.get(game)
  if (!pending) {
    pending = syncCatalogPrintingsAndPrices(game).finally(() => {
      inFlightSyncs.delete(game)
    })
    inFlightSyncs.set(game, pending)
  }
  return pending
}

function readCatalogSnapshot(game: string, supported: boolean) {
  return {
    game,
    printingCount: supported ? catalogDb.countPrintings(game) : 0,
    priceCount: supported ? catalogDb.countPrices(game) : 0,
    updatedAt: supported ? catalogDb.getMeta(metaKey(game, META_PRICES_UPDATED_AT)) : undefined,
  }
}

export function useCatalogSync(game: string, enabled = true) {
  const supported = isScryfallSystem(game)
  const [syncing, setSyncing] = useState(false)
  const [snapshot, setSnapshot] = useState(() => readCatalogSnapshot(game, supported))

  useEffect(() => {
    setSnapshot(readCatalogSnapshot(game, supported))
    if (!enabled || !supported) {
      setSyncing(false)
      return
    }
    let active = true
    setSyncing(true)
    ensureCatalogSynced(game)
      .catch(() => {})
      .finally(() => {
        if (!active) return
        setSnapshot(readCatalogSnapshot(game, supported))
        setSyncing(false)
      })
    return () => {
      active = false
    }
  }, [enabled, game, supported])

  const current =
    snapshot.game === game && supported
      ? snapshot
      : { game, printingCount: 0, priceCount: 0, updatedAt: undefined }

  return {
    supported,
    syncing,
    ready: current.printingCount > 0,
    printingCount: current.printingCount,
    priceCount: current.priceCount,
    updatedAt: current.updatedAt,
  }
}
