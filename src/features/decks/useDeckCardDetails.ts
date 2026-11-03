import { useEffect, useMemo, useRef, useState } from "react"
import { useConvex } from "convex/react"

import { useConvexOnline } from "@/features/connected/useConvexOnline"

import { fetchCardDetails, loadCardDetails } from "./cardDetailsCache"
import { cardDetailsKey, type DeckCard } from "./deckCards"

export function useDeckCardDetails(game: string, cards: readonly DeckCard[], enabled: boolean) {
  const client = useConvex()
  const online = useConvexOnline()
  const [details, setDetails] = useState(loadCardDetails)
  const [settled, setSettled] = useState<ReadonlySet<string>>(() => new Set())
  const requested = useRef(new Set<string>())
  useEffect(() => {
    if (!enabled || !online) return
    const pending = cards.filter((card) => {
      const key = cardDetailsKey(card, game)
      if (requested.current.has(key)) return false
      requested.current.add(key)
      return true
    })
    if (pending.length === 0) return
    const keys = pending.map((card) => cardDetailsKey(card, game))
    fetchCardDetails(client, game, pending)
      .then(() => setDetails(loadCardDetails()))
      .catch(() => {
        for (const key of keys) requested.current.delete(key)
      })
      .finally(() => setSettled((previous) => new Set([...previous, ...keys])))
  }, [client, enabled, game, cards, online])
  return useMemo(() => {
    const detailsFor = (card: DeckCard) => details[cardDetailsKey(card, game)]
    const detailsPending =
      online && cards.some((card) => !detailsFor(card) && !settled.has(cardDetailsKey(card, game)))
    return { detailsFor, detailsPending }
  }, [cards, details, game, online, settled])
}
