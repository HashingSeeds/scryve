import { useEffect, useSyncExternalStore } from "react"

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

// why: a check stamps *_checked_at only after rows exist, so a fresh stamp means no row queries.
function checkIsStale(key: string, maxAgeMs: number, now: number): boolean {
  const checkedAt = Number(catalogDb.getMeta(key))
  return !Number.isFinite(checkedAt) || checkedAt === 0 || now - checkedAt >= maxAgeMs
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

// why: memos key on `version`, bumped per committed replace, since a row count misses a price change that keeps the count.
interface CatalogSnapshot {
  syncing: boolean
  version: number
}

const IDLE_SNAPSHOT: CatalogSnapshot = { syncing: false, version: 0 }
const catalogSnapshots = new Map<string, CatalogSnapshot>()
const catalogListeners = new Set<() => void>()

function catalogSnapshot(game: string): CatalogSnapshot {
  return catalogSnapshots.get(game) ?? IDLE_SNAPSHOT
}

function updateCatalogSnapshot(game: string, patch: Partial<CatalogSnapshot>) {
  catalogSnapshots.set(game, { ...catalogSnapshot(game), ...patch })
  for (const listener of catalogListeners) listener()
}

function subscribeCatalog(listener: () => void) {
  catalogListeners.add(listener)
  return () => {
    catalogListeners.delete(listener)
  }
}

export function catalogVersion(game: string): number {
  return catalogSnapshot(game).version
}

export async function syncCatalogPrintingsAndPrices(
  game: string,
  options: { fetcher?: typeof fetch; force?: boolean; now?: number } = {},
): Promise<{ printingsUpdated: boolean; pricesUpdated: boolean }> {
  if (!isScryfallSystem(game)) return { printingsUpdated: false, pricesUpdated: false }
  const fetcher = options.fetcher ?? fetch
  const now = options.now ?? Date.now()

  const printingsStale =
    options.force ||
    checkIsStale(metaKey(game, META_PRINTINGS_CHECKED_AT), PRINTINGS_MAX_AGE_MS, now)
  const pricesStale =
    options.force || checkIsStale(metaKey(game, META_PRICES_CHECKED_AT), PRICES_MAX_AGE_MS, now)
  if (!printingsStale && !pricesStale) return { printingsUpdated: false, pricesUpdated: false }

  updateCatalogSnapshot(game, { syncing: true })
  try {
    return await fetchStaleCatalog(game, { printingsStale, pricesStale, fetcher, now })
  } finally {
    updateCatalogSnapshot(game, { syncing: false })
  }
}

async function fetchStaleCatalog(
  game: string,
  options: { printingsStale: boolean; pricesStale: boolean; fetcher: typeof fetch; now: number },
): Promise<{ printingsUpdated: boolean; pricesUpdated: boolean }> {
  const { fetcher, now } = options
  const origins = pricingDatasetOrigins()
  let printingsUpdated = false
  let pricesUpdated = false

  if (options.printingsStale) {
    const prevEtag = catalogDb.hasPrintings(game)
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
      updateCatalogSnapshot(game, { version: catalogVersion(game) + 1 })
    }
    catalogDb.setMeta(metaKey(game, META_PRINTINGS_CHECKED_AT), String(now))
  }

  if (options.pricesStale) {
    const prevEtag = catalogDb.hasPrices(game)
      ? catalogDb.getMeta(metaKey(game, META_PRICES_ETAG))
      : undefined
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
      await catalogDb.replacePricesAsync(game, rows)
      if (response.etag) catalogDb.setMeta(metaKey(game, META_PRICES_ETAG), response.etag)
      pricesUpdated = true
      updateCatalogSnapshot(game, { version: catalogVersion(game) + 1 })
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

export interface ValuedCollectionEntry<
  T extends { printingId: string; finish: string; condition: string; quantity: number },
> {
  entry: T
  retailCents: number
  buylistCents: number
}

export function valueCollectionEntries<
  T extends { printingId: string; finish: string; condition: string; quantity: number },
>(
  game: string,
  entries: readonly T[],
): {
  items: ValuedCollectionEntry<T>[]
  totals: { cards: number; retailCents: number; buylistCents: number }
} {
  if (entries.length === 0) {
    return { items: [], totals: { cards: 0, retailCents: 0, buylistCents: 0 } }
  }
  const pricesByPrinting = catalogDb.getPricesBatch(
    game,
    entries.map((entry) => entry.printingId),
  )
  const summaryCache = new Map<string, PrintingPriceSummary>()
  const items: ValuedCollectionEntry<T>[] = new Array(entries.length)
  let cards = 0
  let retailCents = 0
  let buylistCents = 0
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i]
    const cacheKey = `${entry.printingId}\u0000${entry.finish}\u0000${entry.condition}`
    let summary = summaryCache.get(cacheKey)
    if (!summary) {
      const rows = pricesByPrinting.get(entry.printingId)
      summary = rows ? summarizePrintingPrices(rows, entry.finish, entry.condition) : {}
      summaryCache.set(cacheKey, summary)
    }
    const unitRetail = summary.retailCents ?? 0
    const unitBuylist = summary.buylistCents ?? 0
    items[i] = { entry, retailCents: unitRetail, buylistCents: unitBuylist }
    cards += entry.quantity
    retailCents += unitRetail * entry.quantity
    buylistCents += unitBuylist * entry.quantity
  }
  return { items, totals: { cards, retailCents, buylistCents } }
}

