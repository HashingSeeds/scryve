import { useEffect, useMemo, useReducer } from "react"
import { useConvex } from "convex/react"

import { pinnedListCards } from "@/features/stats/listSnapshots"

import type { DeckCard } from "./deckCards"
import { DeckVersionCacheRepository } from "./deckVersionsCache"
import { loadSharedDeckByKey } from "./sharedDecks"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"

/** why: a synced deck is read by version, a device deck by the list pinned when the game started, and a shared deck from the copy kept on this device. */
export type SeatDeck =
  | { ownerId: string; versionId: string }
  | { deckKey: string; fingerprint: string }
  | { sharedDeckKey: string }

const NO_CARDS: readonly DeckCard[] = []
const readCards = () => (deploymentUrl: string, ownerId: string, versionId: string) =>
  new DeckVersionCacheRepository(ownerId, undefined, deploymentUrl).loadCards(versionId)?.cards ??
  NO_CARDS
const refreshedThisSession = new Set<string>()

/** why: a game is often played offline, so the deck shows from the device cache, and the first fetch per version each session refills that cache. */
export function useSeatDeckCards(deck: SeatDeck | undefined): readonly DeckCard[] {
  const convex = useConvex()
  const ownerId = deck && "versionId" in deck ? deck.ownerId : undefined
  const versionId = deck && "versionId" in deck ? deck.versionId : undefined
  const deckKey = deck && "deckKey" in deck ? deck.deckKey : undefined
  const fingerprint = deck && "deckKey" in deck ? deck.fingerprint : undefined
  const sharedDeckKey = deck && "sharedDeckKey" in deck ? deck.sharedDeckKey : undefined
  const [cardsFor, rereadCards] = useReducer(readCards, undefined, readCards)
  const cards = useMemo(() => {
    if (sharedDeckKey) return loadSharedDeckByKey(sharedDeckKey)?.deck.cards ?? NO_CARDS
    if (deckKey && fingerprint) return pinnedListCards(deckKey, fingerprint) ?? NO_CARDS
    return convex && ownerId && versionId ? cardsFor(convex.url, ownerId, versionId) : NO_CARDS
  }, [cardsFor, convex, ownerId, versionId, deckKey, fingerprint, sharedDeckKey])

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
