import { act, renderHook, waitFor } from "@testing-library/react-native"
import { ConvexError } from "convex/values"

import { captureAnalytics } from "@/utils/analytics"
import { ErrorType, reportCrash } from "@/utils/crashReporting"

import type { DeckSyncSnapshot } from "./decksSync"
import { clearGuestDecks, loadGuestDecks, saveGuestDeck } from "./guestDeck"
import { useLocalDeckLeftovers, useLocalDeckSync } from "./localDeckSync"
import type { Id } from "../../../convex/_generated/dataModel"

jest.mock("@/utils/analytics", () => ({ captureAnalytics: jest.fn() }))
jest.mock("@/utils/crashReporting", () => ({
  ErrorType: { HANDLED: "Handled" },
  reportCrash: jest.fn(),
}))

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
  mockImportGuest.mockReset()
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
  expect(captureAnalytics).toHaveBeenCalledTimes(1)
  expect(captureAnalytics).toHaveBeenCalledWith("deck_sync", { action: "sync", outcome: "ok" })
})

test("retains the local copy at capacity", async () => {
  const local = saveGuestDeck(deck)
  mockImportGuest.mockResolvedValue({ status: "limit_reached" })
  await expect(renderSync().sync(local.localId)).resolves.toEqual({ status: "limit_reached" })
  expect(loadGuestDecks()).toEqual([local])
  expect(reportCrash).not.toHaveBeenCalled()
  expect(captureAnalytics).toHaveBeenCalledTimes(1)
  expect(captureAnalytics).toHaveBeenCalledWith("deck_sync", { action: "sync", outcome: "limit" })
})

