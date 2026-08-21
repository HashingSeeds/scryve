import { fireEvent, render, screen, waitFor, within } from "@testing-library/react-native"

import { Screen } from "@/components/Screen"
import { ConnectedHostSource } from "@/features/connected/ConnectedHostSource"
import { DEFAULT_LOCAL_SETTINGS } from "@/features/game/localPersistence"
import { ThemeProvider } from "@/theme/context"

import { NewGameScreen, type ConnectedHostFeed, type NewGameScreenProps } from "./NewGameScreen"
import {
  connectedHarness,
  mockCreateLobby,
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
jest.mock("../../convex/_generated/api", () =>
  jest
    .requireActual<typeof import("../../test/support/connectedHarness")>(
      "../../test/support/connectedHarness",
    )
    .createGeneratedApiMock(),
)

function setup(overrides: Partial<NewGameScreenProps> = {}) {
  return render(
    <ThemeProvider initialContext="light">
      <NewGameScreen
        defaults={DEFAULT_LOCAL_SETTINGS}
        mode="local"
        onModeChange={jest.fn()}
        onBack={jest.fn()}
        onStartLocal={jest.fn()}
        {...overrides}
      />
    </ThemeProvider>,
  )
}

const readyHost: ConnectedHostFeed = { ready: true, busy: false, host: jest.fn() }

function hostSetup(onLobbyCreated: (lobby: { publicId: string }) => void) {
  return themed(
    <ConnectedHostSource onLobbyCreated={onLobbyCreated}>
      {(connected) => (
        <NewGameScreen
          defaults={DEFAULT_LOCAL_SETTINGS}
          mode="connected"
          onModeChange={jest.fn()}
          onBack={jest.fn()}
          onStartLocal={jest.fn()}
          connected={connected}
        />
      )}
    </ConnectedHostSource>,
  )
}

describe("NewGameScreen", () => {
  beforeEach(resetConnectedHarness)

  it("starts defaults and supports six players plus custom life", () => {
    const onStartLocal = jest.fn()
    const view = setup({ onStartLocal })

    fireEvent.press(view.getByLabelText("6 players"))
    fireEvent.press(view.getByLabelText("Use custom starting life"))
    fireEvent.changeText(view.getByTestId("custom-starting-life"), "37")
    fireEvent.changeText(view.getByTestId("player-name-6"), "Six")
    fireEvent.press(view.getByTestId("start-game-button"))

    expect(onStartLocal).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ name: "Six" })]),
      37,
    )
    expect(onStartLocal.mock.calls[0][0]).toHaveLength(6)
  })

  it("falls back to the placeholder name for seats left blank", () => {
    const onStartLocal = jest.fn()
    const view = setup({ onStartLocal })

    fireEvent.changeText(view.getByTestId("player-name-1"), " Ada ")
    fireEvent.press(view.getByTestId("start-game-button"))

    expect(onStartLocal.mock.calls[0][0].map((player: { name: string }) => player.name)).toEqual([
      "Ada",
      "Player 2",
    ])
  })

  it("edits a local player's color and mark from the mark beside their name", () => {
    const onStartLocal = jest.fn()
    const view = setup({ onStartLocal })

    fireEvent.press(view.getByTestId("player-appearance-1"), {
      nativeEvent: { pageX: 22, pageY: 240 },
    })
    expect(view.getByTestId("local-appearance-dialog")).toBeTruthy()
    fireEvent.press(view.getByTestId("appearance-color-39755c"))
    fireEvent.press(view.getByTestId("appearance-shape-hexagon"))
    fireEvent.press(view.getByTestId("save-local-appearance-button"))
    fireEvent.press(view.getByTestId("start-game-button"))

    expect(onStartLocal).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ name: "Player 1", color: "#39755C", shape: "hexagon" }),
      ]),
      20,
    )
  })

  it("does not offer another local player's color and mark combination", () => {
    const view = setup()

    fireEvent.press(view.getByTestId("player-appearance-2"))
    fireEvent.press(view.getByTestId("appearance-color-b85636"))
    expect(view.getByTestId("appearance-shape-circle")).toBeDisabled()
  })

  it("disables start for invalid custom life", () => {
    const view = setup()

    fireEvent.press(view.getByLabelText("Use custom starting life"))
    fireEvent.changeText(view.getByTestId("custom-starting-life"), "0")

    expect(view.getByTestId("start-game-button").props.accessibilityState.disabled).toBe(true)
  })

  it("hides the custom starting life field until it is requested", () => {
    const view = setup()

    expect(view.queryByTestId("custom-starting-life")).toBeNull()
    fireEvent.press(view.getByLabelText("Use custom starting life"))
    expect(view.getByTestId("custom-starting-life")).toBeTruthy()
    fireEvent.press(view.getByLabelText("Start at 30 life"))
    expect(view.queryByTestId("custom-starting-life")).toBeNull()
  })

  it("keeps the start button pinned outside the scrollable form", () => {
    const view = setup()

    fireEvent.press(view.getByLabelText("6 players"))
    const scrollableForm = view.UNSAFE_getByType(Screen)
    expect(within(scrollableForm).queryByTestId("start-game-button")).toBeNull()
    expect(within(scrollableForm).getByTestId("player-name-6")).toBeTruthy()
    expect(view.getByTestId("start-game-button")).toBeTruthy()
  })

  it("reports duplicate names per seat and blocks the start", () => {
    const view = setup()

    fireEvent.changeText(view.getByTestId("player-name-1"), " Ada ")
    fireEvent.changeText(view.getByTestId("player-name-2"), "ada")

    expect(view.getAllByText("Player names must be unique.")).toHaveLength(2)
    expect(view.getByTestId("start-game-button").props.accessibilityState.disabled).toBe(true)
  })

  it("swaps to seats, ruleset, and hosting in connected mode", () => {
    const host = jest.fn()
    const view = setup({ mode: "connected", connected: { ...readyHost, host } })

    expect(view.queryByTestId("player-name-1")).toBeNull()
    expect(view.getByLabelText("4 seats")).toBeTruthy()
    fireEvent.press(view.getByLabelText("4 seats"))
    fireEvent.changeText(view.getByTestId("connected-ruleset"), "commander")
    fireEvent.press(view.getByTestId("host-connected-button"))

    expect(host).toHaveBeenCalledWith({ playerCount: 4, startingLife: 20, ruleset: "commander" })
  })

  it("keeps hosting unavailable until the connected session is ready", () => {
    const view = setup({ mode: "connected", connected: { ...readyHost, ready: false } })

    expect(view.getByTestId("host-connected-button").props.accessibilityState.disabled).toBe(true)
  })

  it("surfaces a host blocker and refuses to submit while it stands", () => {
    const host = jest.fn()
    const view = setup({
      mode: "connected",
      connected: { ...readyHost, host, blockedReason: "Finish your hosted game first." },
    })

    expect(view.getByText("Finish your hosted game first.")).toBeTruthy()
    fireEvent.press(view.getByTestId("host-connected-button"))
    expect(host).not.toHaveBeenCalled()
  })

  it("switches modes through the toggle", () => {
    const onModeChange = jest.fn()
    const view = setup({ onModeChange })

    expect(view.getByTestId("mode-local").props.accessibilityState.selected).toBe(true)
    fireEvent.press(view.getByTestId("mode-connected"))
    expect(onModeChange).toHaveBeenCalledWith("connected")
  })

  it("hosts from the shared setup screen with validated seats and life presets", async () => {
    const onLobbyCreated = jest.fn()
    render(hostSetup(onLobbyCreated))
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

  it("blocks hosting a second lobby from the setup screen", async () => {
    connectedHarness.activeGames = [
      { publicId: "hosted-lobby", status: "lobby", ruleset: "standard", isHost: true },
    ]
    render(hostSetup(jest.fn()))

    await waitFor(() => expect(screen.getByText(/Resume or finish your hosted game/i)).toBeTruthy())
    expect(screen.getByTestId("host-connected-button").props.accessibilityState.disabled).toBe(true)
  })
})
