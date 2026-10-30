import { act, renderHook } from "@testing-library/react-native"

import { storage } from "@/utils/storage"

import { closedDeckDraft, openDeckDraft } from "./deckDraft"
import { useAccountDeckDraft, useLocalDeckDraft } from "./deckDraftStore"
import { loadGuestDecks, saveGuestDeck } from "./guestDeck"
import { forgetAccountDraft, keepLocalDraft } from "./savedDeckDrafts"

jest.mock("@/utils/crashReporting", () => ({
  ErrorType: { HANDLED: "Handled" },
  reportCrash: jest.fn(),
}))

const modern = { game: "mtg", format: "modern" }
const card = (name: string, quantity = 1) => ({ name, quantity, scryfallId: name })
const names = (cards: { name: string; quantity: number }[] | undefined) =>
  cards?.map(({ name, quantity }) => `${quantity} ${name}`)

beforeEach(() => {
  storage.clearAll()
  loadGuestDecks()
})

it("shares one deck's draft between screens, including a discard", () => {
  const key = { ownerId: "owner-a", deckId: "deck-1" }
  const build = renderHook(() => useAccountDeckDraft(key))
  const search = renderHook(() => useAccountDeckDraft(key))

  act(() => {
    build.result.current.setDraft(
      openDeckDraft({ cards: [card("Rats")], note: "", fromCache: false }),
    )
  })
  act(() => {
    expect(
      search.result.current.edit({ type: "add", card: card("Island") }, modern),
    ).toBeUndefined()
  })
  expect(names(build.result.current.draft.cards)).toEqual(["1 Rats", "1 Island"])
  expect(names(build.result.current.latest.current.cards)).toEqual(["1 Rats", "1 Island"])

  act(() => build.result.current.setDraft(closedDeckDraft))
  expect(search.result.current.draft).toBe(closedDeckDraft)
})

it("keeps drafts of different decks apart", () => {
  const deckOne = renderHook(() => useAccountDeckDraft({ ownerId: "owner-a", deckId: "deck-1" }))
  const otherOwner = renderHook(() => useAccountDeckDraft({ ownerId: "owner-b", deckId: "deck-1" }))
  const deckTwo = renderHook(() => useAccountDeckDraft({ ownerId: "owner-a", deckId: "deck-2" }))

  act(() => {
    deckOne.result.current.setDraft(
      openDeckDraft({ cards: [card("Rats")], note: "", fromCache: false }),
    )
  })

  expect(deckOne.result.current.draft.editing).toBe(true)
  expect(otherOwner.result.current.draft).toBe(closedDeckDraft)
  expect(deckTwo.result.current.draft).toBe(closedDeckDraft)
})

it("restores an account draft saved by an installed build until it is saved and the deck is left", () => {
  const saved = openDeckDraft({ cards: [card("Rats")], note: "Kept", fromCache: false })
  storage.set(
    "scryve.decks.draft.v1.owner-a.deck-1",
    JSON.stringify({ draft: { ...saved, cards: [card("Rats", 2)] }, versionId: "version-1" }),
  )
  const key = { ownerId: "owner-a", deckId: "deck-1" }
  const first = renderHook(() => useAccountDeckDraft(key))
  expect(first.result.current.draft).toMatchObject({ editing: true, note: "Kept" })
  expect(names(first.result.current.draft.cards)).toEqual(["2 Rats"])

  act(() => first.result.current.setDraft(closedDeckDraft))
  forgetAccountDraft("owner-a", "deck-1")
  first.unmount()

  expect(renderHook(() => useAccountDeckDraft(key)).result.current.draft).toBe(closedDeckDraft)
})

it("restores a device deck's draft only while the deck exists", () => {
  const stored = saveGuestDeck({ name: "Scratch", format: "modern", cards: [card("Rats")] })
  keepLocalDraft(stored.localId, {
    deck: { ...stored.deck, cards: [card("Rats"), card("Island")] },
    base: stored.deck,
    revision: { localId: stored.localId, updatedAt: stored.updatedAt },
  })
  const missing = "22222222-2222-4222-8222-222222222222"
  keepLocalDraft(missing, {
    deck: stored.deck,
    base: stored.deck,
    revision: { localId: missing, updatedAt: 1 },
  })

  const restored = renderHook(() => useLocalDeckDraft({ localId: stored.localId }))
  const gone = renderHook(() => useLocalDeckDraft({ localId: missing }))

  expect(names(restored.result.current.draft?.cards)).toEqual(["1 Rats", "1 Island"])
  expect(gone.result.current.draft).toBeUndefined()
})
