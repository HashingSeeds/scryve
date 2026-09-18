import { ConvexError } from "convex/values"

import type { ActionCtx } from "../_generated/server"
import { objectRecord, stringValue } from "./games/cards"
import { pokemonImageCandidates } from "./games/pokemon"
import { cardsByYgoIds } from "./games/yugioh"
import { SCRYFALL_RATE_LIMIT_BLOCK_MS, fetchScryfall, normalizeScryfallCard } from "./scryfall"

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

export async function cardImageCandidates(ctx: ActionCtx, game: string, cardId: string) {
  if (game === "pokemon") return await pokemonImageCandidates(ctx, cardId)
  if (game === "ygo") {
    if (cardId.startsWith("rush:")) return []
    const result = await cardsByYgoIds(ctx, [cardId])
    return result.cards
      .flatMap((card) =>
        card.printings.flatMap((printing) => printing.faces.flatMap((face) => face.imageUrl ?? [])),
      )
      .slice(0, 8)
  }
  const original = await fetchScryfall(ctx, `/cards/${encodeURIComponent(cardId)}`)
  if (!original.ok) scryfallLookupError(original.status, cardId, "Card")
  const card = objectRecord(await original.json())
  const oracleId = stringValue(card?.oracle_id)
  if (!oracleId || !/^[\da-f-]{36}$/i.test(oracleId)) return []
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
