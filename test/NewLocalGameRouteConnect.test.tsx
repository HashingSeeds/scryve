import type { ReactNode } from "react"
import { act, render } from "@testing-library/react-native"

import type { ConnectedHostFeed, LocalConnectFeed } from "@/screens/NewGameScreen"

import NewLocalGameRoute, { ReportLocalConnect } from "../src/app/game/new"

jest.mock("expo-router", () => ({
  router: { replace: jest.fn(), back: jest.fn() },
  useFocusEffect: jest.fn(),
  useLocalSearchParams: () => ({}),
}))
jest.mock("@/features/auth/CloudScreen", () => ({
  CloudScreen: ({ children }: { children: (access: { ready: boolean }) => ReactNode }) => (
    <>{children({ ready: true })}</>
  ),
}))
const mockSetupSource = jest.fn()
jest.mock("@/features/connected/ConnectedSetupSource", () => ({
  ConnectedSetupSource: (props: unknown) => {
    mockSetupSource(props)
    return null
  },
}))
const mockFeedPublish = jest.fn()
jest.mock("@/features/connected/LocalGamePublishSource", () => ({
  LocalGamePublishSource: ({ children }: { children: (feed: LocalConnectFeed) => ReactNode }) =>
    children({ publish: mockFeedPublish }),
}))
jest.mock("@/features/game/domain", () => ({
  applyGameCommand: jest.fn(),
  defaultCommandContext: jest.fn(),
  hasLocalGameStarted: () => true,
}))
jest.mock("@/features/game/localPersistence", () => ({
  localGameRepository: {
    loadActiveGame: () => ({ id: "game-1" }),
    loadSettings: () => ({}),
  },
}))
jest.mock("@/screens/JoinConnectedScreen", () => ({
  JoinConnectedScreen: () => null,
}))
const mockNewGameScreen = jest.fn()
jest.mock("@/screens/NewGameScreen", () => ({
  NewGameScreen: (props: unknown) => {
    mockNewGameScreen(props)
    return null
  },
}))

function lastLocalConnect() {
  const calls = mockNewGameScreen.mock.calls
  return (calls[calls.length - 1][0] as { localConnect?: LocalConnectFeed }).localConnect
}

function setupOnChange() {
  return mockSetupSource.mock.calls[0][0].onChange as (feed: ConnectedHostFeed) => void
}

const hostFeed = {
  busy: false,
  host: jest.fn(),
  exitGame: async () => false,
}

describe("NewLocalGameRoute", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("reports the publish feed once per field change, not per object identity", () => {
    const onChange = jest.fn()
    const publish = jest.fn()
    const view = render(<ReportLocalConnect feed={{ publish }} onChange={onChange} />)
    expect(onChange).toHaveBeenCalledTimes(1)

    view.rerender(<ReportLocalConnect feed={{ publish }} onChange={onChange} />)
    expect(onChange).toHaveBeenCalledTimes(1)

    view.rerender(<ReportLocalConnect feed={{ busy: true, publish }} onChange={onChange} />)
    expect(onChange).toHaveBeenCalledTimes(2)
    expect(onChange).toHaveBeenLastCalledWith({ busy: true, publish })
  })

  it("withholds the connect flow until the account gate reports", () => {
    render(<NewLocalGameRoute />)
    expect(lastLocalConnect()).toBeUndefined()

    act(() => setupOnChange()({ ...hostFeed, ready: false }))
    expect(lastLocalConnect()).toBeUndefined()
  })

  it("passes the access gate through while it is pending", () => {
    render(<NewLocalGameRoute />)
    const request = jest.fn()
    act(() =>
      setupOnChange()({ ...hostFeed, ready: false, access: { label: "Sign in to host", request } }),
    )
    expect(lastLocalConnect()).toMatchObject({ access: { label: "Sign in to host" } })
  })

  it("passes the connect flow without access once the gate clears", () => {
    render(<NewLocalGameRoute />)
    act(() => setupOnChange()({ ...hostFeed, ready: true }))
    const feed = lastLocalConnect()
    expect(feed).toBeDefined()
    expect(feed?.access).toBeUndefined()
  })
})
