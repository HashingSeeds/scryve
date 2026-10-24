import { useEffect, useMemo, useState } from "react"
import { useConvex } from "convex/react"

import { DeckVersionCacheRepository, type StorableVersionCard } from "./deckVersionsCache"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"

export type SeatDeck = { ownerId: string; versionId: string }

const NO_CARDS: readonly StorableVersionCard[] = []

/** why: a game is often played offline, so the deck shows from the device cache, and every fetch refills that cache. */
export function useSeatDeckCards(deck: SeatDeck | undefined): readonly StorableVersionCard[] {
  const convex = useConvex()
  const ownerId = deck?.ownerId
  const versionId = deck?.versionId
  const cached = useMemo(() => {
    if (!convex || !ownerId || !versionId) return NO_CARDS
    return (
      new DeckVersionCacheRepository(ownerId, undefined, convex.url).loadCards(versionId)?.cards ??
      NO_CARDS
    )
  }, [convex, ownerId, versionId])
  const [fetched, setFetched] = useState<{
    versionId: string
    cards: readonly StorableVersionCard[]
  }>()

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
        if (active) setFetched({ versionId, cards })
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [convex, ownerId, versionId])

  return fetched && fetched.versionId === versionId ? fetched.cards : cached
}
