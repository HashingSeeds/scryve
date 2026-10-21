import { DeckSyncRepository } from "@/features/decks/decksSync"
import { DeckVersionCacheRepository } from "@/features/decks/deckVersionsCache"
import { loadGuestDeck, type GuestDeck } from "@/features/decks/guestDeck"
import { translate } from "@/i18n/translate"

import { deckFingerprint } from "./deckFingerprint"

export type DeckChoice = {
  versionId?: string
  deckKey?: string
  localId?: string
  name: string
  system: string
  format: string
  startingValue?: number
}

export type SelectedDeck = Pick<
  DeckChoice,
  "versionId" | "deckKey" | "localId" | "name" | "startingValue"
> & {
  deckFingerprint?: string
}

export function deckChoiceId(deck: SelectedDeck) {
  return deck.versionId ?? deck.deckKey ?? deck.localId
}

export function localDeckChoices(decks: readonly GuestDeck[]): DeckChoice[] {
  return decks.map((local) => ({
    localId: local.localId,
    deckKey:
      "deckKey" in local && typeof local.deckKey === "string" ? local.deckKey : local.localId,
    name: local.deck.name,
    system: local.deck.game ?? "mtg",
    format: local.deck.format,
    startingValue:
      "startingValue" in local.deck && typeof local.deck.startingValue === "number"
        ? local.deck.startingValue
        : undefined,
  }))
}

export function chosenDeckCards(
  deck: SelectedDeck,
  ownerId: string,
  deploymentUrl = process.env.EXPO_PUBLIC_CONVEX_URL?.trim(),
) {
  if (deck.localId) {
    const local = loadGuestDeck(deck.localId)
    if (!local) throw new Error(translate("decks:guestStorage.changed"))
    return local.deck.cards
  }
  return deck.versionId
    ? new DeckVersionCacheRepository(ownerId, undefined, deploymentUrl).loadCards(deck.versionId)
        ?.cards
    : undefined
}

export function chosenDeckKey(
  deck: SelectedDeck,
  ownerId: string,
  deploymentUrl = process.env.EXPO_PUBLIC_CONVEX_URL?.trim(),
) {
  const key = deck.deckKey ?? deck.localId
  if (key !== undefined) return key
  const cached = new DeckSyncRepository(ownerId, undefined, deploymentUrl)
    .loadShelf()
    .find((candidate) => candidate.latestVersionId === deck.versionId)
  return cached ? (cached.deckKey ?? cached.syncId ?? String(cached._id)) : undefined
}

export async function pinDeckChoice(deck: SelectedDeck, ownerId: string) {
  const cards = deck.deckFingerprint ? undefined : chosenDeckCards(deck, ownerId)
  return {
    deckKey: chosenDeckKey(deck, ownerId),
    deckVersionId: deck.versionId,
    deckName: deck.name,
    deckFingerprint:
      deck.deckFingerprint ?? (cards === undefined ? undefined : await deckFingerprint(cards)),
  }
}
