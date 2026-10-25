import { useEffect, useMemo, useReducer } from "react"
import { useConvex } from "convex/react"

import { DeckVersionCacheRepository, type StorableVersionCard } from "./deckVersionsCache"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"

export type SeatDeck = { ownerId: string; versionId: string }

const NO_CARDS: readonly StorableVersionCard[] = []
const readCards = () => (deploymentUrl: string, ownerId: string, versionId: string) =>
  new DeckVersionCacheRepository(ownerId, undefined, deploymentUrl).loadCards(versionId)?.cards ??
  NO_CARDS
const refreshedThisSession = new Set<string>()

/** why: a game is often played offline, so the deck shows from the device cache, and the first fetch per version each session refills that cache. */
export function useSeatDeckCards(deck: SeatDeck | undefined): readonly StorableVersionCard[] {
  const convex = useConvex()
  const ownerId = deck?.ownerId
  const versionId = deck?.versionId
  const [cardsFor, rereadCards] = useReducer(readCards, undefined, readCards)
  const cards = useMemo(
    () => (convex && ownerId && versionId ? cardsFor(convex.url, ownerId, versionId) : NO_CARDS),
    [cardsFor, convex, ownerId, versionId],
  )

  useEffect(() => {
    if (!convex || !ownerId || !versionId) return
    const key = `${convex.url}:${ownerId}:${versionId}`
    if (refreshedThisSession.has(key)) return
    convex
      .query(api.decks.versionCards, { versionId: versionId as Id<"deckVersions"> })
      .then(({ revision, cards }) => {
        const cache = new DeckVersionCacheRepository(ownerId, undefined, convex.url)
        // why: the deck editor caches the same revision with card images, which this text-only read must not overwrite.
        if ((cache.loadCards(versionId)?.revision ?? -1) < revision)
          cache.saveCards(versionId, revision, cards)
        refreshedThisSession.add(key)
        rereadCards()
      })
      .catch(() => {})
  }, [convex, ownerId, versionId])

  return cards
}
