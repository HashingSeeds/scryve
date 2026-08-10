import type { ReactNode } from "react"
import { Share, StyleSheet } from "react-native"
import { useKeepAwake } from "expo-keep-awake"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native"

import { Screen } from "@/components/Screen"
import { ThemeProvider } from "@/theme/context"

import { ConnectedBoardScreen } from "./ConnectedBoardScreen"
import { ConnectedHistoryScreen } from "./ConnectedHistoryScreen"
import { ConnectedHomeScreen } from "./ConnectedHomeScreen"
import { ConnectedLobbyScreen } from "./ConnectedLobbyScreen"
import { JoinConnectedScreen } from "./JoinConnectedScreen"

const mockClaimSeat = jest.fn(async () => ({ publicId: "game-public", seat: 2 }))
const mockSyncUser = jest.fn(async () => "user")
const mockStart = jest.fn(async () => ({ publicId: "game-public" }))
const mockLeave = jest.fn(async () => ({ publicId: "game-public", left: true }))
const mockAbandon = jest.fn(async () => ({ publicId: "game-public" }))
const mockCreateLobby = jest.fn(async () => ({
  publicId: "new-game",
  inviteToken: "A".repeat(43),
  manualCode: "AB12CD",
}))
const mockMigrate = jest.fn(async () => ({ isDone: true, continueCursor: "done" }))
let mockActiveGames: any[] = []
let mockPaginatedArgs: unknown[] = []
let mockProjection: any
const mockChangeLife = jest.fn()
const mockDismissFailed = jest.fn()
const mockFinish = jest.fn(async () => undefined)
const mockUseConnectedGame = jest.fn((_publicId: string, _ownerId?: string) => mockRuntime)
let mockRuntime: any
let mockSocketConnected = true
let mockUserId = "user-a"
let mockUserLoaded = true
const mockMigrationOwners = new Set<string>()

function openConnectedMenu() {
  fireEvent.press(screen.getByTestId("game-menu-button"))
}

function openConnectedStatus() {
  openConnectedMenu()
  fireEvent.press(screen.getByTestId("connected-status-button"))
}

function openConnectedFinish() {
  openConnectedMenu()
  fireEvent.press(screen.getByTestId("finish-connected-game-button"))
}

jest.mock("@clerk/expo", () => ({
  useUser: () => ({
    isLoaded: mockUserLoaded,
    user: { id: mockUserId, fullName: "Ada", imageUrl: "https://example.test/a.png" },
  }),
}))
jest.mock("convex/react", () => ({
  useConvexConnectionState: () => ({ isWebSocketConnected: mockSocketConnected }),
  useMutation: (reference: unknown) => {
    const name = String(reference)
    if (name.includes("claimSeat")) return mockClaimSeat
    if (name.includes("startGame")) return mockStart
    if (name.includes("leaveMyGame")) return mockLeave
    if (name.includes("abandonGame")) return mockAbandon
    if (name.includes("createLobby")) return mockCreateLobby
    if (name.includes("migrateMyGameMemberships")) return mockMigrate
    return mockSyncUser
  },
  useQuery: () => mockProjection,
  usePaginatedQuery: (_reference: unknown, args: unknown) => {
    mockPaginatedArgs.push(args)
    return {
      results: args === "skip" ? [] : mockActiveGames,
      status: "Exhausted",
      loadMore: jest.fn(),
    }
  },
}))
jest.mock("@/features/connected/useConnectedGame", () => ({
  useConnectedGame: (publicId: string, ownerId?: string) => mockUseConnectedGame(publicId, ownerId),
}))
jest.mock("@/features/connected/persistence", () => ({
  ConnectedGameRepository: jest.fn((_storage, ownerId: string) => ({
    isMembershipMigrationComplete: () => mockMigrationOwners.has(ownerId),
    markMembershipMigrationComplete: () => mockMigrationOwners.add(ownerId),
  })),
}))
jest.mock("@/features/auth/config", () => ({
  readPublicCloudConfig: () => ({
    configured: true,
    value: {
      clerkPublishableKey: "public-test-key",
      convexUrl: "https://example.convex.cloud",
      inviteOrigin: "https://play.count.example",
    },
  }),
}))
jest.mock("../../convex/_generated/api", () => ({
  api: {
    users: { syncCurrent: "users.syncCurrent" },
    games: {
      claimSeat: "games.claimSeat",
      startGame: "games.startGame",
      leaveMyGame: "games.leaveMyGame",
      abandonGame: "games.abandonGame",
      migrateMyGameMemberships: "games.migrateMyGameMemberships",
      activeConnectedGames: "games.activeConnectedGames",
      createLobby: "games.createLobby",
      lobbyProjection: "games.lobbyProjection",
      connectedHistory: "games.connectedHistory",
    },
  },
}))
jest.mock("react-native-qrcode-svg", () => ({
  __esModule: true,
  default: ({
    value,
    quietZone,
    size,
    ecl,
  }: {
    value: string
    quietZone: number
    size: number
    ecl: string
  }) => {
    const NativeText = jest.requireActual("react-native").Text
    return (
      <NativeText
        testID="invite-qr"
        accessibilityHint={`size-${size}-quiet-zone-${quietZone}-ecl-${ecl}`}
      >
        {value}
      </NativeText>
    )
  },
}))

