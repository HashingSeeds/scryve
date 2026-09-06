import { createContext, type ReactNode } from "react"
import { fireEvent, render, waitFor } from "@testing-library/react-native"

import { resetConnectedProfileBootstrapForTests } from "@/features/connected/useConnectedProfile"
import { localGameRepository } from "@/features/game/localPersistence"

import {
  connectedHarness as mockConnectedHarness,
  resetConnectedHarness,
  mockClaimSeat,
  themed,
} from "./support/connectedHarness"
import DecksRoute from "../src/app/connected/decks"
import JoinRoute from "../src/app/connected/join"
import HistoryRoute from "../src/app/history"

const mockOpenAuth = jest.fn()
const mockAuthContext = createContext({
  configured: true,
  isLoaded: false,
  isSignedIn: false,
  openAuth: mockOpenAuth,
  userId: undefined as string | undefined,
})
let mockUsername: string | null = "alex"

jest.mock("@/features/auth/AuthContext", () => ({
  useAuthAccess: () =>
    jest.requireActual<typeof import("react")>("react").useContext(mockAuthContext),
}))
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({}),
  useFocusEffect: (effect: () => void) => {
    jest.requireActual<typeof import("react")>("react").useEffect(effect, [effect])
  },
}))
jest.mock("@clerk/expo", () => ({
  useUser: () => ({
    isLoaded: mockConnectedHarness.userLoaded,
    user: mockConnectedHarness.userId
      ? { id: mockConnectedHarness.userId, username: mockUsername }
      : null,
  }),
}))
jest.mock("convex/react", () => ({
  ...jest
    .requireActual<typeof import("./support/connectedHarness")>("./support/connectedHarness")
    .createConvexReactMock(),
  useConvex: () => ({ query: jest.fn() }),
}))
jest.mock("../convex/_generated/api", () =>
  jest
    .requireActual<typeof import("./support/connectedHarness")>("./support/connectedHarness")
    .createGeneratedApiMock(),
)

function app(child: ReactNode, signedIn: boolean) {
  return themed(
    <mockAuthContext.Provider
      value={{
        configured: true,
        isLoaded: true,
        isSignedIn: signedIn,
        openAuth: mockOpenAuth,
        userId: mockConnectedHarness.userId,
      }}
    >
      {child}
    </mockAuthContext.Provider>,
  )
}

beforeEach(() => {
  resetConnectedHarness()
  resetConnectedProfileBootstrapForTests()
  localGameRepository.clearActiveGame()
  mockUsername = null
})

it("opens Join without auth and asks for a username only when joining", async () => {
  mockConnectedHarness.userId = undefined
  mockConnectedHarness.convexAuthenticated = false
  const view = render(app(<JoinRoute />, false))
  fireEvent.changeText(view.getByTestId("manual-code-input"), "AB12CD")
  expect(mockOpenAuth).not.toHaveBeenCalled()
  fireEvent.press(view.getByTestId("claim-seat-button"))
  expect(mockOpenAuth).toHaveBeenCalledTimes(1)
  expect(mockClaimSeat).not.toHaveBeenCalled()
  mockConnectedHarness.userId = "user-a"
  mockConnectedHarness.convexAuthenticated = true
  view.rerender(app(<JoinRoute />, true))
  await waitFor(() => expect(view.getByTestId("claim-seat-button")).toBeEnabled())
  expect(view.queryByText("Choose your player username")).toBeNull()
  fireEvent.press(view.getByTestId("claim-seat-button"))
  expect(view.getByText("Choose your player username")).toBeTruthy()
  fireEvent.press(view.getByText("Back to local play"))
  expect(view.getByTestId("manual-code-input").props.value).toBe("AB12CD")
})

it("loads the deck shelf without requiring a multiplayer username", async () => {
  const view = render(app(<DecksRoute />, true))
  await waitFor(() => expect(view.getByText("No decks yet")).toBeTruthy())
  expect(view.queryByText("Choose your player username")).toBeNull()
  expect(mockOpenAuth).not.toHaveBeenCalled()
})

it("keeps History filters open and selected through sign-in and sign-out", async () => {
  mockConnectedHarness.userId = undefined
  mockConnectedHarness.convexAuthenticated = false
  const view = render(app(<HistoryRoute />, false))
  fireEvent.press(view.getByTestId("history-filters-button"))
  fireEvent.press(view.getByTestId("history-date-7d"))
  mockConnectedHarness.userId = "user-a"
  mockConnectedHarness.convexAuthenticated = true
  view.rerender(app(<HistoryRoute />, true))
  await waitFor(() =>
    expect(view.getByTestId("history-date-7d").props.accessibilityState.selected).toBe(true),
  )
  mockConnectedHarness.userId = undefined
  mockConnectedHarness.convexAuthenticated = false
  view.rerender(app(<HistoryRoute />, false))
  expect(view.getByTestId("history-date-7d").props.accessibilityState.selected).toBe(true)
})
