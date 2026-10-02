import { storage } from "@/utils/storage"

import {
  acknowledgeGuestDeckImport,
  clearGuestDecks,
  deleteGuestDeck,
  guestDeckLocalId,
  guestDeckRouteId,
  loadGuestDeck,
  loadGuestDecks,
  saveGuestDeck,
  replaceGuestDeck,
} from "./guestDeck"
import { FREE_DECK_LIMIT } from "../../../convex/lib/policy"

const deck = { name: "Scratch", format: "commander", cards: [] }
const legacy = {
  schemaVersion: 1,
  localId: "11111111-1111-4111-8111-111111111111",
  createdAt: 1,
  updatedAt: 2,
  deck: { ...deck, name: "Legacy" },
}

describe("guest deck storage", () => {
  beforeEach(() => {
    storage.clearAll()
    loadGuestDecks()
  })

  it("keeps up to the free deck limit and edits each deck in place", () => {
    const saved = Array.from({ length: FREE_DECK_LIMIT }, (_, index) =>
      saveGuestDeck({ ...deck, name: `Deck ${index}` }, { now: 100 }),
    )
    expect(new Set(saved.map((entry) => entry.localId)).size).toBe(FREE_DECK_LIMIT)
    expect(() => saveGuestDeck({ ...deck, name: "Other" })).toThrow(`Only ${FREE_DECK_LIMIT}`)

    const [first, second] = saved
    const edited = saveGuestDeck({ ...deck, name: "Updated" }, { localId: first.localId, now: 100 })
    expect(edited.localId).toBe(first.localId)
    expect(edited.createdAt).toBe(first.createdAt)
    expect(edited.updatedAt).toBe(101)
    expect(loadGuestDeck(first.localId)?.deck.name).toBe("Updated")
    expect(loadGuestDeck(second.localId)).toEqual(second)
    expect(storage.getString("decks.guest.v2")).toContain('"name":"Updated"')
    expect(() => saveGuestDeck(deck, { localId: "another-deck" })).toThrow("does not match")
  })

  it("deletes one deck and frees its slot", () => {
    const first = saveGuestDeck(deck)
    const second = saveGuestDeck({ ...deck, name: "Second" })
    deleteGuestDeck(first.localId)
    expect(loadGuestDecks()).toEqual([second])
    expect(saveGuestDeck(deck).localId).not.toBe(first.localId)
  })

  it("migrates a v1 deck to the list without changing its identity", () => {
    storage.set("decks.guest.v1", JSON.stringify(legacy))
    expect(loadGuestDecks()).toEqual([legacy])
    expect(storage.getString("decks.guest.v1")).toBeUndefined()
    expect(JSON.parse(storage.getString("decks.guest.v2") ?? "")).toEqual([legacy])
    expect(loadGuestDecks()).toEqual([legacy])
  })

  it("finishes an interrupted migration without duplicating the deck", () => {
    const other = saveGuestDeck(deck)
    storage.set("decks.guest.v2", JSON.stringify([legacy, other]))
    storage.set("decks.guest.v1", JSON.stringify({ ...legacy, deck: deck }))
    expect(loadGuestDecks()).toEqual([legacy, other])
    expect(storage.getString("decks.guest.v1")).toBeUndefined()
  })

  it("keeps a v1 deck readable when the migration write fails, then migrates before writing", () => {
    storage.set("decks.guest.v1", JSON.stringify(legacy))
    const set = jest.spyOn(storage, "set").mockImplementation(() => {
      throw new Error("disk full")
    })
    expect(loadGuestDecks()).toEqual([legacy])
    expect(storage.getString("decks.guest.v1")).toBeDefined()
    set.mockRestore()
    deleteGuestDeck(legacy.localId)
    expect(loadGuestDecks()).toEqual([])
    expect(storage.getString("decks.guest.v1")).toBeUndefined()
  })

  it("does not clear an edited deck when an old import ack arrives", () => {
    const first = saveGuestDeck(deck, { now: 100 })
    const other = saveGuestDeck({ ...deck, name: "Other" }, { now: 100 })
    saveGuestDeck({ ...deck, name: "Updated" }, { localId: first.localId, now: 101 })
    expect(acknowledgeGuestDeckImport(first.localId, first.updatedAt)).toBe(false)
    expect(acknowledgeGuestDeckImport(first.localId, null)).toBe(false)
    expect(loadGuestDeck(first.localId)?.deck.name).toBe("Updated")
    expect(acknowledgeGuestDeckImport(first.localId, 101)).toBe(true)
    expect(loadGuestDecks()).toEqual([other])
  })

  it.each([
    ["v2", "decks.guest.v2"],
    ["v1", "decks.guest.v1"],
  ])("requires explicit deletion before replacing malformed %s data", (_, key) => {
    storage.set(key, "not json")
    expect(loadGuestDecks()).toEqual([])
    expect(() => saveGuestDeck(deck)).toThrow("delete it explicitly")
    clearGuestDecks()
    expect(saveGuestDeck(deck).localId).toBeTruthy()
  })

  it("rejects corrupted card fields without overwriting the stored value", () => {
    const stored = JSON.stringify([
      { ...legacy, deck: { ...deck, cards: [{ name: "Card", quantity: 1, oracleId: {} }] } },
    ])
    storage.set("decks.guest.v2", stored)
    expect(loadGuestDecks()).toEqual([])
    expect(() => saveGuestDeck(deck)).toThrow("delete it explicitly")
    expect(storage.getString("decks.guest.v2")).toBe(stored)
  })

  it("surfaces read failures before attempting a write", () => {
    const read = jest.spyOn(storage, "getString").mockImplementation(() => {
      throw new Error("disk unavailable")
    })
    const write = jest.spyOn(storage, "set")
    expect(() => saveGuestDeck(deck)).toThrow("Unable to read")
    expect(write).not.toHaveBeenCalled()
    read.mockRestore()
    write.mockRestore()
  })

  it("surfaces failed saves", () => {
    const first = saveGuestDeck(deck)
    const saved = storage.getString("decks.guest.v2")
    const set = jest.spyOn(storage, "set").mockImplementation(() => {
      throw new Error("disk full")
    })
    expect(() => saveGuestDeck({ ...deck, name: "Changed" }, { localId: first.localId })).toThrow(
      "Unable to save",
    )
    expect(storage.getString("decks.guest.v2")).toBe(saved)
    expect(loadGuestDecks()).toEqual([first])
    set.mockRestore()
  })

  it("replaces a confirmed slot atomically with a new identity", () => {
    const first = saveGuestDeck(deck)
    const second = saveGuestDeck({ ...deck, name: "Second" })
    const set = jest.spyOn(storage, "set").mockImplementation(() => {
      throw new Error("disk full")
    })
    expect(() => replaceGuestDeck({ ...deck, name: "New deck" }, first.localId)).toThrow(
      "Unable to save",
    )
    expect(loadGuestDecks()).toEqual([first, second])
    set.mockRestore()
    const next = replaceGuestDeck({ ...deck, name: "New deck" }, first.localId)
    expect(next.localId).not.toBe(first.localId)
    expect(loadGuestDecks()).toEqual([next, second])
    expect(() => replaceGuestDeck(deck, first.localId)).toThrow("saved deck changed")
  })

  it("round-trips guest route ids", () => {
    expect(guestDeckLocalId(guestDeckRouteId(legacy.localId))).toBe(legacy.localId)
    expect(guestDeckLocalId("k17abc")).toBeUndefined()
  })
})
