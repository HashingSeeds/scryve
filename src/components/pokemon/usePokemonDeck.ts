import { useEffect, useState } from "react"
import { useConvex } from "convex/react"
import type { FunctionReturnType } from "convex/server"

import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"

type DeckCard = FunctionReturnType<typeof api.decks.versionCards>[number]
export type PokemonDeckRow = { cardId: string; name: string; copies: number }

export function pokemonDeckRows(cards: readonly DeckCard[]): PokemonDeckRow[] {
  const rows = new Map<string, PokemonDeckRow>()
  for (const card of cards) {
    if (card.category !== "Pokemon" || !card.cardId) continue
    const row = rows.get(card.cardId)
    if (row) row.copies += card.quantity
    else rows.set(card.cardId, { cardId: card.cardId, name: card.name, copies: card.quantity })
  }
  return [...rows.values()]
}

export function usePokemonDeck(versionId: string | undefined): PokemonDeckRow[] {
  const convex = useConvex()
  const [loaded, setLoaded] = useState<{ versionId: string; rows: PokemonDeckRow[] }>()

  useEffect(() => {
    if (!convex || !versionId) return
    let active = true
    convex
      .query(api.decks.versionCards, { versionId: versionId as Id<"deckVersions"> })
      .then((cards) => {
        if (active) setLoaded({ versionId, rows: pokemonDeckRows(cards) })
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [convex, versionId])

  return loaded && loaded.versionId === versionId ? loaded.rows : []
}
