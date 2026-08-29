import {
  compact,
  facet,
  normalizeCardName,
  objectRecord,
  stringValue,
  type NormalizedCard,
} from "./cards"
import { internal } from "../../_generated/api"
import type { ActionCtx } from "../../_generated/server"

const BASE_URL = "https://api.tcgdex.net/v2/en"
const REQUEST_INTERVAL_MS = 100
const REQUEST_TIMEOUT_MS = 10_000

function normalizePokemonCard(value: unknown, includeImages: boolean): NormalizedCard | null {
  const card = objectRecord(value)
  const id = stringValue(card?.id)
  const name = stringValue(card?.name)
  if (!id || !name) return null
  const set = objectRecord(card?.set)
  const types = Array.isArray(card?.types)
    ? card.types.filter((item): item is string => typeof item === "string")
    : []
  const legal = objectRecord(card?.legal)
  const imageBase = stringValue(card?.image)
  const typeLabel = compact([
    stringValue(card?.category),
    stringValue(card?.stage),
    types.join("/"),
  ]).join(" · ")
  return {
    game: "pokemon",
    identityNamespace: "tcgdex-card",
    cardId: id,
    name,
    nameNormalized: normalizeCardName(name),
    ...(stringValue(card?.category) ? { category: stringValue(card?.category) } : {}),
    facets: compact([
      facet("stage", card?.stage),
      facet("types", types.join(", ")),
      facet(
        "standardLegal",
        typeof legal?.standard === "boolean" ? String(legal.standard) : undefined,
      ),
      facet(
        "expandedLegal",
        typeof legal?.expanded === "boolean" ? String(legal.expanded) : undefined,
      ),
    ]),
    printings: [
      {
        provider: "tcgdex",
        providerCardId: id,
        printingId: id,
        ...(stringValue(set?.id) ? { setCode: stringValue(set?.id) } : {}),
        ...(stringValue(card?.localId) ? { collectorNumber: stringValue(card?.localId) } : {}),
        ...(stringValue(card?.rarity) ? { rarity: stringValue(card?.rarity) } : {}),
        ...(typeLabel ? { typeLabel } : {}),
        faces: [
          {
            index: 0,
            name,
            ...(imageBase && includeImages
              ? {
                  imageUrl: `${imageBase}/high.webp`,
                  smallImageUrl: `${imageBase}/low.webp`,
                }
              : {}),
          },
        ],
      },
    ],
  }
}

export function normalizePokemonCards(value: unknown, includeImages = true): NormalizedCard[] {
  const candidates = Array.isArray(value) ? value : [value]
  return candidates.flatMap((candidate) => {
    const card = normalizePokemonCard(candidate, includeImages)
    return card ? [card] : []
  })
}

async function request(ctx: ActionCtx, path: string) {
  const waitMs = await ctx.runMutation(internal.externalApiRateLimits.reserve, {
    bucket: "tcgdex:cards",
    intervalMs: REQUEST_INTERVAL_MS,
  })
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs))
  return await fetch(`${BASE_URL}${path}`, {
    headers: { "Accept": "application/json", "User-Agent": "Scryve/1.0" },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
}

export async function searchPokemon(ctx: ActionCtx, query: string, includeImages = true) {
  const response = await request(ctx, `/cards?name=${encodeURIComponent(query)}`)
  if (!response.ok) throw Object.assign(new Error("TCGdex search failed"), { response })
  const summaries = normalizePokemonCards((await response.json()) as unknown, includeImages).slice(
    0,
    20,
  )
  return { cards: summaries, status: response.status }
}

export async function pokemonCardById(ctx: ActionCtx, id: string, includeImages = true) {
  const response = await request(ctx, `/cards/${encodeURIComponent(id)}`)
  if (response.status === 404) return { cards: [], status: response.status }
  if (!response.ok) throw Object.assign(new Error("TCGdex lookup failed"), { response })
  return {
    cards: normalizePokemonCards((await response.json()) as unknown, includeImages),
    status: response.status,
  }
}

export async function pokemonCardSummaries(ctx: ActionCtx, includeImages = true) {
  const response = await request(ctx, "/cards")
  if (!response.ok) throw Object.assign(new Error("TCGdex card list failed"), { response })
  return {
    cards: normalizePokemonCards((await response.json()) as unknown, includeImages),
    status: response.status,
  }
}
