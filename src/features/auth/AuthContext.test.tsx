import { useEffect, type ReactNode } from "react"
import { Pressable } from "react-native"
import { act, fireEvent, render, screen } from "@testing-library/react-native"
import { ConvexReactClient } from "convex/react"

import { Text } from "@/components/Text"
import { reconnectAfterOutage } from "@/features/connected/convexReconnect"
import { NearbyOnlyWebSocket, setNearbyOnly } from "@/features/lan/nearbyOnly"
import { ThemeProvider } from "@/theme/context"

import { CloudProviders, useAuthAccess } from "./AuthContext"
import { writeSessionHint } from "./sessionHint"

const mockUseAuth = jest.fn((_options?: unknown) => ({ isLoaded: true, isSignedIn: false }))
const mockUseUser = jest.fn((): { user: { id: string } | null } => ({ user: { id: "user_test" } }))
const mockClerkProvider = jest.fn(({ children }: { children: ReactNode }) => children)
const mockConvexClient = { url: "https://example.convex.cloud" }
jest.mock("react-native/Libraries/Modal/Modal", () => {
  const React = jest.requireActual("react")
  const NativeView = jest.requireActual("react-native").View
  const MockModal = ({ children, ...props }: { children: ReactNode }) =>
    React.createElement(NativeView, props, children)
  return { __esModule: true, default: MockModal }
})
jest.mock("@clerk/expo", () => ({
  ClerkProvider: (props: { children: ReactNode }) => mockClerkProvider(props),
  useAuth: (options: unknown) => mockUseAuth(options),
  useUser: () => mockUseUser(),
}))
jest.mock("./tokenCache", () => ({ tokenCache: {} }))
jest.mock("@clerk/expo/resource-cache", () => ({ resourceCache: "native-resource-cache" }))
jest.mock("@/utils/crashReporting", () => ({
  ErrorType: { HANDLED: "Handled" },
  reportCrash: jest.fn(),
}))
jest.mock("@/features/auth/config", () => ({
  readPublicCloudConfig: () => ({
    configured: true,
    value: {
      clerkPublishableKey: "pk_test_example",
      convexUrl: "https://example.convex.cloud",
      inviteOrigin: "https://example.com",
    },
  }),
}))
jest.mock("@clerk/expo/native-components", () => {
  const NativeText = jest.requireActual("react-native").Text
  return { AuthView: () => <NativeText testID="native-auth-view">Auth</NativeText> }
})
jest.mock("@/features/lan/nearbyOnly", () => ({
  ...jest.requireActual("@/features/lan/nearbyOnly"),
  NearbyOnlyWebSocket: class {},
}))
jest.mock("@/features/connected/convexReconnect", () => ({
  reconnectConvexOnNetworkReturn: () => () => undefined,
  reconnectAfterOutage: jest.fn(() => () => undefined),
}))
jest.mock("convex/react", () => ({
  ConvexProviderWithAuth: ({ children }: { children: ReactNode }) => children,
  ConvexReactClient: jest.fn(() => ({
    subscribeToConnectionState: () => () => undefined,
    close: jest.fn(async () => undefined),
  })),
  useConvex: () => mockConvexClient,
  useMutation: () => jest.fn(),
  useConvexAuth: () => ({ isAuthenticated: false, isLoading: true }),
  useConvexConnectionState: () => ({ isWebSocketConnected: false }),
}))
jest.mock("@/features/billing/RevenueCatContext", () => ({
  RevenueCatProvider: ({ children }: { children: ReactNode }) => children,
}))
jest.mock("@/features/billing/RevenueCatSyncSession", () => ({
  RevenueCatSyncSession: () => null,
}))

function Harness() {
  const auth = useAuthAccess()
  return (
    <Pressable testID="open-auth" onPress={auth.openAuth}>
      <Text text="Open" />
    </Pressable>
  )
}

