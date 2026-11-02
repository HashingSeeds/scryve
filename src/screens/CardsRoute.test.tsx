import { act, fireEvent, render, waitFor } from "@testing-library/react-native"

import CardsRoute from "@/app/cards"
import { ThemeProvider } from "@/theme/context"

const mockAction = jest.fn()
jest.mock("convex/react", () => ({
  useConvex: () => ({ action: mockAction, query: jest.fn().mockResolvedValue([]) }),
  useAction: () => jest.fn(),
  useConvexConnectionState: () => ({ isWebSocketConnected: true }),
}))
jest.mock("@/features/decks/useCardNameIndex", () => ({ useCardNameIndex: () => undefined }))
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), canGoBack: () => true, replace: jest.fn() },
  useLocalSearchParams: () => ({}),
}))

it("searches the game picked on the standalone Cards screen", async () => {
  jest.useFakeTimers()
  mockAction.mockResolvedValue([])
  const view = render(
    <ThemeProvider initialContext="dark">
      <CardsRoute />
    </ThemeProvider>,
  )
  fireEvent.press(view.getByTestId("card-search-game"))
  await waitFor(() => expect(view.getByTestId("card-search-game-option-pokemon")).toBeTruthy())
  fireEvent.press(view.getByTestId("card-search-game-option-pokemon"))
  fireEvent.changeText(view.getByTestId("card-search-input"), "pikachu")
  await act(async () => jest.advanceTimersByTime(400))
  jest.useRealTimers()
  expect(mockAction).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ game: "pokemon", query: expect.stringContaining("pikachu") }),
  )
})
