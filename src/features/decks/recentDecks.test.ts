import { act, renderHook } from "@testing-library/react-native"

import { clear } from "@/utils/storage"

import { nextRecentDeckIds, recordRecentDeck, useRecentDecks } from "./recentDecks"

describe("recent decks", () => {
  afterEach(() => {
    clear()
  })

  it("moves an opened deck to the front without duplicates", () => {
    expect(nextRecentDeckIds(["one", "two", "three"], "two")).toEqual(["two", "one", "three"])
  })

  it("keeps the local list bounded", () => {
    const existing = Array.from({ length: 20 }, (_, index) => `deck-${index}`)
    expect(nextRecentDeckIds(existing, "new-deck")).toHaveLength(20)
    expect(nextRecentDeckIds(existing, "new-deck")[0]).toBe("new-deck")
  })

  it("updates a mounted consumer when a deck is opened", () => {
    const hook = renderHook(() => useRecentDecks())

    expect(hook.result.current.deckIds).toEqual([])

    act(() => recordRecentDeck("opened-deck"))

    expect(hook.result.current.deckIds).toEqual(["opened-deck"])
  })
})
