import { useCallback, useState } from "react"

import { load, save } from "@/utils/storage"

const RECENT_DECKS_KEY = "decks.recentIds"
const RECENT_DECK_LIMIT = 20

function storedRecentDeckIds() {
  const stored = load<unknown>(RECENT_DECKS_KEY)
  if (!Array.isArray(stored)) return []
  return stored
    .filter((value): value is string => typeof value === "string")
    .slice(0, RECENT_DECK_LIMIT)
}

export function nextRecentDeckIds(current: string[], deckId: string) {
  return [deckId, ...current.filter((candidate) => candidate !== deckId)].slice(
    0,
    RECENT_DECK_LIMIT,
  )
}

export function useRecentDecks() {
  const [deckIds, setDeckIds] = useState(storedRecentDeckIds)

  const recordDeckOpened = useCallback((deckId: string) => {
    setDeckIds((current) => {
      const next = nextRecentDeckIds(current, deckId)
      save(RECENT_DECKS_KEY, next)
      return next
    })
  }, [])

  return { deckIds, recordDeckOpened }
}
