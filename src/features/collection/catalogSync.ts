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
  price: PrintingPriceSummary
}

export function pricingDatasetOrigin(): string {
  const override = process.env.EXPO_PUBLIC_PRICING_DATASET_BASE_URL?.trim()
  if (override) return override.replace(/\/+$/, "")
  return prereleaseBuild() ? PREVIEW_DATASET_ORIGIN : PROD_DATASET_ORIGIN
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

async function fetchJsonWithEtag(
  url: string,
  etag: string | undefined,
  fetcher: typeof fetch,
): Promise<{ status: "not_modified" } | { status: "ok"; data: unknown; etag?: string }> {
  const response = await fetcher(url, etag ? { headers: { "If-None-Match": etag } } : undefined)
  if (response.status === 304) return { status: "not_modified" }
  if (!response.ok) throw new Error(`Catalog fetch failed (${response.status})`)
  return {
    status: "ok",
    data: await response.json(),
    etag: response.headers.get("etag") ?? undefined,
  }
}

export async function syncCatalogPrintingsAndPrices(
  game: string,
  options: { fetcher?: typeof fetch; force?: boolean; now?: number } = {},
): Promise<{ printingsUpdated: boolean; pricesUpdated: boolean }> {
  if (!isScryfallSystem(game)) return { printingsUpdated: false, pricesUpdated: false }
  const fetcher = options.fetcher ?? fetch
  const now = options.now ?? Date.now()
  const origin = pricingDatasetOrigin()

  let printingsUpdated = false
  let pricesUpdated = false

  const printingsCheckedAt = metaNumber(metaKey(game, META_PRINTINGS_CHECKED_AT))
  const hasPrintings = catalogDb.countPrintings(game) > 0
  if (options.force || !hasPrintings || now - printingsCheckedAt >= PRINTINGS_MAX_AGE_MS) {
    const prevEtag = hasPrintings
      ? catalogDb.getMeta(metaKey(game, META_PRINTINGS_ETAG))
      : undefined
    const response = await fetchJsonWithEtag(`${origin}${MTG_PRINTINGS_PATH}`, prevEtag, fetcher)
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
      catalogDb.replacePrintings(game, rows, pack.version)
      if (response.etag) catalogDb.setMeta(metaKey(game, META_PRINTINGS_ETAG), response.etag)
      printingsUpdated = true
    }
    catalogDb.setMeta(metaKey(game, META_PRINTINGS_CHECKED_AT), String(now))
  }

  const pricesCheckedAt = metaNumber(metaKey(game, META_PRICES_CHECKED_AT))
  const hasPrices = catalogDb.countPrices(game) > 0
  if (options.force || !hasPrices || now - pricesCheckedAt >= PRICES_MAX_AGE_MS) {
    const prevEtag = hasPrices ? catalogDb.getMeta(metaKey(game, META_PRICES_ETAG)) : undefined
    const response = await fetchJsonWithEtag(`${origin}${MTG_PRICES_PATH}`, prevEtag, fetcher)
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
      catalogDb.replacePrices(game, rows, updatedAt)
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
  const matching = rows.filter((row) => row.source === sourceKey && row[field] !== undefined)
  if (matching.length === 0) return undefined
  const order: ("nonfoil" | "foil" | "etched")[] =
    finish === "etched"
      ? ["etched", "foil", "nonfoil"]
      : finish === "foil"
        ? ["foil", "etched", "nonfoil"]
        : ["nonfoil", "foil", "etched"]
  for (const candidate of order) {
    const found = matching.find((row) => row.finish === candidate)
    if (found?.[field] !== undefined) return found[field]
  }
  return matching[0]?.[field]
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

export function resolveScannedPrinting(
  game: string,
  name: string,
  hint: CollectorHint = {},
  options: { setLock?: string; finish?: string; condition?: string } = {},
): ResolvedScanPrinting {
  const normalized = normalizePrintingName(name)
  const candidates = catalogDb.findPrintingsByName(game, normalized)
  const preferredSet = options.setLock?.toLowerCase() ?? hint.setCode?.toLowerCase()
  const collector = hint.collectorNumber?.toLowerCase()

  let printing: CatalogPrinting | undefined
  if (hint.setCode && collector) {
    const exact = catalogDb.findPrintingBySetNumber(game, hint.setCode, collector)
    if (exact && exact.nameNormalized === normalized) printing = exact
  }
  if (!printing && preferredSet && collector) {
    printing = candidates.find(
      (candidate) => candidate.setCode === preferredSet && candidate.collectorNumber === collector,
    )
  }
  if (!printing && preferredSet) {
    printing = candidates.find((candidate) => candidate.setCode === preferredSet)
  }
  if (!printing && collector) {
    printing = candidates.find((candidate) => candidate.collectorNumber === collector)
  }
  printing ??= candidates[0]

  const finish = options.finish ?? (hint.isFoilStar ? "foil" : "nonfoil")
  const price = printing
    ? lookupPrintingPrice(game, printing.printingId, finish, options.condition ?? "NM")
    : {}
  return { printing, alternates: candidates, price }
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

export function useCatalogSync(game: string, enabled = true) {
  const supported = isScryfallSystem(game)
  const [syncing, setSyncing] = useState(false)
  const [printingCount, setPrintingCount] = useState(() =>
    supported ? catalogDb.countPrintings(game) : 0,
  )
  const [priceCount, setPriceCount] = useState(() => (supported ? catalogDb.countPrices(game) : 0))
  const [updatedAt, setUpdatedAt] = useState(() =>
    supported ? catalogDb.getMeta(metaKey(game, META_PRICES_UPDATED_AT)) : undefined,
  )

  useEffect(() => {
    if (!enabled || !supported) return
    let active = true
    setSyncing(true)
    ensureCatalogSynced(game)
      .then(() => {
        if (!active) return
        setPrintingCount(catalogDb.countPrintings(game))
        setPriceCount(catalogDb.countPrices(game))
        setUpdatedAt(catalogDb.getMeta(metaKey(game, META_PRICES_UPDATED_AT)))
      })
      .catch(() => {})
      .finally(() => {
        if (active) setSyncing(false)
      })
    return () => {
      active = false
    }
  }, [enabled, game, supported])

  return {
    supported,
    syncing,
    ready: printingCount > 0,
    printingCount,
    priceCount,
    updatedAt,
  }
}
