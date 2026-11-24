import { storage } from "@/utils/storage"

import { localCardDb } from "./localDb.web"

describe("web local card database", () => {
  beforeEach(() => {
    storage.clearAll()
    localCardDb.clearAll()
  })

  afterEach(() => jest.restoreAllMocks())

  it("persists guest decks, kv entries, and card details synchronously across reads", () => {
    localCardDb.setKv("k1", "v1")
    localCardDb.upsertGuestDeck("d1", "dk1", 100, '{"name":"Web Deck"}')
    localCardDb.setGuestMeta("unreadable", '["bad"]')
    localCardDb.upsertCardDetails(
      [{ key: "sol-ring", payload: '{"typeLine":"Artifact"}', accessedAt: 5 }],
      10,
    )

    expect(localCardDb.getKv("k1")).toBe("v1")
    expect(localCardDb.listGuestDecks()).toEqual([
      { localId: "d1", payload: '{"name":"Web Deck"}' },
    ])
    expect(localCardDb.getGuestMeta("unreadable")).toBe('["bad"]')
    expect(localCardDb.getCardDetail("sol-ring")).toBe('{"typeLine":"Artifact"}')
  })

  it("reflects concurrent per-deck saves and deletes without a shared index race", () => {
    localCardDb.upsertGuestDeck("d1", "dk1", 100, '{"createdAt":1,"name":"First"}')
    localCardDb.upsertGuestDeck("d2", "dk2", 200, '{"createdAt":2,"name":"Second"}')
    localCardDb.deleteGuestDeck("d1")
    localCardDb.upsertGuestDeck("d3", "dk3", 300, '{"createdAt":3,"name":"Third"}')

    expect(localCardDb.listGuestDecks()).toEqual([
      { localId: "d2", payload: '{"createdAt":2,"name":"Second"}' },
      { localId: "d3", payload: '{"createdAt":3,"name":"Third"}' },
    ])
  })

  it("surfaces storage write failures synchronously", () => {
    const spy = jest.spyOn(storage, "set").mockImplementation(() => {
      throw new Error("quota exceeded")
    })
    expect(() => localCardDb.upsertGuestDeck("d1", "dk1", 100, '{"name":"Fail"}')).toThrow(
      "quota exceeded",
    )
    spy.mockRestore()
    expect(localCardDb.listGuestDecks()).toEqual([])
  })
})
