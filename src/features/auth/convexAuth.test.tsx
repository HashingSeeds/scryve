import type { ReactNode } from "react"
import { act, renderHook } from "@testing-library/react-native"
import type { ConvexReactClient } from "convex/react"

import { ErrorType, reportCrash } from "@/utils/crashReporting"

import { ConvexAuthReconnect, createConvexAuthHook } from "./convexAuth"

type TokenOptions = { template?: "convex"; skipCache?: boolean }

const mockUseConvexAuth = jest.fn(() => ({
  isAuthenticated: false,
  isLoading: false,
}))
const mockUseConvexConnectionState = jest.fn(() => ({ isWebSocketConnected: false }))

jest.mock("convex/react", () => ({
  useConvexAuth: () => mockUseConvexAuth(),
  useConvexConnectionState: () => mockUseConvexConnectionState(),
}))
jest.mock("@/utils/crashReporting", () => ({
  ErrorType: { HANDLED: "Handled" },
  reportCrash: jest.fn(),
}))

function clerkAuth(getToken: jest.Mock<Promise<string | null>, [options?: TokenOptions]>) {
  return {
    isLoaded: true,
    isSignedIn: true,
    getToken,
    orgId: null,
    orgRole: null,
    sessionId: "session-1",
  }
}

describe("createConvexAuthHook", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("uses Clerk's no-options cached-token path", async () => {
    const getToken = jest.fn<Promise<string | null>, [options?: TokenOptions]>()
    getToken.mockResolvedValue("cached-token")
    const useAuthFromClerk = jest.fn(() => clerkAuth(getToken))
    const useConvexAuth = createConvexAuthHook(useAuthFromClerk, 0)
    const { result } = renderHook(useConvexAuth)

    await result.current.fetchAccessToken({ forceRefreshToken: false })

    expect(getToken).toHaveBeenCalledWith()
  })

  it("bypasses the cache only for forced native refreshes", async () => {
    const getToken = jest.fn<Promise<string | null>, [options?: TokenOptions]>()
    getToken.mockResolvedValue("fresh-token")
    const useConvexAuth = createConvexAuthHook(() => clerkAuth(getToken), 0)
    const { result } = renderHook(useConvexAuth)

    await result.current.fetchAccessToken({ forceRefreshToken: true })

    expect(getToken).toHaveBeenCalledWith({ skipCache: true })
  })

  it("reports Clerk token failures and returns null to Convex", async () => {
    const tokenError = new Error("Token request failed")
    const getToken = jest.fn<Promise<string | null>, [options?: TokenOptions]>()
    getToken.mockRejectedValue(tokenError)
    const useConvexAuth = createConvexAuthHook(() => clerkAuth(getToken), 0)
    const { result } = renderHook(useConvexAuth)

    await expect(result.current.fetchAccessToken({ forceRefreshToken: true })).resolves.toBeNull()

    expect(reportCrash).toHaveBeenCalledWith(tokenError, ErrorType.HANDLED)
  })

  it.each([
    [
      "offline",
      Object.assign(new Error("Network request failed while offline"), { code: "clerk_offline" }),
    ],
    [
      "unreachable",
      new Error(
        'Clerk: Network error at "https://clerk.example/v1/client" - TypeError: Network request failed. Please try again.',
      ),
    ],
    ["failing to fetch", new TypeError("Failed to fetch")],
  ])("returns null without reporting a crash when Clerk is %s", async (_, networkError) => {
    const getToken = jest.fn<Promise<string | null>, [options?: TokenOptions]>()
    getToken.mockRejectedValue(networkError)
    const useConvexAuth = createConvexAuthHook(() => clerkAuth(getToken), 0)
    const { result } = renderHook(useConvexAuth)

    await expect(result.current.fetchAccessToken({ forceRefreshToken: true })).resolves.toBeNull()

    expect(reportCrash).not.toHaveBeenCalled()
  })

  it("keeps the last committed Clerk session after a discarded render", async () => {
    const committedGetToken = jest.fn<Promise<string | null>, [options?: TokenOptions]>()
    committedGetToken.mockResolvedValue("committed-token")
    const discardedGetToken = jest.fn<Promise<string | null>, [options?: TokenOptions]>()
    discardedGetToken.mockResolvedValue("discarded-token")
    let auth = clerkAuth(committedGetToken)
    let discardRender = false
    const useConvexAuth = createConvexAuthHook(() => auth, 0)
    const view = renderHook(() => {
      const result = useConvexAuth()
      if (discardRender) throw new Error("Discard this render")
      return result
    })
    const fetchAccessToken = view.result.current.fetchAccessToken

    auth = clerkAuth(discardedGetToken)
    discardRender = true
    expect(() => view.rerender(undefined)).toThrow("Discard this render")
    await fetchAccessToken({ forceRefreshToken: false })

    expect(committedGetToken).toHaveBeenCalledWith()
    expect(discardedGetToken).not.toHaveBeenCalled()
  })
})

