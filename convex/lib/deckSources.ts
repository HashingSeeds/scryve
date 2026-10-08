import { ConvexError } from "convex/values"

export const DECK_SOURCES = {
  archidekt: "Archidekt",
  ygoprodeck: "YGOPRODeck",
  limitless: "Limitless",
} as const

export type DeckSource = keyof typeof DECK_SOURCES

const MAX_URL_LENGTH = 2048
const DEFAULT_MAX_RESPONSE_BYTES = 4 * 1024 * 1024
const REQUEST_TIMEOUT_MS = 10_000

export function deckSourceUrl(input: string, hosts: readonly string[], message: string) {
  const invalid = () => new ConvexError({ code: "invalid_deck_url", message })
  if (input.length > MAX_URL_LENGTH) throw invalid()
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    throw invalid()
  }
  if (
    url.protocol !== "https:" ||
    !hosts.includes(url.hostname) ||
    url.port ||
    url.username ||
    url.password
  )
    throw invalid()
  return url
}

export async function boundedText(
  response: Response,
  code: string,
  maxBytes = DEFAULT_MAX_RESPONSE_BYTES,
): Promise<string> {
  const tooLarge = () =>
    new ConvexError({ code, message: "The deck response is too large or empty." })
  if (Number(response.headers.get("content-length")) > maxBytes || !response.body) {
    await response.body?.cancel()
    throw tooLarge()
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) throw tooLarge()
      chunks.push(value)
    }
  } finally {
    await reader.cancel()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

export async function fetchDeckSource(
  source: DeckSource,
  url: string,
  options: { accept: string; maxBytes?: number },
): Promise<string> {
  const name = DECK_SOURCES[source]
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      redirect: "error",
      headers: {
        "Accept": options.accept,
        "User-Agent": "ScryveDeckBuilder/1.0 (https://scryve.sow.care)",
      },
    })
    if (!response.ok)
      throw new ConvexError({
        code: `${source}_unavailable`,
        message:
          response.status === 403 || response.status === 404
            ? `This deck is unavailable. Use a public ${name} deck or paste its text export.`
            : `${name} is temporarily unavailable. Try again or paste its text export.`,
      })
    return await boundedText(response, `${source}_invalid_response`, options.maxBytes)
  } catch (error) {
    if (error instanceof ConvexError) throw error
    throw new ConvexError({
      code: `${source}_unavailable`,
      message: `Could not load ${name}. Try again or paste its text export.`,
    })
  } finally {
    clearTimeout(timer)
  }
}

export function invalidSourceDeck(
  source: DeckSource,
  message = `${DECK_SOURCES[source]} returned an unsupported deck. Try its text export instead.`,
): never {
  throw new ConvexError({ code: `${source}_invalid_deck`, message })
}
