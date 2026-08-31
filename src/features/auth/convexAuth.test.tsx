import { act, renderHook } from "@testing-library/react-native"

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

function clerkAuth(
  getToken: jest.Mock<Promise<string | null>, [options?: TokenOptions]>,
  sessionClaims?: Record<string, unknown>,
) {
  return {
    isLoaded: true,
    isSignedIn: true,
    getToken,
    orgId: null,
    orgRole: null,
    sessionId: "session-1",
    sessionClaims,
  }
}

describe("createConvexAuthHook", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("uses Clerk's no-options cached-token path for native Convex integration", async () => {
    const getToken = jest.fn<Promise<string | null>, [options?: TokenOptions]>()
    getToken.mockResolvedValue("cached-token")
    const useAuthFromClerk = jest.fn(() => clerkAuth(getToken, { aud: "convex" }))
    const useConvexAuth = createConvexAuthHook(useAuthFromClerk, 0)
    const { result } = renderHook(useConvexAuth)

    await result.current.fetchAccessToken({ forceRefreshToken: false })

    expect(getToken).toHaveBeenCalledWith()
  })

  it("bypasses the cache only for forced native refreshes", async () => {
    const getToken = jest.fn<Promise<string | null>, [options?: TokenOptions]>()
    getToken.mockResolvedValue("fresh-token")
    const useConvexAuth = createConvexAuthHook(() => clerkAuth(getToken, { aud: "convex" }), 0)
    const { result } = renderHook(useConvexAuth)

    await result.current.fetchAccessToken({ forceRefreshToken: true })

    expect(getToken).toHaveBeenCalledWith({ skipCache: true })
  })

  it("uses the Convex JWT template when native integration claims are absent", async () => {
    const getToken = jest.fn<Promise<string | null>, [options?: TokenOptions]>()
    getToken.mockResolvedValue("template-token")
    const useConvexAuth = createConvexAuthHook(() => clerkAuth(getToken), 0)
    const { result } = renderHook(useConvexAuth)

    await result.current.fetchAccessToken({ forceRefreshToken: false })

    expect(getToken).toHaveBeenCalledWith({ template: "convex", skipCache: false })
  })

  it("reports Clerk token failures and returns null to Convex", async () => {
    const tokenError = new Error("Token request failed")
    const getToken = jest.fn<Promise<string | null>, [options?: TokenOptions]>()
    getToken.mockRejectedValue(tokenError)
    const useConvexAuth = createConvexAuthHook(() => clerkAuth(getToken, { aud: "convex" }), 0)
    const { result } = renderHook(useConvexAuth)

    await expect(result.current.fetchAccessToken({ forceRefreshToken: true })).resolves.toBeNull()

    expect(reportCrash).toHaveBeenCalledWith(tokenError, ErrorType.HANDLED)
  })

  it("keeps the last committed Clerk session after a discarded render", async () => {
    const committedGetToken = jest.fn<Promise<string | null>, [options?: TokenOptions]>()
    committedGetToken.mockResolvedValue("committed-token")
    const discardedGetToken = jest.fn<Promise<string | null>, [options?: TokenOptions]>()
    discardedGetToken.mockResolvedValue("discarded-token")
    let auth = clerkAuth(committedGetToken, { aud: "convex" })
    let discardRender = false
    const useConvexAuth = createConvexAuthHook(() => auth, 0)
    const view = renderHook(() => {
      const result = useConvexAuth()
      if (discardRender) throw new Error("Discard this render")
      return result
    })
    const fetchAccessToken = view.result.current.fetchAccessToken

    auth = clerkAuth(discardedGetToken, { aud: "convex" })
    discardRender = true
    expect(() => view.rerender(undefined)).toThrow("Discard this render")
    await fetchAccessToken({ forceRefreshToken: false })

    expect(committedGetToken).toHaveBeenCalledWith()
    expect(discardedGetToken).not.toHaveBeenCalled()
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
