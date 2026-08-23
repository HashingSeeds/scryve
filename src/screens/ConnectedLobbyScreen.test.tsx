import { Share } from "react-native"
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native"

import { Screen } from "@/components/Screen"

import { ConnectedLobbyScreen } from "./ConnectedLobbyScreen"
import { JoinConnectedScreen } from "./JoinConnectedScreen"
import {
  connectedHarness,
  mockAbandon,
  mockClaimSeat,
  mockLeave,
  mockReportPlayer,
  mockSelectDeck,
  mockSetAppearance,
  mockStart,
  mockSyncUser,
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
jest.mock("@/features/auth/config", () =>
  jest
    .requireActual<typeof import("../../test/support/connectedHarness")>(
      "../../test/support/connectedHarness",
    )
    .createAuthConfigMock(),
)
jest.mock("../../convex/_generated/api", () =>
  jest
    .requireActual<typeof import("../../test/support/connectedHarness")>(
      "../../test/support/connectedHarness",
    )
    .createGeneratedApiMock(),
)
jest.mock("react-native-qrcode-svg", () =>
  jest
    .requireActual<typeof import("../../test/support/connectedHarness")>(
      "../../test/support/connectedHarness",
    )
    .createQrCodeMock(),
)

describe("ConnectedLobbyScreen", () => {
  beforeEach(resetConnectedHarness)

  it("renders a recoverable accessible error when a start race fails", async () => {
    connectedHarness.projection = {
      ...connectedHarness.projection,
      status: "lobby",
      isHost: true,
      invitation: null,
    }
    mockStart.mockRejectedValueOnce(new Error("Lobby already started"))
    const onStarted = jest.fn()
    render(themed(<ConnectedLobbyScreen publicId="game-public" onStarted={onStarted} />))
    fireEvent.press(screen.getByTestId("start-connected-game-button"))
    await waitFor(() => expect(screen.getByTestId("connected-action-error")).toBeTruthy())
    expect(screen.getByTestId("connected-action-error").props.accessibilityRole).toBe("alert")
    expect(onStarted).not.toHaveBeenCalled()
  })

  it("disables Start and ignores duplicate presses while starting", async () => {
    let resolveStart: (value: { publicId: string }) => void = () => undefined
    mockStart.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveStart = resolve
      }),
    )
    connectedHarness.projection = {
      ...connectedHarness.projection,
      status: "lobby",
      isHost: true,
      invitation: null,
    }
    render(themed(<ConnectedLobbyScreen publicId="game-public" onStarted={jest.fn()} />))
    fireEvent.press(screen.getByTestId("start-connected-game-button"))
    fireEvent.press(screen.getByTestId("start-connected-game-button"))
    expect(mockStart).toHaveBeenCalledTimes(1)
    expect(screen.getByText("Starting\u2026")).toBeTruthy()
    expect(screen.getByTestId("start-connected-game-button")).toBeDisabled()

    await act(async () => resolveStart({ publicId: "game-public" }))
  })

  it("disables deck choices and ignores duplicate selection presses", async () => {
    let resolveSelection: (value: undefined) => void = () => undefined
    mockSelectDeck.mockReturnValueOnce(
      new Promise<undefined>((resolve) => {
        resolveSelection = resolve
      }),
    )
    connectedHarness.decks = [
      {
        _id: "deck-1",
        name: "Krenko",
        versions: [{ _id: "deck-version-1", versionNumber: 1 }],
      },
    ]
    connectedHarness.projection = {
      ...connectedHarness.projection,
      status: "lobby",
      invitation: null,
      players: connectedHarness.projection.players.map((player, index) => ({
        ...player,
        controlledByMe: index === 0,
      })),
    }
    render(themed(<ConnectedLobbyScreen publicId="game-public" onStarted={jest.fn()} />))
    fireEvent.press(screen.getByTestId("seat-1-deck-deck-1"))
    fireEvent.press(screen.getByTestId("seat-1-deck-deck-1"))
    expect(mockSelectDeck).toHaveBeenCalledTimes(1)
    expect(mockSelectDeck).toHaveBeenCalledWith({
      publicId: "game-public",
      seat: 1,
      deckVersionId: "deck-version-1",
    })
    expect(screen.getByText("Selecting deck\u2026")).toBeTruthy()
    expect(screen.getByTestId("seat-1-deck-deck-1")).toBeDisabled()

    await act(async () => resolveSelection(undefined))
  })

  it("reserves deck selector space while decks load independently", () => {
    connectedHarness.decks = undefined
    connectedHarness.projection = {
      ...connectedHarness.projection,
      status: "lobby",
      invitation: null,
      players: connectedHarness.projection.players.map((player, index) => ({
        ...player,
        controlledByMe: index === 0,
      })),
    }

    render(themed(<ConnectedLobbyScreen publicId="game-public" onStarted={jest.fn()} />))

    expect(screen.getByTestId("seat-1-deck-loading").props.accessibilityRole).toBe("progressbar")
    expect(screen.getByText("Loading decks…")).toBeTruthy()
    expect(screen.getByText("Ada")).toBeTruthy()
  })

  it("says that an empty deck list does not block play", () => {
    connectedHarness.projection = {
      ...connectedHarness.projection,
      status: "lobby",
      invitation: null,
      players: connectedHarness.projection.players.map((player, index) => ({
        ...player,
        controlledByMe: index === 0,
      })),
    }

    render(themed(<ConnectedLobbyScreen publicId="game-public" onStarted={jest.fn()} />))

    expect(screen.getByTestId("seat-1-no-decks")).toHaveTextContent(
      "No decks available. You can play without one.",
    )
  })

  it("keeps the lobby usable and retries a failed deck query in place", () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined)
    connectedHarness.queryErrors.add("decks.listMine")
    connectedHarness.projection = {
      ...connectedHarness.projection,
      status: "lobby",
      invitation: null,
      players: connectedHarness.projection.players.map((player, index) => ({
        ...player,
        controlledByMe: index === 0,
      })),
    }
    render(themed(<ConnectedLobbyScreen publicId="game-public" onStarted={jest.fn()} />))

    expect(screen.getByText("Decks unavailable. You can play without one.")).toBeTruthy()
    expect(screen.getByText("Ada")).toBeTruthy()
    connectedHarness.queryErrors.delete("decks.listMine")
    fireEvent.press(screen.getByTestId("retry-seat-1-decks"))
    expect(screen.getByTestId("seat-1-no-decks")).toBeTruthy()
    consoleError.mockRestore()
  })

  it("renders and shares the production HTTPS invite with an actionable manual fallback", async () => {
    const inviteToken = "A".repeat(43)
    connectedHarness.projection = {
      ...connectedHarness.projection,
      status: "lobby",
      invitation: { token: inviteToken, manualCode: "AB12CD" },
    }
    const share = jest.spyOn(Share, "share").mockResolvedValue({ action: "sharedAction" })
    const view = render(
      themed(<ConnectedLobbyScreen publicId="game-public" onStarted={jest.fn()} />),
    )
    const inviteUrl = `https://play.count.example/join/${inviteToken}`
    expect(view.UNSAFE_getByType(Screen).props.preset).toBe("fixed")
    expect(screen.getByTestId("invite-qr").props.children).toBe("scryve://join/AB12CD")
    expect(screen.getByTestId("invite-qr").props.accessibilityHint).toBe(
      "size-184-quiet-zone-8-ecl-H",
    )
    expect(screen.getByText("Scan to join or enter code AB12CD.")).toBeTruthy()
    expect(screen.getByTestId("manual-code")).toHaveTextContent("AB12CD")
    expect(screen.getByText("Ada")).toBeTruthy()
    expect(screen.getByText("Grace")).toBeTruthy()
    expect(screen.queryByTestId("share-manual-code-button")).toBeNull()
    fireEvent.press(screen.getByTestId("share-invite-button"))
    await waitFor(() =>
      expect(share).toHaveBeenCalledWith({
        message: `Join my Scryve game: ${inviteUrl}`,
        url: inviteUrl,
      }),
    )
    view.unmount()

    connectedHarness.projection = {
      ...connectedHarness.projection,
      status: "lobby",
      invitation: { token: "invalid", manualCode: "ZX90QW" },
    }
    render(themed(<ConnectedLobbyScreen publicId="game-public" onStarted={jest.fn()} />))
    expect(screen.getByTestId("invite-qr").props.children).toBe("scryve://join/ZX90QW")
    fireEvent.press(screen.getByTestId("share-invite-button"))
    await waitFor(() =>
      expect(share).toHaveBeenLastCalledWith({ message: "Join my Scryve game with code ZX90QW" }),
    )
    expect(screen.getByText(/Enter code ZX90QW/i)).toBeTruthy()
  })

  it("opens a confirmation dialog from an opponent in the lobby", async () => {
    connectedHarness.projection = {
      ...connectedHarness.projection,
      status: "lobby",
      invitation: null,
      players: [
        {
          playerId: "player-1",
          seat: 1,
          displayName: "Ada",
          color: "#7C3AED",
          controlledByMe: true,
        },
        {
          playerId: "player-2",
          seat: 2,
          displayName: "Grace",
          color: "#2563EB",
          controlledByMe: false,
        },
      ],
    }
    render(themed(<ConnectedLobbyScreen publicId="game-public" onStarted={jest.fn()} />))

    fireEvent.press(screen.getByTestId("lobby-report-player-seat-2"))
    expect(screen.getByText("Report Grace")).toBeTruthy()
    expect(screen.getByText(/Reporting also blocks this player for you immediately/i)).toBeTruthy()
    expect(mockReportPlayer).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.press(screen.getByTestId("submit-player-report-button"))
    })
    expect(mockReportPlayer).toHaveBeenCalledWith({
      publicId: "game-public",
      playerId: "player-2",
      reason: "offensive_username",
    })
  })

  it("does not queue start or seat claim from cached UI while the socket is offline", () => {
    connectedHarness.socketConnected = false
    connectedHarness.projection = {
      ...connectedHarness.projection,
      status: "lobby",
      isHost: true,
      invitation: null,
    }
    const lobby = render(
      themed(<ConnectedLobbyScreen publicId="game-public" onStarted={jest.fn()} />),
    )
    expect(screen.getByTestId("connected-start-offline").props.accessibilityRole).toBe("alert")
    fireEvent.press(screen.getByTestId("start-connected-game-button"))
    expect(mockStart).not.toHaveBeenCalled()
    lobby.unmount()

    render(themed(<JoinConnectedScreen onJoined={jest.fn()} />))
    expect(screen.getByText(/Reconnect to claim a seat/i)).toBeTruthy()
    fireEvent.press(screen.getByTestId("claim-seat-button"))
    expect(mockSyncUser).not.toHaveBeenCalled()
    expect(mockClaimSeat).not.toHaveBeenCalled()
  })

  it("moves a non-host to the board exactly once when the reactive lobby starts", async () => {
    connectedHarness.projection = {
      ...connectedHarness.projection,
      status: "lobby",
      isHost: false,
      invitation: null,
    }
    const onStarted = jest.fn()
    const view = render(
      themed(<ConnectedLobbyScreen publicId="game-public" onStarted={onStarted} />),
    )
    expect(screen.getByText("Waiting for the host to start.")).toBeTruthy()
    connectedHarness.projection = { ...connectedHarness.projection, status: "active" }
    view.rerender(themed(<ConnectedLobbyScreen publicId="game-public" onStarted={onStarted} />))
    await waitFor(() => expect(onStarted).toHaveBeenCalledTimes(1))
    view.rerender(themed(<ConnectedLobbyScreen publicId="game-public" onStarted={onStarted} />))
    expect(onStarted).toHaveBeenCalledTimes(1)
  })

  it("confirms lobby leave and navigates only after the mutation succeeds", async () => {
    connectedHarness.projection = {
      ...connectedHarness.projection,
      status: "lobby",
      isHost: false,
      invitation: null,
    }
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
    connectedHarness.projection = {
      ...connectedHarness.projection,
      status: "lobby",
      isHost: true,
      invitation: null,
    }
    render(themed(<ConnectedLobbyScreen publicId="game-public" onStarted={jest.fn()} />))

    expect(screen.queryByTestId("leave-connected-lobby-button")).toBeNull()
    expect(screen.getByTestId("abandon-connected-lobby-button")).toBeTruthy()
  })

  it("confirms an abandon in a modal instead of pushing the lobby content down", () => {
    connectedHarness.projection = {
      ...connectedHarness.projection,
      status: "lobby",
      isHost: true,
      invitation: null,
    }
    render(themed(<ConnectedLobbyScreen publicId="game-public" onStarted={jest.fn()} />))

    fireEvent.press(screen.getByTestId("abandon-connected-lobby-button"))
    const confirmation = screen.getByTestId("connected-lobby-leave-confirmation")
    expect(confirmation.props.accessibilityViewIsModal).toBe(true)
    expect(screen.getByTestId("connected-lobby-leave-backdrop")).toBeTruthy()

    fireEvent.press(screen.getByTestId("connected-lobby-leave-backdrop"))
    expect(screen.queryByTestId("connected-lobby-leave-confirmation")).toBeNull()
    expect(mockAbandon).not.toHaveBeenCalled()
  })

  it("disables appearance combinations claimed by another seat", async () => {
    connectedHarness.projection = {
      ...connectedHarness.projection,
      status: "lobby",
      isHost: true,
      invitation: null,
      players: [
        {
          playerId: "player-1",
          seat: 1,
          displayName: "Ada",
          color: "#B85636",
          shape: "circle",
          controlledByMe: true,
        },
        {
          playerId: "player-2",
          seat: 2,
          displayName: "Grace",
          color: "#B85636",
          shape: "square",
          controlledByMe: false,
        },
      ],
    }
    render(themed(<ConnectedLobbyScreen publicId="game-public" onStarted={jest.fn()} />))

    fireEvent.press(screen.getByTestId("edit-appearance-seat-1"))
    expect(screen.getByTestId("appearance-shape-square")).toBeDisabled()
    expect(screen.getByTestId("appearance-shape-star")).toBeEnabled()

    fireEvent.press(screen.getByTestId("appearance-shape-star"))
    await act(async () => fireEvent.press(screen.getByTestId("save-appearance-button")))
    expect(mockSetAppearance).toHaveBeenCalledWith({
      publicId: "game-public",
      seat: 1,
      color: "#B85636",
      shape: "star",
    })

    fireEvent.press(screen.getByTestId("edit-appearance-seat-1"))
    fireEvent.press(screen.getByTestId("appearance-color-41476e"))
    expect(screen.getByTestId("appearance-shape-square")).toBeEnabled()
  })

  it("explains online-only lobby exits when offline, including a dropped confirmation", () => {
    connectedHarness.projection = {
      ...connectedHarness.projection,
      status: "lobby",
      isHost: false,
      invitation: null,
    }
    const view = render(
      themed(
        <ConnectedLobbyScreen publicId="game-public" onStarted={jest.fn()} onLeft={jest.fn()} />,
      ),
    )
    fireEvent.press(screen.getByTestId("leave-connected-lobby-button"))
    connectedHarness.socketConnected = false
    view.rerender(
      themed(
        <ConnectedLobbyScreen publicId="game-public" onStarted={jest.fn()} onLeft={jest.fn()} />,
      ),
    )
    expect(screen.getByTestId("connected-lobby-exit-offline").props.accessibilityRole).toBe("alert")
    expect(screen.getByText(/Reconnect to leave or abandon this lobby/i)).toBeTruthy()
    expect(
      screen.getByTestId("confirm-connected-lobby-leave-button").props.accessibilityState.disabled,
    ).toBe(true)
  })

  it.each([
    ["leave", false],
    ["abandon", true],
  ] as const)("keeps the lobby recoverable when %s is rejected", async (action, isHost) => {
    connectedHarness.projection = {
      ...connectedHarness.projection,
      status: "lobby",
      isHost,
      invitation: null,
    }
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
