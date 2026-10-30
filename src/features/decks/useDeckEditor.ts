import { useCallback, useRef, useState } from "react"

import { loadCardDetails } from "./cardDetailsCache"
import { cardDetailsKey } from "./deckCards"
import { editDeck, type DeckEdit, type DeckEdits } from "./deckDraft"

export function applyDeckEdit<Draft extends DeckEdits>(
  current: Draft,
  action: DeckEdit<Draft["cards"][number]>,
  deck: { game: string; format: string },
) {
  let cached: ReturnType<typeof loadCardDetails> | undefined
  return editDeck(current, action, {
    ...deck,
    detailsFor: (card) => (cached ??= loadCardDetails())[cardDetailsKey(card, deck.game)],
  })
}

export function useDeckEditor<Draft extends DeckEdits | undefined>(initial: Draft | (() => Draft)) {
  const [draft, setDraftState] = useState(initial)
  // why: search and scanner taps can land before a re-render, so edits read this ref, which every draft write updates first.
  const latest = useRef(draft)
  const setDraft = useCallback((next: Draft) => {
    latest.current = next
    setDraftState(next)
  }, [])

  function edit(
    action: DeckEdit<NonNullable<Draft>["cards"][number]>,
    deck: { game: string; format: string },
  ) {
    const current = latest.current
    if (!current) return undefined
    const next = applyDeckEdit(current, action, deck)
    if ("error" in next) return next.error
    setDraft(next)
    return undefined
  }

  return { draft, latest, setDraft, edit }
}