test("saves server content and its key before moving the exact revision", async () => {
  const card = { name: "Llanowar Elves", quantity: 1, board: "main" }
  mockQuery.mockResolvedValue({
    deck: { ...deck, _id: deckId, deckKey: "stable-key", syncRevision: 2 },
    cards: [{ _id: "card-1", _creationTime: 1, deckVersionId: "version-1", ...card }],
  })
  mockMove.mockImplementation(async () => {
    expect(loadGuestDecks()).toMatchObject([
      { deckKey: "stable-key", movedFromAccount: true, deck: { ...deck, cards: [card] } },
    ])
    return { ...metadata[0], deleted: true, revision: 3 }
  })
  const localId = await renderSync().keepOnDevice(deckId)
  expect(loadGuestDecks()[0].localId).toBe(localId)
  expect(mockMove).toHaveBeenCalledWith({ deckId, expectedRevision: 2, expectedVersion: null })
  expect(mockAcceptMetadata).toHaveBeenCalledWith([{ ...metadata[0], deleted: true, revision: 3 }])
  expect(captureAnalytics).toHaveBeenCalledTimes(1)
  expect(captureAnalytics).toHaveBeenCalledWith("deck_sync", {
    action: "move_to_device",
    outcome: "ok",
  })
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

test.each(["unauthenticated", "rate_limited"])(
  "counts a %s move as failed without reporting it",
  async (code) => {
    mockMove.mockRejectedValue(new ConvexError({ code }))
    await expect(renderSync().keepOnDevice(deckId)).rejects.toBeInstanceOf(ConvexError)
    expect(reportCrash).not.toHaveBeenCalled()
    expect(captureAnalytics).toHaveBeenCalledWith("deck_sync", {
      action: "move_to_device",
      outcome: "failed",
    })
  },
)

test("keeps the copy if the move reply is lost", async () => {
  mockMove.mockRejectedValue(new Error("connection lost"))
  await expect(renderSync().keepOnDevice(deckId)).rejects.toThrow("connection lost")
  expect(loadGuestDecks()).toMatchObject([{ deckKey: "stable-key", deck }])
  expect(reportCrash).not.toHaveBeenCalled()
  expect(captureAnalytics).toHaveBeenCalledTimes(1)
  expect(captureAnalytics).toHaveBeenCalledWith("deck_sync", {
    action: "move_to_device",
    outcome: "failed",
  })
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
  expect(captureAnalytics).not.toHaveBeenCalled()
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

test.each([200, undefined])(
  "moves the exact version copied, with updatedAt %s",
  async (updatedAt) => {
    const version = { _id: "version-1", createdAt: 100, updatedAt }
    mockQuery.mockResolvedValue({
      deck: { ...deck, _id: deckId, syncRevision: 2 },
      version,
      cards: [],
    })
    await renderSync().keepOnDevice(deckId)
    expect(mockMove).toHaveBeenCalledWith({
      deckId,
      expectedRevision: 2,
      expectedVersion: { id: version._id, updatedAt: updatedAt ?? 100 },
    })
  },
)

test("a card conflict preserves the server and existing device decks and explains the failure", async () => {
  const other = saveGuestDeck(deck)
  mockMove.mockRejectedValue(
    new ConvexError({ code: "sync_conflict", message: "Deck cards changed on another device" }),
  )
  await expect(renderSync().keepOnDevice(deckId)).rejects.toThrow(
    "This deck changed on another device, so it is still synced.",
  )
  expect(loadGuestDecks()).toEqual([other])
  expect(mockAcceptMetadata).not.toHaveBeenCalled()
  expect(reportCrash).not.toHaveBeenCalled()
  expect(captureAnalytics).toHaveBeenCalledTimes(1)
  expect(captureAnalytics).toHaveBeenCalledWith("deck_sync", {
    action: "move_to_device",
    outcome: "conflict",
  })
})

test.each([0, 100, undefined])(
  "reconciles an interrupted move with guest receipt %s",
  async (guestUpdatedAt) => {
    jest.spyOn(Date, "now").mockReturnValue(500)
    mockQuery.mockResolvedValue({
      deck: {
        ...deck,
        _id: deckId,
        deckKey: "stable-key",
        syncRevision: 2,
        guestLocalId: "11111111-1111-4111-8111-111111111111",
        guestUpdatedAt,
      },
      version: null,
      cards: [],
    })
    mockMove.mockRejectedValue(new Error("interrupted"))
    await expect(renderSync().keepOnDevice(deckId)).rejects.toThrow("interrupted")
    const [copy] = loadGuestDecks()
    expect(copy.updatedAt).toBe(guestUpdatedAt ?? 500)
    mockImportGuest.mockResolvedValue({
      status: "already_imported",
      deckId,
      localUpdatedAt: guestUpdatedAt ?? null,
    })
    const hook = renderHook(() => useLocalDeckLeftovers(freshMetadata, "owner", true))
    await waitFor(() => expect(loadGuestDecks()).toEqual([]))
    expect(hook.result.current.error).toBe(false)
    jest.restoreAllMocks()
  },
)

test("a missing receipt never clears a moved copy with different cards", async () => {
  const copy = saveGuestDeck(
    { ...deck, cards: [{ name: "Elves", quantity: 1 }] },
    { movedFromAccount: true },
  )
  mockImportGuest.mockResolvedValue({ status: "already_imported", deckId, localUpdatedAt: null })
  await expect(renderSync().sync(copy.localId)).resolves.toEqual({ status: "kept_newer_edits" })
  expect(loadGuestDecks()).toEqual([copy])
})

test("a flagged copy sends only import fields and can revive its original account deck", async () => {
  const payload = { ...deck, guestLocalId: "local-only", movedFromAccount: true }
  const copy = saveGuestDeck(payload, { movedFromAccount: true })
  mockImportGuest.mockResolvedValue({ status: "imported", deckId, localUpdatedAt: copy.updatedAt })
  await expect(renderSync().sync(copy.localId)).resolves.toEqual({ status: "synced", deckId })
  expect(mockImportGuest).toHaveBeenCalledWith({
    ...deck,
    deckKey: copy.deckKey,
    localId: copy.localId,
    localUpdatedAt: copy.updatedAt,
    movedFromAccount: true,
  })
  expect(loadGuestDecks()).toEqual([])
})

test("other_account keeps the copy and offers an import with a fresh key and alias", async () => {
  const copy = saveGuestDeck(deck, {
    movedFromAccount: true,
    guestLocalId: "11111111-1111-4111-8111-111111111111",
  })
  mockImportGuest.mockResolvedValueOnce({ status: "other_account" })
  const result = await renderSync().sync(copy.localId)
  expect(result.status).toBe("other_account")
  expect(loadGuestDecks()).toEqual([copy])
  expect(mockImportGuest).toHaveBeenCalledTimes(1)
  if (result.status !== "other_account") throw new Error("Expected new deck offer")
  mockImportGuest.mockResolvedValue({ status: "imported", deckId, localUpdatedAt: copy.updatedAt })
  await expect(result.addAsNew()).resolves.toEqual({ status: "synced", deckId })
  const args = mockImportGuest.mock.lastCall?.[0]
  expect(args.deckKey).not.toBe(copy.deckKey)
  expect(args.localId).not.toBe(copy.localId)
  expect(args.localId).not.toBe(copy.guestLocalId)
  expect(args.movedFromAccount).toBeUndefined()
  expect(loadGuestDecks()).toEqual([copy])
  expect(reportCrash).not.toHaveBeenCalled()
  expect(captureAnalytics).toHaveBeenCalledTimes(2)
  expect(captureAnalytics).toHaveBeenNthCalledWith(1, "deck_sync", {
    action: "sync",
    outcome: "other_account",
  })
  expect(captureAnalytics).toHaveBeenNthCalledWith(2, "deck_sync", {
    action: "add_as_new",
    outcome: "ok",
  })
  await result.addAsNew()
  expect(mockImportGuest).toHaveBeenLastCalledWith(args)
})

test.each(["sync", "move_to_device", "add_as_new"] as const)(
  "reports an unexpected %s failure once without content",
  async (action) => {
    const local = saveGuestDeck(deck)
    const failure = new ConvexError({ code: "invalid_deck_key", message: "private deck content" })
    const sync = renderSync()
    let operation: () => Promise<unknown>
    if (action === "move_to_device") {
      mockQuery.mockRejectedValueOnce(failure)
      operation = () => sync.keepOnDevice(deckId)
    } else if (action === "add_as_new") {
      mockImportGuest.mockResolvedValueOnce({ status: "other_account" })
      const result = await sync.sync(local.localId)
      if (result.status !== "other_account") throw new Error("Expected new deck offer")
      operation = result.addAsNew
    } else operation = () => sync.sync(local.localId)
    jest.mocked(captureAnalytics).mockClear()
    if (action !== "move_to_device") mockImportGuest.mockRejectedValueOnce(failure)
    await expect(operation()).rejects.toBe(failure)
    expect(reportCrash).toHaveBeenCalledTimes(1)
    expect(reportCrash).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "LocalDeckSyncFailed",
        message: "Device deck operation failed",
      }),
      ErrorType.HANDLED,
      {
        tags: { action, code: "invalid_deck_key" },
        fingerprint: ["local-deck-sync-failed", action],
      },
    )
    const [error] = jest.mocked(reportCrash).mock.calls[0]
    expect(error).not.toHaveProperty("cause")
    expect(captureAnalytics).toHaveBeenCalledTimes(1)
    expect(captureAnalytics).toHaveBeenCalledWith("deck_sync", { action, outcome: "failed" })
  },
)

test.each([
  new Error("offline"),
  new TypeError("Network request failed"),
  new ConvexError({ code: "sync_conflict", message: "private" }),
])("does not report an expected sync failure %s", async (failure) => {
  const local = saveGuestDeck(deck)
  mockImportGuest.mockRejectedValueOnce(failure)
  const result = renderSync().sync(local.localId)
  if (failure instanceof ConvexError) await expect(result).resolves.toEqual({ status: "conflict" })
  else await expect(result).rejects.toBe(failure)
  expect(reportCrash).not.toHaveBeenCalled()
  expect(captureAnalytics).toHaveBeenCalledTimes(1)
  expect(captureAnalytics).toHaveBeenCalledWith("deck_sync", {
    action: "sync",
    outcome: failure instanceof ConvexError ? "conflict" : "failed",
  })
})

test("reports a stuck automatic reconcile once across retries without a usage event", async () => {
  const local = saveGuestDeck(deck, { deckKey: "stable-key" })
  mockImportGuest.mockResolvedValue({
    status: "already_imported",
    deckId,
    localUpdatedAt: local.updatedAt - 1,
  })
  const hook = renderHook(() => useLocalDeckLeftovers(freshMetadata, "owner", true))
  await waitFor(() => expect(hook.result.current.error).toBe(true))
  act(() => hook.result.current.retry())
  await waitFor(() => expect(hook.result.current.error).toBe(true))
  expect(reportCrash).toHaveBeenCalledTimes(1)
  expect(reportCrash).toHaveBeenCalledWith(
    expect.objectContaining({
      name: "LocalDeckReconcileKeptNewerEdits",
      message: "Device deck reconciliation kept newer edits",
    }),
    ErrorType.HANDLED,
    {
      tags: { status: "kept_newer_edits" },
      fingerprint: ["local-deck-reconcile-kept-newer-edits"],
    },
  )
  expect(captureAnalytics).not.toHaveBeenCalled()
})
