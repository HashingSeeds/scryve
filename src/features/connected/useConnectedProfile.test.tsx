import type { ReactNode } from "react"
import { act, renderHook, waitFor } from "@testing-library/react-native"

import {
  ConnectedProfileProvider,
  resetConnectedProfileBootstrapForTests,
  useConnectedProfile,
} from "./useConnectedProfile"

let mockUserLoaded = true
let mockUserId: string | undefined = "user-a"
let mockSocketConnected = true
let mockConvexAuthenticated = true
let mockConvexLoading = false
let mockConvexRefreshing = false
const mockSyncCurrent = jest.fn<Promise<string>, [{ displayName: string; avatarUrl?: string }]>()

jest.mock("@clerk/expo", () => ({
  useUser: () => ({
    isLoaded: mockUserLoaded,
    user: mockUserId
      ? {
          id: mockUserId,
          fullName: mockUserId === "user-a" ? "Ada" : "Bea",
          username: mockUserId === "user-a" ? "ada_lovelace" : "bea_smith",
          imageUrl: `https://example.test/${mockUserId}.png`,
        }
      : null,
  }),
}))
jest.mock("convex/react", () => ({
  useConvexAuth: () => ({
    isAuthenticated: mockConvexAuthenticated,
    isLoading: mockConvexLoading,
    isRefreshing: mockConvexRefreshing,
  }),
  useConvexConnectionState: () => ({ isWebSocketConnected: mockSocketConnected }),
  useMutation: () => mockSyncCurrent,
}))
jest.mock("../../../convex/_generated/api", () => ({
  api: { users: { syncCurrent: "users.syncCurrent" } },
}))

function wrapper({ children }: { children: ReactNode }) {
  return <ConnectedProfileProvider>{children}</ConnectedProfileProvider>
}

describe("useConnectedProfile", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resetConnectedProfileBootstrapForTests()
    mockUserLoaded = true
    mockUserId = "user-a"
    mockSocketConnected = true
    mockConvexAuthenticated = true
    mockConvexLoading = false
    mockConvexRefreshing = false
    mockSyncCurrent.mockResolvedValue("convex-user-a")
  })

  it("reports a signed-out Clerk session without starting a sync", () => {
    mockUserId = undefined
    const { result } = renderHook(useConnectedProfile, { wrapper })

    expect(result.current).toMatchObject({ status: "error", reason: "signedOut" })
    expect(mockSyncCurrent).not.toHaveBeenCalled()
  })

  it("reports Convex authentication loading explicitly", () => {
    mockConvexAuthenticated = false
    mockConvexLoading = true
    const { result } = renderHook(useConnectedProfile, { wrapper })

    expect(result.current).toMatchObject({
      status: "loading",
      reason: "authentication",
      profile: { userId: "user-a" },
    })
    expect(mockSyncCurrent).not.toHaveBeenCalled()
  })

  it("reports Clerk session loading explicitly", () => {
    mockUserLoaded = false
    const { result } = renderHook(useConnectedProfile, { wrapper })

    expect(result.current).toMatchObject({ status: "loading", reason: "session" })
    expect(mockSyncCurrent).not.toHaveBeenCalled()
  })

  it("reports offline with the known account and keeps retry available", () => {
    mockSocketConnected = false
    const { result } = renderHook(useConnectedProfile, { wrapper })

    expect(result.current).toMatchObject({
      status: "offline",
      profile: { userId: "user-a" },
    })
    expect(result.current.retry).toEqual(expect.any(Function))
    expect(mockSyncCurrent).not.toHaveBeenCalled()
  })

  it("becomes ready after syncing the current Clerk profile", async () => {
    const { result } = renderHook(useConnectedProfile, { wrapper })

    expect(result.current).toMatchObject({ status: "loading", reason: "profile" })
    await waitFor(() => expect(result.current).toMatchObject({ status: "ready" }))
    expect(mockSyncCurrent).toHaveBeenCalledWith({
      displayName: "ada_lovelace",
      avatarUrl: "https://example.test/user-a.png",
    })
  })

  it("waits for Convex authentication refresh before syncing the profile", async () => {
    mockConvexRefreshing = true
    const { result } = renderHook(useConnectedProfile, { wrapper })

    expect(result.current).toMatchObject({ status: "loading", reason: "authentication" })
    expect(mockSyncCurrent).not.toHaveBeenCalled()
  })

  it("retries a failed profile sync", async () => {
    mockSyncCurrent
      .mockRejectedValueOnce(new Error("Profile sync failed"))
      .mockResolvedValueOnce("convex-user-a")
    const { result } = renderHook(useConnectedProfile, { wrapper })

    await waitFor(() =>
      expect(result.current).toMatchObject({
        status: "error",
        reason: "sync",
        message: "Profile sync failed",
      }),
    )
    act(() => result.current.retry())

    await waitFor(() => expect(result.current).toMatchObject({ status: "ready" }))
    expect(mockSyncCurrent).toHaveBeenCalledTimes(2)
  })

  it("withholds account A readiness while account B syncs", async () => {
    const { result, rerender } = renderHook(useConnectedProfile, { wrapper })
    await waitFor(() => expect(result.current).toMatchObject({ status: "ready" }))

    let resolveAccountB!: (value: string) => void
    mockSyncCurrent.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveAccountB = resolve
        }),
    )
    mockUserId = "user-b"
    rerender(undefined)

    expect(result.current).toMatchObject({
      status: "loading",
      reason: "profile",
      profile: { userId: "user-b" },
    })
    await act(async () => resolveAccountB("convex-user-b"))
    expect(result.current).toMatchObject({
      status: "ready",
      profile: { userId: "user-b" },
    })
  })
})
