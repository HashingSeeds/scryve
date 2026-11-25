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
    { name: string; nameKey: string; needed: number; printingId?: string; setCode?: string }
  >()

  for (const card of cards) {
    if (card.quantity <= 0) continue
    const printingId = card.scryfallId ?? card.printingId
    const normalized = normalizePrintingName(card.name)
    const nameKey = `name:${normalized}`
    // why: collection entries take the catalog's card ID, falling back to the name key, so a deck card without one resolves the same way.
    const cardId =
      card.oracleId ??
      card.cardId ??
      (printingId ? catalogDb.getPrinting(game, printingId)?.cardId : undefined) ??
      catalogDb.findPrintingsByName(game, normalized)[0]?.cardId ??
      nameKey
    const existing = byCardId.get(cardId)
    if (existing) {
      existing.needed += card.quantity
    } else {
      byCardId.set(cardId, { name: card.name, nameKey, needed: card.quantity, printingId })
    }
  }

  // why: a copy scanned before the catalog knew the card is stored under its name key; a group keyed by that name already counts it.
  const ownedMap = ownedQuantitiesByCardId(game, [
    ...byCardId.keys(),
    ...[...byCardId.values()].map((info) => info.nameKey),
  ])

  let totalCards = 0
  let ownedCards = 0
  let missingCards = 0
  let estimatedMissingCents = 0
  const items: DeckOwnershipItem[] = []

  for (const [cardId, info] of byCardId) {
    const owned =
      (ownedMap.get(cardId) ?? 0) +
      (byCardId.has(info.nameKey) ? 0 : (ownedMap.get(info.nameKey) ?? 0))
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
      const lookupId = printing?.printingId ?? info.printingId
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
