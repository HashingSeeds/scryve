const IMAGE_KEY = /^yugioh\/cards\/([0-9]+)\.jpg$/
const SOURCE_PATH = /^\/images\/cards(?:_small)?\/([0-9]+)\.jpg$/
const ALLOWED_SOURCE_HOST = "images.ygoprodeck.com"

type MirrorRequest = {
  key: string
  sourceUrl: string
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

export function validateMirrorInput(value: unknown): MirrorRequest {
  if (!value || typeof value !== "object") {
    throw new RequestFailure(400, "Invalid mirror request")
  }

  const record = value as Record<string, unknown>
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

  return { key: record.key, sourceUrl: source.toString() }
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
