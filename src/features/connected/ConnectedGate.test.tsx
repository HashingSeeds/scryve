import type { ReactNode } from "react"
import { ActivityIndicator } from "react-native"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native"

import { Button } from "@/components/Button"
import { Screen } from "@/components/Screen"
import { ThemeProvider } from "@/theme/context"

import { ConnectedGate, resetSyncedProfileCacheForTests } from "./ConnectedGate"

let mockSocketConnected = true
let mockConvexAuthenticated = true
let mockConvexLoading = false
let mockClerkLoaded = true
let mockClerkSignedIn = true
let mockUserLoaded = true
let mockUserId: string | undefined = "user-a"
const mockOpenAuth = jest.fn()
const mockSyncCurrent = jest.fn(async () => "user")
const mockUsernameCheck = jest.fn(async () => ({ acceptable: true }))
const mockCachedGames = new Set<string>()
let mockCachedProjectionPublicId: string | undefined

jest.mock("@/features/auth/AuthContext", () => ({
  useAuthAccess: () => ({
    configured: true,
    isLoaded: mockClerkLoaded,
    isSignedIn: mockClerkSignedIn,
    openAuth: mockOpenAuth,
  }),
}))
jest.mock("@clerk/expo", () => ({
  useUser: () => ({
    isLoaded: mockUserLoaded,
    user: mockUserId ? { id: mockUserId, fullName: "Ada", imageUrl: undefined } : null,
  }),
}))
jest.mock("convex/react", () => ({
  useConvexAuth: () => ({
    isAuthenticated: mockConvexAuthenticated,
    isLoading: mockConvexLoading,
  }),
  useConvexConnectionState: () => ({ isWebSocketConnected: mockSocketConnected }),
  useMutation: () => mockSyncCurrent,
  useConvex: () => ({ query: mockUsernameCheck }),
}))
jest.mock("./persistence", () => ({
  ConnectedGameRepository: jest.fn((_storage, ownerId: string) => ({
    loadProjection: (gameId: string) =>
      mockCachedGames.has(`${ownerId}:${gameId}`)
        ? { publicId: mockCachedProjectionPublicId ?? gameId }
        : null,
  })),
}))
jest.mock("../../../convex/_generated/api", () => ({
  api: {
    users: { syncCurrent: "syncCurrent" },
    moderation: { usernameIsAcceptable: "usernameIsAcceptable" },
  },
}))

function themed(children: ReactNode) {
  return <ThemeProvider initialContext="light">{children}</ThemeProvider>
}

function gate(children: ReactNode, onBack = jest.fn()) {
  return themed(
    <ConnectedGate allowOfflineBootstrap offlineGameId="game-public" onBack={onBack}>
      {children}
    </ConnectedGate>,
  )
}

