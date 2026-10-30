import { DeckSyncRepository } from "@/features/decks/decksSync"
import { newestPendingCardWrite, versionWriteOutbox } from "@/features/decks/decksVersionWrites"
import { DeckVersionCacheRepository } from "@/features/decks/deckVersionsCache"
import { loadGuestDeck, type GuestDeck } from "@/features/decks/guestDeck"
import { translate } from "@/i18n/translate"

import { deckFingerprint } from "./deckFingerprint"
import { saveListSnapshot } from "./listSnapshots"

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
  system?: string
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
    if (!local) throw new Error(translate("decks:detail.maybeDeleted"))
    return local.deck.cards.map((card) => ({
      ...card,
      game: card.game ?? local.deck.game ?? "mtg",
    }))
  }
  if (!deck.versionId) return undefined
  const cache = new DeckVersionCacheRepository(ownerId, undefined, deploymentUrl)
  const { pending } = versionWriteOutbox(ownerId, undefined, deploymentUrl).getState()
  const cards =
    newestPendingCardWrite(
      pending,
      deck.versionId,
      (versionId) => cache.mappedVersionId(versionId) ?? versionId,
    )?.cards ?? cache.loadCards(deck.versionId)?.cards
  if (cards === undefined) return undefined
  const cachedDeck = new DeckSyncRepository(ownerId, undefined, deploymentUrl)
    .loadShelf()
    .find((candidate) => candidate.latestVersionId === deck.versionId)
  return cards.map((card) => ({
    ...card,
    game: card.game ?? deck.system ?? cachedDeck?.game ?? "mtg",
  }))
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
  return cached?.deckKey
}

export async function pinDeckChoice(deck: SelectedDeck, ownerId: string) {
  const cards = deck.deckFingerprint ? undefined : chosenDeckCards(deck, ownerId)
  const deckKey = chosenDeckKey(deck, ownerId)
  const fingerprint =
    deck.deckFingerprint ?? (cards === undefined ? undefined : await deckFingerprint(cards))
  if (deckKey && fingerprint && cards) saveListSnapshot(deckKey, fingerprint, cards)
  return {
    deckKey,
    deckVersionId: deck.versionId,
    deckName: deck.name,
    deckFingerprint: fingerprint,
  }
}
