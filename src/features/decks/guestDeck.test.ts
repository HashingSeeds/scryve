import { storage } from "@/utils/storage"

import {
  acknowledgeGuestDeckImport,
  deleteGuestDeck,
  loadGuestDeck,
  saveGuestDeck,
  replaceGuestDeck,
} from "./guestDeck"

const deck = { name: "Scratch", format: "commander", cards: [] }

describe("guest deck storage", () => {
  beforeEach(() => {
    storage.clearAll()
    loadGuestDeck()
  })

  it("persists one deck, edits it in place, and reloads it", () => {
    const first = saveGuestDeck(deck, { now: 100 })
    expect(first.localId).toBeTruthy()
    expect(loadGuestDeck()).toEqual(first)

    expect(() => saveGuestDeck({ ...deck, name: "Other" }, { now: 100 })).toThrow("already exists")
    const second = saveGuestDeck({ ...deck, name: "Updated" }, { localId: first.localId, now: 100 })
    expect(second.localId).toBe(first.localId)
    expect(second.createdAt).toBe(first.createdAt)
    expect(second.updatedAt).toBe(101)
    expect(storage.getString("decks.guest.v1")).toContain('"name":"Updated"')
    expect(() => saveGuestDeck(deck, { localId: "another-deck" })).toThrow("does not match")
  })

  it("does not clear an edited deck when an old import ack arrives", () => {
    const first = saveGuestDeck(deck, { now: 100 })
    saveGuestDeck({ ...deck, name: "Updated" }, { localId: first.localId, now: 101 })
    expect(acknowledgeGuestDeckImport(first.localId, first.updatedAt)).toBe(false)
    expect(acknowledgeGuestDeckImport(first.localId, null)).toBe(false)
    expect(loadGuestDeck()?.deck.name).toBe("Updated")
    expect(acknowledgeGuestDeckImport(first.localId, 101)).toBe(true)
    expect(loadGuestDeck()).toBeUndefined()
  })

  it("requires explicit deletion before replacing malformed data", () => {
    storage.set("decks.guest.v1", "not json")
    expect(loadGuestDeck()).toBeUndefined()
    expect(() => saveGuestDeck(deck)).toThrow("delete it explicitly")
    deleteGuestDeck()
    expect(saveGuestDeck(deck).localId).toBeTruthy()
  })

  it("rejects corrupted card fields without overwriting the stored value", () => {
    storage.set(
      "decks.guest.v1",
      JSON.stringify({
        schemaVersion: 1,
        localId: "11111111-1111-4111-8111-111111111111",
        createdAt: 1,
        updatedAt: 1,
        deck: { ...deck, cards: [{ name: "Card", quantity: 1, oracleId: { bad: true } }] },
      }),
    )
    expect(loadGuestDeck()).toBeUndefined()
    expect(() => saveGuestDeck(deck)).toThrow("delete it explicitly")
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
    const saved = storage.getString("decks.guest.v1")
    const set = jest.spyOn(storage, "set").mockImplementation(() => {
      throw new Error("disk full")
    })
    expect(() => saveGuestDeck({ ...deck, name: "Changed" }, { localId: first.localId })).toThrow(
      "Unable to save",
    )
    expect(storage.getString("decks.guest.v1")).toBe(saved)
    expect(loadGuestDeck()).toEqual(first)
    set.mockRestore()
  })

  it("deletes explicitly", () => {
    const first = saveGuestDeck(deck)
    deleteGuestDeck()
    expect(loadGuestDeck()).toBeUndefined()
    expect(saveGuestDeck(deck).localId).not.toBe(first.localId)
  })

  it("replaces a confirmed slot atomically with a new identity", () => {
    const first = saveGuestDeck(deck)
    const set = jest.spyOn(storage, "set").mockImplementation(() => {
      throw new Error("disk full")
    })
    expect(() => replaceGuestDeck({ ...deck, name: "New deck" }, first.localId)).toThrow(
      "Unable to save",
    )
    expect(loadGuestDeck()).toEqual(first)
    set.mockRestore()
    const next = replaceGuestDeck({ ...deck, name: "New deck" }, first.localId)
    expect(next.localId).not.toBe(first.localId)
    expect(loadGuestDeck()?.deck.name).toBe("New deck")
    expect(() => replaceGuestDeck(deck, first.localId)).toThrow("saved deck changed")
  })
})
