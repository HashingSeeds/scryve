import type { ActionCtx } from "../_generated/server"
import { scryfallImageCandidates } from "./games/magic"
import { pokemonImageCandidates } from "./games/pokemon"
import { ygoprodeckImageCandidates } from "./games/yugioh"
import { SYSTEMS, type CatalogProvider, type SystemId } from "./systems"

export async function cardImageCandidates(ctx: ActionCtx, game: SystemId, cardId: string) {
  return await catalogImageCandidates[SYSTEMS[game].integration.capabilities.cardCatalog.provider](
    ctx,
    cardId,
  )
}

const catalogImageCandidates = {
  tcgdex: pokemonImageCandidates,
  ygoprodeck: ygoprodeckImageCandidates,
  scryfall: scryfallImageCandidates,
} satisfies Record<CatalogProvider, (ctx: ActionCtx, cardId: string) => Promise<string[]>>