function themed(children: ReactNode) {
  return <ThemeProvider initialContext="light">{children}</ThemeProvider>
}

describe("connected lobby screens", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSocketConnected = true
    mockUserId = "user-a"
    mockUserLoaded = true
    mockActiveGames = []
    mockPaginatedArgs = []
    mockUseConnectedGame.mockImplementation(() => mockRuntime)
    mockMigrationOwners.clear()
    mockProjection = {
      publicId: "game-public",
      status: "active",
      playerCount: 2,
      startingLife: 40,
      ruleset: "commander",
      isHost: false,
      players: [
        { seat: 1, displayName: "Ada", color: "#7C3AED", currentLife: 40 },
        { seat: 2, displayName: "Grace", color: "#2563EB", currentLife: 40 },
      ],
    }
    mockRuntime = {
      projection: {
        schemaVersion: 1,
        ...mockProjection,
        eventSequence: 0,
        serverUpdatedAt: 1,
        recentOperationIds: [],
        players: [
          {
            playerId: "player-1",
            seat: 1,
            displayName: "Ada",
            color: "#7C3AED",
            currentLife: 40,
            pendingDelta: 0,
            controlledByMe: true,
          },
          {
            playerId: "player-2",
            seat: 2,
            displayName: "Grace",
            color: "#2563EB",
            currentLife: 40,
            pendingDelta: 0,
            controlledByMe: false,
          },
        ],
      },
      pending: [],
      failed: [],
      connectionStatus: "connected",
      changeLife: mockChangeLife,
      finish: mockFinish,
      dismissFailed: mockDismissFailed,
      finishing: false,
    }
  })

  it("claims a seat from a manual code with editable display metadata", async () => {
    const onJoined = jest.fn()
    render(themed(<JoinConnectedScreen onJoined={onJoined} />))
    fireEvent.changeText(screen.getByTestId("manual-code-input"), "AB12CD")
    fireEvent.changeText(screen.getByTestId("join-display-name"), "Grace")
    fireEvent.press(screen.getByTestId("claim-seat-button"))
    await waitFor(() => expect(onJoined).toHaveBeenCalledWith("game-public"))
    expect(mockClaimSeat).toHaveBeenCalledWith(
      expect.objectContaining({ manualCode: "AB12CD", displayName: "Grace" }),
    )
  })

  it("validates connected display names before claiming a seat", () => {
    render(themed(<JoinConnectedScreen onJoined={jest.fn()} />))
    fireEvent.changeText(screen.getByTestId("manual-code-input"), "AB12CD")
    fireEvent.changeText(screen.getByTestId("join-display-name"), "   ")
    expect(screen.getByText("Enter a player name.")).toBeTruthy()
    expect(screen.getByTestId("claim-seat-button").props.accessibilityState.disabled).toBe(true)
  })

  it("hosts with validated 2–6 seat and 20/30/40/custom life presets", async () => {
    const onLobbyCreated = jest.fn()
    render(themed(<ConnectedHomeScreen onLobbyCreated={onLobbyCreated} onJoin={jest.fn()} />))
    await waitFor(() => expect(screen.getByTestId("host-connected-button")).toBeEnabled())
    fireEvent.press(screen.getByLabelText("4 seats"))
    fireEvent.press(screen.getByLabelText("Start at 40 life"))
    fireEvent.press(screen.getByTestId("host-connected-button"))
    await waitFor(() => expect(onLobbyCreated).toHaveBeenCalled())
    expect(mockCreateLobby).toHaveBeenCalledWith(
      expect.objectContaining({ playerCount: 4, startingLife: 40, ruleset: "standard" }),
    )

    fireEvent.press(screen.getByLabelText("Use custom starting life"))
    fireEvent.changeText(screen.getByTestId("connected-starting-life"), "0")
    expect(screen.getByTestId("host-connected-button").props.accessibilityState.disabled).toBe(true)
  })

  it("starts connected setup at the top without duplicating the header safe area", async () => {
    const view = render(
      themed(<ConnectedHomeScreen onLobbyCreated={jest.fn()} onJoin={jest.fn()} />),
    )

    await waitFor(() => expect(screen.getByTestId("host-connected-button")).toBeEnabled())
    expect(view.UNSAFE_getByType(Screen).props.safeAreaEdges).toEqual(["bottom"])
  })

  it("hides custom starting life behind an ellipsis until requested", async () => {
    render(themed(<ConnectedHomeScreen onLobbyCreated={jest.fn()} onJoin={jest.fn()} />))

    await waitFor(() => expect(screen.getByTestId("host-connected-button")).toBeEnabled())
    expect(screen.queryByTestId("connected-starting-life")).toBeNull()
    fireEvent.press(screen.getByLabelText("Use custom starting life"))
    expect(screen.getByTestId("connected-starting-life")).toBeTruthy()
  })

  it("surfaces a cold-start active connected game for resume", async () => {
    mockActiveGames = [{ publicId: "resumable-game", status: "active", ruleset: "commander" }]
    const onResume = jest.fn()
    render(
      themed(
        <ConnectedHomeScreen onLobbyCreated={jest.fn()} onJoin={jest.fn()} onResume={onResume} />,
      ),
    )
    await waitFor(() => expect(screen.getByTestId("resume-connected-resumable-game")).toBeTruthy())
    fireEvent.press(screen.getByTestId("resume-connected-resumable-game"))
    expect(onResume).toHaveBeenCalledWith(mockActiveGames[0])
    await waitFor(() => expect(mockMigrate).toHaveBeenCalledWith({ cursor: null }))
    expect(mockPaginatedArgs[0]).toBe("skip")
    expect(mockPaginatedArgs).toContainEqual({})
  })

  it("identifies an existing hosted lobby and prevents stacking another one", async () => {
    mockActiveGames = [
      {
        publicId: "hosted-lobby",
        status: "lobby",
        ruleset: "standard",
        playerCount: 2,
        isHost: true,
        updatedAt: 1_800_000_000_000,
      },
    ]
    render(themed(<ConnectedHomeScreen onLobbyCreated={jest.fn()} onJoin={jest.fn()} />))

    await waitFor(() => expect(screen.getByTestId("resume-connected-hosted-lobby")).toBeTruthy())
    expect(screen.getByText(/Hosted lobby · standard · 2 seats/)).toBeTruthy()
    expect(screen.getByTestId("host-connected-button").props.accessibilityState.disabled).toBe(true)
    expect(screen.getByText(/Resume or finish\/abandon your hosted game/i)).toBeTruthy()
  })

  it("renders one connected history card when device memberships repeat a game", () => {
    mockActiveGames = [
      {
        publicId: "finished-game",
        players: [{}, {}],
        eventCount: 3,
        finishedAt: 1_800_000_000_000,
      },
      {
        publicId: "finished-game",
        players: [{}, {}],
        eventCount: 3,
        finishedAt: 1_800_000_000_000,
      },
    ]
    render(themed(<ConnectedHistoryScreen onBack={jest.fn()} onSelect={jest.fn()} />))
    expect(screen.getAllByText("Finished connected game")).toHaveLength(1)
  })

  it("does not restart a completed membership migration on the next home mount", async () => {
    const first = render(
      themed(<ConnectedHomeScreen onLobbyCreated={jest.fn()} onJoin={jest.fn()} />),
    )
    await waitFor(() => expect(mockMigrate).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(mockMigrationOwners).toContain("user-a"))
    first.unmount()
    mockSyncUser.mockClear()
    render(themed(<ConnectedHomeScreen onLobbyCreated={jest.fn()} onJoin={jest.fn()} />))
    await waitFor(() => expect(mockSyncUser).toHaveBeenCalled())
    expect(mockMigrate).toHaveBeenCalledTimes(1)
  })

  it("skips resume/history synchronously when switching from ready A to unsynced B", async () => {
    mockActiveGames = [{ publicId: "account-a-game", status: "active", ruleset: "standard" }]
    let resolveAccountB!: (value: string) => void
    const accountBPending = new Promise<string>((resolve) => {
      resolveAccountB = resolve
    })
    const view = render(
      themed(
        <ConnectedHomeScreen onLobbyCreated={jest.fn()} onJoin={jest.fn()} onHistory={jest.fn()} />,
      ),
    )
    await waitFor(() => expect(screen.getByTestId("resume-connected-account-a-game")).toBeTruthy())
    mockSyncUser.mockImplementationOnce(() => accountBPending)
    mockUserId = "user-b"
    view.rerender(
      themed(
        <ConnectedHomeScreen onLobbyCreated={jest.fn()} onJoin={jest.fn()} onHistory={jest.fn()} />,
      ),
    )
    expect(screen.queryByTestId("resume-connected-account-a-game")).toBeNull()
    expect(
      screen.getByRole("button", { name: "Connected history" }).props.accessibilityState.disabled,
    ).toBe(true)
    expect(mockPaginatedArgs.at(-1)).toBe("skip")
    await act(async () => resolveAccountB("user-b"))
  })

  it("enables only the signed-in player's accessible controls", () => {
    render(themed(<ConnectedBoardScreen publicId="game-public" />))
    expect(
      StyleSheet.flatten(screen.getByTestId("connected-game-board").props.style),
    ).toMatchObject({ flex: 1, width: "100%" })
    expect(screen.queryByTestId("connected-game-board-scroll")).toBeNull()
    const ownedAddOne = screen.getByTestId("life-seat-1-1")
    const viewOnlyAddOne = screen.getByTestId("life-seat-2-1")
    expect(ownedAddOne.props.accessibilityState.disabled).toBe(false)
    expect(ownedAddOne.props.accessibilityLabel).toBe("Seat 1, Ada, add 1 life")
    expect(viewOnlyAddOne.props.accessibilityState.disabled).toBe(true)
    expect(screen.queryByText("Your seat")).toBeNull()
    expect(screen.queryByText("View only")).toBeNull()
    expect(screen.getByTestId("life-card-seat-1").props.accessibilityLabel).toContain("Your seat")
    expect(
      screen.getAllByTestId("player-mark-spin-line", { includeHiddenElements: true }),
    ).toHaveLength(1)
    fireEvent.press(ownedAddOne)
    expect(mockChangeLife).toHaveBeenCalledWith("player-1", 1)
    expect(useKeepAwake).toHaveBeenCalledWith("count-connected-game")
  })

  it("shows pending, connection, and retained failure state accessibly", () => {
    mockRuntime = {
      ...mockRuntime,
      pending: [{ event: { operationId: "operation-1" } }],
      connectionStatus: "offline",
      failed: [
        {
          action: { event: { operationId: "operation-2", delta: 5 } },
          reason: "Game is not active",
        },
      ],
    }
    render(themed(<ConnectedBoardScreen publicId="game-public" />))
    expect(screen.getByTestId("connected-game-board")).toBeTruthy()
    openConnectedStatus()
    expect(screen.getByLabelText("Needs attention, 1 failed change, 1 change pending")).toBeTruthy()
    expect(screen.getByTestId("connected-failed-action").props.accessibilityRole).toBe("alert")
    fireEvent.press(screen.getByText("Dismiss after reviewing"))
    expect(mockDismissFailed).toHaveBeenCalledWith("operation-2")
  })

  it("shows actionable offline-queue backpressure", () => {
    mockRuntime = {
      ...mockRuntime,
      changeError:
        "The offline queue for pending changes is full. Reconnect and sync before making more changes.",
    }
    render(themed(<ConnectedBoardScreen publicId="game-public" />))
    openConnectedStatus()
    expect(screen.getByTestId("connected-change-error").props.accessibilityRole).toBe("alert")
    expect(screen.getByText(/Reconnect and sync/i)).toBeTruthy()
  })

  it("renders a resumed finished summary read-only with the shared menu actions disabled", () => {
    const onHistory = jest.fn()
    mockRuntime = {
      ...mockRuntime,
      projection: {
        ...mockRuntime.projection,
        status: "finished",
        eventSequence: 12,
      },
    }
    render(
      themed(
        <ConnectedBoardScreen publicId="game-public" onBack={jest.fn()} onHistory={onHistory} />,
      ),
    )
    expect(screen.getByTestId("connected-game-board")).toBeTruthy()
    openConnectedStatus()
    expect(screen.getByText("Connected summary")).toBeTruthy()
    expect(screen.getByText("12 accepted life changes · final")).toBeTruthy()
    expect(
      [1, 2].every(
        (seat) => screen.getByTestId(`life-seat-${seat}-1`).props.accessibilityState.disabled,
      ),
    ).toBe(true)
    expect(screen.queryByTestId("finish-connected-game-button")).toBeNull()
    fireEvent.press(screen.getByText("Close"))
    openConnectedMenu()
    expect(screen.queryByTestId("connected-history-button")).toBeNull()
    expect(
      screen.getByTestId("finish-connected-game-button").props.accessibilityState.disabled,
    ).toBe(true)
    expect(screen.getByTestId("connected-undo-button").props.accessibilityState.disabled).toBe(true)
  })

  it("uses a connected end-game pop-up with cancel and confirm outcomes", async () => {
    mockRuntime = {
      ...mockRuntime,
      projection: { ...mockRuntime.projection, isHost: true },
    }
    render(themed(<ConnectedBoardScreen publicId="game-public" />))
    openConnectedFinish()
    expect(screen.getByTestId("connected-finish-confirmation").props.accessibilityRole).toBe(
      "alert",
    )
    fireEvent.press(screen.getByText("Cancel"))
    expect(screen.queryByTestId("connected-finish-confirmation")).toBeNull()
    expect(mockFinish).not.toHaveBeenCalled()

    openConnectedFinish()
    fireEvent.press(screen.getByTestId("confirm-connected-finish-button"))
    await waitFor(() => expect(mockFinish).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.queryByTestId("connected-finish-confirmation")).toBeNull())
  })

  it("keeps connected finish unavailable while offline or life changes are pending", () => {
    mockRuntime = {
      ...mockRuntime,
      connectionStatus: "offline",
      projection: { ...mockRuntime.projection, isHost: true },
    }
    const offline = render(themed(<ConnectedBoardScreen publicId="game-public" />))
    openConnectedMenu()
    expect(
      screen.getByTestId("finish-connected-game-button").props.accessibilityState.disabled,
    ).toBe(true)
    fireEvent.press(screen.getByTestId("connected-status-button"))
    expect(screen.getByText(/Reconnect before finishing/i)).toBeTruthy()
    offline.unmount()

    mockRuntime = {
      ...mockRuntime,
      connectionStatus: "syncing",
      pending: [{ event: { operationId: "operation-1", playerId: "player-1" } }],
      projection: { ...mockRuntime.projection, isHost: true },
    }
    render(themed(<ConnectedBoardScreen publicId="game-public" />))
    openConnectedMenu()
    expect(
      screen.getByTestId("finish-connected-game-button").props.accessibilityState.disabled,
    ).toBe(true)
    fireEvent.press(screen.getByTestId("connected-status-button"))
    expect(screen.getByText(/Wait for 1 pending change/i)).toBeTruthy()
    expect(screen.getByText("1 pending")).toBeTruthy()
  })

  it("does not imply an in-flight connected finish can be cancelled", () => {
    mockRuntime = {
      ...mockRuntime,
      projection: { ...mockRuntime.projection, isHost: true },
    }
    const view = render(themed(<ConnectedBoardScreen publicId="game-public" />))
    openConnectedFinish()
    mockRuntime = { ...mockRuntime, finishing: true }
    view.rerender(themed(<ConnectedBoardScreen publicId="game-public" />))
    expect(
      screen.getByTestId("cancel-connected-finish-button").props.accessibilityState.disabled,
    ).toBe(true)
    expect(screen.getByText("Ending…")).toBeTruthy()
  })

  it("surfaces a connected finish mutation error and keeps recovery/navigation available", async () => {
    const onHistory = jest.fn()
    mockRuntime = {
      ...mockRuntime,
      projection: { ...mockRuntime.projection, isHost: true },
    }
    const view = render(
      themed(
        <ConnectedBoardScreen publicId="game-public" onBack={jest.fn()} onHistory={onHistory} />,
      ),
    )
    openConnectedFinish()
    fireEvent.press(screen.getByTestId("confirm-connected-finish-button"))
    await waitFor(() => expect(screen.queryByTestId("connected-finish-confirmation")).toBeNull())

    mockRuntime = { ...mockRuntime, finishError: "Could not finish the game" }
    view.rerender(
      themed(
        <ConnectedBoardScreen publicId="game-public" onBack={jest.fn()} onHistory={onHistory} />,
      ),
    )
    openConnectedStatus()
    expect(screen.getByTestId("connected-finish-error").props.accessibilityRole).toBe("alert")
    expect(screen.getByText("Could not finish the game")).toBeTruthy()
    fireEvent.press(screen.getByText("Close"))
    openConnectedMenu()
    expect(screen.getByTestId("finish-connected-game-button")).toBeTruthy()
    expect(onHistory).not.toHaveBeenCalled()
  })

  it("keeps a directly linked lobby board read-only without queuing invalid actions", () => {
    mockRuntime = {
      ...mockRuntime,
      projection: { ...mockRuntime.projection, status: "lobby", isHost: true },
    }
    render(themed(<ConnectedBoardScreen publicId="game-public" />))
    const addOne = [1, 2].map((seat) => screen.getByTestId(`life-seat-${seat}-1`))
    expect(addOne.every((control) => control.props.accessibilityState.disabled)).toBe(true)
    fireEvent.press(addOne[0])
    expect(mockChangeLife).not.toHaveBeenCalled()
    openConnectedStatus()
    expect(screen.getByText("This game is lobby and is read-only on the board.")).toBeTruthy()
    fireEvent.press(screen.getByText("Close"))
    openConnectedMenu()
    expect(
      screen.getByTestId("finish-connected-game-button").props.accessibilityState.disabled,
    ).toBe(true)
  })

  it("remounts runtime state when the dynamic route switches games", () => {
    mockUseConnectedGame.mockImplementation((publicId: string) => {
      const React = jest.requireActual("react")
      const [mountedPublicId] = React.useState(publicId)
      return {
        ...mockRuntime,
        projection: {
          ...mockRuntime.projection,
          publicId: mountedPublicId,
          players: mockRuntime.projection.players.map((player: any, index: number) => ({
            ...player,
            displayName: index === 0 ? mountedPublicId : player.displayName,
          })),
        },
      }
    })
    const view = render(themed(<ConnectedBoardScreen publicId="game-a" />))
    expect(screen.getByTestId("life-card-seat-1").props.accessibilityLabel).toContain("game-a")
    view.rerender(themed(<ConnectedBoardScreen publicId="game-b" />))
    expect(screen.getByTestId("life-card-seat-1").props.accessibilityLabel).not.toContain("game-a")
    expect(screen.getByTestId("life-card-seat-1").props.accessibilityLabel).toContain("game-b")
  })

  it("remounts and withholds account-A runtime state after an A-to-B account switch", () => {
    mockUseConnectedGame.mockImplementation((_publicId: string, ownerId?: string) => {
      const React = jest.requireActual("react")
      const [mountedOwner] = React.useState(ownerId)
      return {
        ...mockRuntime,
        projection: {
          ...mockRuntime.projection,
          players: mockRuntime.projection.players.map((player: any, index: number) => ({
            ...player,
            displayName: index === 0 ? mountedOwner : player.displayName,
          })),
        },
      }
    })
    const view = render(themed(<ConnectedBoardScreen publicId="game-public" />))
    expect(screen.getByTestId("life-card-seat-1").props.accessibilityLabel).toContain("user-a")
    mockUserId = "user-b"
    view.rerender(themed(<ConnectedBoardScreen publicId="game-public" />))
    expect(screen.getByTestId("life-card-seat-1").props.accessibilityLabel).not.toContain("user-a")
    expect(screen.getByTestId("life-card-seat-1").props.accessibilityLabel).toContain("user-b")
    expect(mockUseConnectedGame).toHaveBeenLastCalledWith("game-public", "user-b")
  })

  it("does not mount a runtime or expose controls before Clerk user hydration", () => {
    mockUserLoaded = false
    const view = render(themed(<ConnectedBoardScreen publicId="game-public" />))
    expect(screen.getByText("Loading your connected-game session…")).toBeTruthy()
    expect(mockUseConnectedGame).not.toHaveBeenCalled()
    expect(screen.queryByTestId("life-seat-1-1")).toBeNull()
    mockUserLoaded = true
    view.rerender(themed(<ConnectedBoardScreen publicId="game-public" />))
    expect(mockUseConnectedGame).toHaveBeenCalledWith("game-public", "user-a")
  })

  it("renders a recoverable accessible error when a start race fails", async () => {
    mockProjection = { ...mockProjection, status: "lobby", isHost: true, invitation: null }
    mockStart.mockRejectedValueOnce(new Error("Lobby already started"))
    const onStarted = jest.fn()
    render(themed(<ConnectedLobbyScreen publicId="game-public" onStarted={onStarted} />))
    fireEvent.press(screen.getByTestId("start-connected-game-button"))
    await waitFor(() => expect(screen.getByTestId("connected-action-error")).toBeTruthy())
    expect(screen.getByTestId("connected-action-error").props.accessibilityRole).toBe("alert")
    expect(onStarted).not.toHaveBeenCalled()
  })

  it("renders and shares the production HTTPS invite with an actionable manual fallback", async () => {
    const inviteToken = "A".repeat(43)
    mockProjection = {
      ...mockProjection,
      status: "lobby",
      invitation: { token: inviteToken, manualCode: "AB12CD" },
    }
    const share = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" })
    const view = render(
      themed(<ConnectedLobbyScreen publicId="game-public" onStarted={jest.fn()} />),
    )
    const inviteUrl = `https://play.count.example/join/${inviteToken}`
    expect(view.UNSAFE_getByType(Screen).props.preset).toBe("auto")
    expect(screen.getByTestId("invite-qr").props.children).toBe("count://join/AB12CD")
    expect(screen.getByTestId("invite-qr").props.accessibilityHint).toBe(
      "size-184-quiet-zone-16-ecl-H",
    )
    expect(screen.getByText("Scan to join or enter code AB12CD.")).toBeTruthy()
    expect(screen.getByText("Code: AB12CD")).toBeTruthy()
    expect(screen.queryByText("Ada")).toBeNull()
    expect(screen.queryByText("Grace")).toBeNull()
    expect(screen.queryByTestId("share-manual-code-button")).toBeNull()
    fireEvent.press(screen.getByTestId("share-invite-button"))
    await waitFor(() =>
      expect(share).toHaveBeenCalledWith({
        message: `Join my Count game: ${inviteUrl}`,
        url: inviteUrl,
      }),
    )
    view.unmount()

    mockProjection = {
      ...mockProjection,
      status: "lobby",
      invitation: { token: "invalid", manualCode: "ZX90QW" },
    }
    render(themed(<ConnectedLobbyScreen publicId="game-public" onStarted={jest.fn()} />))
    expect(screen.getByTestId("invite-qr").props.children).toBe("count://join/ZX90QW")
    fireEvent.press(screen.getByTestId("share-invite-button"))
    await waitFor(() =>
      expect(share).toHaveBeenLastCalledWith({ message: "Join my Count game with code ZX90QW" }),
    )
    expect(screen.getByText(/Enter code ZX90QW/i)).toBeTruthy()
  })

  it("does not queue start or seat claim from cached UI while the socket is offline", () => {
    mockSocketConnected = false
    mockProjection = { ...mockProjection, status: "lobby", isHost: true, invitation: null }
    const lobby = render(
      themed(<ConnectedLobbyScreen publicId="game-public" onStarted={jest.fn()} />),
    )
    expect(screen.getByTestId("connected-start-offline").props.accessibilityRole).toBe("alert")
    fireEvent.press(screen.getByTestId("start-connected-game-button"))
    expect(mockStart).not.toHaveBeenCalled()
    lobby.unmount()

    render(themed(<JoinConnectedScreen onJoined={jest.fn()} />))
    expect(screen.getByText("Seat claims are online-only.")).toBeTruthy()
    fireEvent.press(screen.getByTestId("claim-seat-button"))
    expect(mockSyncUser).not.toHaveBeenCalled()
    expect(mockClaimSeat).not.toHaveBeenCalled()
  })

  it("moves a non-host to the board exactly once when the reactive lobby starts", async () => {
    mockProjection = { ...mockProjection, status: "lobby", isHost: false, invitation: null }
    const onStarted = jest.fn()
    const view = render(
      themed(<ConnectedLobbyScreen publicId="game-public" onStarted={onStarted} />),
    )
    expect(screen.getByText("Waiting for the host to start.")).toBeTruthy()
    mockProjection = { ...mockProjection, status: "active" }
    view.rerender(themed(<ConnectedLobbyScreen publicId="game-public" onStarted={onStarted} />))
    await waitFor(() => expect(onStarted).toHaveBeenCalledTimes(1))
    view.rerender(themed(<ConnectedLobbyScreen publicId="game-public" onStarted={onStarted} />))
    expect(onStarted).toHaveBeenCalledTimes(1)
  })

  it("confirms lobby leave and navigates only after the mutation succeeds", async () => {
    mockProjection = { ...mockProjection, status: "lobby", isHost: false, invitation: null }
    const onLeft = jest.fn()
    render(
      themed(
        <ConnectedLobbyScreen
          publicId="game-public"
          onStarted={jest.fn()}
          onBack={jest.fn()}
          onLeft={onLeft}
        />,
      ),
    )
    fireEvent.press(screen.getByTestId("leave-connected-lobby-button"))
    expect(screen.getByTestId("connected-lobby-leave-confirmation")).toBeTruthy()
    fireEvent.press(screen.getByText("Cancel"))
    expect(mockLeave).not.toHaveBeenCalled()
    fireEvent.press(screen.getByTestId("leave-connected-lobby-button"))
    fireEvent.press(screen.getByTestId("confirm-connected-lobby-leave-button"))
    await waitFor(() =>
      expect(mockLeave).toHaveBeenCalledWith(
        expect.objectContaining({ publicId: "game-public", deviceId: expect.any(String) }),
      ),
    )
    expect(onLeft).toHaveBeenCalledTimes(1)
  })

  it("requires a host to abandon instead of hiding an unfinished lobby", () => {
    mockProjection = { ...mockProjection, status: "lobby", isHost: true, invitation: null }
    render(themed(<ConnectedLobbyScreen publicId="game-public" onStarted={jest.fn()} />))

    expect(screen.queryByTestId("leave-connected-lobby-button")).toBeNull()
    expect(screen.getByTestId("abandon-connected-lobby-button")).toBeTruthy()
  })

  it("explains online-only lobby exits when offline, including a dropped confirmation", () => {
    mockProjection = { ...mockProjection, status: "lobby", isHost: false, invitation: null }
    const view = render(
      themed(
        <ConnectedLobbyScreen publicId="game-public" onStarted={jest.fn()} onLeft={jest.fn()} />,
      ),
    )
    fireEvent.press(screen.getByTestId("leave-connected-lobby-button"))
    mockSocketConnected = false
    view.rerender(
      themed(
        <ConnectedLobbyScreen publicId="game-public" onStarted={jest.fn()} onLeft={jest.fn()} />,
      ),
    )
    expect(screen.getByTestId("connected-lobby-exit-offline").props.accessibilityRole).toBe("alert")
    expect(screen.getByText(/Reconnect before leaving or abandoning/i)).toBeTruthy()
    expect(
      screen.getByTestId("confirm-connected-lobby-leave-button").props.accessibilityState.disabled,
    ).toBe(true)
  })

  it.each([
    ["leave", false],
    ["abandon", true],
  ] as const)("keeps the lobby recoverable when %s is rejected", async (action, isHost) => {
    mockProjection = { ...mockProjection, status: "lobby", isHost, invitation: null }
    const mutation = action === "leave" ? mockLeave : mockAbandon
    mutation.mockRejectedValueOnce(new Error(`${action} rejected`))
    const onLeft = jest.fn()
    render(
      themed(<ConnectedLobbyScreen publicId="game-public" onStarted={jest.fn()} onLeft={onLeft} />),
    )
    fireEvent.press(screen.getByTestId(`${action}-connected-lobby-button`))
    fireEvent.press(screen.getByTestId(`confirm-connected-lobby-${action}-button`))
    await waitFor(() =>
      expect(screen.getByText(new RegExp(`${action} rejected`, "i"))).toBeTruthy(),
    )
    expect(screen.getByTestId("connected-action-error").props.accessibilityRole).toBe("alert")
    expect(screen.getByTestId("connected-lobby-leave-confirmation")).toBeTruthy()
    expect(onLeft).not.toHaveBeenCalled()
  })
})
