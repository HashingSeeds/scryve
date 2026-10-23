import { renderHook, waitFor } from "@testing-library/react-native"

import { DeckSyncRepository } from "@/features/decks/decksSync"

import { useListCards } from "./useListCards"

const mockLocals = jest.fn(
  () => [] as { localId: string; deckKey?: string; deck: { name: string } }[],
)
const mockShelf = jest.fn(() => [] as { deckKey?: string; _id: string; latestVersionId?: string }[])
const mockChosenCards = jest.fn()
const mockLookup = jest.fn()
jest.mock("@/features/decks/guestDeck", () => ({ loadGuestDecks: () => mockLocals() }))
jest.mock("@/features/decks/decksSync", () => ({
  DeckSyncRepository: jest.fn().mockImplementation(() => ({ loadShelf: mockShelf })),
}))
jest.mock("./deckChoices", () => ({
  chosenDeckCards: (...args: unknown[]) => mockChosenCards(...args),
}))
jest.mock("./deckFingerprint", () => ({
  deckFingerprint: async (cards: { name: string }[]) => cards[0]?.name,
}))
jest.mock("./listSnapshots", () => ({
  lookupListSnapshot: (...args: unknown[]) => mockLookup(...args),
}))

beforeEach(() => {
  jest.clearAllMocks()
  mockLocals.mockReturnValue([])
  mockShelf.mockReturnValue([])
  mockLookup.mockResolvedValue(undefined)
})

it("fingerprints a device deck's current cards", async () => {
  mockLocals.mockReturnValue([{ localId: "local", deckKey: "key", deck: { name: "Burn" } }])
  mockChosenCards.mockReturnValue([{ name: "now" }])
  mockLookup.mockResolvedValue([{ name: "now", quantity: 1 }])
  const { result } = renderHook(() => useListCards("key", "owner", ["now"]))
  await waitFor(() => expect(result.current.currentFingerprint).toBe("now"))
  expect(result.current.cards.get("now")).toEqual([{ name: "now", quantity: 1 }])
})

it("fingerprints a synced deck's latest version, and leaves current unknown without cards", async () => {
  process.env.EXPO_PUBLIC_CONVEX_URL = "https://deck.convex.cloud"
  mockShelf.mockReturnValue([{ deckKey: "key", _id: "deck", latestVersionId: "latest" }])
  mockChosenCards.mockReturnValue([{ name: "synced" }])
  const { result, rerender } = renderHook(
    ({ fingerprints }: { fingerprints: string[] }) => useListCards("key", "owner", fingerprints),
    { initialProps: { fingerprints: ["a"] } },
  )
  await waitFor(() => expect(result.current.currentFingerprint).toBe("synced"))
  expect(DeckSyncRepository).toHaveBeenCalledWith("owner", undefined, "https://deck.convex.cloud")
  expect(mockChosenCards).toHaveBeenCalledWith({ versionId: "latest", name: "" }, "owner")
  mockChosenCards.mockReturnValue(undefined)
  rerender({ fingerprints: ["b"] })
  await waitFor(() => expect(result.current.currentFingerprint).toBeUndefined())
})

it("still returns lists when the current deck cannot be read", async () => {
  mockLocals.mockReturnValue([{ localId: "local", deckKey: "key", deck: { name: "Burn" } }])
  mockChosenCards.mockImplementation(() => {
    throw new Error("deleted")
  })
  mockLookup.mockResolvedValue([{ name: "old", quantity: 1 }])
  const { result } = renderHook(() => useListCards("key", "owner", ["old"]))
  await waitFor(() => expect(result.current.cards.get("old")).toBeTruthy())
  expect(result.current.currentFingerprint).toBeUndefined()
})
