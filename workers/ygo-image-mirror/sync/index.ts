import { pathToFileURL } from "node:url"

const CARD_DATA_URL = "https://db.ygoprodeck.com/api/v7/cardinfo.php"
const MAX_BATCH_SIZE = 1
const DEFAULT_RETRIES = 5

type Fetch = typeof fetch

type SyncOptions = {
  mirrorBaseUrl: string
  mirrorToken: string
  dryRun?: boolean
  limit?: number
  batchSize?: number
  retries?: number
  fetch?: Fetch
  report?: (entry: Record<string, unknown>) => void
}

type MirrorBatchResponse = {
  requested: number
  created: number
  existing: number
  failed: number
}

class NonRetryableRequestFailure extends Error {}

function objectRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function printingId(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isSafeInteger(value) && value > 0) return String(value)
  if (typeof value === "string" && /^[0-9]{1,20}$/.test(value)) return value
  return undefined
}

export function printingIdsFromCardData(value: unknown): string[] {
  const envelope = objectRecord(value)
  if (!Array.isArray(envelope?.data)) throw new Error("YGOPRODeck returned invalid card data")

  const ids = new Set<string>()
  for (const candidate of envelope.data) {
    const card = objectRecord(candidate)
    if (!Array.isArray(card?.card_images)) continue
    for (const candidateImage of card.card_images) {
      const id = printingId(objectRecord(candidateImage)?.id)
      if (id) ids.add(id)
    }
  }
  return [...ids]
}

export function batches<T>(items: readonly T[], size: number): T[][] {
  if (!Number.isSafeInteger(size) || size < 1 || size > MAX_BATCH_SIZE) {
    throw new Error(`Batch size must be between 1 and ${MAX_BATCH_SIZE}`)
  }
  const result: T[][] = []
  for (let offset = 0; offset < items.length; offset += size) {
    result.push(items.slice(offset, offset + size))
  }
  return result
}

export function mirrorOrigin(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error("YGO_MIRROR_BASE_URL must be a valid HTTPS origin")
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !["", "/"].includes(url.pathname)
  ) {
    throw new Error("YGO_MIRROR_BASE_URL must be a valid HTTPS origin")
  }
  return url.origin
}

function mirrorBatchResponse(value: unknown): MirrorBatchResponse {
  const record = objectRecord(value)
  const keys = ["requested", "created", "existing", "failed"] as const
  if (
    !record ||
    keys.some((key) => !Number.isSafeInteger(record[key]) || Number(record[key]) < 0)
  ) {
    throw new Error("Mirror returned an invalid response")
  }
  return {
    requested: Number(record.requested),
    created: Number(record.created),
    existing: Number(record.existing),
    failed: Number(record.failed),
  }
}

async function sleep(milliseconds: number) {
  await new Promise((resolve) => setTimeout(resolve, milliseconds))
}

async function postBatch(
  fetcher: Fetch,
  origin: string,
  token: string,
  ids: readonly string[],
  retries: number,
) {
  let attempt = 0
  let partialResult: MirrorBatchResponse | undefined
  while (true) {
    attempt += 1
    try {
      const response = await fetcher(`${origin}/mirror`, {
        method: "POST",
        headers: {
          "authorization": `Bearer ${token}`,
          "content-type": "application/json",
          "user-agent": "Scryve image sync/1.0",
        },
        body: JSON.stringify({ printingIds: ids }),
        signal: AbortSignal.timeout(120_000),
      })
      if (!response.ok) {
        const message = `Mirror returned status ${response.status}`
        if (response.status !== 429 && response.status < 500) {
          throw new NonRetryableRequestFailure(message)
        }
        throw new Error(message)
      }
      let result: MirrorBatchResponse
      try {
        result = mirrorBatchResponse((await response.json()) as unknown)
      } catch (error) {
        throw new NonRetryableRequestFailure(
          error instanceof Error ? error.message : "Mirror returned an invalid response",
        )
      }
      if (
        result.requested !== ids.length ||
        result.created + result.existing + result.failed !== result.requested
      ) {
        throw new NonRetryableRequestFailure("Mirror returned inconsistent totals")
      }
      if (result.failed > 0) {
        partialResult = result
        throw new Error("Mirror batch reported failed images")
      }
      return result
    } catch (error) {
      if (error instanceof NonRetryableRequestFailure) throw error
      if (attempt > retries) {
        if (partialResult) return partialResult
        throw error
      }
      await sleep(500 * 2 ** (attempt - 1))
    }
  }
}

