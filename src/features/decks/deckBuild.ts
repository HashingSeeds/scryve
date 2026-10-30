import { translate } from "@/i18n/translate"

import { groupedCards, printingKey, type DeckCard } from "./deckCards"

const TYPE_GROUPS = ["creatures", "spells", "artifacts", "lands", "other"] as const
export type TypeGroup = (typeof TYPE_GROUPS)[number]

export function typeGroup(typeLine: string | undefined): TypeGroup {
  if (typeLine === undefined) return "other"
  const front = typeLine.split(" // ")[0]
  if (/\bLand\b/.test(front)) return "lands"
  if (/\bCreature\b/.test(front)) return "creatures"
  if (/\bArtifact\b/.test(front)) return "artifacts"
  return "spells"
}

export function buildSections(
  cards: DeckCard[],
  sections: readonly { id: string; label: string }[],
  typeLineOf?: (card: DeckCard) => string | undefined,
) {
  const grouped = groupedCards(cards, sections)
  if (!typeLineOf) return grouped
  return grouped.flatMap((section) => {
    if (section.board !== "main") return [section]
    return TYPE_GROUPS.flatMap((group) => {
      const data = section.data.filter((card) => typeGroup(typeLineOf(card)) === group)
      if (data.length === 0) return []
      return [
        {
          board: section.board,
          label: translate(`decks:build.group.${group}`),
          data,
          quantity: data.reduce((total, card) => total + card.quantity, 0),
        },
      ]
    })
  })
}

export function countCardChanges(base: readonly DeckCard[], cards: readonly DeckCard[]) {
  const before = new Map(base.map((card) => [printingKey(card), card]))
  const after = new Map(cards.map((card) => [printingKey(card), card]))
  const changed = [...base, ...cards].filter((card) => {
    const was = before.get(printingKey(card))
    const now = after.get(printingKey(card))
    return was?.quantity !== now?.quantity || was?.commanderColor !== now?.commanderColor
  })
  return new Set(changed.map((card) => printingKey({ ...card, section: "" }))).size
}
