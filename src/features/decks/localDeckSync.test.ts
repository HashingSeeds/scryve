import { renderHook } from "@testing-library/react-native"
import { ConvexError } from "convex/values"

import { clearGuestDecks, loadGuestDecks, saveGuestDeck } from "./guestDeck"
import { useLocalDeckSync } from "./localDeckSync"
import type { Id } from "../../../convex/_generated/dataModel"

const mockImportGuest = jest.fn()
const mockResync = jest.fn()
const mockUnsync = jest.fn()
const mockQuery = jest.fn()

jest.mock("../../../convex/_generated/api", () => ({
  api: {
    decks: { importGuest: "importGuest", resync: "resync", unsync: "unsync", detail: "detail" },
  },
}))
jest.mock("convex/react", () => ({
  useConvex: () => ({ query: mockQuery }),
  useMutation: (reference: string) =>
    ({ importGuest: mockImportGuest, resync: mockResync, unsync: mockUnsync })[reference],
}))

const deck = { name: "Elves", format: "commander", game: "mtg", cards: [] }
const deckId = "deck-1" as Id<"decks">
const versionId = "version-1" as Id<"deckVersions">

function renderSync() {
  return renderHook(() => useLocalDeckSync("owner")).result.current
}

describe("local deck sync", () => {
  beforeEach(() => {
    clearGuestDecks()
    jest.clearAllMocks()
  })

  it("imports a never-synced deck and drops the local copy", async () => {
    const local = saveGuestDeck(deck)
    mockImportGuest.mockResolvedValue({
      status: "imported",
      deckId,
      localUpdatedAt: local.updatedAt,
    })
    const { sync } = renderSync()

    await expect(sync(local.localId)).resolves.toEqual({ status: "synced", deckId })
    expect(mockImportGuest).toHaveBeenCalledWith({
      ...deck,
      localId: local.localId,
      localUpdatedAt: local.updatedAt,
    })
    expect(loadGuestDecks()).toEqual([])
  })

  it("resyncs an unsynced deck to its server origin and keeps the copy when full", async () => {
    const unsynced = { deckId, ownerId: "owner", versionId, expectedRevision: 3 }
    const local = saveGuestDeck(deck, { unsynced })
    mockResync.mockRejectedValueOnce(new ConvexError({ code: "deck_limit_reached" }))
    const { sync } = renderSync()

    await expect(sync(local.localId)).resolves.toEqual({ status: "limit_reached" })
    expect(loadGuestDecks()).toHaveLength(1)

    mockResync.mockResolvedValue({ deckId })
    await expect(sync(local.localId)).resolves.toEqual({ status: "synced", deckId })
    expect(mockResync).toHaveBeenLastCalledWith({ ...deck, ...unsynced })
    expect(loadGuestDecks()).toEqual([])
  })

  it("imports a deck another account unsynced instead of resyncing that account's row", async () => {
    const local = saveGuestDeck(deck, {
      unsynced: { deckId, ownerId: "someone-else", expectedRevision: 3 },
    })
    mockImportGuest.mockResolvedValue({
      status: "imported",
      deckId: "deck-2",
      localUpdatedAt: local.updatedAt,
    })
    const { sync } = renderSync()

    await expect(sync(local.localId)).resolves.toEqual({ status: "synced", deckId: "deck-2" })
    expect(mockResync).not.toHaveBeenCalled()
  })

  it("keeps one device copy of an unsynced deck when the move is retried", async () => {
    const card = { name: "Llanowar Elves", quantity: 1, board: "main" as const }
    mockQuery.mockResolvedValue({
      deck: { ...deck, syncRevision: 2 },
      version: { _id: versionId },
      cards: [{ _id: "card-1", _creationTime: 1, deckVersionId: versionId, ...card }],
    })
    mockUnsync.mockResolvedValue({ deckId, expectedRevision: 3, versionId, ...deck, cards: [card] })
    const { unsync } = renderSync()

    const localId = await unsync(deckId)
    await expect(unsync(deckId)).resolves.toBe(localId)
    expect(loadGuestDecks()).toMatchObject([
      {
        localId,
        deck: { ...deck, cards: [card] },
        unsynced: { deckId, ownerId: "owner", versionId, expectedRevision: 3 },
      },
    ])
  })

  it("drops the device copy when the server refuses to unsync", async () => {
    mockQuery.mockResolvedValue({ deck: { ...deck, syncRevision: 2 }, version: null, cards: [] })
    mockUnsync.mockRejectedValue(new ConvexError({ code: "deck_archived" }))
    const { unsync } = renderSync()

    await expect(unsync(deckId)).rejects.toBeInstanceOf(ConvexError)
    expect(loadGuestDecks()).toEqual([])
  })

  it("keeps the device copy when the unsync response is lost", async () => {
    mockQuery.mockResolvedValue({ deck: { ...deck, syncRevision: 2 }, version: null, cards: [] })
    mockUnsync.mockRejectedValue(new Error("connection lost"))
    const { unsync } = renderSync()

    await expect(unsync(deckId)).rejects.toThrow("connection lost")
    expect(loadGuestDecks()).toMatchObject([{ deck, unsynced: { deckId, expectedRevision: 3 } }])
  })

  it("keeps a device copy whose edits are newer than the server's import receipt", async () => {
    const local = saveGuestDeck(deck)
    mockImportGuest.mockResolvedValue({
      status: "already_imported",
      deckId,
      localUpdatedAt: local.updatedAt - 1,
    })
    const { sync } = renderSync()

    await expect(sync(local.localId)).resolves.toEqual({ status: "kept_newer_edits" })
    expect(loadGuestDecks()).toEqual([local])
  })
})
