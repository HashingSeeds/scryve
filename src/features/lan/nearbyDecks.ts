import type { LobbyDeckState } from "@/features/connected/LobbySeatList"
import type { MyDecks } from "@/features/decks/LocalDeckChoicesSource"
import type { SharedDeck } from "@/features/decks/sharedDecks"
import { deckFingerprint } from "@/features/stats/deckFingerprint"
import { saveListSnapshot } from "@/features/stats/listSnapshots"

import type { LanSeatDeck, LanSetup } from "./lanGame"
import { DEFAULT_DECK_GAME } from "../../../convex/lib/deckGames"
import { identitySection } from "../../../convex/lib/systems"

const listed = (decks: MyDecks) => (decks === undefined || decks === "unavailable" ? [] : decks)

const latestVersionsOnly = (decks: MyDecks) =>
  listed(decks).map((deck) => ({
    ...deck,
    versions: deck.versions.filter(({ _id }) => _id === deck.latestVersionId),
  }))

export function nearbyDeckState(
  decks: MyDecks,
  signedIn: boolean,
  { system, format }: Pick<LanSetup, "system" | "format">,
): LobbyDeckState {
  if (decks === undefined && signedIn) return { status: "loading" }
  const lifeFromDeck = Boolean(identitySection(system, format)?.startingValueFacet)
  return { status: "ready", value: lifeFromDeck ? latestVersionsOnly(decks) : [...listed(decks)] }
}

export function nearbySeatDeck(
  decks: MyDecks,
  versionId: string,
  { system, format }: Pick<LanSetup, "system" | "format">,
): LanSeatDeck | undefined {
  const deck = listed(decks).find((candidate) =>
    candidate.versions.some(({ _id }) => _id === versionId),
  )
  if (!deck || (deck.game ?? DEFAULT_DECK_GAME) !== system || deck.format !== format)
    return undefined
  return {
    versionId,
    name: deck.name,
    ...(deck.latestVersionId === versionId && deck.startingValue !== undefined
      ? { startingValue: deck.startingValue }
      : {}),
  }
}

/** why: peers see every seat's deck, so a shared deck travels by its key and list fingerprint, never its link. */
export async function nearbySharedSeatDeck(
  { deckKey, deck, startingValue }: SharedDeck,
  { system, format }: Pick<LanSetup, "system" | "format">,
): Promise<LanSeatDeck | undefined> {
  if ((deck.game ?? DEFAULT_DECK_GAME) !== system || deck.format !== format) return undefined
  const cards = deck.cards.map((card) => ({ ...card, game: card.game ?? deck.game ?? "mtg" }))
  const fingerprint = await deckFingerprint(cards)
  saveListSnapshot(deckKey, fingerprint, cards)
  return {
    versionId: deckKey,
    name: deck.name,
    fingerprint,
    ...(startingValue === undefined ? {} : { startingValue }),
  }
}