describe("native auth experience", () => {
  it("keeps AuthView mounted while the modal is hidden and preserves pending sessions", () => {
    render(
      <ThemeProvider initialContext="light">
        <CloudProviders>
          <Harness />
        </CloudProviders>
      </ThemeProvider>,
    )
    expect(screen.getByTestId("native-auth-view")).toBeTruthy()
    expect(screen.getByTestId("auth-modal").props.visible).toBe(false)
    expect(mockUseAuth).toHaveBeenCalledWith({ treatPendingAsSignedOut: false })
    fireEvent.press(screen.getByTestId("open-auth"))
    expect(screen.getByTestId("auth-modal").props.visible).toBe(true)
  })

  it("keeps one Convex client across nearby only, reconnecting it at once when switched off", () => {
    jest.mocked(ConvexReactClient).mockClear()
    render(
      <ThemeProvider initialContext="light">
        <CloudProviders>
          <Harness />
        </CloudProviders>
      </ThemeProvider>,
    )
    expect(ConvexReactClient).toHaveBeenCalledTimes(1)
    expect(ConvexReactClient).toHaveBeenCalledWith("https://example.convex.cloud", {
      initialAuthTokenReuse: true,
      webSocketConstructor: NearbyOnlyWebSocket,
    })
    expect(reconnectAfterOutage).not.toHaveBeenCalled()

    act(() => setNearbyOnly(true))
    expect(reconnectAfterOutage).not.toHaveBeenCalled()
    act(() => setNearbyOnly(false))

    expect(ConvexReactClient).toHaveBeenCalledTimes(1)
    expect(reconnectAfterOutage).toHaveBeenCalledTimes(1)
  })

  it("passes the native Clerk resource cache alongside the token cache", () => {
    render(
      <ThemeProvider initialContext="light">
        <CloudProviders>
          <Harness />
        </CloudProviders>
      </ThemeProvider>,
    )

    expect(mockClerkProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        __experimental_resourceCache: "native-resource-cache",
        tokenCache: {},
        afterSignOutUrl: undefined,
      }),
    )
  })

  const mounts = jest.fn()
  function MountProbe() {
    useEffect(() => mounts(), [])
    return null
  }
  const app = () => (
    <ThemeProvider initialContext="light">
      <CloudProviders>
        <MountProbe />
      </CloudProviders>
    </ThemeProvider>
  )

  describe("account changes", () => {
    beforeEach(() => {
      mounts.mockClear()
      writeSessionHint({ userId: null })
    })
    afterEach(() => {
      mockUseAuth.mockReset().mockReturnValue({ isLoaded: true, isSignedIn: false })
      mockUseUser.mockReset().mockReturnValue({ user: { id: "user_test" } })
    })
    function signIn(id: string) {
      mockUseAuth.mockReturnValue({ isLoaded: true, isSignedIn: true })
      mockUseUser.mockReturnValue({ user: { id } })
    }
    function signOut() {
      mockUseAuth.mockReturnValue({ isLoaded: true, isSignedIn: false })
      mockUseUser.mockReturnValue({ user: null })
    }

    it("keeps the app mounted when a signed-out player signs in", () => {
      signOut()
      const view = render(app())
      signIn("user_test")
      view.rerender(app())
      expect(mounts).toHaveBeenCalledTimes(1)
    })

    it("starts the app fresh on sign-out and on a switch to another account", () => {
      signIn("user_test")
      const view = render(app())
      signOut()
      view.rerender(app())
      expect(mounts).toHaveBeenCalledTimes(2)
      signIn("user_test")
      view.rerender(app())
      expect(mounts).toHaveBeenCalledTimes(2)
      signIn("user_other")
      view.rerender(app())
      expect(mounts).toHaveBeenCalledTimes(3)
    })
  })

  describe("launch with a session hint", () => {
    beforeEach(() => {
      mounts.mockClear()
      writeSessionHint({ userId: "user_test" })
      mockUseAuth.mockReturnValue({ isLoaded: false, isSignedIn: false })
      mockUseUser.mockReturnValue({ user: null })
    })
    afterEach(() => {
      mockUseAuth.mockReset().mockReturnValue({ isLoaded: true, isSignedIn: false })
      mockUseUser.mockReset().mockReturnValue({ user: { id: "user_test" } })
    })

    it("keeps the app mounted when Clerk confirms the hinted user", () => {
      const view = render(app())
      mockUseAuth.mockReturnValue({ isLoaded: true, isSignedIn: true })
      mockUseUser.mockReturnValue({ user: { id: "user_test" } })
      view.rerender(app())
      expect(mounts).toHaveBeenCalledTimes(1)
    })

    it("starts the app fresh when Clerk confirms a different user", () => {
      const view = render(app())
      mockUseAuth.mockReturnValue({ isLoaded: true, isSignedIn: true })
      mockUseUser.mockReturnValue({ user: { id: "user_other" } })
      view.rerender(app())
      expect(mounts).toHaveBeenCalledTimes(2)
    })
  })
})