describe("connected cold-offline and authentication gate", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resetSyncedProfileCacheForTests()
    mockCachedGames.clear()
    mockCachedProjectionPublicId = undefined
    mockSocketConnected = true
    mockConvexAuthenticated = true
    mockConvexLoading = false
    mockClerkLoaded = true
    mockClerkSignedIn = true
    mockUserLoaded = true
    mockUserId = "user-a"
  })

  it("keeps an established board and taps mounted through a socket drop", async () => {
    const onTap = jest.fn()
    const child = <Button testID="offline-life-tap" text="+1" onPress={onTap} />
    const view = render(gate(child))
    await waitFor(() => expect(screen.getByTestId("offline-life-tap")).toBeTruthy())
    mockSocketConnected = false
    mockCachedGames.add("user-a:game-public")
    view.rerender(gate(child))
    fireEvent.press(screen.getByTestId("offline-life-tap"))
    expect(onTap).toHaveBeenCalledTimes(1)
  })

  it("renders the known owner's cached board before Convex finishes cold offline auth", () => {
    mockSocketConnected = false
    mockConvexLoading = true
    mockConvexAuthenticated = false
    mockClerkLoaded = false
    mockCachedGames.add("user-a:game-public")
    const onTap = jest.fn()
    render(gate(<Button testID="cold-offline-life-tap" text="+1" onPress={onTap} />))
    fireEvent.press(screen.getByTestId("cold-offline-life-tap"))
    expect(onTap).toHaveBeenCalledTimes(1)
    expect(mockSyncCurrent).not.toHaveBeenCalled()
  })

  it.each([
    ["unknown owner", undefined],
    ["different owner", "user-b"],
  ])("does not expose account A's cached board to an %s", (_label, ownerId) => {
    mockSocketConnected = false
    mockConvexLoading = true
    mockConvexAuthenticated = false
    mockUserId = ownerId
    mockCachedGames.add("user-a:game-public")
    render(gate(<Button testID="private-cached-board" text="+1" />))
    expect(screen.queryByTestId("private-cached-board")).toBeNull()
    expect(
      screen.getByText("Connected play is offline. Local play remains available."),
    ).toBeTruthy()
    expect(screen.queryByText(/issuer|deployment/i)).toBeNull()
  })

  it("does not bootstrap a route from a cached projection for a different game", () => {
    mockSocketConnected = false
    mockCachedGames.add("user-a:game-public")
    mockCachedProjectionPublicId = "game-other"
    render(gate(<Button testID="wrong-game-board" text="Board" />))
    expect(screen.queryByTestId("wrong-game-board")).toBeNull()
    expect(
      screen.getByText("Connected play is offline. Local play remains available."),
    ).toBeTruthy()
  })

  it("offers re-authentication and a safe exit for a signed-out or expired session", () => {
    mockClerkSignedIn = false
    mockUserId = undefined
    const onBack = jest.fn()
    render(gate(<Button testID="private-cached-board" text="+1" />, onBack))
    expect(screen.queryByTestId("private-cached-board")).toBeNull()
    expect(screen.getByText(/session expired|signed out/i)).toBeTruthy()
    expect(screen.queryByText(/issuer|deployment/i)).toBeNull()
    fireEvent.press(screen.getByText("Re-authenticate"))
    fireEvent.press(screen.getByText("Back to local play"))
    expect(mockOpenAuth).toHaveBeenCalledTimes(1)
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it("reserves issuer/deployment guidance for an online Convex rejection", () => {
    mockConvexAuthenticated = false
    const view = render(gate(<Button testID="private-cached-board" text="+1" />))
    expect(screen.queryByTestId("private-cached-board")).toBeNull()
    expect(screen.getByText(/issuer or deployment configuration/i)).toBeTruthy()
    expect(view.UNSAFE_getByType(Screen).props.safeAreaEdges).toEqual(["top", "bottom"])
  })

  it("skips the profile gate when re-entering after an earlier successful sync", async () => {
    const child = <Button testID="warm-connected-board" text="Board" />
    const first = render(gate(child))
    await waitFor(() => expect(screen.getByTestId("warm-connected-board")).toBeTruthy())
    first.unmount()

    mockSyncCurrent.mockImplementationOnce(() => new Promise<string>(() => undefined))
    render(gate(child))

    expect(screen.getByTestId("warm-connected-board")).toBeTruthy()
    expect(screen.queryByText("Preparing your connected-play profile…")).toBeNull()
  })

  it("withholds the loading interstitial until the reveal delay elapses", () => {
    jest.useFakeTimers()
    try {
      mockClerkLoaded = false
      mockSyncCurrent.mockImplementationOnce(() => new Promise<string>(() => undefined))
      render(gate(<Button testID="delayed-board" text="Board" />))

      expect(screen.queryByText("Checking your session… Local play remains available.")).toBeNull()
      expect(screen.queryByText("Back to local play")).toBeNull()
      expect(screen.UNSAFE_queryByType(ActivityIndicator)).toBeNull()

      act(() => jest.advanceTimersByTime(200))

      expect(screen.getByText("Checking your session… Local play remains available.")).toBeTruthy()
      expect(screen.UNSAFE_getByType(ActivityIndicator)).toBeTruthy()
    } finally {
      jest.useRealTimers()
    }
  })

  it("offers retry, re-authentication, and a safe exit after profile setup fails", async () => {
    mockSyncCurrent.mockRejectedValueOnce(new Error("Could not sync profile"))
    const onBack = jest.fn()
    render(gate(<Button testID="connected-board" text="Board" />, onBack))

    await waitFor(() => expect(screen.getByText("Could not sync profile")).toBeTruthy())
    expect(screen.queryByText("Preparing your connected-play profile…")).toBeNull()
    fireEvent.press(screen.getByText("Re-authenticate"))
    fireEvent.press(screen.getByText("Back to local play"))
    expect(mockOpenAuth).toHaveBeenCalledTimes(1)
    expect(onBack).toHaveBeenCalledTimes(1)

    fireEvent.press(screen.getByText("Retry connected setup"))
    await waitFor(() => expect(mockSyncCurrent).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.getByTestId("connected-board")).toBeTruthy())
  })
})
