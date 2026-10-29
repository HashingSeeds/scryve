import { fireEvent, render, waitFor } from "@testing-library/react-native"

import type { CloudAccess } from "@/features/auth/CloudScreen"
import { ThemeProvider } from "@/theme/context"
import { clear } from "@/utils/storage"

import { clearGuestDecks, loadGuestDecks, saveGuestDeck } from "./guestDeck"
import { LocalDeckSyncHeader } from "./LocalDeckSyncHeader"

const mockImportGuest = jest.fn()
const mockPresentPaywall = jest.fn()
let mockCapacity = { used: 1, limit: 2, premium: false, canCreate: true }

jest.mock("../../../convex/_generated/api", () => ({
  api: { decks: { capacity: "capacity", importGuest: "importGuest" } },
}))
jest.mock("convex/react", () => ({
  useConvex: () => ({ query: jest.fn() }),
  useQuery: () => mockCapacity,
  useMutation: (reference: string) => (reference === "importGuest" ? mockImportGuest : jest.fn()),
}))
jest.mock("@/features/billing/RevenueCatContext", () => ({
  useRevenueCat: () => ({ configured: true, isLoading: false, presentPaywall: mockPresentPaywall }),
}))

const access: CloudAccess = {
  ready: true,
  loading: false,
  signedIn: true,
  ownerId: "owner",
  request: jest.fn(),
}

function renderHeader(cloud = access) {
  return render(
    <ThemeProvider initialContext="light">
      <LocalDeckSyncHeader access={cloud} />
    </ThemeProvider>,
  )
}

describe("local deck sync header", () => {
  beforeEach(() => {
    clear()
    clearGuestDecks()
    jest.clearAllMocks()
    mockCapacity = { used: 1, limit: 2, premium: false, canCreate: true }
  })

  it("lets a player pick only as many decks as the account has free, then syncs them", async () => {
    const first = saveGuestDeck({ name: "Elves", format: "commander", cards: [] })
    const second = saveGuestDeck({ name: "Goblins", format: "commander", cards: [] })
    mockImportGuest.mockResolvedValue({
      status: "imported",
      deckId: "deck-1",
      localUpdatedAt: first.updatedAt,
    })
    const view = renderHeader()
    expect(mockImportGuest).not.toHaveBeenCalled()

    fireEvent.press(view.getByTestId("local-deck-sync-choose"))
    fireEvent.press(view.getByTestId(`local-deck-sync-choice-${first.localId}`))
    expect(view.getByTestId(`local-deck-sync-choice-${second.localId}`)).toBeDisabled()
    fireEvent.press(view.getByTestId("local-deck-sync-pro"))
    expect(mockPresentPaywall).toHaveBeenCalled()
    fireEvent.press(view.getByTestId("local-deck-sync-confirm"))

    await waitFor(() => expect(loadGuestDecks()).toEqual([second]))
    expect(mockImportGuest).toHaveBeenCalledTimes(1)
  })

  it("ignores a deck the player moved off their account", () => {
    saveGuestDeck({ name: "Elves", format: "commander", cards: [] }, { movedFromAccount: true })
    expect(renderHeader().queryByTestId("local-deck-sync-choose")).toBeNull()
  })

  it("offers no sync without an account", () => {
    saveGuestDeck({ name: "Elves", format: "commander", cards: [] })
    const signedOut = { ...access, ready: false, signedIn: false, ownerId: undefined }
    expect(renderHeader(signedOut).queryByTestId("local-deck-sync-choose")).toBeNull()
  })
})
