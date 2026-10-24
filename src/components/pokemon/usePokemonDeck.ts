import { useMemo } from "react"

import { useSeatDeckCards, type SeatDeck } from "@/features/decks/useSeatDeckCards"

export type PokemonDeckRow = { cardId: string; name: string; copies: number }
type DeckCard = { category?: string; cardId?: string; name: string; quantity: number }

export function pokemonDeckRows(cards: readonly DeckCard[]): PokemonDeckRow[] {
  const rows = new Map<string, PokemonDeckRow>()
  for (const card of cards) {
    if (card.category?.toLowerCase() !== "pokemon" || !card.cardId) continue
    const row = rows.get(card.cardId)
    if (row) row.copies += card.quantity
    else rows.set(card.cardId, { cardId: card.cardId, name: card.name, copies: card.quantity })
  }
  return [...rows.values()]
}

export function usePokemonDeck(deck: SeatDeck | undefined): PokemonDeckRow[] {
  const cards = useSeatDeckCards(deck)
  return useMemo(() => pokemonDeckRows(cards), [cards])
}
