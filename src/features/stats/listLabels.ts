import type { DeckCard } from "@/features/decks/deckCards"

import { cardChanges } from "./cardChanges"
import type { listStats } from "./deckStatsMath"

export const LISTS_WITH_CHANGES = 5

export type LabeledList = ReturnType<typeof listStats>[number] & {
  kind: "current" | "dated" | "untracked"
  changes: ReturnType<typeof cardChanges>
}

export function fingerprintsToRead(rows: readonly { fingerprint: string | null }[]) {
  return rows
    .flatMap((row) => (row.fingerprint === null ? [] : [row.fingerprint]))
    .slice(0, LISTS_WITH_CHANGES + 1)
}

export function labelLists(
  rows: ReturnType<typeof listStats>,
  context: {
    currentFingerprint?: string
    cards: ReadonlyMap<string, readonly DeckCard[]>
  },
): LabeledList[] {
  const tracked = rows.filter((row) => row.fingerprint !== null)
  return rows.map((row) => {
    if (row.fingerprint === null) return { ...row, kind: "untracked", changes: [] }
    const index = tracked.indexOf(row)
    const previous = tracked[index + 1]?.fingerprint
    const cards = context.cards.get(row.fingerprint)
    const previousCards = previous ? context.cards.get(previous) : undefined
    return {
      ...row,
      kind: row.fingerprint === context.currentFingerprint ? "current" : "dated",
      changes:
        index < LISTS_WITH_CHANGES && cards && previousCards
          ? cardChanges(cards, previousCards)
          : [],
    }
  })
}
