import { fireEvent, render, waitFor } from "@testing-library/react-native"

import type { CloudAccess } from "@/features/auth/CloudScreen"
import { ThemeProvider } from "@/theme/context"
import { clear } from "@/utils/storage"

import { clearGuestDecks, loadGuestDecks, saveGuestDeck } from "./guestDeck"
import { LocalDeckSyncNotice } from "./LocalDeckSyncNotice"

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

function renderNotice() {
  return render(
    <ThemeProvider initialContext="light">
      <LocalDeckSyncNotice access={access} />
    </ThemeProvider>,
  )
}

describe("local deck sync notice", () => {
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
    const view = renderNotice()
    expect(view.getByText("2 decks are only on this device. You can sync 1 more.")).toBeTruthy()

    fireEvent.press(view.getByTestId("local-deck-sync-choose"))
    fireEvent.press(view.getByTestId(`local-deck-sync-choice-${first.localId}`))
    expect(view.getByTestId(`local-deck-sync-choice-${second.localId}`)).toBeDisabled()
    fireEvent.press(view.getByTestId("local-deck-sync-pro"))
    expect(mockPresentPaywall).toHaveBeenCalled()
    fireEvent.press(view.getByTestId("local-deck-sync-confirm"))

    await waitFor(() => expect(loadGuestDecks()).toEqual([second]))
    expect(mockImportGuest).toHaveBeenCalledTimes(1)
  })

  it("stays hidden once the player keeps their decks on the device", () => {
    saveGuestDeck({ name: "Elves", format: "commander", cards: [] })
    const view = renderNotice()
    fireEvent.press(view.getByTestId("local-deck-sync-dismiss"))
    expect(view.queryByTestId("local-deck-sync-notice")).toBeNull()
    view.unmount()
    expect(renderNotice().queryByTestId("local-deck-sync-notice")).toBeNull()
  })
})
