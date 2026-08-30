import { useEffect, useState } from "react"

import { load, save } from "@/utils/storage"

const RECENT_DECKS_KEY = "decks.recentIds"
const RECENT_DECK_LIMIT = 20

function storedRecentDeckIds() {
  const stored = load<unknown>(RECENT_DECKS_KEY)
  if (!Array.isArray(stored)) return []
  return [...new Set(stored.filter((value): value is string => typeof value === "string"))].slice(
    0,
    RECENT_DECK_LIMIT,
  )
}

const listeners = new Set<() => void>()
let recentDeckIds = storedRecentDeckIds()

function notifyRecentDecks() {
  listeners.forEach((listener) => listener())
}

export function recordRecentDeck(deckId: string) {
  const next = nextRecentDeckIds(storedRecentDeckIds(), deckId)
  recentDeckIds = next
  save(RECENT_DECKS_KEY, next)
  notifyRecentDecks()
}

export function nextRecentDeckIds(current: string[], deckId: string) {
  return [deckId, ...current.filter((candidate) => candidate !== deckId)].slice(
    0,
    RECENT_DECK_LIMIT,
  )
}

export function useRecentDecks() {
  const [deckIds, setDeckIds] = useState(() => {
    recentDeckIds = storedRecentDeckIds()
    return recentDeckIds
  })

  useEffect(() => {
    const listener = () => setDeckIds(recentDeckIds)
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  }, [])

  return { deckIds }
}
