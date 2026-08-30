const PRINTING_ID = /^[0-9]{1,20}$/
const IMAGE_KEY = /^yugioh\/cards\/([0-9]{1,20})\.jpg$/
const SOURCE_PATH = /^\/images\/cards(?:_small)?\/([0-9]+)\.jpg$/
const ALLOWED_SOURCE_HOST = "images.ygoprodeck.com"
export const MAX_MIRROR_TARGETS = 1

export type MirrorTarget = {
  printingId: string
  key: string
  sourceUrl: string
}

export type MirrorRequest = {
  kind: "batch" | "legacy"
  targets: MirrorTarget[]
}

export class RequestFailure extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

export function printingIdFromKey(key: string): string | undefined {
  return IMAGE_KEY.exec(key)?.[1]
}

export function sourceUrlForKey(key: string): string | undefined {
  const printingId = printingIdFromKey(key)
  return printingId
    ? `https://${ALLOWED_SOURCE_HOST}/images/cards_small/${printingId}.jpg`
    : undefined
}

export function mirrorTargetForPrintingId(printingId: string): MirrorTarget | undefined {
  if (!PRINTING_ID.test(printingId)) return undefined
  const key = `yugioh/cards/${printingId}.jpg`
  const sourceUrl = sourceUrlForKey(key)
  return sourceUrl ? { printingId, key, sourceUrl } : undefined
}

function batchTargets(record: Record<string, unknown>): MirrorTarget[] | undefined {
  if (!Array.isArray(record.printingIds)) return undefined
  if (record.printingIds.length === 0 || record.printingIds.length > MAX_MIRROR_TARGETS) {
    throw new RequestFailure(400, `printingIds must contain 1-${MAX_MIRROR_TARGETS} items`)
  }

  const uniqueIds = new Set<string>()
  for (const value of record.printingIds) {
    if (typeof value !== "string" || !PRINTING_ID.test(value)) {
      throw new RequestFailure(400, "Invalid printing ID")
    }
    uniqueIds.add(value)
  }

  return [...uniqueIds].map((printingId) => {
    const target = mirrorTargetForPrintingId(printingId)
    if (!target) throw new RequestFailure(400, "Invalid printing ID")
    return target
  })
}

export function validateMirrorInput(value: unknown): MirrorRequest {
  if (!value || typeof value !== "object") {
    throw new RequestFailure(400, "Invalid mirror request")
  }

  const record = value as Record<string, unknown>
  const targets = batchTargets(record)
  if (targets) return { kind: "batch", targets }

  if (typeof record.key !== "string" || typeof record.sourceUrl !== "string") {
    throw new RequestFailure(400, "Invalid mirror request")
  }

  const printingId = printingIdFromKey(record.key)
  if (!printingId) throw new RequestFailure(400, "Invalid image key")

  let source: URL
  try {
    source = new URL(record.sourceUrl)
  } catch {
    throw new RequestFailure(400, "Invalid source URL")
  }

  const sourcePrintingId = SOURCE_PATH.exec(source.pathname)?.[1]
  if (
    source.protocol !== "https:" ||
    source.hostname !== ALLOWED_SOURCE_HOST ||
    source.username !== "" ||
    source.password !== "" ||
    source.port !== "" ||
    source.search !== "" ||
    source.hash !== "" ||
    sourcePrintingId !== printingId
  ) {
    throw new RequestFailure(400, "Source is not allowed")
  }

  return {
    kind: "legacy",
    targets: [{ printingId, key: record.key, sourceUrl: source.toString() }],
  }
}

async function cancelReader(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
  try {
    await reader.cancel()
  } catch {
    return
  }
}

export async function readBoundedBody(
  body: ReadableStream<Uint8Array> | null,
  maximumBytes: number,
  tooLargeMessage = "Image is too large",
): Promise<Uint8Array> {
  if (!body) throw new RequestFailure(502, "Source returned no body")

  const result = new Uint8Array(maximumBytes)
  const reader = body.getReader()
  let length = 0

  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      if (length + chunk.value.byteLength > maximumBytes) {
        await cancelReader(reader)
        throw new RequestFailure(413, tooLargeMessage)
      }
      result.set(chunk.value, length)
      length += chunk.value.byteLength
    }
  } finally {
    reader.releaseLock()
  }

  return result.slice(0, length)
}

export function isJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
}
