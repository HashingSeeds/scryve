import { act, renderHook, waitFor } from "@testing-library/react-native"
import { ConvexError } from "convex/values"

import type { DeckSyncSnapshot } from "./decksSync"
import { clearGuestDecks, loadGuestDecks, saveGuestDeck } from "./guestDeck"
import { useLocalDeckLeftovers, useLocalDeckSync } from "./localDeckSync"
import type { Id } from "../../../convex/_generated/dataModel"

const mockImportGuest = jest.fn()
const mockMove = jest.fn()
const mockQuery = jest.fn()
const mockAcceptMetadata = jest.fn()
const mockClient = { query: mockQuery }

jest.mock("./decksSync", () => ({
  getDeckSyncController: () => ({ acceptMetadata: mockAcceptMetadata }),
}))
jest.mock("../../../convex/_generated/api", () => ({
  api: { decks: { importGuest: "importGuest", moveToDevice: "moveToDevice", detail: "detail" } },
}))
jest.mock("convex/react", () => ({
  useConvex: () => mockClient,
  useMutation: (reference: string) =>
    ({ importGuest: mockImportGuest, moveToDevice: mockMove })[reference],
}))

const deck = { name: "Elves", format: "commander", game: "mtg", cards: [] }
const deckId = "deck-1" as Id<"decks">
const metadata = [
  {
    deckId,
    deckKey: "stable-key",
    id: deckId,
    revision: 2,
    name: deck.name,
    format: deck.format,
    game: deck.game,
    note: "",
    deleted: false,
    createdAt: 1,
    updatedAt: 2,
  },
]
const freshMetadata = { metadata, loading: false }

function renderSync() {
  return renderHook(() => useLocalDeckSync("owner")).result.current
}

beforeEach(() => {
  clearGuestDecks()
  jest.clearAllMocks()
  mockQuery.mockResolvedValue({
    deck: { ...deck, _id: deckId, deckKey: "stable-key", syncRevision: 2 },
    cards: [],
  })
  mockMove.mockResolvedValue({ ...metadata[0], deleted: true, revision: 3 })
})

test("sync passes the stable key and drops the copy only after a matching receipt", async () => {
  const local = saveGuestDeck(deck, { deckKey: "stable-key" })
  mockImportGuest.mockImplementation(async () => {
    expect(loadGuestDecks()).toEqual([local])
    return { status: "imported", deckId, localUpdatedAt: local.updatedAt }
  })
  await expect(renderSync().sync(local.localId)).resolves.toEqual({ status: "synced", deckId })
  expect(mockImportGuest).toHaveBeenCalledWith({
    ...deck,
    deckKey: "stable-key",
    localId: local.localId,
    localUpdatedAt: local.updatedAt,
  })
  expect(loadGuestDecks()).toEqual([])
})

test("retains the local copy at capacity", async () => {
  const local = saveGuestDeck(deck)
  mockImportGuest.mockResolvedValue({ status: "limit_reached" })
  await expect(renderSync().sync(local.localId)).resolves.toEqual({ status: "limit_reached" })
  expect(loadGuestDecks()).toEqual([local])
})

test("saves server content and its key before moving the exact revision", async () => {
  const card = { name: "Llanowar Elves", quantity: 1, board: "main" }
  mockQuery.mockResolvedValue({
    deck: { ...deck, _id: deckId, deckKey: "stable-key", syncRevision: 2 },
    cards: [{ _id: "card-1", _creationTime: 1, deckVersionId: "version-1", ...card }],
  })
  mockMove.mockImplementation(async () => {
    expect(loadGuestDecks()).toMatchObject([
      { deckKey: "stable-key", deck: { ...deck, cards: [card] } },
    ])
    return { ...metadata[0], deleted: true, revision: 3 }
  })
  const localId = await renderSync().keepOnDevice(deckId)
  expect(loadGuestDecks()[0].localId).toBe(localId)
  expect(mockMove).toHaveBeenCalledWith({ deckId, expectedRevision: 2 })
  expect(mockAcceptMetadata).toHaveBeenCalledWith([{ ...metadata[0], deleted: true, revision: 3 }])
})

