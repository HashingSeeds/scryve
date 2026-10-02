import { act, renderHook, waitFor } from "@testing-library/react-native"

import type { CloudAccess } from "@/features/auth/CloudScreen"

import {
  clearGuestDecks,
  deleteGuestDeck,
  loadGuestDecks,
  replaceGuestDeck,
  saveGuestDeck,
} from "./guestDeck"
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
    clearGuestDecks()
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
    expect(loadGuestDecks()).toEqual([deck])
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
    expect(loadGuestDecks()).toEqual([])
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
    expect(loadGuestDecks()[0]?.deck.name).toBe("Edited")
    expect(mockImport).toHaveBeenCalledTimes(1)
  })

  it("imports each deck on its own, keeps the ones without room, and retries them later", async () => {
    const first = saveGuestDeck({ name: "First", format: "commander", cards: [] })
    const second = saveGuestDeck({ name: "Second", format: "commander", cards: [] })
    mockImport.mockImplementation(({ localId, localUpdatedAt }) =>
      Promise.resolve(
        localId === first.localId
          ? { status: "imported", deckId: "remote", localUpdatedAt }
          : {
              status: "limit_reached",
              capacity: { used: 2, limit: 2, premium: false, canCreate: false },
            },
      ),
    )
    const hook = renderHook(() => useGuestDeckImport(access))
    await waitFor(() =>
      expect(hook.result.current.result).toEqual({ imported: 1, limitReached: 1 }),
    )
    expect(loadGuestDecks()).toEqual([second])
    expect(hook.result.current.error).toBeUndefined()
    expect(mockImport).toHaveBeenCalledTimes(2)

    mockImport.mockImplementation(({ localId, localUpdatedAt }) =>
      Promise.resolve(
        localId === first.localId
          ? { status: "already_imported", deckId: "remote", localUpdatedAt }
          : { status: "imported", deckId: "remote-2", localUpdatedAt },
      ),
    )
    await act(async () => {
      await hook.result.current.retry()
    })
    expect(mockImport).toHaveBeenLastCalledWith(
      expect.objectContaining({ localId: second.localId }),
    )
    expect(loadGuestDecks()).toEqual([])
  })

  it("does not import a deleted deck while another import is in flight", async () => {
    const first = saveGuestDeck({ name: "First", format: "commander", cards: [] })
    const second = saveGuestDeck({ name: "Second", format: "commander", cards: [] })
    let resolve!: (value: unknown) => void
    mockImport.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      }),
    )
    const hook = renderHook(() => useGuestDeckImport(access))
    await waitFor(() => expect(mockImport).toHaveBeenCalledTimes(1))
    act(() => deleteGuestDeck(second.localId))
    await act(async () => {
      resolve({ status: "imported", deckId: "remote", localUpdatedAt: first.updatedAt })
    })
    expect(mockImport).toHaveBeenCalledTimes(1)
    expect(loadGuestDecks()).toEqual([])
    expect(hook.result.current.error).toBeUndefined()
  })

  it("imports a replacement saved while another import is in flight", async () => {
    const first = saveGuestDeck({ name: "First", format: "commander", cards: [] })
    const second = saveGuestDeck({ name: "Second", format: "commander", cards: [] })
    let resolve!: (value: unknown) => void
    mockImport.mockReturnValueOnce(
      new Promise((done) => {
        resolve = done
      }),
    )
    mockImport.mockImplementation(({ localUpdatedAt }) =>
      Promise.resolve({ status: "imported", deckId: "remote-2", localUpdatedAt }),
    )
    renderHook(() => useGuestDeckImport(access))
    await waitFor(() => expect(mockImport).toHaveBeenCalledTimes(1))
    let replacement!: ReturnType<typeof replaceGuestDeck>
    act(() => {
      replacement = replaceGuestDeck({ ...second.deck, name: "Replacement" }, second.localId)
    })
    await act(async () => {
      resolve({ status: "imported", deckId: "remote", localUpdatedAt: first.updatedAt })
    })
    await waitFor(() => expect(loadGuestDecks()).toEqual([]))
    expect(mockImport).toHaveBeenCalledTimes(2)
    expect(mockImport).toHaveBeenLastCalledWith(
      expect.objectContaining({ localId: replacement.localId, name: "Replacement" }),
    )
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
    expect(loadGuestDecks()).toEqual([deck])
  })
})