export async function syncYgoImages(options: SyncOptions) {
  const fetcher = options.fetch ?? fetch
  const report = options.report ?? ((entry) => console.log(JSON.stringify(entry)))
  const origin = mirrorOrigin(options.mirrorBaseUrl)
  const batchSize = options.batchSize ?? MAX_BATCH_SIZE
  const retries = options.retries ?? DEFAULT_RETRIES
  batches([], batchSize)
  if (options.limit !== undefined && (!Number.isSafeInteger(options.limit) || options.limit < 1)) {
    throw new Error("Limit must be a positive integer")
  }
  if (!Number.isSafeInteger(retries) || retries < 0 || retries > 8) {
    throw new Error("Retries must be between 0 and 8")
  }
  const response = await fetcher(CARD_DATA_URL, {
    headers: {
      "accept": "application/json",
      "user-agent": "Scryve image sync/1.0",
    },
    signal: AbortSignal.timeout(120_000),
  })
  if (!response.ok) throw new Error(`YGOPRODeck card data failed with status ${response.status}`)

  const allIds = printingIdsFromCardData((await response.json()) as unknown)
  const selectedIds = options.limit === undefined ? allIds : allIds.slice(0, options.limit)
  report({ event: "sync_started", discovered: allIds.length, selected: selectedIds.length })
  if (options.dryRun) return { discovered: allIds.length, selected: selectedIds.length }
  if (!options.mirrorToken) throw new Error("YGO_MIRROR_TOKEN is required")

  let created = 0
  let existing = 0
  let failed = 0
  const groups = batches(selectedIds, batchSize)
  for (const [index, ids] of groups.entries()) {
    let result: MirrorBatchResponse
    try {
      result = await postBatch(fetcher, origin, options.mirrorToken, ids, retries)
    } catch (error) {
      if (error instanceof NonRetryableRequestFailure) throw error
      failed += ids.length
      report({
        event: "sync_batch_failed",
        batch: index + 1,
        batches: groups.length,
        failed: ids.length,
        error: error instanceof Error ? error.message : "Unknown error",
      })
      continue
    }
    created += result.created
    existing += result.existing
    failed += result.failed
    const batchNumber = index + 1
    if (batchNumber === 1 || batchNumber % 100 === 0 || batchNumber === groups.length) {
      report({
        event: "sync_progress",
        batch: batchNumber,
        batches: groups.length,
        processed: created + existing + failed,
        created,
        existing,
        failed,
      })
    }
  }

  const result = {
    discovered: allIds.length,
    selected: selectedIds.length,
    created,
    existing,
    failed,
  }
  report({ event: "sync_completed", ...result })
  return result
}

function numberArgument(name: string) {
  const prefix = `--${name}=`
  const raw = process.argv.find((argument) => argument.startsWith(prefix))?.slice(prefix.length)
  if (raw === undefined) return undefined
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value < 1)
    throw new Error(`${name} must be a positive integer`)
  return value
}

async function main() {
  const dryRun = process.argv.includes("--dry-run")
  const result = await syncYgoImages({
    mirrorBaseUrl: process.env.YGO_MIRROR_BASE_URL ?? "",
    mirrorToken: process.env.YGO_MIRROR_TOKEN ?? "",
    dryRun,
    limit: numberArgument("limit"),
    batchSize: numberArgument("batch-size"),
  })
  if ("failed" in result && result.failed > 0) {
    throw new Error(`Image sync completed with ${result.failed} failed printing IDs`)
  }
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
