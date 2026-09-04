import { Dimensions, StyleSheet } from "react-native"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react-native"

import { Screen } from "@/components/Screen"
import { ConnectedHostSource } from "@/features/connected/ConnectedHostSource"
import {
  ConnectedProfileProvider,
  resetConnectedProfileBootstrapForTests,
} from "@/features/connected/useConnectedProfile"
import { DEFAULT_LOCAL_SETTINGS } from "@/features/game/localPersistence"
import { ThemeProvider } from "@/theme/context"

import { NewGameScreen, type ConnectedHostFeed, type NewGameScreenProps } from "./NewGameScreen"
import {
  connectedHarness,
  mockCreateLobby,
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
    <ConnectedProfileProvider>
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
      </ConnectedHostSource>
    </ConnectedProfileProvider>,
  )
}

describe("NewGameScreen", () => {
  beforeEach(() => {
    resetConnectedHarness()
    resetConnectedProfileBootstrapForTests()
  })

  it("starts no-system defaults and supports six players", () => {
    const onStartLocal = jest.fn()
    const view = setup({ onStartLocal })

    for (let count = 2; count < 6; count += 1)
      fireEvent.press(view.getByTestId("player-count-increment"))
    fireEvent.changeText(view.getByTestId("player-name-6"), "Six")
    fireEvent.press(view.getByTestId("start-game-button"))

    expect(onStartLocal).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ name: "Six" })]),
      20,
      { layout: "auto", lifeStep: 1 },
    )
    expect(onStartLocal.mock.calls[0][0]).toHaveLength(6)
  })

  it("offers only valid layouts for the player count and submits the selection", () => {
    const onStartLocal = jest.fn()
    const view = setup({ onStartLocal })

    expect(view.getByTestId("player-layout-auto")).toBeTruthy()
    const { width, height } = Dimensions.get("window")
    expect(
      StyleSheet.flatten(
        view.getByTestId("player-layout-auto-preview", {
          includeHiddenElements: true,
        }).props.style,
      ),
    ).toMatchObject({
      aspectRatio: width / height,
    })
    expect(view.queryByTestId("player-layout-tabletop")).toBeNull()
    fireEvent.press(view.getByTestId("player-count-increment"))
    fireEvent.press(view.getByTestId("player-count-increment"))

    expect(view.getByTestId("player-layout-tabletop")).toBeTruthy()
    expect(view.queryByTestId("player-layout-featured-first")).toBeNull()
    fireEvent.press(view.getByTestId("player-layout-tabletop"))
    fireEvent.press(view.getByTestId("start-game-button"))

    expect(onStartLocal).toHaveBeenCalledWith(expect.any(Array), 20, {
      layout: "tabletop",
      lifeStep: 1,
    })
  })

  it("offers the Table layout to six players", () => {
    const view = setup()

    for (let count = 2; count < 6; count += 1)
      fireEvent.press(view.getByTestId("player-count-increment"))

    expect(view.getByTestId("player-layout-tabletop")).toBeTruthy()
  })

  it("starts Yu-Gi-Oh! at 8000 Life Points with the Advanced format", () => {
    const onStartLocal = jest.fn()
    const view = setup({ onStartLocal })

    fireEvent.press(view.getByTestId("play-system-ygo"))
    expect(view.getByLabelText("Life Points, 8000")).toBeTruthy()
    expect(view.getByLabelText("Change by, 100")).toBeTruthy()
    fireEvent.press(view.getByTestId("start-game-button"))

    expect(onStartLocal).toHaveBeenCalledWith(expect.any(Array), 8000, {
      format: "advanced",
      layout: "auto",
      lifeStep: 100,
      system: "ygo",
    })
  })

  it("preselects the saved system and format defaults", () => {
    const onStartLocal = jest.fn()
    const view = setup({
      onStartLocal,
      defaults: {
        ...DEFAULT_LOCAL_SETTINGS,
        defaultSystem: "ygo",
        defaultFormat: "advanced",
        defaultStartingLife: 8000,
      },
    })

    expect(view.getByTestId("play-system-ygo").props.accessibilityState.selected).toBe(true)
    expect(view.getByLabelText("Life Points, 8000")).toBeTruthy()
    fireEvent.press(view.getByTestId("start-game-button"))

    expect(onStartLocal).toHaveBeenCalledWith(expect.any(Array), 8000, {
      format: "advanced",
      layout: "auto",
      lifeStep: 100,
      system: "ygo",
    })
  })

  it("starts Pokémon at six Prize cards", () => {
    const onStartLocal = jest.fn()
    const view = setup({ onStartLocal })

    fireEvent.press(view.getByTestId("play-system-pokemon"))
    expect(view.getByLabelText("Prize cards, 6")).toBeTruthy()
    fireEvent.press(view.getByTestId("start-game-button"))

    expect(onStartLocal).toHaveBeenCalledWith(expect.any(Array), 6, {
      format: "standard",
      layout: "auto",
      lifeStep: 1,
      system: "pokemon",
    })
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
      { layout: "auto", lifeStep: 1 },
    )
  })

  it("does not offer another local player's color and mark combination", () => {
    const view = setup()

    fireEvent.press(view.getByTestId("player-appearance-2"))
    fireEvent.press(view.getByTestId("appearance-color-b85636"))
    expect(view.getByTestId("appearance-shape-circle")).toBeDisabled()
  })

  it("uses the Life box as the starting value and saves a per-game change amount", () => {
    const onStartLocal = jest.fn()
    const view = setup({ onStartLocal })

    fireEvent.press(view.getByTestId("play-system-mtg"))
    expect(view.getByLabelText("Increase Life by 10")).toBeTruthy()
    fireEvent.press(view.getByTestId("starting-counter-increment"))
    fireEvent.press(view.getByTestId("life-step"))
    fireEvent.press(view.getByTestId("life-step-option-5"))
    fireEvent.press(view.getByTestId("starting-counter-increment"))
    fireEvent.press(view.getByTestId("start-game-button"))

    expect(onStartLocal).toHaveBeenCalledWith(expect.any(Array), 35, {
      format: "standard",
      layout: "auto",
      lifeStep: 5,
      system: "mtg",
    })
  })

  it("keeps the start button pinned outside the scrollable form", () => {
    const view = setup()

    for (let count = 2; count < 6; count += 1)
      fireEvent.press(view.getByTestId("player-count-increment"))
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
    fireEvent.press(view.getByTestId("play-system-mtg"))
    fireEvent.press(view.getByTestId("player-count-increment"))
    fireEvent.press(view.getByTestId("player-count-increment"))
    fireEvent.press(view.getByTestId("play-format"))
    fireEvent.press(view.getByTestId("play-format-option-commander"))
    fireEvent.press(view.getByTestId("host-connected-button"))

    expect(host).toHaveBeenCalledWith({
      playerCount: 4,
      startingLife: 20,
      ruleset: "commander",
      system: "mtg",
      format: "commander",
      deckRequired: false,
      layout: "auto",
      lifeStep: 10,
    })
  })

  it("lets connected hosts require a deck while leaving local setup unchanged", () => {
    const host = jest.fn()
    const view = setup({ mode: "connected", connected: { ...readyHost, host } })

    expect(view.getByTestId("deck-requirement-optional").props.accessibilityState.selected).toBe(
      true,
    )
    fireEvent.press(view.getByTestId("deck-requirement-required"))
    fireEvent.press(view.getByTestId("host-connected-button"))

    expect(host).toHaveBeenCalledWith(expect.objectContaining({ deckRequired: true }))
    expect(view.queryByTestId("player-name-1")).toBeNull()
  })

  it("keeps join and resumable connected games below setup", () => {
    const onJoinConnected = jest.fn()
    const onResumeConnected = jest.fn()
    const game = {
      publicId: "resume-game",
      status: "lobby" as const,
      isHost: true,
      playerCount: 2,
      ruleset: "standard",
      updatedAt: 1,
    }
    const view = setup({
      mode: "connected",
      connected: { ...readyHost, activeGames: [game] },
      onJoinConnected,
      onResumeConnected,
    })

    fireEvent.press(view.getByTestId("join-connected-button"))
    fireEvent.press(view.getByTestId("resume-connected-resume-game"))

    expect(onJoinConnected).toHaveBeenCalledTimes(1)
    expect(onResumeConnected).toHaveBeenCalledWith(game)
  })

  it("keeps hosting unavailable until the connected session is ready", () => {
    const view = setup({
      mode: "connected",
      connected: {
        ...readyHost,
        ready: false,
        status: "Preparing your connected profile…",
      },
    })

    expect(view.getByTestId("host-connected-button").props.accessibilityState.disabled).toBe(true)
    expect(view.getByTestId("connected-host-preparation")).toHaveTextContent(
      "Preparing your connected profile…",
    )
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
    expect(mockSyncUser).toHaveBeenCalledTimes(1)
    fireEvent.press(screen.getByTestId("play-system-mtg"))
    fireEvent.press(screen.getByTestId("player-count-increment"))
    fireEvent.press(screen.getByTestId("player-count-increment"))
    fireEvent.press(screen.getByTestId("starting-counter-increment"))
    fireEvent.press(screen.getByTestId("starting-counter-increment"))
    fireEvent.press(screen.getByTestId("host-connected-button"))
    await waitFor(() => expect(onLobbyCreated).toHaveBeenCalled())
    expect(mockCreateLobby).toHaveBeenCalledWith(
      expect.objectContaining({
        playerCount: 4,
        startingLife: 40,
        lifeStep: 10,
        ruleset: "standard",
      }),
    )
    expect(mockSyncUser).toHaveBeenCalledTimes(1)
  })

  it("blocks hosting a second lobby from the setup screen", async () => {
    connectedHarness.activeGames = [
      { publicId: "hosted-lobby", status: "lobby", ruleset: "standard", isHost: true },
    ]
    render(hostSetup(jest.fn()))

    await waitFor(() => expect(screen.getByText(/Resume or finish your hosted game/i)).toBeTruthy())
    expect(screen.getByTestId("host-connected-button").props.accessibilityState.disabled).toBe(true)
  })

  it("explains the hosted-game check before enabling Host", async () => {
    connectedHarness.activeGamesStatus = "LoadingFirstPage"
    render(hostSetup(jest.fn()))

    await waitFor(() =>
      expect(screen.getByText("Checking for an existing hosted game…")).toBeTruthy(),
    )
    expect(screen.getByTestId("host-connected-button")).toBeDisabled()
  })
})
