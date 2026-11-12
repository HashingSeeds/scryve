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

  it("lets a nearby guest leave while it can't reach the host, but not a cloud one", async () => {
    const onExit = jest.fn(async () => true)
    const guest = {
      lobby: { ...view().lobby, isHost: false },
      online: false,
      onExit,
    }
    screen.unmount()
    view({ ...guest, exitOfflineNotice: undefined })
    fireEvent.press(screen.getByTestId("leave-connected-lobby-button"))
    fireEvent.press(screen.getByTestId("confirm-connected-lobby-leave-button"))
    await waitFor(() => expect(onExit).toHaveBeenCalledWith("leave"))
    screen.unmount()

    view(guest)
    fireEvent.press(screen.getByTestId("leave-connected-lobby-button"))
    expect(screen.getByTestId("confirm-connected-lobby-leave-button")).toBeDisabled()
  })

  it("names players whose app is too old to edit any seat, and still lets the host start", () => {
    view({ outdatedNames: ["Alex", "Sam"] })
    expect(screen.getByTestId("lobby-outdated-apps")).toHaveTextContent(
      "Alex, Sam need to update Scryve before everyone can edit any seat. You can start now. Each player will change only their own seat.",
    )
    expect(screen.getByTestId("start-connected-game-button")).not.toBeDisabled()
  })

  it("shows only your own team's color in 2HG, and saves a pick to your seat", async () => {
    const save = jest.fn(async () => true)
    view({
      lobby: {
        playerCount: 4,
        startingLife: 60,
        ruleset: "commander",
        system: "mtg",
        format: "commander",
        variant: "twoHeadedGiant",
        isHost: false,
        players: [
          seat(1, { color: "#B85636", controlledByMe: false }),
          seat(2, { color: "#B85636", controlledByMe: true, shape: "triangle" }),
          seat(3, { color: "#39755C", controlledByMe: false }),
        ],
      },
      appearance: { saving: false, proLocked: true, foil: false, save, presentPaywall: jest.fn() },
    })

    expect(screen.queryByTestId("team-color-2")).toBeNull()
    fireEvent.press(screen.getByTestId("edit-appearance-seat-2"))
    expect(screen.getByTestId("appearance-color-117b9c")).toBeDisabled()
    fireEvent.press(screen.getByTestId("appearance-team-color"))
    expect(screen.getByTestId("team-colors-1-39755c")).toBeDisabled()
    fireEvent.press(screen.getByTestId("team-colors-1-117b9c"))
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(2, { color: "#117B9C", shape: "triangle" }),
    )
    expect(screen.queryByTestId("team-colors-1")).toBeNull()
  })

  it("saves a 2HG mark without touching the team color, and keeps the team row shut while a save runs", async () => {
    const save = jest.fn(async () => true)
    const props = view({
      lobby: {
        playerCount: 4,
        startingLife: 60,
        ruleset: "commander",
        system: "mtg",
        format: "commander",
        variant: "twoHeadedGiant",
        isHost: false,
        players: [
          seat(1, { color: "#B85636", controlledByMe: false }),
          seat(2, { color: "#B85636", controlledByMe: true, shape: "triangle" }),
        ],
      },
      appearance: { saving: false, proLocked: true, foil: false, save, presentPaywall: jest.fn() },
    })
    fireEvent.press(screen.getByTestId("edit-appearance-seat-2"))
    fireEvent.press(screen.getByTestId("appearance-shape-star"))
    fireEvent.press(screen.getByTestId("save-appearance-button"))
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(2, expect.objectContaining({ shape: "star" }), true),
    )

    fireEvent.press(screen.getByTestId("edit-appearance-seat-2"))
    fireEvent.press(screen.getByTestId("appearance-team-color"))
    screen.rerender(
      themed(<LobbyView {...props} appearance={{ ...props.appearance!, saving: true }} />),
    )
    expect(screen.queryByTestId("team-colors-1")).toBeNull()
  })
})
