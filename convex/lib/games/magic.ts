import { ConvexError } from "convex/values"

import {
  compact,
  facet,
  normalizeCardName,
  objectRecord,
  stringValue,
  type CardFace,
  type NormalizedCard,
} from "./cards"
import { internal } from "../../_generated/api"
import type { Doc } from "../../_generated/dataModel"
import type { ActionCtx } from "../../_generated/server"
import { SCRYFALL_RATE_LIMIT_BLOCK_MS, fetchScryfall, normalizeScryfallCard } from "../scryfall"

function faceFromValue(value: unknown, index: number): CardFace | null {
  const face = objectRecord(value)
  if (!face) return null
  const images = objectRecord(face.image_uris)
  return {
    index,
    ...(stringValue(face.name) ? { name: stringValue(face.name) } : {}),
    ...(stringValue(face.oracle_text) ? { text: stringValue(face.oracle_text) } : {}),
    ...(stringValue(images?.normal) ? { imageUrl: stringValue(images?.normal) } : {}),
    ...(stringValue(images?.small) ? { smallImageUrl: stringValue(images?.small) } : {}),
  }
}

export function normalizeScryfallCatalogCard(value: unknown): NormalizedCard | null {
  const card = objectRecord(value)
  const providerCardId = stringValue(card?.id)
  const name = stringValue(card?.name)
  if (!card || !providerCardId || !name) return null
  const cardId = stringValue(card.oracle_id) ?? providerCardId
  const imageUris = objectRecord(card.image_uris)
  const rawFaces = Array.isArray(card.card_faces) ? card.card_faces : []
  const faces =
    rawFaces.length > 0
      ? rawFaces.flatMap((candidate, index) => {
          const face = faceFromValue(candidate, index)
          return face ? [face] : []
        })
      : [
          {
            index: 0,
            name,
            ...(stringValue(card.oracle_text) ? { text: stringValue(card.oracle_text) } : {}),
            ...(stringValue(imageUris?.normal) ? { imageUrl: stringValue(imageUris?.normal) } : {}),
            ...(stringValue(imageUris?.small)
              ? { smallImageUrl: stringValue(imageUris?.small) }
              : {}),
          },
        ]
  return {
    game: "mtg",
    identityNamespace: "scryfall-oracle",
    cardId,
    name,
    nameNormalized: normalizeCardName(name),
    ...(stringValue(card.layout) ? { category: stringValue(card.layout) } : {}),
    facets: compact([facet("manaCost", card.mana_cost), facet("typeLine", card.type_line)]),
    printings: [
      {
        provider: "scryfall",
        providerCardId,
        printingId: providerCardId,
        ...(stringValue(card.set) ? { setCode: stringValue(card.set) } : {}),
        ...(stringValue(card.collector_number)
          ? { collectorNumber: stringValue(card.collector_number) }
          : {}),
        ...(stringValue(card.lang) ? { language: stringValue(card.lang) } : {}),
        ...(stringValue(card.rarity) ? { rarity: stringValue(card.rarity) } : {}),
        ...(stringValue(card.type_line) ? { typeLabel: stringValue(card.type_line) } : {}),
        ...(stringValue(card.mana_cost) ? { costLabel: stringValue(card.mana_cost) } : {}),
        faces,
      },
    ],
  }
}

function scryfallLookupError(status: number, cardId: string, lookup: "Card" | "Printing"): never {
  if (status === 429)
    throw new ConvexError({
      code: "scryfall_rate_limited",
      message: "Scryfall requests are paused. Try again shortly.",
      retryAfterMs: SCRYFALL_RATE_LIMIT_BLOCK_MS,
    })
  throw new ConvexError({
    code: "scryfall_unavailable",
    message: `${lookup} lookup failed (Scryfall HTTP ${status}, card ${cardId})`,
  })
}

/** why: new printings of a card are rare, so a week of reuse costs little artwork and saves two Scryfall requests per view. */
const IMAGE_FALLBACK_TTL_MS = 7 * 24 * 60 * 60 * 1000

async function scryfallOracleId(ctx: ActionCtx, cardId: string) {
  const original = await fetchScryfall(ctx, `/cards/${encodeURIComponent(cardId)}`)
  if (!original.ok) scryfallLookupError(original.status, cardId, "Card")
  const value: unknown = await original.json()
  const reference = normalizeScryfallCard(value)
  if (reference) await ctx.runMutation(internal.cards.cache, reference)
  return stringValue(objectRecord(value)?.oracle_id)
}

export async function scryfallImageCandidates(ctx: ActionCtx, cardId: string): Promise<string[]> {
  const cached: {
    oracleId: string
    fallbacks: Doc<"scryfallImageFallbacks"> | null
  } | null = await ctx.runQuery(internal.cards.cachedImageFallbacks, { scryfallId: cardId })
  const fallbacks = cached?.fallbacks
  if (fallbacks && fallbacks.fetchedAt > Date.now() - IMAGE_FALLBACK_TTL_MS) return fallbacks.urls
  /** why: a stored reference uses its own printing ID when Scryfall gave it no oracle identity. */
  const oracleId = cached
    ? cached.oracleId === cardId
      ? undefined
      : cached.oracleId
    : await scryfallOracleId(ctx, cardId)
  if (!oracleId || !/^[\da-f-]{36}$/i.test(oracleId)) return []
  const urls = await scryfallPrintingImages(ctx, cardId, oracleId)
  await ctx.runMutation(internal.cards.cacheImageFallbacks, { oracleId, urls })
  return urls
}

async function scryfallPrintingImages(ctx: ActionCtx, cardId: string, oracleId: string) {
  const response = await fetchScryfall(
    ctx,
    `/cards/search?${new URLSearchParams({ q: `oracleid:${oracleId} lang:en`, unique: "prints", order: "released" })}`,
  )
  if (!response.ok) scryfallLookupError(response.status, cardId, "Printing")
  const page = objectRecord(await response.json())
  // eslint-disable-next-line self-explanatory-code/prefer-self-explanatory-code
  // ponytail: one provider page, expand pagination if this misses usable older artwork.
  return (Array.isArray(page?.data) ? page.data : [])
    .flatMap((value: unknown) => {
      const printing = objectRecord(value)
      if (printing?.oracle_id !== oracleId) return []
      const normalized = normalizeScryfallCard(value)
      return normalized?.imageUrl ? [normalized.imageUrl] : []
    })
    .slice(0, 8)
}
