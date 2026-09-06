import { createContext } from "react"
import { router } from "expo-router"
import { fireEvent, render, waitFor } from "@testing-library/react-native"

import { resetConnectedProfileBootstrapForTests } from "@/features/connected/useConnectedProfile"
import { localGameRepository } from "@/features/game/localPersistence"

import {
  connectedHarness as mockConnectedHarness,
  resetConnectedHarness,
  mockCreateLobby,
  themed,
} from "./support/connectedHarness"
import NewLocalGameRoute from "../src/app/game/new"

const mockOpenAuth = jest.fn()
const mockAuthContext = createContext({
  configured: true,
  isLoaded: false,
  isSignedIn: false,
  openAuth: mockOpenAuth,
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

function route(isLoaded: boolean, isSignedIn: boolean, configured = true) {
  return themed(
    <mockAuthContext.Provider value={{ configured, isLoaded, isSignedIn, openAuth: mockOpenAuth }}>
      <NewLocalGameRoute />
    </mockAuthContext.Provider>,
  )
}

beforeEach(() => {
  resetConnectedHarness()
  resetConnectedProfileBootstrapForTests()
  localGameRepository.clearActiveGame()
  mockUsername = "alex"
})

it("keeps the draft through session loading, sign-in, query recovery, and reconnecting", async () => {
  mockConnectedHarness.userLoaded = false
  mockConnectedHarness.convexLoading = true
  mockConnectedHarness.convexAuthenticated = false
  const view = render(route(false, false))
  fireEvent.changeText(view.getByTestId("player-name-1"), "Draft player")
  fireEvent.press(view.getByTestId("starting-counter-increment"))
  fireEvent.press(view.getByTestId("mode-connected"))
  expect(view.getByLabelText("Life, 21")).toBeTruthy()
  expect(view.getByTestId("host-connected-button")).toBeDisabled()
  expect(mockOpenAuth).not.toHaveBeenCalled()
  mockConnectedHarness.userLoaded = true
  mockConnectedHarness.userId = undefined
  view.rerender(route(true, false))
  fireEvent.press(view.getByTestId("host-connected-button"))
  expect(mockOpenAuth).toHaveBeenCalledTimes(1)
  fireEvent.press(view.getByTestId("connected-action-join"))
  expect(mockOpenAuth).toHaveBeenCalledTimes(1)
  expect(router.push).toHaveBeenCalledWith("/connected/join")
  mockConnectedHarness.userId = "user-a"
  mockConnectedHarness.convexLoading = false
  mockConnectedHarness.convexAuthenticated = true
  mockConnectedHarness.activeGamesStatus = "LoadingFirstPage"
  view.rerender(route(true, true))
  expect(view.getByTestId("host-connected-button")).toBeDisabled()
  mockConnectedHarness.activeGamesStatus = "Exhausted"
  view.rerender(route(true, true))
  await waitFor(() => expect(view.getByTestId("host-connected-button")).toBeEnabled())

  const errorLog = jest.spyOn(console, "error").mockImplementation(() => undefined)
  try {
    mockConnectedHarness.paginatedError = new Error("Temporary query failure")
    view.rerender(route(true, true))
    expect(view.getByLabelText("Life, 21")).toBeTruthy()
    expect(view.getByTestId("host-connected-button")).toBeDisabled()
    mockConnectedHarness.paginatedError = undefined
    fireEvent.press(view.getByTestId("retry-connected-host-preparation"))
    await waitFor(() => expect(view.getByTestId("host-connected-button")).toBeEnabled())
  } finally {
    errorLog.mockRestore()
  }

  mockConnectedHarness.socketConnected = false
  view.rerender(route(true, true))
  expect(view.getByTestId("host-connected-button")).toBeDisabled()
  fireEvent.press(view.getByTestId("mode-local"))
  expect(view.getByTestId("player-name-1").props.value).toBe("Draft player")
  expect(view.getByTestId("start-game-button")).toBeEnabled()
  mockConnectedHarness.socketConnected = true
  view.rerender(route(true, true))
  fireEvent.press(view.getByTestId("mode-connected"))
  await waitFor(() => expect(view.getByTestId("host-connected-button")).toBeEnabled())
  fireEvent.press(view.getByTestId("host-connected-button"))
  await waitFor(() =>
    expect(mockCreateLobby).toHaveBeenCalledWith(expect.objectContaining({ startingLife: 21 })),
  )
})

it("requests a missing username on action without discarding setup", async () => {
  mockUsername = null
  const view = render(route(true, true))
  fireEvent.press(view.getByTestId("starting-counter-increment"))
  fireEvent.press(view.getByTestId("mode-connected"))
  expect(view.queryByText("Choose your player username")).toBeNull()
  fireEvent.press(view.getByTestId("host-connected-button"))
  await waitFor(() => expect(view.getByText("Choose your player username")).toBeTruthy())
  expect(mockCreateLobby).not.toHaveBeenCalled()
  fireEvent.press(view.getByText("Back to local play"))
  expect(view.queryByText("Choose your player username")).toBeNull()
  expect(view.getByLabelText("Life, 21")).toBeTruthy()
  mockUsername = "alex"
  view.rerender(route(true, true))
  await waitFor(() => expect(view.getByTestId("host-connected-button")).toBeEnabled())
})

it("keeps local setup usable without cloud configuration", () => {
  const view = render(route(true, false, false))
  fireEvent.press(view.getByTestId("mode-connected"))
  expect(view.getByTestId("host-connected-button")).toBeDisabled()
  fireEvent.press(view.getByTestId("mode-local"))
  expect(view.getByTestId("start-game-button")).toBeEnabled()
})
