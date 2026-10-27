import { internal } from "../_generated/api"
import type { ActionCtx } from "../_generated/server"
import { compact, type CatalogCard } from "./games/cards"
import { scryfallImageCandidates } from "./games/magic"
import { pokemonImageCandidates } from "./games/pokemon"
import { ygoprodeckImageCandidates } from "./games/yugioh"
import { SYSTEMS, type CatalogProvider, type SystemId } from "./systems"

export async function cardImageCandidates(ctx: ActionCtx, game: SystemId, cardId: string) {
  return await catalogImageCandidates[SYSTEMS[game].integration.capabilities.cardCatalog.provider](
    ctx,
    cardId,
    game,
  )
}

async function syncedImageCandidates(
  ctx: ActionCtx,
  cardId: string,
  game: SystemId,
): Promise<string[]> {
  const card: CatalogCard | null = await ctx.runQuery(internal.cardCatalog.lookupCached, {
    game,
    cardId,
  })
  return compact(card?.faces.flatMap((face) => [face.imageUrl, face.smallImageUrl]) ?? [])
}

const catalogImageCandidates = {
  "tcgdex": pokemonImageCandidates,
  "ygoprodeck": ygoprodeckImageCandidates,
  "scryfall": scryfallImageCandidates,
  "lorcanajson": syncedImageCandidates,
  "fab-cube": syncedImageCandidates,
  "rifthunt": syncedImageCandidates,
} satisfies Record<
  CatalogProvider,
  (ctx: ActionCtx, cardId: string, game: SystemId) => Promise<string[]>
>
