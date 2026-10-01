import { ConvexError, v } from "convex/values"

import { action } from "./_generated/server"
import { requireActionCapability } from "./lib/actionCapabilities"
import { limitDeckImport } from "./lib/deckRateLimits"
import { archidektDeckLink, parseArchidektDeck } from "./lib/games/archidekt"
import {
  type CardReference,
  fetchScryfall,
  normalizeScryfallCard,
  objectRecord,
} from "./lib/scryfall"

const MAX_RESPONSE_BYTES = 4 * 1024 * 1024

async function boundedJson(response: Response): Promise<unknown> {
  if (Number(response.headers.get("content-length")) > MAX_RESPONSE_BYTES || !response.body) {
    await response.body?.cancel()
    throw new ConvexError({
      code: "archidekt_invalid_response",
      message: "The deck response is too large or empty.",
    })
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_RESPONSE_BYTES)
        throw new ConvexError({
          code: "archidekt_invalid_response",
          message: "The deck response is too large.",
        })
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
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown
  } catch {
    throw new ConvexError({
      code: "archidekt_invalid_response",
      message: "Archidekt returned an invalid response.",
    })
  }
}

export const resolvePublic = action({
  args: { url: v.string() },
  handler: async (ctx, args) => {
    const { deckId, sourceUrl } = archidektDeckLink(args.url)
    await limitDeckImport(ctx)
    await requireActionCapability(ctx, "mtg", "deckImport")
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10_000)
    let payload: unknown
    try {
      const response = await fetch(`https://archidekt.com/api/decks/${deckId}/`, {
        signal: controller.signal,
        redirect: "error",
        headers: {
          "Accept": "application/json",
          "User-Agent": "ScryveDeckBuilder/1.0 (https://scryve.sow.care)",
        },
      })
      if (!response.ok)
        throw new ConvexError({
          code: "archidekt_unavailable",
          message:
            response.status === 403 || response.status === 404
              ? "This deck is unavailable. Use a public Archidekt deck or paste its text export."
              : "Archidekt is temporarily unavailable. Try again or paste its text export.",
        })
      payload = await boundedJson(response)
    } catch (error) {
      if (error instanceof ConvexError) throw error
      throw new ConvexError({
        code: "archidekt_unavailable",
        message: "Could not load Archidekt. Try again or paste its text export.",
      })
    } finally {
      clearTimeout(timer)
    }
    const { entries, ...metadata } = parseArchidektDeck(payload, deckId)
    const resolved = new Map<string, CardReference>()
    const ids = [...new Set(entries.map((entry) => entry.scryfallId))]
    for (let offset = 0; offset < ids.length; offset += 75) {
      const response = await fetchScryfall(ctx, "/cards/collection", {
        method: "POST",
        body: JSON.stringify({ identifiers: ids.slice(offset, offset + 75).map((id) => ({ id })) }),
      })
      if (!response.ok)
        throw new ConvexError({
          code: "scryfall_unavailable",
          message: "Card resolution is temporarily unavailable.",
        })
      const result = objectRecord(await boundedJson(response))
      if (!Array.isArray(result?.data) || result.data.length > 75)
        throw new ConvexError({
          code: "scryfall_unavailable",
          message: "Card resolution returned an invalid response.",
        })
      for (const value of result.data) {
        const card = normalizeScryfallCard(value)
        if (card) resolved.set(card.scryfallId.toLowerCase(), card)
      }
    }
    const cards: (CardReference & {
      quantity: number
      board: "main" | "sideboard" | "commander"
    })[] = []
    const unresolved: string[] = []
    for (const entry of entries) {
      const card = resolved.get(entry.scryfallId)
      if (!card || card.oracleId.toLowerCase() !== entry.oracleId) unresolved.push(entry.name)
      else cards.push({ ...card, quantity: entry.quantity, board: entry.board })
    }
    return { ...metadata, sourceUrl, cards, unresolved, invalidLines: [] as string[] }
  },
})
