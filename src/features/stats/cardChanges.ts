import type { DeckCard } from "@/features/decks/deckCards"

import { canonicalDecklist } from "../../../convex/lib/deckFingerprint"

export function cardChanges(current: readonly DeckCard[], previous: readonly DeckCard[]) {
  const quantities = new Map<string, { name: string; quantity: number }>()
  for (const [cards, sign] of [
    [current, 1],
    [previous, -1],
  ] as const) {
    for (const card of cards) {
      const key = canonicalDecklist([{ ...card, quantity: 1 }])
      const row = quantities.get(key) ?? { name: card.name, quantity: 0 }
      quantities.set(key, { ...row, quantity: row.quantity + card.quantity * sign })
    }
  }
  return [...quantities.values()]
    .filter((row) => row.quantity !== 0)
    .sort((a, b) => Math.sign(b.quantity) - Math.sign(a.quantity) || a.name.localeCompare(b.name))
}

export function formatCardChange(change: ReturnType<typeof cardChanges>[number]) {
  return `${change.quantity > 0 ? "+" : "−"}${Math.abs(change.quantity)} ${change.name}`
}