function isSingleEditAway(a: string, b: string): boolean {
  if (a === b) return false
  const lenDiff = Math.abs(a.length - b.length)
  if (lenDiff > 1) return false
  if (a.length === b.length) {
    let diffs = 0
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] !== b[i]) {
        diffs += 1
        if (diffs > 1) return false
      }
    }
    return diffs === 1
  }
  const shorter = a.length < b.length ? a : b
  const longer = a.length < b.length ? b : a
  let i = 0
  let j = 0
  let skipped = false
  while (i < shorter.length && j < longer.length) {
    if (shorter[i] === longer[j]) {
      i += 1
      j += 1
    } else if (skipped) {
      return false
    } else {
      skipped = true
      j += 1
    }
  }
  return true
}

function uniqueFuzzySetMatch(
  code: string | undefined,
  candidates: readonly CatalogPrinting[],
): string | undefined {
  if (!code || code.length < 3) return undefined
  const lower = code.toLowerCase()
  const uniqueSets = new Set(candidates.map((candidate) => candidate.setCode))
  if (uniqueSets.has(lower)) return lower
  let matched: string | undefined
  for (const setCode of uniqueSets) {
    if (setCode.length < 3 || !isSingleEditAway(lower, setCode)) continue
    if (matched) return undefined
    matched = setCode
  }
  return matched
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
  const matchedCandidateSet =
    !lockedSet && !hint.setCode && hint.candidateSetCodes?.length
      ? hint.candidateSetCodes.find((code) =>
          candidates.some((candidate) => candidate.setCode === code.toLowerCase()),
        )
      : undefined
  const rawSet = lockedSet ?? hint.setCode?.toLowerCase() ?? matchedCandidateSet?.toLowerCase()
  const preferredSet =
    lockedSet ??
    (rawSet && candidates.some((candidate) => candidate.setCode === rawSet)
      ? rawSet
      : uniqueFuzzySetMatch(rawSet, candidates))
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

export function useCatalogSync(game: string, enabled = true) {
  const supported = isScryfallSystem(game)
  const snapshot = useSyncExternalStore(
    subscribeCatalog,
    () => catalogSnapshot(game),
    () => catalogSnapshot(game),
  )

  useEffect(() => {
    if (!enabled || !supported) return
    ensureCatalogSynced(game).catch(() => {})
  }, [enabled, game, supported])

  return {
    supported,
    syncing: supported && snapshot.syncing,
    version: snapshot.version,
  }
}
