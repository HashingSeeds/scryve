import { useEffect, useState } from "react"

import type { DeckCard } from "@/features/decks/deckCards"
import { DeckSyncRepository } from "@/features/decks/decksSync"
import { loadGuestDecks } from "@/features/decks/guestDeck"

import { chosenDeckCards } from "./deckChoices"
import { deckFingerprint } from "./deckFingerprint"
import { lookupListSnapshot } from "./listSnapshots"

async function currentListFingerprint(
  deckKey: string,
  ownerId: string,
  deploymentUrl = process.env.EXPO_PUBLIC_CONVEX_URL?.trim(),
) {
  const local = loadGuestDecks().find((deck) => (deck.deckKey ?? deck.localId) === deckKey)
  const versionId = new DeckSyncRepository(ownerId, undefined, deploymentUrl)
    .loadShelf()
    .find((deck) => (deck.deckKey ?? deck.syncId ?? String(deck._id)) === deckKey)?.latestVersionId
  const cards = local
    ? chosenDeckCards({ localId: local.localId, name: local.deck.name }, ownerId)
    : versionId
      ? chosenDeckCards({ versionId, name: "" }, ownerId)
      : undefined
  return cards && (await deckFingerprint(cards))
}

export function useListCards(deckKey: string, ownerId: string | undefined, fingerprints: string[]) {
  const [found, setFound] = useState<{
    currentFingerprint?: string
    cards: ReadonlyMap<string, readonly DeckCard[]>
  }>({ cards: new Map() })
  const wanted = fingerprints.join(",")
  useEffect(() => {
    if (!ownerId) return
    let cancelled = false
    Promise.all([
      currentListFingerprint(deckKey, ownerId).catch(() => undefined),
      Promise.all(
        wanted
          .split(",")
          .filter(Boolean)
          .map(
            async (fingerprint) =>
              [fingerprint, await lookupListSnapshot(deckKey, fingerprint, ownerId)] as const,
          ),
      ),
    ])
      .then(([currentFingerprint, lists]) => {
        if (!cancelled)
          setFound({
            currentFingerprint,
            cards: new Map(
              lists.flatMap(([fingerprint, cards]) => (cards ? [[fingerprint, cards]] : [])),
            ),
          })
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [deckKey, ownerId, wanted])
  return found
}
