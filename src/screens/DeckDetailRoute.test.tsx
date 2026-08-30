import { act, render } from "@testing-library/react-native"

import { clear, load } from "@/utils/storage"

import DeckDetailRoute from "../app/connected/decks/[deckId]"

let mockParams: { deckId?: string } = { deckId: "deck-from-route" }

jest.mock("expo-router", () => ({
  Redirect: () => null,
  router: { back: jest.fn() },
  useLocalSearchParams: () => mockParams,
}))

jest.mock("@/features/connected/ConnectedGate", () => ({
  ConnectedGate: ({ children }: { children: React.ReactNode }) => children,
}))

jest.mock("@/screens/DeckDetailScreen", () => ({
  DeckDetailScreen: () => null,
}))

describe("deck detail route", () => {
  beforeEach(() => {
    clear()
    mockParams = { deckId: "deck-from-route" }
  })

  it("records a nonempty deck id as recent", async () => {
    render(<DeckDetailRoute />)

    await act(async () => undefined)

    expect(load("decks.recentIds")).toEqual(["deck-from-route"])
  })
})
