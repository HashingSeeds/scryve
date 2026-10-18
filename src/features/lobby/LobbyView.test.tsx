import { fireEvent, render, screen, waitFor } from "@testing-library/react-native"

import { LobbyView, type LobbyViewProps } from "./LobbyView"
import { themed } from "../../../test/support/connectedHarness"

const seat = (number: number, overrides: object = {}) => ({
  playerId: `player-${number}`,
  seat: number,
  displayName: `Player ${number}`,
  color: "#7C3AED",
  controlledByMe: number === 1,
  ...overrides,
})

function view(overrides: Partial<LobbyViewProps> = {}) {
  const props: LobbyViewProps = {
    lobby: {
      playerCount: 2,
      startingLife: 40,
      ruleset: "commander",
      system: "mtg",
      format: "commander",
      isHost: true,
      players: [seat(1), seat(2)],
    },
    online: true,
    offlineNotice: "Offline",
    exitOfflineNotice: "Offline",
    starting: false,
    leaving: false,
    onStart: jest.fn(),
    onExit: jest.fn(async () => true),
    ...overrides,
  }
  render(themed(<LobbyView {...props} />))
  return props
}

describe("LobbyView", () => {
  it("holds the start while a seated player is away, and leaves out what the lobby can't do", () => {
    const props = view({
      lobby: {
        playerCount: 2,
        startingLife: 40,
        ruleset: "commander",
        isHost: true,
        players: [seat(1), seat(2, { away: true })],
      },
      onChangePlayerCount: jest.fn(),
    })

    expect(screen.getByTestId("seat-2-readiness")).toHaveTextContent("Away")
    expect(screen.getByTestId("start-connected-game-button")).toBeDisabled()
    expect(screen.queryByTestId("open-invite-button")).toBeNull()
    expect(screen.queryByTestId("lobby-report-player-seat-2")).toBeNull()
    expect(screen.queryByTestId("lobby-require-decks")).toBeNull()
    fireEvent.press(screen.getByTestId("lobby-player-count-4"))
    expect(props.onChangePlayerCount).toHaveBeenCalledWith(4)
  })

  it("closes the exit dialog only once the exit goes through", async () => {
    const onExit = jest.fn(async () => false)
    view({ onExit })

    fireEvent.press(screen.getByTestId("abandon-connected-lobby-button"))
    fireEvent.press(screen.getByTestId("confirm-connected-lobby-abandon-button"))
    await waitFor(() => expect(onExit).toHaveBeenCalledWith("abandon"))
    expect(screen.getByTestId("connected-lobby-leave-confirmation")).toBeTruthy()
  })
})
