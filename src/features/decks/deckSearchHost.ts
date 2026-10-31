import { useEffect, useRef, useSyncExternalStore } from "react"

import type { DeckCard } from "./deckCards"
import type { KnownCardEntry } from "./deckVersionsCache"
import type { GuestDeckPayload } from "./guestDeck"

type SearchCard = GuestDeckPayload["cards"][number]

export type DeckSearchHost = {
  game: string
  format: string
  onAdd: (card: SearchCard) => string | undefined
  onRemove: (card: SearchCard) => void
  offlineCandidates?: KnownCardEntry[]
  // why: screens freeze on blur, so the deck screen under /cards never re-renders; read the draft through its store.
  cards: () => DeckCard[]
  subscribe: (listener: () => void) => () => void
}

const hosts = new Map<string, { readonly current: DeckSearchHost | undefined }>()
const listeners = new Set<() => void>()
const notify = () => listeners.forEach((listener) => listener())

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function useHostDeckSearch(deckId: string, host: DeckSearchHost | undefined) {
  const latest = useRef(host)
  useEffect(() => {
    latest.current = host
  })
  const hosting = host !== undefined
  useEffect(() => {
    if (!hosting) return
    hosts.set(deckId, latest)
    notify()
    return () => {
      if (hosts.get(deckId) !== latest) return
      hosts.delete(deckId)
      notify()
    }
  }, [deckId, hosting])
}

export function useDeckSearchHost(deckId: string | undefined) {
  const registration = () => (deckId === undefined ? undefined : hosts.get(deckId))
  // why: the registration, not its host, is the snapshot; the host changes on every deck render and would loop a reader above it.
  return useSyncExternalStore(subscribe, registration, registration)?.current
}
