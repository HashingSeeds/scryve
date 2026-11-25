import { router } from "expo-router"
import { act, fireEvent, render, waitFor } from "@testing-library/react-native"

import CardsRoute from "@/app/cards"
import DecksRoute from "@/app/connected/decks"
import { ThemeProvider } from "@/theme/context"

const mockAction = jest.fn()
let mockParams: { system?: string } = {}
jest.mock("convex/react", () => ({
  useConvex: () => ({ action: mockAction, query: jest.fn().mockResolvedValue([]) }),
  useAction: () => jest.fn(),
  useConvexConnectionState: () => ({ isWebSocketConnected: true }),
}))
jest.mock("@/features/decks/useCardNameIndex", () => ({ useCardNameIndex: () => undefined }))
jest.mock("@/features/auth/AuthContext", () => ({
  useAuthAccess: () => ({ configured: false, isSignedIn: false, openAuth: jest.fn() }),
}))
jest.mock("@/features/auth/CloudScreen", () => ({ CloudScreen: () => null }))
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), canGoBack: () => true, replace: jest.fn(), push: jest.fn() },
  useFocusEffect: jest.fn(),
  useLocalSearchParams: () => mockParams,
}))

it("searches the game picked on the standalone Cards screen", async () => {
  jest.useFakeTimers()
  mockAction.mockResolvedValue([])
  const view = render(
    <ThemeProvider initialContext="dark">
      <CardsRoute />
    </ThemeProvider>,
  )
  fireEvent.press(view.getByTestId("collection-actions-button"))
  fireEvent.press(view.getByTestId("deck-action-game"))
  await waitFor(() => expect(view.getByTestId("deck-action-game-pokemon")).toBeTruthy())
  fireEvent.press(view.getByTestId("deck-action-game-pokemon"))
  fireEvent.changeText(view.getByTestId("card-search-input"), "pikachu")
  await act(async () => jest.advanceTimersByTime(400))
  jest.useRealTimers()
  expect(mockAction).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ game: "pokemon", query: expect.stringContaining("pikachu") }),
  )
})

it("switches to Decks and back in place, keeping the search", () => {
  const view = render(
    <ThemeProvider initialContext="dark">
      <CardsRoute />
    </ThemeProvider>,
  )
  fireEvent.changeText(view.getByTestId("card-search-input"), "bolt")
  fireEvent.press(view.getByTestId("app-tab-decks"))
  expect(view.getByTestId("deck-search-input")).toBeTruthy()
  expect(view.queryByTestId("card-search-input")).toBeNull()
  fireEvent.press(view.getByTestId("app-tab-cards"))
  expect(view.getByText("bolt")).toBeTruthy()
  expect(view.queryByTestId("deck-search-input")).toBeNull()
  expect(router.push).not.toHaveBeenCalled()
  expect(router.replace).not.toHaveBeenCalled()
})

it("opens Cards on the game the deck shelf is filtered to", async () => {
  jest.useFakeTimers()
  mockAction.mockResolvedValue([])
  mockParams = { system: "pokemon" }
  try {
    const view = render(
      <ThemeProvider initialContext="dark">
        <DecksRoute />
      </ThemeProvider>,
    )
    fireEvent.press(view.getByTestId("app-tab-cards"))
    fireEvent.changeText(view.getByTestId("card-search-input"), "pikachu")
    await act(async () => jest.advanceTimersByTime(400))
    expect(mockAction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ game: "pokemon", query: expect.stringContaining("pikachu") }),
    )
  } finally {
    mockParams = {}
    jest.useRealTimers()
  }
})
