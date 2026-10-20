import { act, render } from "@testing-library/react-native"

import LanGameRoute from "./LanGameRoute"
import type { LanSessionState } from "./lanSession"

const mockRouter = {
  back: jest.fn(),
  canGoBack: jest.fn(() => true),
  dismissTo: jest.fn(),
  push: jest.fn(),
  replace: jest.fn(),
}
const mockRedirect = jest.fn((_props: { href: unknown }) => null)
const mockBoard = jest.fn((_props: { onGameAbandoned: () => void }) => null)
const mockStore = {
  state: { status: "idle" } as LanSessionState,
  listeners: new Set<() => void>(),
}

jest.mock("expo-router", () => ({
  get router() {
    return mockRouter
  },
  Redirect: (props: { href: unknown }) => mockRedirect(props),
}))
jest.mock("@/screens/ConnectedBoardScreen", () => ({
  ConnectedBoardWithRuntime: (props: { onGameAbandoned: () => void }) => mockBoard(props),
}))
jest.mock("./lanAvailability", () => ({ lanPlayAvailable: () => true }))
jest.mock("./useLanGame", () => ({
  useLanGame: () => ({ status: "ready", projection: { publicId: "lan-1" } }),
}))
jest.mock("./lanSession", () => {
  const { useSyncExternalStore } = jest.requireActual<typeof import("react")>("react")
  const subscribe = (listener: () => void) => {
    mockStore.listeners.add(listener)
    return () => mockStore.listeners.delete(listener)
  }
  const getState = () => mockStore.state
  return {
    lanSession: {
      getState,
      resumeHostedGame: () => undefined,
      revealRole: jest.fn(),
      leave: () => {
        mockStore.state = { status: "idle" }
        mockStore.listeners.forEach((listener) => listener())
      },
    },
    useLanSession: () => useSyncExternalStore(subscribe, getState),
  }
})

function setSession(state: LanSessionState) {
  mockStore.state = state
  act(() => mockStore.listeners.forEach((listener) => listener()))
}

const projection = { publicId: "lan-1" } as LanSessionState["projection"]

function abandonFromBoard(before: LanSessionState, after: LanSessionState) {
  mockStore.state = before
  render(<LanGameRoute />)
  const { onGameAbandoned } = mockBoard.mock.calls[0][0]
  setSession(after)
  act(() => onGameAbandoned())
}

beforeEach(() => jest.clearAllMocks())

it("sends a host who abandons to Play instead of its emptied lobby", () => {
  abandonFromBoard(
    { role: "host", status: "connected", seatKey: "host", projection },
    { status: "idle" },
  )
  expect(mockRouter.dismissTo).toHaveBeenCalledTimes(1)
  expect(mockRouter.dismissTo).toHaveBeenCalledWith({
    pathname: "/",
    params: { destination: "play" },
  })
  expect(mockRouter.back).not.toHaveBeenCalled()
  expect(mockRouter.replace).not.toHaveBeenCalled()
  expect(mockRedirect).not.toHaveBeenCalled()
})

it("sends a guest who leaves a game the host ended straight to Play", () => {
  abandonFromBoard(
    { role: "guest", status: "connected", seatKey: "guest", projection },
    { status: "idle", seatKey: "guest", projection },
  )
  expect(mockRouter.dismissTo).toHaveBeenCalledTimes(1)
  expect(mockRouter.dismissTo).toHaveBeenCalledWith({
    pathname: "/",
    params: { destination: "play" },
  })
  expect(mockRouter.back).not.toHaveBeenCalled()
})
