import type { ActionCtx } from "../_generated/server"
import { objectRecord, stringValue } from "./games/cards"
import { pokemonImageCandidates } from "./games/pokemon"
import { cardsByYgoIds } from "./games/yugioh"
import { fetchScryfall, normalizeScryfallCard } from "./scryfall"

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
  if (!original.ok)
    throw new Error(`Card lookup failed (Scryfall HTTP ${original.status}, card ${cardId})`)
  const card = objectRecord(await original.json())
  const oracleId = stringValue(card?.oracle_id)
  if (!oracleId || !/^[\da-f-]{36}$/i.test(oracleId)) return []
  const response = await fetchScryfall(
    ctx,
    `/cards/search?${new URLSearchParams({ q: `oracleid:${oracleId} lang:en`, unique: "prints", order: "released" })}`,
  )
  if (!response.ok)
    throw new Error(`Printing lookup failed (Scryfall HTTP ${response.status}, card ${cardId})`)
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
