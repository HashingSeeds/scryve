import { useEffect, useMemo, useReducer } from "react"
import { useConvex } from "convex/react"

import type { FocusedCardDetails } from "@/components/CardFocusDialog"
import { LocalGameRepository } from "@/features/game/localPersistence"

import { readCardDetail, saveCardDetails } from "./cardDetailsCache"
import { commanderShortName } from "./commanderName"
import { isBackground } from "./commanderSelection"
import { cardDetailsKey, cardSection, type DeckCard } from "./deckCards"
import { useSeatDeckCards, type SeatDeck } from "./useSeatDeckCards"
import { api } from "../../../convex/_generated/api"

export type SeatCommander = { name?: string; power?: number }

export function printedPower(power: string | undefined): number | undefined {
  const value = Number(power)
  return Number.isInteger(value) && value > 0 ? value : undefined
}

/** why: a Background is a commander that never attacks, so a Choose-a-Background deck has one attacker. */
export function seatCommanders(
  cards: readonly DeckCard[],
  detailsFor: (card: DeckCard) => FocusedCardDetails | undefined,
): (SeatCommander & { card: DeckCard })[] {
  const commanders = cards.filter((card) => cardSection(card) === "commander")
  if (commanders.length > 2) return []
  return commanders
    .filter((card) => !isBackground(detailsFor(card)))
    .map((card) => ({
      card,
      name: commanderShortName(card.name),
      power: printedPower(detailsFor(card)?.power),
    }))
}

const readDetail = () => (card: DeckCard) => readCardDetail(cardDetailsKey(card, "mtg"))
const refreshedThisSession = new Set<string>()

/** why: a game is often played offline, so the commanders read from the device's deck and card caches, and an online read refreshes a card so a printed power stored after the cache was filled still arrives. */
export function useSeatCommanders(deck: SeatDeck | undefined): SeatCommander[] {
  const convex = useConvex()
  const cards = useSeatDeckCards(deck)
  const [detailFor, rereadDetails] = useReducer(readDetail, undefined, readDetail)
  const cached = useMemo(() => seatCommanders(cards, detailFor), [cards, detailFor])
  const unpowered = cached
    .flatMap(({ card, power }) => (power === undefined && card.scryfallId ? [card.scryfallId] : []))
    .join(" ")

  useEffect(() => {
    if (!convex) return
    for (const scryfallId of unpowered.split(" ")) {
      if (!scryfallId || refreshedThisSession.has(scryfallId)) continue
      refreshedThisSession.add(scryfallId)
      convex
        .action(api.cards.byId, {
          scryfallId,
          deviceId: new LocalGameRepository().getDeviceId(),
        })
        .then((reference) => {
          saveCardDetails({ [scryfallId]: { ...readCardDetail(scryfallId), ...reference } })
          rereadDetails()
        })
        .catch(() => refreshedThisSession.delete(scryfallId))
    }
  }, [convex, unpowered])

  return useMemo(() => cached.map(({ name, power }) => ({ name, power })), [cached])
}