describe("createConvexAuthHook with Convex's auth provider", () => {
  const convex = jest.requireActual<typeof import("convex/react")>("convex/react")
  const signedOut = () => ({ ...clerkAuth(jest.fn()), isSignedIn: false, sessionId: null })

  it("reports a fresh sign-in as pending until Convex checks the new token", () => {
    let auth: ReturnType<Parameters<typeof createConvexAuthHook>[0]> = signedOut()
    const setAuth = jest.fn<void, [unknown, (isAuthenticated: boolean) => void]>()
    const client = { setAuth, clearAuth: jest.fn() } as unknown as ConvexReactClient
    const useAuth = createConvexAuthHook(() => auth, 0)
    const view = renderHook(convex.useConvexAuth, {
      wrapper: ({ children }: { children: ReactNode }) => (
        <convex.ConvexProviderWithAuth client={client} useAuth={useAuth}>
          {children}
        </convex.ConvexProviderWithAuth>
      ),
    })
    expect(view.result.current).toMatchObject({ isLoading: false, isAuthenticated: false })

    auth = clerkAuth(jest.fn())
    view.rerender(undefined)
    expect(view.result.current).toMatchObject({ isLoading: true, isAuthenticated: false })

    act(() => setAuth.mock.lastCall?.[1](true))
    expect(view.result.current).toMatchObject({ isLoading: false, isAuthenticated: true })
  })
})

describe("ConvexAuthReconnect", () => {
  beforeEach(() => {
    mockUseConvexAuth.mockReturnValue({ isAuthenticated: false, isLoading: false })
    mockUseConvexConnectionState.mockReturnValue({ isWebSocketConnected: false })
  })

  it("retries once when transport reconnects after Convex lost authentication", () => {
    const onReconnect = jest.fn()
    const view = renderHook(() => ConvexAuthReconnect({ onReconnect }))

    mockUseConvexConnectionState.mockReturnValue({ isWebSocketConnected: true })
    act(() => view.rerender(undefined))

    expect(onReconnect).toHaveBeenCalledTimes(1)
    view.unmount()
  })

  it("waits for loading to finish before retrying a reconnect without authentication", () => {
    const onReconnect = jest.fn()
    const view = renderHook(() => ConvexAuthReconnect({ onReconnect }))

    mockUseConvexAuth.mockReturnValue({ isAuthenticated: true, isLoading: false })
    mockUseConvexConnectionState.mockReturnValue({ isWebSocketConnected: true })
    act(() => view.rerender(undefined))
    expect(onReconnect).not.toHaveBeenCalled()

    mockUseConvexConnectionState.mockReturnValue({ isWebSocketConnected: false })
    act(() => view.rerender(undefined))
    mockUseConvexAuth.mockReturnValue({ isAuthenticated: false, isLoading: true })
    mockUseConvexConnectionState.mockReturnValue({ isWebSocketConnected: true })
    act(() => view.rerender(undefined))
    expect(onReconnect).not.toHaveBeenCalled()

    mockUseConvexAuth.mockReturnValue({ isAuthenticated: false, isLoading: false })
    act(() => view.rerender(undefined))
    expect(onReconnect).toHaveBeenCalledTimes(1)
    view.unmount()
  })
})
