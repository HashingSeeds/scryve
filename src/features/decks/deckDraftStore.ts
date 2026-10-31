import { useSyncExternalStore } from "react"

import { closedDeckDraft, type DeckDraft, type DeckEdit, type DeckEdits } from "./deckDraft"
import { loadGuestDeck, type GuestDeckPayload } from "./guestDeck"
import { loadAccountDraft, loadLocalDraft } from "./savedDeckDrafts"
import { applyDeckEdit } from "./useDeckEditor"

type GuestCard = GuestDeckPayload["cards"][number]
export type LocalDeckDraft = GuestDeckPayload &
  Pick<DeckEdits<GuestCard>, "undo" | "commanderSelected">

export type AccountDeckKey = { ownerId: string | undefined; deckId: string }
export type LocalDeckKey = { localId: string }

type Entry<Draft> = {
  current: Draft
  set: (next: Draft) => void
  subscribe: (listener: () => void) => () => void
}

// why: an entry is dropped when its last screen unmounts, so a reopened deck reads saved drafts again and an open draft with no changes does not come back.
function deckDraftStore<Key, Draft extends DeckEdits | undefined>(
  idOf: (key: Key) => string,
  seed: (key: Key) => Draft,
) {
  const entries = new Map<string, Entry<Draft>>()

  function entryFor(key: Key) {
    const id = idOf(key)
    const existing = entries.get(id)
    if (existing) return existing
    const listeners = new Set<() => void>()
    const entry: Entry<Draft> = {
      current: seed(key),
      set: (next) => {
        entry.current = next
        listeners.forEach((listener) => listener())
      },
      subscribe: (listener) => {
        listeners.add(listener)
        entries.set(id, entry)
        return () => {
          listeners.delete(listener)
          if (listeners.size === 0 && entries.get(id) === entry) entries.delete(id)
        }
      },
    }
    entries.set(id, entry)
    return entry
  }

  return function useDeckDraft(key: Key) {
    const entry = entryFor(key)
    const getDraft = () => entry.current
    const draft = useSyncExternalStore(entry.subscribe, getDraft, getDraft)

    function edit(
      action: DeckEdit<NonNullable<Draft>["cards"][number]>,
      deck: { game: string; format: string },
    ) {
      const current = entry.current
      if (!current) return undefined
      const next = applyDeckEdit(current, action, deck)
      if ("error" in next) return next.error
      entry.set(next)
      return undefined
    }

    // why: `latest` reads the store directly, so taps that land before a re-render still edit the newest draft.
    const latest: { readonly current: Draft } = entry
    return { draft, latest, setDraft: entry.set, edit, subscribe: entry.subscribe }
  }
}

export const useAccountDeckDraft = deckDraftStore<AccountDeckKey, DeckDraft>(
  ({ ownerId, deckId }) => `${ownerId ?? "signed-out"}.${deckId}`,
  ({ ownerId, deckId }) => loadAccountDraft(ownerId, deckId)?.draft ?? closedDeckDraft,
)

export const useLocalDeckDraft = deckDraftStore<LocalDeckKey, LocalDeckDraft | undefined>(
  ({ localId }) => localId,
  ({ localId }) => {
    const stored = loadGuestDeck(localId)
    return (stored && loadLocalDraft(localId)?.deck) ?? stored?.deck
  },
)
