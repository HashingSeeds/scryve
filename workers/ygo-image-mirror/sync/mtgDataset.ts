import { pathToFileURL } from "node:url"
import { gzipSync } from "node:zlib"

import {
  type MagicDataset,
  type MagicDatasetCard,
  magicDatasetCard,
} from "../../../convex/lib/magicDataset"
import { objectRecord, SCRYFALL_BASE_URL, SCRYFALL_HEADERS } from "../../../convex/lib/scryfall"

import { mirrorOrigin } from "./index"

export const DATASET_PATH = "/datasets/mtg/cards.json"
const BULK_DATA_URL = `${SCRYFALL_BASE_URL}/bulk-data/oracle-cards`
const MIN_CARDS = 30_000

type Fetch = typeof fetch

type SyncOptions = {
  mirrorBaseUrl: string
  mirrorToken: string
  dryRun?: boolean
  minCards?: number
  fetch?: Fetch
  report?: (entry: Record<string, unknown>) => void
}

async function bulkFile(fetcher: Fetch) {
  const response = await fetcher(BULK_DATA_URL, {
    headers: SCRYFALL_HEADERS,
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`Scryfall bulk data failed with status ${response.status}`)
  const record = objectRecord(await response.json())
  const version = record?.updated_at
  const downloadUrl = record?.jsonl_download_uri
  if (typeof version !== "string" || typeof downloadUrl !== "string") {
    throw new Error("Scryfall bulk data is missing updated_at or jsonl_download_uri")
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

export async function buildMagicDataset(fetcher: Fetch = fetch): Promise<MagicDataset> {
  const { version, downloadUrl } = await bulkFile(fetcher)
  const response = await fetcher(downloadUrl, {
    headers: SCRYFALL_HEADERS,
    signal: AbortSignal.timeout(10 * 60_000),
  })
  if (!response.ok || !response.body) {
    throw new Error(`Scryfall bulk download failed with status ${response.status}`)
  }

  const cards: MagicDatasetCard[] = []
  for await (const line of jsonLines(response.body)) {
    const card = magicDatasetCard(JSON.parse(line))
    if (card) cards.push(card)
  }
  return { version, cards }
}

export async function syncMagicDataset(options: SyncOptions) {
  const fetcher = options.fetch ?? fetch
  const report = options.report ?? ((entry) => console.log(JSON.stringify(entry)))
  const origin = mirrorOrigin(options.mirrorBaseUrl)
  const minCards = options.minCards ?? MIN_CARDS

  const dataset = await buildMagicDataset(fetcher)
  const json = JSON.stringify(dataset)
  const gzip = gzipSync(json, { level: 9 })
  const result = {
    version: dataset.version,
    cards: dataset.cards.length,
    rawBytes: Buffer.byteLength(json),
    gzipBytes: gzip.byteLength,
  }
  report({ event: "dataset_built", ...result })

  if (dataset.cards.length < minCards) {
    throw new Error(
      `Refusing to upload ${dataset.cards.length} cards; expected at least ${minCards}`,
    )
  }
  if (options.dryRun) return result
  if (!options.mirrorToken) throw new Error("YGO_MIRROR_TOKEN is required")

  const response = await fetcher(`${origin}${DATASET_PATH}`, {
    method: "PUT",
    headers: {
      "authorization": `Bearer ${options.mirrorToken}`,
      "content-type": "application/gzip",
      "user-agent": "Scryve dataset sync/1.0",
    },
    body: gzip,
    signal: AbortSignal.timeout(120_000),
  })
  if (!response.ok) throw new Error(`Mirror returned status ${response.status}`)
  report({ event: "dataset_uploaded", ...result })
  return result
}

async function main() {
  await syncMagicDataset({
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
