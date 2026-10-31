import { Platform } from "react-native"

import { storage } from "@/utils/storage"

import {
  acknowledgeGuestDeckImport,
  addGuestDeckVersion,
  clearGuestDecks,
  deleteGuestDeck,
  deleteGuestDeckVersion,
  guestDeckBringing,
  guestDeckVersions,
  guestDeckLocalId,
  guestDeckRouteId,
  loadGuestDeck,
  loadGuestDecks,
  saveGuestDeck,
  setGuestDeckBringing,
  updateGuestDeckVersion,
} from "./guestDeck"
import { FREE_DECK_LIMIT } from "../../../convex/lib/policy"

jest.mock("@/utils/crashReporting", () => ({
  ErrorType: { HANDLED: "Handled" },
  reportCrash: jest.fn(),
}))

const deck = { name: "Scratch", format: "commander", cards: [] }
const legacy = {
  schemaVersion: 1,
  localId: "11111111-1111-4111-8111-111111111111",
  createdAt: 1,
  updatedAt: 2,
  deck: { ...deck, name: "Legacy" },
}

describe("guest deck storage", () => {
  afterEach(() => jest.restoreAllMocks())
  beforeEach(() => {
    storage.clearAll()
    loadGuestDecks()
  })

  it("keeps more decks than the synced deck limit and edits each deck in place", () => {
    const saved = Array.from({ length: FREE_DECK_LIMIT + 3 }, (_, index) =>
      saveGuestDeck({ ...deck, name: `Deck ${index}` }, { now: 100 }),
    )
    expect(new Set(saved.map((entry) => entry.localId)).size).toBe(FREE_DECK_LIMIT + 3)

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

  it("keeps valid decks usable and preserves an unreadable one through saves", () => {
    const valid = { ...legacy, localId: "22222222-2222-4222-8222-222222222222" }
    const invalid = {
      ...legacy,
      deck: { ...deck, cards: [{ name: "Card", quantity: 1, oracleId: {} }] },
    }
    storage.set("decks.guest.v2", JSON.stringify([legacy, invalid, valid, { ...valid, deck }]))
    expect(loadGuestDecks()).toEqual([legacy, valid])
    const saved = saveGuestDeck(deck)
    saveGuestDeck({ ...deck, name: "Edited" }, { localId: valid.localId })
    deleteGuestDeck(legacy.localId)
    expect(loadGuestDecks().map((entry) => entry.localId)).toEqual([valid.localId, saved.localId])
    expect(JSON.parse(storage.getString("decks.guest.v2") ?? "")).toEqual(
      expect.arrayContaining([invalid, { ...valid, deck }]),
    )
  })

  it("surfaces read failures before attempting a write", () => {
    const read = jest.spyOn(storage, "getString").mockImplementation(() => {
      throw new Error("disk unavailable")
    })
    const write = jest.spyOn(storage, "set")
    loadGuestDecks()
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

  it("defaults keys to localId and persists them through edits and reloads", () => {
    const saved = saveGuestDeck(deck)
    expect(saved.deckKey).toBe(saved.localId)
    const edited = saveGuestDeck({ ...deck, name: "Edited" }, { localId: saved.localId })
    expect(edited.deckKey).toBe(saved.deckKey)
    expect(loadGuestDecks()[0].deckKey).toBe(saved.deckKey)
    expect(saveGuestDeck(edited.deck).deckKey).not.toBe(saved.deckKey)
  })

  it("keeps a supplied key immutable and reads old decks without a key", () => {
    const saved = saveGuestDeck(deck, { deckKey: "server-key" })
    expect(saveGuestDeck(deck, { localId: saved.localId }).deckKey).toBe("server-key")
    expect(() => saveGuestDeck(deck, { localId: saved.localId, deckKey: "other" })).toThrow(
      "cannot change",
    )
    storage.set("decks.guest.v2", JSON.stringify([legacy]))
    loadGuestDecks()
    expect(saveGuestDeck(deck, { localId: legacy.localId }).deckKey).toBe(legacy.localId)
  })

  it("keeps another tab's deck when writing from a stale snapshot", () => {
    jest.replaceProperty(Platform, "OS", "web")
    const first = saveGuestDeck(deck)
    storage.set("decks.guest.v2", JSON.stringify([first, legacy]))

    const second = saveGuestDeck({ ...deck, name: "Second" })

    expect(loadGuestDecks()).toEqual([first, legacy, second])
    expect(JSON.parse(storage.getString("decks.guest.v2") ?? "")).toEqual([first, legacy, second])
  })

  it("uses the native snapshot for saves and acknowledgments without rereading storage", () => {
    jest.replaceProperty(Platform, "OS", "ios")
    const first = saveGuestDeck(deck, { now: 100 })
    const read = jest.spyOn(storage, "getString")
    const edited = saveGuestDeck({ ...deck, name: "Edited" }, { localId: first.localId })
    const second = saveGuestDeck(deck)
    expect(acknowledgeGuestDeckImport(edited.localId, edited.updatedAt)).toBe(true)
    expect(read).not.toHaveBeenCalled()
    read.mockRestore()
    expect(loadGuestDecks()).toEqual([second])
  })

  it("keeps the moved flag through edits and reloads", () => {
    const saved = saveGuestDeck(deck, { movedFromAccount: true })
    saveGuestDeck({ ...deck, name: "Edited" }, { localId: saved.localId })
    expect(loadGuestDecks()[0].movedFromAccount).toBe(true)
    storage.set("decks.guest.v2", JSON.stringify([{ ...saved, movedFromAccount: "yes" }]))
    expect(loadGuestDecks()).toEqual([])
  })

  describe("versions", () => {
    const bolt = [{ name: "Lightning Bolt", quantity: 4 }]
    const shock = [{ name: "Shock", quantity: 4 }]
    const stored = () => JSON.parse(storage.getString("decks.guest.v2") ?? "[]")[0]

    it("reads a deck stored before versions as its only version, and saves it in that format", () => {
      storage.set("decks.guest.v2", JSON.stringify([{ ...legacy, deck: { ...deck, cards: bolt } }]))
      const [old] = loadGuestDecks()
      expect(guestDeckVersions(old)).toEqual([
        { number: 1, name: "Current", createdAt: 1, updatedAt: 2, cards: bolt },
      ])
      expect(guestDeckBringing(old)).toBe(1)
      saveGuestDeck({ ...deck, cards: shock }, { localId: old.localId, version: 1 })
      expect(stored()).not.toHaveProperty("versions")
      expect(stored().deck.cards).toEqual(shock)
    })

    it("adds a version that becomes the list older builds read", () => {
      const saved = saveGuestDeck({ ...deck, cards: bolt })
      addGuestDeckVersion(saved.localId, { name: "Tuned", note: "More reach", cards: shock }, 2)
      expect(stored().deck.cards).toEqual(shock)
      expect(stored().versions).toEqual([
        expect.objectContaining({ number: 1, name: "Current", cards: bolt }),
        expect.not.objectContaining({ cards: expect.anything() }),
      ])
      expect(guestDeckVersions(loadGuestDecks()[0])).toEqual([
        expect.objectContaining({ number: 1, cards: bolt }),
        expect.objectContaining({ number: 2, name: "Tuned", note: "More reach", cards: shock }),
      ])
    })

    it("refuses a version past the limit and keeps the deck as it was", () => {
      const saved = saveGuestDeck({ ...deck, cards: bolt })
      addGuestDeckVersion(saved.localId, { name: "Tuned", cards: shock }, 2)
      const before = storage.getString("decks.guest.v2")
      expect(() => addGuestDeckVersion(saved.localId, { name: "Third", cards: [] }, 2)).toThrow(
        "This deck holds up to 2 versions. Delete one to add another.",
      )
      expect(storage.getString("decks.guest.v2")).toBe(before)
      expect(() =>
        addGuestDeckVersion(saved.localId, { name: "Third", cards: [] }, 5),
      ).not.toThrow()
    })

    it("saves into the chosen version and leaves the others alone", () => {
      const saved = saveGuestDeck({ ...deck, cards: bolt })
      addGuestDeckVersion(saved.localId, { name: "Tuned", cards: shock }, 2)
      saveGuestDeck({ ...deck, name: "Renamed", cards: [] }, { localId: saved.localId, version: 1 })
      const [edited] = loadGuestDecks()
      expect(edited.deck).toMatchObject({ name: "Renamed", cards: shock })
      expect(guestDeckVersions(edited).map((version) => version.cards)).toEqual([[], shock])
      expect(() => saveGuestDeck(deck, { localId: saved.localId, version: 7 })).toThrow(
        "does not exist",
      )
    })

    it("renames, picks, and deletes versions", () => {
      const saved = saveGuestDeck({ ...deck, cards: bolt })
      addGuestDeckVersion(saved.localId, { name: "Tuned", cards: shock }, 2)
      const renamed = updateGuestDeckVersion(saved.localId, 1, { name: "Stock", note: "" })
      setGuestDeckBringing(saved.localId, 2)
      expect(loadGuestDecks()[0]).toMatchObject({ bringing: 2, updatedAt: renamed.updatedAt })

      deleteGuestDeckVersion(saved.localId, 2)
      const [left] = loadGuestDecks()
      expect(left.deck.cards).toEqual(bolt)
      expect(guestDeckVersions(left)).toEqual([
        expect.objectContaining({ number: 1, name: "Stock", cards: bolt }),
      ])
      expect(left.bringing).toBeUndefined()
      expect(() => deleteGuestDeckVersion(saved.localId, 1)).toThrow()
    })

    it("creates a moved deck with every version in order", () => {
      const moved = saveGuestDeck(
        { ...deck, cards: shock },
        {
          movedFromAccount: true,
          bringing: 3,
          versions: [
            { number: 1, name: "Current", cards: bolt },
            { number: 3, name: "Tuned", cards: shock },
          ],
        },
      )
      expect(guestDeckVersions(moved).map(({ number, cards }) => ({ number, cards }))).toEqual([
        { number: 1, cards: bolt },
        { number: 3, cards: shock },
      ])
      expect(guestDeckBringing(moved)).toBe(3)
    })
  })

  it("round-trips guest route ids", () => {
    expect(guestDeckLocalId(guestDeckRouteId(legacy.localId))).toBe(legacy.localId)
    expect(guestDeckLocalId("k17abc")).toBeUndefined()
  })
})

it.each(["web", "ios"] as const)(
  "reports each store failure once per session on %s without content",
  async (platform) => {
    await jest.isolateModulesAsync(async () => {
      const { Platform }: typeof import("react-native") = require("react-native")
      jest.replaceProperty(Platform, "OS", platform)
      const { storage }: typeof import("@/utils/storage") = require("@/utils/storage")
      const {
        reportCrash,
        ErrorType,
      }: typeof import("@/utils/crashReporting") = require("@/utils/crashReporting")
      jest.mocked(reportCrash).mockClear()
      storage.clearAll()
      storage.set("decks.guest.v2", "private deck content")
      const guest: typeof import("./guestDeck") = require("./guestDeck")
      expect(reportCrash).not.toHaveBeenCalled()
      for (const [raw, reason] of [
        ["private deck content", "malformed"],
        ['[{"deck":{"name":"private deck content"}}]', "unsupported"],
      ]) {
        storage.set("decks.guest.v2", raw)
        guest.loadGuestDecks()
        guest.loadGuestDecks()
        await Promise.resolve()
        expect(reportCrash).toHaveBeenLastCalledWith(
          expect.objectContaining({
            name: "GuestDeckLoadFailed",
            message: "Device deck store load failed",
          }),
          ErrorType.HANDLED,
          {
            tags: { platform: platform === "web" ? "web" : "native", reason },
            fingerprint: ["guest-deck-storage", "load"],
          },
        )
      }
      const read = jest.spyOn(storage, "getString").mockImplementation(() => {
        throw new Error("private deck content")
      })
      guest.loadGuestDecks()
      guest.loadGuestDecks()
      read.mockRestore()
      await Promise.resolve()
      expect(reportCrash).toHaveBeenCalledTimes(3)
      expect(reportCrash).toHaveBeenLastCalledWith(
        expect.objectContaining({ name: "GuestDeckLoadFailed" }),
        ErrorType.HANDLED,
        {
          tags: { platform: platform === "web" ? "web" : "native", reason: "read_failed" },
          fingerprint: ["guest-deck-storage", "load"],
        },
      )
      guest.clearGuestDecks()
      const write = jest.spyOn(storage, "set").mockImplementation(() => {
        throw new Error("private deck content")
      })
      expect(() => guest.saveGuestDeck(deck)).toThrow()
      expect(() => guest.saveGuestDeck(deck)).toThrow()
      write.mockRestore()
      await Promise.resolve()
      expect(reportCrash).toHaveBeenCalledTimes(4)
      expect(reportCrash).toHaveBeenLastCalledWith(
        expect.objectContaining({
          name: "GuestDeckSaveFailed",
          message: "Device deck store save failed",
        }),
        ErrorType.HANDLED,
        {
          tags: { platform: platform === "web" ? "web" : "native" },
          fingerprint: ["guest-deck-storage", "save"],
        },
      )
      for (const [error, , context] of jest.mocked(reportCrash).mock.calls) {
        expect(error).not.toHaveProperty("cause")
        expect(JSON.stringify({ name: error.name, message: error.message, context })).not.toContain(
          "private deck content",
        )
      }
      jest.restoreAllMocks()
    })
  },
)
