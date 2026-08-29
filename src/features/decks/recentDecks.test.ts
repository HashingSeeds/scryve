import { nextRecentDeckIds } from "./recentDecks"

describe("recent decks", () => {
  it("moves an opened deck to the front without duplicates", () => {
    expect(nextRecentDeckIds(["one", "two", "three"], "two")).toEqual(["two", "one", "three"])
  })

  it("keeps the local list bounded", () => {
    const existing = Array.from({ length: 20 }, (_, index) => `deck-${index}`)
    expect(nextRecentDeckIds(existing, "new-deck")).toHaveLength(20)
    expect(nextRecentDeckIds(existing, "new-deck")[0]).toBe("new-deck")
  })
})
