import type { FunctionReturnType } from "convex/server"

import type { DeckChoice } from "@/features/stats/deckChoices"
import { load, save } from "@/utils/storage"

import { isGuestDeckPayload, type GuestDeckPayload } from "./guestDeck"
import { isShareToken } from "./shareLinks"
import type { api } from "../../../convex/_generated/api"

export type SharedDeckView = NonNullable<FunctionReturnType<typeof api.decks.shared>>

/** why: game setup pins its cards from this copy, so a shared deck plays offline without becoming one of your decks. */
export type SharedDeck = {
  token: string
  deckKey: string
  deck: GuestDeckPayload
  startingValue?: number
}

const SHARED_DECKS_KEY = "decks.shared.v1"
const SHARED_DECK_LIMIT = 20

export function sharedDeckPayload({ name, game, format, cards }: SharedDeckView): GuestDeckPayload {
  return { name, game, format, cards }
}

function isSharedDeck(value: unknown): value is SharedDeck {
  if (typeof value !== "object" || value === null) return false
  const { token, deckKey, deck, startingValue } = value as Record<string, unknown>
  return (
    typeof token === "string" &&
    isShareToken(token) &&
    typeof deckKey === "string" &&
    /^shared-[0-9a-f]{32}$/.test(deckKey) &&
    isGuestDeckPayload(deck) &&
    (startingValue === undefined || typeof startingValue === "number")
  )
}

export function loadSharedDecks(): SharedDeck[] {
  const stored = load(SHARED_DECKS_KEY)
  return Array.isArray(stored) ? stored.filter(isSharedDeck) : []
}

export function loadSharedDeck(token: string) {
  return loadSharedDecks().find((shared) => shared.token === token)
}

// why: the owner may have changed the deck since, so the latest view replaces the copy kept before.
export function keepSharedDeck(view: SharedDeckView, token: string) {
  const shared: SharedDeck = {
    token,
    deckKey: view.deckKey,
    deck: sharedDeckPayload(view),
    ...(view.startingValue === undefined ? {} : { startingValue: view.startingValue }),
  }
  return save(
    SHARED_DECKS_KEY,
    [shared, ...loadSharedDecks().filter((kept) => kept.token !== token)].slice(
      0,
      SHARED_DECK_LIMIT,
    ),
  )
}

export function sharedDeckChoices(decks: readonly SharedDeck[]): DeckChoice[] {
  return decks.map(({ token, deckKey, deck, startingValue }) => ({
    sharedToken: token,
    deckKey,
    name: deck.name,
    system: deck.game ?? "mtg",
    format: deck.format,
    startingValue,
  }))
}
