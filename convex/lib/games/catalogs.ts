import type { ActionCtx } from "../../_generated/server"
import type { GameSystemId } from "../integrations"
import type { NormalizedCard } from "./cards"
import { pokemonCardById, searchPokemon } from "./pokemon"
import { cardsByYgoIds, searchYgo } from "./yugioh"

type ProviderCards = Promise<{ cards: NormalizedCard[]; status: number }>

type CardCatalog = {
  readonly search: (ctx: ActionCtx, query: string, includeImages: boolean) => ProviderCards
  readonly byId: (ctx: ActionCtx, cardId: string, includeImages: boolean) => ProviderCards
}

/** why: keyed by every system that searches a cached provider, so a new system fails typecheck here instead of searching another game's catalog. Magic searches Scryfall directly. */
export const CARD_CATALOGS = {
  ygo: {
    search: searchYgo,
    byId: (ctx, cardId, includeImages) => cardsByYgoIds(ctx, [cardId], includeImages),
  },
  pokemon: { search: searchPokemon, byId: pokemonCardById },
} as const satisfies Record<Exclude<GameSystemId, "mtg">, CardCatalog>
