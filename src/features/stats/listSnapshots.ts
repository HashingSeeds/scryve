import type { DeckCard } from "@/features/decks/deckCards"
import { DeckSyncRepository } from "@/features/decks/decksSync"
import { DeckVersionCacheRepository } from "@/features/decks/deckVersionsCache"
import { loadGuestDecks } from "@/features/decks/guestDeck"
import { load, save } from "@/utils/storage"

import { deckFingerprint } from "./deckFingerprint"

type Snapshot = { fingerprint: string; cards: DeckCard[] }

function snapshotsKey(deckKey: string) {
  return `scryve.stats.lists.v1.${deckKey}`
}

function snapshots(deckKey: string) {
  const value = load(snapshotsKey(deckKey))
  if (!Array.isArray(value)) return []
  return value.filter(
    (item): item is Snapshot =>
      typeof item === "object" &&
      item !== null &&
      typeof item.fingerprint === "string" &&
      Array.isArray(item.cards) &&
      item.cards.every(
        (card: unknown) =>
          typeof card === "object" &&
          card !== null &&
          "name" in card &&
          typeof card.name === "string" &&
          "quantity" in card &&
          typeof card.quantity === "number" &&
          Number.isSafeInteger(card.quantity) &&
          card.quantity > 0,
      ),
  )
}

export function saveListSnapshot(deckKey: string, fingerprint: string, cards: DeckCard[]) {
  return save(
    snapshotsKey(deckKey),
    [
      { fingerprint, cards },
      ...snapshots(deckKey).filter((row) => row.fingerprint !== fingerprint),
    ].slice(0, 20),
  )
}

export async function lookupListSnapshot(
  deckKey: string,
  fingerprint: string,
  ownerId: string,
  deploymentUrl = process.env.EXPO_PUBLIC_CONVEX_URL?.trim(),
) {
  const stored = snapshots(deckKey).find((row) => row.fingerprint === fingerprint)
  if (stored) return stored.cards
  const local = loadGuestDecks().find((deck) => (deck.deckKey ?? deck.localId) === deckKey)
  if (local && (await deckFingerprint(local.deck.cards)) === fingerprint) return local.deck.cards
  const sync = new DeckSyncRepository(ownerId, undefined, deploymentUrl)
  const metadata = sync.loadMetadata().find((deck) => deck.deckKey === deckKey)
  const shelf = sync.loadShelf().find((deck) => deck.deckKey === deckKey)
  const deckId = metadata?.deckId ?? shelf?._id
  if (!deckId) return undefined
  const cache = new DeckVersionCacheRepository(ownerId, undefined, deploymentUrl)
  const versionIds = new Set(cache.loadVersions(deckId).map((version) => version.versionId))
  if (shelf?.latestVersionId) versionIds.add(shelf.latestVersionId)
  for (const versionId of versionIds) {
    const cards = cache.loadCards(versionId)?.cards
    if (cards && (await deckFingerprint(cards)) === fingerprint) return cards
  }
  return undefined
}
