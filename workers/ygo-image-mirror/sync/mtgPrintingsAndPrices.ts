import { pathToFileURL } from "node:url"
import { gzipSync } from "node:zlib"

import {
  compressScryfallImagePath,
  encodeFinishes,
  encodeRarity,
  MTG_PRICES_PATH,
  MTG_PRINTINGS_PATH,
  type MtgPricesPack,
  type MtgPriceTuple,
  type MtgPrintingsPack,
  type MtgPrintingTuple,
  parsePriceCents,
  trimPriceTuple,
} from "../../../convex/lib/cardPricing"
import { objectRecord, SCRYFALL_BASE_URL, SCRYFALL_HEADERS } from "../../../convex/lib/scryfall"

import { mirrorOrigin } from "./index"

const DEFAULT_CARDS_BULK_URL = `${SCRYFALL_BASE_URL}/bulk-data/default-cards`
const CARD_KINGDOM_PRICELIST_URL = "https://api.cardkingdom.com/api/v2/pricelist"
const MIN_PRINTINGS = 50_000
const MIN_PRICES = 40_000

const NON_DECK_LAYOUTS = new Set([
  "token",
  "double_faced_token",
  "emblem",
  "art_series",
  "vanguard",
  "scheme",
  "planar",
])

type Fetch = typeof fetch

type SyncOptions = {
  mirrorBaseUrl: string
  mirrorToken: string
  dryRun?: boolean
  minPrintings?: number
  minPrices?: number
  fetch?: Fetch
  report?: (entry: Record<string, unknown>) => void
}

interface CardKingdomEntry {
  retailCents?: number
  foilRetailCents?: number
  buylistCents?: number
  foilBuylistCents?: number
}

