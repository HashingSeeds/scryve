import { ConvexError, type Value } from "convex/values"

import { lookupKey, type PastedDeckEntry } from "./pastedDeckList"
import {
  type CardReference,
  fetchScryfall,
  normalizeScryfallCard,
  objectRecord,
  SCRYFALL_RATE_LIMIT_BLOCK_MS,
  scryfallRateLimited,
} from "./scryfall"
import { internal } from "../_generated/api"
import type { ActionCtx } from "../_generated/server"

export const SCRYFALL_COLLECTION_SIZE = 75

export type ScryfallCardLookup = Pick<
  PastedDeckEntry,
  "name" | "scryfallId" | "setCode" | "collectorNumber"
>

type Scope = "exact" | "set" | "name"

function scopeOf(lookup: ScryfallCardLookup): Scope {
  if (lookup.scryfallId || (lookup.setCode && lookup.collectorNumber)) return "exact"
  return lookup.setCode ? "set" : "name"
}

function identifier(lookup: ScryfallCardLookup) {
  if (lookup.scryfallId) return { id: lookup.scryfallId }
  if (lookup.setCode && lookup.collectorNumber)
    return { set: lookup.setCode, collector_number: lookup.collectorNumber }
  /** why: Scryfall's collection endpoint answers not_found for a full two-part name like "Fire // Ice". */
  const name = lookup.name.split(" // ")[0]
  return lookup.setCode ? { name, set: lookup.setCode } : { name }
}

/** why: each scope gets its own request, so a name-only lookup never picks up the printing an exact lookup asked for. */
function keysFor(card: CardReference, scope: Scope) {
  if (scope === "exact")
    return [
      lookupKey(card),
      ...(card.setCode && card.collectorNumber
        ? [
            lookupKey({
              name: card.name,
              setCode: card.setCode,
              collectorNumber: card.collectorNumber,
            }),
          ]
        : []),
    ]
  const names = [card.name, ...card.name.split(" // ")]
  if (scope === "name") return names.map((name) => lookupKey({ name }))
  return card.setCode ? names.map((name) => lookupKey({ name, setCode: card.setCode })) : []
}

async function fetchCollection(ctx: ActionCtx, lookups: readonly ScryfallCardLookup[]) {
  const identifiers = [
    ...new Map(lookups.map(identifier).map((id) => [JSON.stringify(id), id])).values(),
  ]
  const response = await fetchScryfall(ctx, "/cards/collection", {
    method: "POST",
    body: JSON.stringify({ identifiers }),
  })
  if (response.status === 429) scryfallRateLimited(SCRYFALL_RATE_LIMIT_BLOCK_MS)
  if (!response.ok)
    throw new ConvexError({
      code: "scryfall_unavailable",
      message: "Card lookup is temporarily unavailable",
      status: response.status,
    })
  const payload = objectRecord((await response.json()) as unknown)
  if (!Array.isArray(payload?.data))
    throw new ConvexError({
      code: "scryfall_invalid_response",
      message: "Card service returned an invalid response",
    })
  return payload.data
    .map(normalizeScryfallCard)
    .filter((card): card is CardReference => card !== null)
}

/** why: every Magic card lookup goes through here, since a caller that asks Scryfall directly skips the cache and gets rate limited. */
export async function resolveScryfallCards(
  ctx: ActionCtx,
  lookups: readonly ScryfallCardLookup[],
  options: { beforeFetch?: () => Promise<void> } = {},
): Promise<{ found: Map<string, CardReference>; failure?: ConvexError<Value> }> {
  const unique = [
    ...new Map(
      lookups.map(({ name, scryfallId, setCode, collectorNumber }) => {
        const lookup = {
          name,
          ...(scryfallId ? { scryfallId } : {}),
          ...(setCode ? { setCode } : {}),
          ...(collectorNumber ? { collectorNumber } : {}),
        }
        return [lookupKey(lookup), lookup] as const
      }),
    ).values(),
  ]
  const found = new Map<string, CardReference>()
  for (let offset = 0; offset < unique.length; offset += SCRYFALL_COLLECTION_SIZE) {
    const cached: { key: string; card: CardReference }[] = await ctx.runQuery(
      internal.cards.cachedLookups,
      { lookups: unique.slice(offset, offset + SCRYFALL_COLLECTION_SIZE) },
    )
    for (const { key, card } of cached) found.set(key, card)
  }
  const misses = new Map<Scope, ScryfallCardLookup[]>()
  for (const lookup of unique) {
    if (found.has(lookupKey(lookup))) continue
    const scope = scopeOf(lookup)
    misses.set(scope, [...(misses.get(scope) ?? []), lookup])
  }
  if (misses.size === 0) return { found }

  const fetched = new Map<string, CardReference>()
  let failure: ConvexError<Value> | undefined
  try {
    await options.beforeFetch?.()
    for (const [scope, group] of misses) {
      for (let offset = 0; offset < group.length; offset += SCRYFALL_COLLECTION_SIZE) {
        for (const card of await fetchCollection(
          ctx,
          group.slice(offset, offset + SCRYFALL_COLLECTION_SIZE),
        )) {
          fetched.set(card.scryfallId, card)
          for (const key of keysFor(card, scope)) if (!found.has(key)) found.set(key, card)
        }
      }
    }
  } catch (error) {
    if (!(error instanceof ConvexError)) throw error
    failure = error
  }
  if (fetched.size > 0)
    await ctx.runMutation(internal.cards.cacheMany, { cards: [...fetched.values()] })
  return failure ? { found, failure } : { found }
}
