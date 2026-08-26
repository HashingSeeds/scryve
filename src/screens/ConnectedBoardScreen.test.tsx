import { Dimensions, StyleSheet } from "react-native"
import { useKeepAwake } from "expo-keep-awake"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native"

import { ConnectedBoardScreen } from "./ConnectedBoardScreen"
import {
  connectedHarness,
  mockBlockPlayer,
  mockChangeLife,
  mockDismissFailed,
  mockFinish,
  mockReportPlayer,
  mockUseConnectedGame,
  resetConnectedHarness,
  themed,
} from "../../test/support/connectedHarness"

jest.mock("@clerk/expo", () =>
  jest
    .requireActual<typeof import("../../test/support/connectedHarness")>(
      "../../test/support/connectedHarness",
    )
    .createClerkMock(),
)
jest.mock("convex/react", () =>
  jest
    .requireActual<typeof import("../../test/support/connectedHarness")>(
      "../../test/support/connectedHarness",
    )
    .createConvexReactMock(),
)
jest.mock("@/features/connected/useConnectedGame", () =>
  jest
    .requireActual<typeof import("../../test/support/connectedHarness")>(
      "../../test/support/connectedHarness",
    )
    .createConnectedGameMock(),
)
jest.mock("../../convex/_generated/api", () =>
  jest
    .requireActual<typeof import("../../test/support/connectedHarness")>(
      "../../test/support/connectedHarness",
    )
    .createGeneratedApiMock(),
)

function openConnectedMenu() {
  fireEvent.press(screen.getByTestId("game-menu-button"))
}

function openConnectedPlayers() {
  openConnectedMenu()
  fireEvent.press(screen.getByTestId("players-button"))
}

function openConnectedStatus() {
  openConnectedMenu()
  fireEvent.press(screen.getByTestId("status-button"))
}

function openConnectedFinish() {
  openConnectedMenu()
  fireEvent.press(screen.getByTestId("end-game-button"))
}

