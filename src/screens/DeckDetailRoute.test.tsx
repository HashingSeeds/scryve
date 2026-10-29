import { router } from "expo-router"
import { act, render } from "@testing-library/react-native"

import { clear, load } from "@/utils/storage"

import DeckDetailRoute from "../app/connected/decks/[deckId]"

const mockDetailScreen = jest.fn((_props: unknown) => null)

let mockParams: { deckId?: string; reviewChanges?: string } = { deckId: "deck-from-route" }

jest.mock("expo-router", () => ({
  Redirect: () => null,
  router: { back: jest.fn(), canGoBack: jest.fn(() => true), replace: jest.fn() },
  useLocalSearchParams: () => mockParams,
}))

jest.mock("@/features/auth/AuthContext", () => ({
  useAuthAccess: () => ({ configured: true }),
}))

jest.mock("@/features/auth/CloudScreen", () => ({
  CloudScreen: ({ children }: { children: () => React.ReactNode }) => children(),
}))

jest.mock("@/screens/DeckDetailScreen", () => ({
  DeckDetailScreen: (props: unknown) => mockDetailScreen(props),
}))

describe("deck detail route", () => {
  beforeEach(() => {
    clear()
    jest.clearAllMocks()
    mockDetailScreen.mockClear()
    mockParams = { deckId: "deck-from-route" }
  })

  it("falls back to the Decks list when the deck page was opened by link", () => {
    jest.mocked(router.canGoBack).mockReturnValue(false)
    render(<DeckDetailRoute />)
    const props = mockDetailScreen.mock.lastCall?.[0] as { onBack: () => void }
    props.onBack()
    expect(router.back).not.toHaveBeenCalled()
    expect(router.replace).toHaveBeenCalledWith("/connected/decks")
  })

  it("passes a shelf review request to the detail screen", () => {
    mockParams = { deckId: "deck-from-route", reviewChanges: "true" }
    render(<DeckDetailRoute />)
    expect(mockDetailScreen).toHaveBeenLastCalledWith(
      expect.objectContaining({ reviewChanges: true }),
    )
  })

  it("records a nonempty deck id as recent", async () => {
    render(<DeckDetailRoute />)

    await act(async () => undefined)

    expect(load("decks.recentIds")).toEqual(["deck-from-route"])
  })

  it("sends the old single guest deck link to the deck list", async () => {
    mockParams = { deckId: "guest" }
    render(<DeckDetailRoute />)

    await act(async () => undefined)

    expect(mockDetailScreen).not.toHaveBeenCalled()
    expect(load("decks.recentIds")).toBeNull()
  })
})
