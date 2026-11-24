import type { DeckCard } from "@/features/decks/deckCards"
import { catalogDb } from "@/storage/catalogDb"

import { lookupPrintingPrice, normalizePrintingName } from "./catalogSync"
import { ownedQuantitiesByCardId } from "./collectionStore"

export interface DeckOwnershipItem {
  name: string
  cardId: string
  printingId?: string
  setCode?: string
  needed: number
  owned: number
  missing: number
  unitPriceCents?: number
}

export interface DeckOwnershipSummary {
  totalCards: number
  ownedCards: number
  missingCards: number
  estimatedMissingCents: number
  items: DeckOwnershipItem[]
}

export function computeDeckOwnership(
  game: string,
  cards: readonly DeckCard[],
): DeckOwnershipSummary {
  const byCardId = new Map<
    string,
    { name: string; needed: number; printingId?: string; setCode?: string }
  >()

  for (const card of cards) {
    if (card.quantity <= 0) continue
    const cardId = card.oracleId ?? card.cardId ?? `name:${normalizePrintingName(card.name)}`
    const existing = byCardId.get(cardId)
    if (existing) {
      existing.needed += card.quantity
    } else {
      byCardId.set(cardId, {
        name: card.name,
        needed: card.quantity,
        printingId: card.scryfallId ?? card.printingId,
      })
    }
  }

  const cardIds = [...byCardId.keys()]
  const ownedMap = ownedQuantitiesByCardId(game, cardIds)

  let totalCards = 0
  let ownedCards = 0
  let missingCards = 0
  let estimatedMissingCents = 0
  const items: DeckOwnershipItem[] = []

  for (const [cardId, info] of byCardId) {
    const owned = ownedMap.get(cardId) ?? 0
    const covered = Math.min(info.needed, owned)
    const missing = Math.max(0, info.needed - owned)
    let unitPriceCents: number | undefined
    let setCode: string | undefined

    if (missing > 0) {
      const printing =
        (info.printingId ? catalogDb.getPrinting(game, info.printingId) : undefined) ??
        catalogDb.findPrintingsByCardId(game, cardId)[0] ??
        catalogDb.findPrintingsByName(game, normalizePrintingName(info.name))[0]
      setCode = printing?.setCode
      const lookupId = info.printingId ?? printing?.printingId
      if (lookupId) {
        unitPriceCents = lookupPrintingPrice(game, lookupId, "nonfoil", "NM").retailCents
      }
      if (unitPriceCents !== undefined) {
        estimatedMissingCents += unitPriceCents * missing
      }
    }

    totalCards += info.needed
    ownedCards += covered
    missingCards += missing
    items.push({
      name: info.name,
      cardId,
      printingId: info.printingId,
      setCode,
      needed: info.needed,
      owned,
      missing,
      unitPriceCents,
    })
  }

  return { totalCards, ownedCards, missingCards, estimatedMissingCents, items }
}
