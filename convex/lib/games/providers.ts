import type { CardCatalog } from "./cards"
import type { DeckFeed, DeckLinkSource, DeckListRules } from "./decks"
import { LIMITLESS_FEED, LIMITLESS_LINK } from "./limitless"
import { POKEMON_DECK_LIST, TCGDEX_CATALOG } from "./pokemon"
import { YGOPRODECK_CATALOG } from "./yugioh"
import { YDK_DECK_LIST, YGOPRODECK_FEED, YGOPRODECK_LINK } from "./yugiohDecks"
import type { GameSystemId } from "../integrations"

type GameProvider = {
  readonly catalog: CardCatalog
  readonly deckList: DeckListRules
  readonly deckLink: DeckLinkSource
  readonly deckFeed: DeckFeed | null
}

export type ProviderGame = Exclude<GameSystemId, "mtg">

export const GAME_PROVIDERS: Readonly<Record<ProviderGame, GameProvider>> = {
  ygo: {
    catalog: YGOPRODECK_CATALOG,
    deckList: YDK_DECK_LIST,
    deckLink: YGOPRODECK_LINK,
    deckFeed: YGOPRODECK_FEED,
  },
  pokemon: {
    catalog: TCGDEX_CATALOG,
    deckList: POKEMON_DECK_LIST,
    deckLink: LIMITLESS_LINK,
    deckFeed: LIMITLESS_FEED,
  },
}

export function isProviderGame(game: string | undefined): game is ProviderGame {
  return game !== undefined && Object.hasOwn(GAME_PROVIDERS, game)
}