test("does not move server content if saving the local copy fails", async () => {
  const { storage } = jest.requireActual("@/utils/storage") as typeof import("@/utils/storage")
  const write = jest.spyOn(storage, "set").mockImplementation(() => {
    throw new Error("disk full")
  })
  await expect(renderSync().keepOnDevice(deckId)).rejects.toThrow("Unable to save")
  expect(mockMove).not.toHaveBeenCalled()
  write.mockRestore()
})

test("deletes only the new copy when the server refuses the move", async () => {
  const other = saveGuestDeck(deck)
  mockMove.mockRejectedValue(new ConvexError({ code: "sync_conflict" }))
  await expect(renderSync().keepOnDevice(deckId)).rejects.toBeInstanceOf(ConvexError)
  expect(loadGuestDecks()).toEqual([other])
})

test("keeps the copy if the move reply is lost", async () => {
  mockMove.mockRejectedValue(new Error("connection lost"))
  await expect(renderSync().keepOnDevice(deckId)).rejects.toThrow("connection lost")
  expect(loadGuestDecks()).toMatchObject([{ deckKey: "stable-key", deck }])
})

test("keeps edits newer than an import receipt", async () => {
  const local = saveGuestDeck(deck)
  mockImportGuest.mockResolvedValue({
    status: "already_imported",
    deckId,
    localUpdatedAt: local.updatedAt - 1,
  })
  await expect(renderSync().sync(local.localId)).resolves.toEqual({ status: "kept_newer_edits" })
  expect(loadGuestDecks()).toEqual([local])
})

test("preserves the original guest alias through sync, move, edit, and sync again", async () => {
  const original = saveGuestDeck(deck, { deckKey: "stable-key" })
  mockImportGuest.mockImplementation(async (args) => ({
    status: "imported",
    deckId,
    localUpdatedAt: args.localUpdatedAt,
  }))
  const hook = renderHook(() => useLocalDeckSync("owner"))
  await act(async () => {
    await hook.result.current.sync(original.localId)
  })
  mockQuery.mockResolvedValue({
    deck: {
      ...deck,
      _id: deckId,
      deckKey: original.deckKey,
      guestLocalId: original.localId,
      syncRevision: 2,
    },
    cards: [],
  })
  let copyId = ""
  await act(async () => {
    copyId = await hook.result.current.keepOnDevice(deckId)
  })
  expect(copyId).not.toBe(original.localId)
  act(() => {
    saveGuestDeck({ ...deck, name: "Edited" }, { localId: copyId })
    loadGuestDecks()
  })
  await act(async () => {
    await hook.result.current.sync(copyId)
  })
  expect(mockImportGuest).toHaveBeenLastCalledWith(
    expect.objectContaining({
      deckKey: original.deckKey,
      localId: original.localId,
      name: "Edited",
    }),
  )
  expect(loadGuestDecks()).toEqual([])
})

test("resolves live-key leftovers through Sync and leaves deleted-key copies alone", async () => {
  const local = saveGuestDeck(deck, { deckKey: "stable-key" })
  const other = saveGuestDeck(deck, { deckKey: "removed-key" })
  mockImportGuest.mockResolvedValue({
    status: "already_imported",
    deckId,
    localUpdatedAt: local.updatedAt,
  })
  const { result } = renderHook(() =>
    useLocalDeckLeftovers(
      {
        loading: false,
        metadata: [
          ...metadata,
          { ...metadata[0], id: "removed", deckKey: "removed-key", deleted: true },
        ],
      },
      "owner",
      true,
    ),
  )
  await waitFor(() => expect(loadGuestDecks()).toEqual([other]))
  expect(mockImportGuest).toHaveBeenCalledTimes(1)
  expect(result.current.error).toBe(false)
})