async function defaultCardsBulkFile(fetcher: Fetch) {
  const response = await fetcher(DEFAULT_CARDS_BULK_URL, {
    headers: SCRYFALL_HEADERS,
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) {
    throw new Error(`Scryfall default-cards bulk data failed with status ${response.status}`)
  }
  const record = objectRecord(await response.json())
  const version = record?.updated_at
  const downloadUrl = record?.jsonl_download_uri
  if (typeof version !== "string" || typeof downloadUrl !== "string") {
    throw new Error("Scryfall default-cards bulk data is missing updated_at or jsonl_download_uri")
  }
  if (new URL(downloadUrl).protocol !== "https:") {
    throw new Error("Scryfall bulk download must use HTTPS")
  }
  return { version, downloadUrl }
}

async function* jsonLines(body: ReadableStream<Uint8Array>) {
  const decoder = new TextDecoder()
  let buffered = ""
  for await (const chunk of body.pipeThrough(new DecompressionStream("gzip"))) {
    buffered += decoder.decode(chunk, { stream: true })
    const lines = buffered.split("\n")
    buffered = lines.pop() ?? ""
    for (const line of lines) if (line.trim()) yield line
  }
  buffered += decoder.decode()
  if (buffered.trim()) yield buffered
}

export async function fetchCardKingdomPrices(
  fetcher: Fetch = fetch,
): Promise<Map<string, CardKingdomEntry>> {
  const byScryfallId = new Map<string, CardKingdomEntry>()
  const response = await fetcher(CARD_KINGDOM_PRICELIST_URL, {
    headers: { "User-Agent": "Scryve/1.0 (https://scryve.app)", "Accept": "application/json" },
    signal: AbortSignal.timeout(60_000),
  })
  if (!response.ok) {
    throw new Error(`Card Kingdom pricelist failed with status ${response.status}`)
  }
  const payload = objectRecord(await response.json())
  const items = Array.isArray(payload?.data) ? payload.data : []
  for (const item of items) {
    const record = objectRecord(item)
    const scryfallId = record?.scryfall_id
    if (typeof scryfallId !== "string" || !scryfallId) continue
    const isFoil = record?.is_foil === "true" || record?.is_foil === true
    const retail = parsePriceCents(record?.price_retail)
    const buylist = parsePriceCents(record?.price_buy)
    if (retail === undefined && buylist === undefined) continue
    const entry = byScryfallId.get(scryfallId) ?? {}
    if (isFoil) {
      if (retail !== undefined) entry.foilRetailCents = retail
      if (buylist !== undefined) entry.foilBuylistCents = buylist
    } else {
      if (retail !== undefined) entry.retailCents = retail
      if (buylist !== undefined) entry.buylistCents = buylist
    }
    byScryfallId.set(scryfallId, entry)
  }
  return byScryfallId
}

function printingImagePath(raw: Record<string, unknown>): string {
  const imageUris = objectRecord(raw.image_uris)
  const face = Array.isArray(raw.card_faces) ? objectRecord(raw.card_faces[0]) : null
  const faceUris = objectRecord(face?.image_uris)
  const url =
    (typeof imageUris?.normal === "string" && imageUris.normal) ||
    (typeof faceUris?.normal === "string" && faceUris.normal) ||
    (typeof imageUris?.small === "string" && imageUris.small) ||
    (typeof faceUris?.small === "string" && faceUris.small) ||
    ""
  return compressScryfallImagePath(url)
}

export async function buildMtgPrintingsAndPrices(fetcher: Fetch = fetch): Promise<{
  printingsPack: MtgPrintingsPack
  pricesPack: MtgPricesPack
}> {
  const [{ version, downloadUrl }, ckPrices] = await Promise.all([
    defaultCardsBulkFile(fetcher),
    fetchCardKingdomPrices(fetcher),
  ])

  const response = await fetcher(downloadUrl, {
    headers: SCRYFALL_HEADERS,
    signal: AbortSignal.timeout(10 * 60_000),
  })
  if (!response.ok || !response.body) {
    throw new Error(`Scryfall default-cards download failed with status ${response.status}`)
  }

  const sets: Record<string, string> = {}
  const rows: MtgPrintingTuple[] = []
  const prices: Record<string, MtgPriceTuple> = {}

  for await (const line of jsonLines(response.body)) {
    const raw = objectRecord(JSON.parse(line))
    if (!raw) continue
    if (raw.digital === true) continue
    if (raw.set_type === "memorabilia") continue
    if (typeof raw.layout === "string" && NON_DECK_LAYOUTS.has(raw.layout)) continue

    const scryfallId = typeof raw.id === "string" ? raw.id : undefined
    const oracleId =
      typeof raw.oracle_id === "string"
        ? raw.oracle_id
        : Array.isArray(raw.card_faces) &&
            typeof objectRecord(raw.card_faces[0])?.oracle_id === "string"
          ? (objectRecord(raw.card_faces[0])?.oracle_id as string)
          : scryfallId
    const name = typeof raw.name === "string" ? raw.name : undefined
    const setCode = typeof raw.set === "string" ? raw.set.toLowerCase() : undefined
    const collectorNumber =
      typeof raw.collector_number === "string" ? raw.collector_number : undefined
    if (!scryfallId || !oracleId || !name || !setCode || !collectorNumber) continue

    if (typeof raw.set_name === "string" && !sets[setCode]) {
      sets[setCode] = raw.set_name
    }
    const finishes = Array.isArray(raw.finishes)
      ? raw.finishes.filter((entry): entry is string => typeof entry === "string")
      : []
    const tcgplayerId =
      typeof raw.tcgplayer_id === "number" && Number.isFinite(raw.tcgplayer_id)
        ? raw.tcgplayer_id
        : 0

    rows.push([
      scryfallId,
      oracleId,
      name,
      setCode,
      collectorNumber,
      encodeRarity(typeof raw.rarity === "string" ? raw.rarity : undefined),
      encodeFinishes(finishes),
      tcgplayerId,
      printingImagePath(raw),
    ])

    const rawPrices = objectRecord(raw.prices)
    const ck = ckPrices.get(scryfallId)
    const tuple = trimPriceTuple([
      parsePriceCents(rawPrices?.usd),
      parsePriceCents(rawPrices?.usd_foil),
      parsePriceCents(rawPrices?.usd_etched),
      parsePriceCents(rawPrices?.eur),
      parsePriceCents(rawPrices?.eur_foil),
      ck?.retailCents,
      ck?.foilRetailCents,
      ck?.buylistCents,
      ck?.foilBuylistCents,
    ])
    if (tuple) prices[scryfallId] = tuple
  }

  return {
    printingsPack: { version, sets, rows },
    pricesPack: { version, asOf: Date.now(), prices },
  }
}

async function uploadPack(
  fetcher: Fetch,
  origin: string,
  token: string,
  path: string,
  gzip: Uint8Array,
) {
  const response = await fetcher(`${origin}${path}`, {
    method: "PUT",
    headers: {
      "authorization": `Bearer ${token}`,
      "content-type": "application/gzip",
      "user-agent": "Scryve pricing sync/1.0",
    },
    body: gzip,
    signal: AbortSignal.timeout(120_000),
  })
  if (!response.ok) throw new Error(`Mirror returned status ${response.status} for ${path}`)
}

export async function syncMtgPrintingsAndPrices(options: SyncOptions) {
  const fetcher = options.fetch ?? fetch
  const report = options.report ?? ((entry) => console.log(JSON.stringify(entry)))
  const minPrintings = options.minPrintings ?? MIN_PRINTINGS
  const minPrices = options.minPrices ?? MIN_PRICES

  const { printingsPack, pricesPack } = await buildMtgPrintingsAndPrices(fetcher)
  const printingsJson = JSON.stringify(printingsPack)
  const pricesJson = JSON.stringify(pricesPack)
  const printingsGzip = gzipSync(printingsJson, { level: 9 })
  const pricesGzip = gzipSync(pricesJson, { level: 9 })
  const priceCount = Object.keys(pricesPack.prices).length

  const result = {
    version: printingsPack.version,
    printings: printingsPack.rows.length,
    prices: priceCount,
    printingsRawBytes: Buffer.byteLength(printingsJson),
    printingsGzipBytes: printingsGzip.byteLength,
    pricesRawBytes: Buffer.byteLength(pricesJson),
    pricesGzipBytes: pricesGzip.byteLength,
  }
  report({ event: "pricing_packs_built", ...result })

  if (printingsPack.rows.length < minPrintings) {
    throw new Error(
      `Refusing to upload ${printingsPack.rows.length} printings; expected at least ${minPrintings}`,
    )
  }
  if (priceCount < minPrices) {
    throw new Error(`Refusing to upload ${priceCount} prices; expected at least ${minPrices}`)
  }
  if (options.dryRun) return result

  const origin = mirrorOrigin(options.mirrorBaseUrl)
  if (!options.mirrorToken) throw new Error("YGO_MIRROR_TOKEN is required")

  await uploadPack(fetcher, origin, options.mirrorToken, MTG_PRINTINGS_PATH, printingsGzip)
  await uploadPack(fetcher, origin, options.mirrorToken, MTG_PRICES_PATH, pricesGzip)
  report({ event: "pricing_packs_uploaded", ...result })
  return result
}

async function main() {
  await syncMtgPrintingsAndPrices({
    mirrorBaseUrl: process.env.YGO_MIRROR_BASE_URL ?? "",
    mirrorToken: process.env.YGO_MIRROR_TOKEN ?? "",
    dryRun: process.argv.includes("--dry-run"),
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error: unknown) => {
    console.error(
      JSON.stringify({
        event: "sync_failed",
        error: error instanceof Error ? error.message : "Unknown error",
      }),
    )
    process.exitCode = 1
  })
}
