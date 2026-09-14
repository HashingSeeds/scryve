import { act, render } from "@testing-library/react-native"

import { clear, load } from "@/utils/storage"

import DeckDetailRoute from "../app/connected/decks/[deckId]"

const mockDetailScreen = jest.fn((_props: unknown) => null)

let mockParams: { deckId?: string; reviewChanges?: string } = { deckId: "deck-from-route" }

jest.mock("expo-router", () => ({
  Redirect: () => null,
  router: { back: jest.fn() },
  useLocalSearchParams: () => mockParams,
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
    mockParams = { deckId: "deck-from-route" }
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
})
