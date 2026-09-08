export type DeckCard = {
  game?: string
  identityNamespace?: string
  cardId?: string
  providerCardId?: string
  printingId?: string
  section?: string
  entryKind?: string
  originalReference?: string
  category?: string
  oracleId?: string
  scryfallId?: string
  name: string
  imageUrl?: string
  smallImageUrl?: string
  quantity: number
  board?: "main" | "sideboard" | "commander"
}

export function cardSection(card: DeckCard) {
  return card.section ?? card.board ?? "main"
}

export function printingKey(card: DeckCard) {
  const identity =
    card.printingId ??
    card.providerCardId ??
    card.scryfallId ??
    card.cardId ??
    card.oracleId ??
    card.originalReference ??
    card.name
  return `${cardSection(card)}:${identity}`
}

export function groupedCards(
  cards: DeckCard[],
  sections: readonly { id: string; label: string }[],
) {
  const known = sections.map((section) => {
    const boardCards = cards.filter((card) => cardSection(card) === section.id)
    return {
      board: section.id,
      label: section.label,
      data: boardCards,
      quantity: boardCards.reduce((total, card) => total + card.quantity, 0),
    }
  })
  const knownIds = new Set(sections.map((section) => section.id))
  const extraIds = [...new Set(cards.map(cardSection).filter((id) => !knownIds.has(id)))]
  const extra = extraIds.map((board) => {
    const boardCards = cards.filter((card) => cardSection(card) === board)
    return {
      board,
      label: board.charAt(0).toUpperCase() + board.slice(1),
      data: boardCards,
      quantity: boardCards.reduce((total, card) => total + card.quantity, 0),
    }
  })
  return [...known, ...extra].filter((section) => section.data.length > 0)
}

export function totalQuantity(cards: DeckCard[]) {
  return cards.reduce((total, card) => total + card.quantity, 0)
}
