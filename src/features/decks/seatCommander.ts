import { useEffect, useMemo, useState } from "react"
import { useConvex } from "convex/react"

import type { FocusedCardDetails } from "@/components/CardFocusDialog"
import { LocalGameRepository } from "@/features/game/localPersistence"

import { readCardDetail, saveCardDetails } from "./cardDetailsCache"
import { commanderShortName } from "./commanderName"
import { cardDetailsKey, cardSection, type DeckCard } from "./deckCards"
import { useSeatDeckCards, type SeatDeck } from "./useSeatDeckCards"
import { api } from "../../../convex/_generated/api"

export type SeatCommander = { name?: string; power?: number }

export function printedPower(power: string | undefined): number | undefined {
  const value = Number(power)
  return Number.isInteger(value) && value > 0 ? value : undefined
}

export function seatCommander(
  cards: readonly DeckCard[],
  detailsFor: (card: DeckCard) => FocusedCardDetails | undefined,
): SeatCommander & { card?: DeckCard } {
  const commanders = cards.filter((card) => cardSection(card) === "commander")
  if (commanders.length !== 1) return {}
  const [card] = commanders
  return {
    card,
    name: commanderShortName(card.name),
    power: printedPower(detailsFor(card)?.power),
  }
}

const detailFor = (card: DeckCard) => readCardDetail(cardDetailsKey(card, "mtg"))
const refreshedThisSession = new Set<string>()

/** why: a game is often played offline, so the commander reads from the device's deck and card caches, and an online read refreshes the card so a printed power stored after the cache was filled still arrives. */
export function useSeatCommander(deck: SeatDeck | undefined): SeatCommander {
  const convex = useConvex()
  const cards = useSeatDeckCards(deck)
  const cached = useMemo(() => seatCommander(cards, detailFor), [cards])
  const [fetched, setFetched] = useState<{ scryfallId: string; power?: number }>()
  const scryfallId = cached.card?.scryfallId

  useEffect(() => {
    if (!convex || !scryfallId || cached.power !== undefined) return
    if (refreshedThisSession.has(scryfallId)) return
    refreshedThisSession.add(scryfallId)
    let active = true
    convex
      .action(api.cards.byId, {
        scryfallId,
        deviceId: new LocalGameRepository().getDeviceId(),
      })
      .then((reference) => {
        saveCardDetails({ [scryfallId]: { ...readCardDetail(scryfallId), ...reference } })
        if (active) setFetched({ scryfallId, power: printedPower(reference.power) })
      })
      .catch(() => refreshedThisSession.delete(scryfallId))
    return () => {
      active = false
    }
  }, [convex, scryfallId, cached.power])

  const power =
    cached.power ?? (fetched && fetched.scryfallId === scryfallId ? fetched.power : undefined)
  return { name: cached.name, power }
}