test("waits for a successful metadata pull before reconciling cached leftovers", async () => {
  const local = saveGuestDeck(deck, { deckKey: "stable-key" })
  const hook = renderHook(
    (snapshot: Pick<DeckSyncSnapshot, "metadata" | "loading" | "unavailable">) =>
      useLocalDeckLeftovers(snapshot, "owner", true),
    { initialProps: { metadata, loading: true, unavailable: false } },
  )
  expect(mockImportGuest).not.toHaveBeenCalled()
  expect(hook.result.current.localIds.has(local.localId)).toBe(false)
  hook.rerender({ metadata, loading: false, unavailable: true })
  expect(mockImportGuest).not.toHaveBeenCalled()
  hook.rerender({
    metadata: [{ ...metadata[0], deleted: true }],
    loading: false,
    unavailable: false,
  })
  expect(mockImportGuest).not.toHaveBeenCalled()
  expect(loadGuestDecks()).toEqual([local])

  mockImportGuest.mockResolvedValue({
    status: "already_imported",
    deckId,
    localUpdatedAt: local.updatedAt,
  })
  hook.rerender({ metadata, loading: false, unavailable: false })
  await waitFor(() => expect(loadGuestDecks()).toEqual([]))
  expect(mockImportGuest).toHaveBeenCalledTimes(1)
})

test.each(["connection", "kept_newer_edits", "conflict"])(
  "shows a failed leftover after %s and offers a retry without deleting its content",
  async (failure) => {
    const local = saveGuestDeck(deck, { deckKey: "stable-key" })
    if (failure === "connection") mockImportGuest.mockRejectedValue(new Error("lost connection"))
    else if (failure === "conflict")
      mockImportGuest.mockRejectedValue(new ConvexError({ code: "sync_conflict" }))
    else
      mockImportGuest.mockResolvedValue({
        status: "already_imported",
        deckId,
        localUpdatedAt: local.updatedAt - 1,
      })
    const { result } = renderHook(() => useLocalDeckLeftovers(freshMetadata, "owner", true))
    expect(result.current.localIds.has(local.localId)).toBe(true)
    await waitFor(() => expect(result.current.error).toBe(true))
    expect(result.current.localIds.has(local.localId)).toBe(false)
    expect(loadGuestDecks()).toEqual([local])
    mockImportGuest.mockResolvedValue({
      status: "already_imported",
      deckId,
      localUpdatedAt: local.updatedAt,
    })
    act(() => result.current.retry())
    await waitFor(() => expect(loadGuestDecks()).toEqual([]))
  },
)

test("reuses a saved move copy on retry and never deletes it on a later refusal", async () => {
  mockMove.mockRejectedValueOnce(new Error("connection lost"))
  const hook = renderHook(() => useLocalDeckSync("owner"))
  await act(async () => {
    await expect(hook.result.current.keepOnDevice(deckId)).rejects.toThrow("connection lost")
  })
  const [copy] = loadGuestDecks()
  mockMove.mockRejectedValueOnce(new ConvexError({ code: "sync_conflict" }))
  await expect(hook.result.current.keepOnDevice(deckId)).rejects.toBeInstanceOf(ConvexError)
  expect(loadGuestDecks()).toEqual([copy])
  mockMove.mockResolvedValueOnce({ ...metadata[0], deleted: true, revision: 3 })
  await expect(hook.result.current.keepOnDevice(deckId)).resolves.toBe(copy.localId)
  expect(loadGuestDecks()).toEqual([copy])
})

test("keeps local edits when retrying a move would overwrite a different saved copy", async () => {
  const edited = saveGuestDeck({ ...deck, name: "Edited locally" }, { deckKey: "stable-key" })
  await expect(renderSync().keepOnDevice(deckId)).rejects.toBeInstanceOf(ConvexError)
  expect(mockMove).not.toHaveBeenCalled()
  expect(loadGuestDecks()).toEqual([edited])
})
