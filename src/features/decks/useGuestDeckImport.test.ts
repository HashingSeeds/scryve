import { act, renderHook, waitFor } from "@testing-library/react-native"

import type { CloudAccess } from "@/features/auth/CloudScreen"

import { deleteGuestDeck, loadGuestDeck, saveGuestDeck } from "./guestDeck"
import { useGuestDeckImport } from "./useGuestDeckImport"

const mockImport = jest.fn()
jest.mock("convex/react", () => ({ useMutation: () => mockImport }))

const access: CloudAccess = {
  ready: true,
  loading: false,
  ownerId: "owner",
  signedIn: true,
  request: jest.fn(),
}

describe("guest deck sign-in import", () => {
  beforeEach(() => {
    deleteGuestDeck()
    mockImport.mockReset()
  })

  it("keeps the deck through sign-in and failed imports, then removes only the acknowledged revision", async () => {
    const deck = saveGuestDeck({ name: "Local", format: "commander", cards: [] })
    mockImport.mockRejectedValueOnce(new Error("Offline"))
    const hook = renderHook(
      ({ current }: { current: CloudAccess }) => useGuestDeckImport(current),
      {
        initialProps: { current: { ...access, ready: false } },
      },
    )
    expect(mockImport).not.toHaveBeenCalled()
    hook.rerender({ current: access })
    await waitFor(() => expect(hook.result.current.error).toBeDefined())
    expect(loadGuestDeck()).toEqual(deck)
    mockImport.mockResolvedValue({
      status: "imported",
      deckId: "remote",
      localUpdatedAt: deck.updatedAt,
    })
    await act(async () => {
      await hook.result.current.retry()
    })
    expect(mockImport).toHaveBeenLastCalledWith({
      ...deck.deck,
      localId: deck.localId,
      localUpdatedAt: deck.updatedAt,
    })
    expect(loadGuestDeck()).toBeUndefined()
  })

  it("retains newer local edits when the server returns an earlier import receipt", async () => {
    const deck = saveGuestDeck({ name: "Local", format: "commander", cards: [] }, { now: 100 })
    saveGuestDeck({ ...deck.deck, name: "Edited" }, { localId: deck.localId, now: 101 })
    mockImport.mockResolvedValue({
      status: "already_imported",
      deckId: "remote",
      localUpdatedAt: 100,
    })
    const hook = renderHook(() => useGuestDeckImport(access))
    await waitFor(() => expect(hook.result.current.error).toContain("newer edits"))
    expect(loadGuestDeck()?.deck.name).toBe("Edited")
    expect(mockImport).toHaveBeenCalledTimes(1)
  })

  it("keeps a deck when the account fills up and retries after a slot is freed", async () => {
    const deck = saveGuestDeck({ name: "Local", format: "commander", cards: [] })
    mockImport.mockResolvedValueOnce({
      status: "limit_reached",
      capacity: { used: 2, limit: 2, premium: false, canCreate: false },
    })
    const hook = renderHook(() => useGuestDeckImport(access))
    await waitFor(() => expect(hook.result.current.result?.status).toBe("limit_reached"))
    expect(loadGuestDeck()).toEqual(deck)
    mockImport.mockResolvedValue({
      status: "imported",
      deckId: "remote",
      localUpdatedAt: deck.updatedAt,
    })
    await act(async () => {
      await hook.result.current.retry()
    })
    expect(loadGuestDeck()).toBeUndefined()
  })

  it("does not delete the local deck if the user signs out during import", async () => {
    const deck = saveGuestDeck({ name: "Local", format: "commander", cards: [] })
    let resolve!: (value: unknown) => void
    mockImport.mockReturnValue(
      new Promise((done) => {
        resolve = done
      }),
    )
    const hook = renderHook(
      ({ current }: { current: CloudAccess }) => useGuestDeckImport(current),
      {
        initialProps: { current: access },
      },
    )
    await waitFor(() => expect(mockImport).toHaveBeenCalledTimes(1))
    hook.rerender({ current: { ...access, ready: false, ownerId: undefined, signedIn: false } })
    await act(async () => {
      resolve({ status: "imported", deckId: "remote", localUpdatedAt: deck.updatedAt })
    })
    expect(loadGuestDeck()).toEqual(deck)
  })
})