describe("ConnectedBoardScreen", () => {
  beforeEach(resetConnectedHarness)

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
    connectedHarness.runtime = {
      ...connectedHarness.runtime,
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
    expect(screen.getByText("1 change needs attention")).toBeTruthy()
    fireEvent.press(screen.getByTestId("review-connected-sync-button"))
    expect(screen.getByLabelText("Needs attention, 1 failed change, 1 change pending")).toBeTruthy()
    expect(screen.getByTestId("connected-failed-action").props.accessibilityRole).toBe("alert")
    fireEvent.press(screen.getByText("Dismiss after reviewing"))
    expect(mockDismissFailed).toHaveBeenCalledWith("operation-2")
  })

  it("shows actionable offline-queue backpressure", () => {
    connectedHarness.runtime = {
      ...connectedHarness.runtime,
      changeError:
        "The offline queue for pending changes is full. Reconnect and sync before making more changes.",
    }
    render(themed(<ConnectedBoardScreen publicId="game-public" />))
    expect(screen.getByTestId("connected-sync-toast").props.accessibilityRole).toBe("alert")
    fireEvent.press(screen.getByTestId("review-connected-sync-button"))
    expect(screen.getByTestId("connected-change-error").props.accessibilityRole).toBe("alert")
    expect(screen.getByText(/Reconnect and sync/i)).toBeTruthy()
  })

  it("layers queued and syncing status over the board, then dismisses sync success", () => {
    jest.useFakeTimers()
    connectedHarness.runtime = {
      ...connectedHarness.runtime,
      connectionStatus: "offline",
      pending: [{ event: { operationId: "operation-1", playerId: "player-1" } }],
    }
    const view = render(themed(<ConnectedBoardScreen publicId="game-public" />))
    expect(
      StyleSheet.flatten(screen.getByTestId("connected-sync-toast-layer").props.style),
    ).toMatchObject({ position: "absolute" })
    expect(screen.getByText("1 change queued")).toBeTruthy()

    connectedHarness.runtime = { ...connectedHarness.runtime, connectionStatus: "syncing" }
    view.rerender(themed(<ConnectedBoardScreen publicId="game-public" />))
    expect(screen.queryByText("Syncing 1 change\u2026")).toBeNull()
    act(() => jest.advanceTimersByTime(1_500))
    expect(screen.getByText("Syncing 1 change\u2026")).toBeTruthy()

    connectedHarness.runtime = {
      ...connectedHarness.runtime,
      connectionStatus: "connected",
      pending: [],
    }
    view.rerender(themed(<ConnectedBoardScreen publicId="game-public" />))
    expect(screen.getByText("Changes synced")).toBeTruthy()
    act(() => jest.advanceTimersByTime(2_500))
    expect(screen.queryByTestId("connected-sync-toast")).toBeNull()
    jest.useRealTimers()
  })

  it("stays silent when a sync completes quickly", () => {
    jest.useFakeTimers()
    connectedHarness.runtime = {
      ...connectedHarness.runtime,
      connectionStatus: "syncing",
      pending: [{ event: { operationId: "operation-1", playerId: "player-1" } }],
    }
    const view = render(themed(<ConnectedBoardScreen publicId="game-public" />))
    expect(screen.queryByText("Syncing 1 change\u2026")).toBeNull()

    connectedHarness.runtime = {
      ...connectedHarness.runtime,
      connectionStatus: "connected",
      pending: [],
    }
    view.rerender(themed(<ConnectedBoardScreen publicId="game-public" />))
    expect(screen.queryByText("Changes synced")).toBeNull()
    act(() => jest.advanceTimersByTime(5_000))
    expect(screen.queryByTestId("connected-sync-toast")).toBeNull()
    jest.useRealTimers()
  })

  it("keeps an owner-scoped cached board usable offline with sync status over the grid", () => {
    connectedHarness.runtime = {
      ...connectedHarness.runtime,
      status: "ready",
      source: "cache",
      connectionStatus: "offline",
      pending: [{ event: { operationId: "operation-cached", playerId: "player-1" } }],
    }

    render(themed(<ConnectedBoardScreen publicId="game-public" />))

    expect(screen.getByTestId("life-card-seat-1").props.accessibilityLabel).toContain("Ada")
    expect(screen.getByTestId("life-seat-1-1").props.accessibilityState.disabled).toBe(false)
    expect(screen.getByText("1 change queued")).toBeTruthy()
    expect(
      StyleSheet.flatten(screen.getByTestId("connected-sync-toast-layer").props.style),
    ).toMatchObject({ position: "absolute" })
  })

  it("renders a resumed finished summary read-only with the shared menu actions disabled", () => {
    const onHistory = jest.fn()
    connectedHarness.runtime = {
      ...connectedHarness.runtime,
      projection: {
        ...connectedHarness.runtime.projection,
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
    expect(screen.queryByTestId("end-game-button")).toBeNull()
    fireEvent.press(screen.getByText("Close"))
    openConnectedMenu()
    expect(screen.queryByTestId("connected-history-button")).toBeNull()
    expect(screen.getByTestId("end-game-button").props.accessibilityState.disabled).toBe(true)
    expect(screen.getByTestId("players-button").props.accessibilityState.disabled).toBeFalsy()
  })

  it("reports an opponent from the board and confirms the block took effect", async () => {
    render(themed(<ConnectedBoardScreen publicId="game-public" onBack={jest.fn()} />))
    openConnectedPlayers()

    expect(screen.queryByTestId("report-player-seat-1")).toBeNull()
    fireEvent.press(screen.getByTestId("report-player-seat-2"))
    fireEvent.press(screen.getByText("Harassment or abuse"))
    await act(async () => {
      fireEvent.press(screen.getByTestId("submit-player-report-button"))
    })

    expect(mockReportPlayer).toHaveBeenCalledWith({
      publicId: "game-public",
      playerId: "player-2",
      reason: "harassment",
    })
    expect(screen.getByTestId("player-actions-confirmation")).toHaveTextContent(/blocked them/)
  })

  it("blocks an opponent without filing a report", async () => {
    render(themed(<ConnectedBoardScreen publicId="game-public" onBack={jest.fn()} />))
    openConnectedPlayers()
    await act(async () => {
      fireEvent.press(screen.getByTestId("block-player-seat-2"))
    })

    expect(mockBlockPlayer).toHaveBeenCalledWith({
      publicId: "game-public",
      playerId: "player-2",
    })
    expect(mockReportPlayer).not.toHaveBeenCalled()
  })

  it("keeps the board usable when a report fails", async () => {
    mockReportPlayer.mockRejectedValueOnce(new Error("Network unavailable") as never)
    render(themed(<ConnectedBoardScreen publicId="game-public" onBack={jest.fn()} />))
    openConnectedPlayers()
    fireEvent.press(screen.getByTestId("report-player-seat-2"))
    await act(async () => {
      fireEvent.press(screen.getByTestId("submit-player-report-button"))
    })

    expect(screen.getByTestId("player-actions-error")).toHaveTextContent(
      /Could not complete that request/,
    )
    expect(screen.getByTestId("submit-player-report-button")).toBeTruthy()
  })

  it("uses a connected end-game pop-up with cancel and confirm outcomes", async () => {
    connectedHarness.runtime = {
      ...connectedHarness.runtime,
      projection: { ...connectedHarness.runtime.projection, isHost: true },
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

  it("submits connected finish only once while the mutation is pending", async () => {
    let resolveFinish: (finished: boolean) => void = () => undefined
    mockFinish.mockReturnValueOnce(
      new Promise<boolean>((resolve) => {
        resolveFinish = resolve
      }),
    )
    connectedHarness.runtime = {
      ...connectedHarness.runtime,
      projection: { ...connectedHarness.runtime.projection, isHost: true },
    }
    render(themed(<ConnectedBoardScreen publicId="game-public" />))
    openConnectedFinish()
    fireEvent.press(screen.getByTestId("confirm-connected-finish-button"))
    fireEvent.press(screen.getByTestId("confirm-connected-finish-button"))
    expect(mockFinish).toHaveBeenCalledTimes(1)

    await act(async () => resolveFinish(true))
    await waitFor(() => expect(screen.queryByTestId("connected-finish-confirmation")).toBeNull())
  })

  it("keeps connected finish unavailable while offline or life changes are pending", () => {
    connectedHarness.runtime = {
      ...connectedHarness.runtime,
      connectionStatus: "offline",
      projection: { ...connectedHarness.runtime.projection, isHost: true },
    }
    const offline = render(themed(<ConnectedBoardScreen publicId="game-public" />))
    openConnectedMenu()
    expect(screen.getByTestId("end-game-button").props.accessibilityState.disabled).toBe(true)
    fireEvent.press(screen.getByTestId("status-button"))
    expect(screen.getByText(/Reconnect before finishing/i)).toBeTruthy()
    offline.unmount()

    connectedHarness.runtime = {
      ...connectedHarness.runtime,
      connectionStatus: "syncing",
      pending: [{ event: { operationId: "operation-1", playerId: "player-1" } }],
      projection: { ...connectedHarness.runtime.projection, isHost: true },
    }
    render(themed(<ConnectedBoardScreen publicId="game-public" />))
    openConnectedMenu()
    expect(screen.getByTestId("end-game-button").props.accessibilityState.disabled).toBe(true)
    fireEvent.press(screen.getByTestId("status-button"))
    expect(screen.getByText(/Wait for 1 pending change/i)).toBeTruthy()
    expect(screen.getByText("1 pending")).toBeTruthy()
  })

  it("does not imply an in-flight connected finish can be cancelled", () => {
    connectedHarness.runtime = {
      ...connectedHarness.runtime,
      projection: { ...connectedHarness.runtime.projection, isHost: true },
    }
    const view = render(themed(<ConnectedBoardScreen publicId="game-public" />))
    openConnectedFinish()
    connectedHarness.runtime = { ...connectedHarness.runtime, finishing: true }
    view.rerender(themed(<ConnectedBoardScreen publicId="game-public" />))
    expect(
      screen.getByTestId("cancel-connected-finish-button").props.accessibilityState.disabled,
    ).toBe(true)
    expect(screen.getByText("Ending…")).toBeTruthy()
  })

  it("keeps finish confirmation open and shows a mutation error there", async () => {
    const onHistory = jest.fn()
    connectedHarness.runtime = {
      ...connectedHarness.runtime,
      projection: { ...connectedHarness.runtime.projection, isHost: true },
    }
    const view = render(
      themed(
        <ConnectedBoardScreen publicId="game-public" onBack={jest.fn()} onHistory={onHistory} />,
      ),
    )
    mockFinish.mockResolvedValueOnce(false)
    openConnectedFinish()
    fireEvent.press(screen.getByTestId("confirm-connected-finish-button"))
    await waitFor(() => expect(mockFinish).toHaveBeenCalledTimes(1))
    expect(screen.getByTestId("connected-finish-confirmation")).toBeTruthy()

    connectedHarness.runtime = {
      ...connectedHarness.runtime,
      finishError: "Could not finish the game",
    }
    view.rerender(
      themed(
        <ConnectedBoardScreen publicId="game-public" onBack={jest.fn()} onHistory={onHistory} />,
      ),
    )
    expect(screen.getByTestId("connected-finish-error").props.accessibilityRole).toBe("alert")
    expect(screen.getByText("Could not finish the game")).toBeTruthy()
    expect(screen.getByTestId("confirm-connected-finish-button")).toBeTruthy()
    expect(onHistory).not.toHaveBeenCalled()
  })

  it("keeps a directly linked lobby board read-only without queuing invalid actions", () => {
    connectedHarness.runtime = {
      ...connectedHarness.runtime,
      projection: { ...connectedHarness.runtime.projection, status: "lobby", isHost: true },
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
    expect(screen.getByTestId("end-game-button").props.accessibilityState.disabled).toBe(true)
  })

  it("remounts runtime state when the dynamic route switches games", () => {
    mockUseConnectedGame.mockImplementation((publicId: string) => {
      const React = jest.requireActual<typeof import("react")>("react")
      const [mountedPublicId] = React.useState(publicId)
      return {
        ...connectedHarness.runtime,
        projection: {
          ...connectedHarness.runtime.projection,
          publicId: mountedPublicId,
          players: connectedHarness.runtime.projection.players.map((player, index) => ({
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

  it("withholds account-A cache until account B has its own ready projection", () => {
    let userBReady = false
    mockUseConnectedGame.mockImplementation((_publicId: string, ownerId?: string) => {
      const loading = ownerId === "user-b" && !userBReady
      return {
        ...connectedHarness.runtime,
        status: loading ? "loading" : "ready",
        source: ownerId === "user-a" ? "cache" : "remote",
        projection: {
          ...connectedHarness.runtime.projection,
          players: connectedHarness.runtime.projection.players.map((player, index) => ({
            ...player,
            displayName: index === 0 ? (ownerId ?? "") : player.displayName,
          })),
        },
      }
    })
    const view = render(themed(<ConnectedBoardScreen publicId="game-public" />))
    expect(screen.getByTestId("life-card-seat-1").props.accessibilityLabel).toContain("user-a")
    connectedHarness.userId = "user-b"
    view.rerender(themed(<ConnectedBoardScreen publicId="game-public" />))
    expect(screen.queryByText("user-a")).toBeNull()
    expect(screen.queryByTestId("life-card-seat-1")).toBeNull()
    expect(screen.getByTestId("connected-board-loading-status")).toBeTruthy()
    expect(mockUseConnectedGame).toHaveBeenLastCalledWith("game-public", "user-b")

    userBReady = true
    view.rerender(themed(<ConnectedBoardScreen publicId="game-public" />))
    expect(screen.getByTestId("life-card-seat-1").props.accessibilityLabel).toContain("user-b")
  })

  it("uses a neutral full-board surface while the first projection has no seat metadata", () => {
    connectedHarness.runtime = { ...connectedHarness.runtime, status: "loading" }
    const view = render(themed(<ConnectedBoardScreen publicId="game-public" />))

    expect(
      screen.getByTestId("connected-board-shell-surface", { includeHiddenElements: true }),
    ).toBeTruthy()
    expect(
      screen.queryByTestId("connected-board-shell-cell", { includeHiddenElements: true }),
    ).toBeNull()
    expect(
      StyleSheet.flatten(screen.getByTestId("connected-game-board").props.style),
    ).toMatchObject({ flex: 1, width: "100%" })
    expect(
      StyleSheet.flatten(screen.getByTestId("connected-board-status-layer").props.style),
    ).toMatchObject({ position: "absolute" })
    expect(screen.getByText("Loading connected board…")).toBeTruthy()
    expect(screen.queryByTestId("life-seat-1-1")).toBeNull()

    connectedHarness.runtime = { ...connectedHarness.runtime, status: "ready" }
    view.rerender(themed(<ConnectedBoardScreen publicId="game-public" />))
    expect(screen.queryByTestId("connected-board-shell")).toBeNull()
    expect(screen.getByTestId("life-seat-1-1")).toBeTruthy()
  })

  it.each([5, 6])(
    "keeps the outer board geometry stable when a %i-player projection arrives",
    (playerCount) => {
      const originalWindow = Dimensions.get("window")
      const originalScreen = Dimensions.get("screen")
      try {
        Dimensions.set({
          window: { width: 844, height: 390, scale: 1, fontScale: 1 },
          screen: { width: 844, height: 390, scale: 1, fontScale: 1 },
        })
        const players = Array.from({ length: playerCount }, (_, index) => ({
          playerId: `player-${index + 1}`,
          seat: index + 1,
          displayName: `Player ${index + 1}`,
          color: index % 2 === 0 ? "#7C3AED" : "#2563EB",
          currentLife: 40,
          pendingDelta: 0,
          controlledByMe: index === 0,
        }))
        connectedHarness.runtime = { ...connectedHarness.runtime, status: "loading" }
        const view = render(themed(<ConnectedBoardScreen publicId="game-public" />))
        const loadingBoardStyle = StyleSheet.flatten(
          screen.getByTestId("connected-game-board").props.style,
        )

        connectedHarness.runtime = {
          ...connectedHarness.runtime,
          status: "ready",
          projection: {
            ...connectedHarness.runtime.projection,
            playerCount,
            players,
          },
        }
        view.rerender(themed(<ConnectedBoardScreen publicId="game-public" />))

        expect(screen.getByTestId("player-grid").props.accessibilityLabel).toBe(
          `${playerCount} player life grid`,
        )
        expect(screen.getAllByTestId(/^player-grid-row-/)).toHaveLength(2)
        expect(StyleSheet.flatten(screen.getByTestId("connected-game-board").props.style)).toEqual(
          loadingBoardStyle,
        )
        view.unmount()
      } finally {
        act(() => Dimensions.set({ window: originalWindow, screen: originalScreen }))
      }
    },
  )

  it("retries a thrown board query without replacing the player-grid shell", () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined)
    const onBack = jest.fn()
    let unavailable = true
    mockUseConnectedGame.mockImplementation(() => {
      if (unavailable) throw new Error("Game unavailable")
      return connectedHarness.runtime
    })
    const view = render(themed(<ConnectedBoardScreen publicId="game-public" onBack={onBack} />))

    expect(view.getByText("Connected board unavailable")).toBeTruthy()
    expect(
      view.getByTestId("connected-board-shell-surface", { includeHiddenElements: true }),
    ).toBeTruthy()
    expect(
      StyleSheet.flatten(view.getByTestId("connected-board-status-layer").props.style),
    ).toMatchObject({ position: "absolute" })
    fireEvent.press(view.getByTestId("back-from-connected-board-button"))
    expect(onBack).toHaveBeenCalledTimes(1)

    unavailable = false
    fireEvent.press(view.getByTestId("retry-connected-board-button"))
    expect(view.getByTestId("life-seat-1-1")).toBeTruthy()
    expect(view.queryByTestId("connected-board-unavailable-status")).toBeNull()
    consoleError.mockRestore()
  })

  it("offers a way back to local play when the Clerk session is signed out", () => {
    const onBack = jest.fn()
    connectedHarness.userId = undefined

    render(themed(<ConnectedBoardScreen publicId="game-public" onBack={onBack} />))

    expect(screen.getByText("Connected session unavailable")).toBeTruthy()
    expect(screen.getByLabelText("Back to local play")).toBeTruthy()
    fireEvent.press(screen.getByTestId("back-from-connected-board-button"))
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(mockUseConnectedGame).not.toHaveBeenCalled()
  })

  it("does not mount a runtime before Clerk hydration and keeps the board shell stable", () => {
    const onBack = jest.fn()
    connectedHarness.userLoaded = false
    const view = render(themed(<ConnectedBoardScreen publicId="game-public" onBack={onBack} />))
    expect(screen.getByText("Checking connected session…")).toBeTruthy()
    expect(
      screen.getByTestId("connected-board-shell-surface", { includeHiddenElements: true }),
    ).toBeTruthy()
    expect(
      StyleSheet.flatten(screen.getByTestId("connected-board-status-layer").props.style),
    ).toMatchObject({ position: "absolute" })
    expect(mockUseConnectedGame).not.toHaveBeenCalled()
    expect(screen.queryByTestId("life-seat-1-1")).toBeNull()
    expect(screen.getByTestId("back-from-connected-board-button")).toBeTruthy()
    connectedHarness.userLoaded = true
    view.rerender(themed(<ConnectedBoardScreen publicId="game-public" />))
    expect(mockUseConnectedGame).toHaveBeenCalledWith("game-public", "user-a")
  })

  it("offers a way back to local play while the connected board is stuck loading", () => {
    const onBack = jest.fn()
    connectedHarness.runtime = { ...connectedHarness.runtime, status: "loading" }
    const view = render(themed(<ConnectedBoardScreen publicId="game-public" onBack={onBack} />))

    expect(view.getByText("Loading connected board…")).toBeTruthy()
    fireEvent.press(view.getByTestId("back-from-connected-board-button"))
    expect(onBack).toHaveBeenCalledTimes(1)

    connectedHarness.runtime = { ...connectedHarness.runtime, status: "ready" }
    view.rerender(themed(<ConnectedBoardScreen publicId="game-public" onBack={onBack} />))
    expect(view.queryByTestId("back-from-connected-board-button")).toBeNull()
    expect(view.getByTestId("life-seat-1-1")).toBeTruthy()
  })
})
