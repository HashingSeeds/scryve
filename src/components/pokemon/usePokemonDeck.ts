import { useEffect, useMemo, useState } from "react"
import { useConvex } from "convex/react"

import { DeckVersionCacheRepository } from "@/features/decks/deckVersionsCache"

import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"

export type SeatDeck = { ownerId: string; versionId: string }
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

/** why: a game is often played offline, so the deck shows from the device cache, and every fetch refills that cache. */
export function usePokemonDeck(deck: SeatDeck | undefined): PokemonDeckRow[] {
  const convex = useConvex()
  const ownerId = deck?.ownerId
  const versionId = deck?.versionId
  const cached = useMemo(() => {
    if (!convex || !ownerId || !versionId) return []
    const stored = new DeckVersionCacheRepository(ownerId, undefined, convex.url).loadCards(
      versionId,
    )
    return stored ? pokemonDeckRows(stored.cards) : []
  }, [convex, ownerId, versionId])
  const [fetched, setFetched] = useState<{ versionId: string; rows: PokemonDeckRow[] }>()

  useEffect(() => {
    if (!convex || !ownerId || !versionId) return
    let active = true
    convex
      .query(api.decks.versionCards, { versionId: versionId as Id<"deckVersions"> })
      .then(({ revision, cards }) => {
        const cache = new DeckVersionCacheRepository(ownerId, undefined, convex.url)
        // why: the deck editor caches the same revision with card images, which this text-only read must not overwrite.
        if ((cache.loadCards(versionId)?.revision ?? -1) < revision)
          cache.saveCards(versionId, revision, cards)
        if (active) setFetched({ versionId, rows: pokemonDeckRows(cards) })
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [convex, ownerId, versionId])

  return fetched && fetched.versionId === versionId ? fetched.rows : cached
}
