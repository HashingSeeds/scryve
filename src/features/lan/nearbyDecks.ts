import type { LobbyDeckState } from "@/features/connected/LobbySeatList"
import type { MyDecks } from "@/features/decks/LocalDeckChoicesSource"

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
