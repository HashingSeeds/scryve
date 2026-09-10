import { Dimensions, StyleSheet } from "react-native"
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native"

import { Screen } from "@/components/Screen"
import { ConnectedHostSource } from "@/features/connected/ConnectedHostSource"
import {
  ConnectedProfileProvider,
  resetConnectedProfileBootstrapForTests,
} from "@/features/connected/useConnectedProfile"
import { createLocalGame } from "@/features/game/domain"
import { DEFAULT_LOCAL_SETTINGS } from "@/features/game/localPersistence"
import { ThemeProvider } from "@/theme/context"

import { JoinConnectedScreen } from "./JoinConnectedScreen"
import { NewGameScreen, type ConnectedHostFeed, type NewGameScreenProps } from "./NewGameScreen"
import {
  connectedHarness,
  mockAbandon,
  mockCreateLobby,
  mockLeave,
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

const readyHost: ConnectedHostFeed = {
  ready: true,
  busy: false,
  host: jest.fn(),
  exitGame: jest.fn(async () => true),
}

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

  it("keeps arriving games out of the setup form until requested", () => {
    const props = {
      defaults: DEFAULT_LOCAL_SETTINGS,
      mode: "connected" as const,
      onModeChange: jest.fn(),
      onBack: jest.fn(),
      onStartLocal: jest.fn(),
      onResumeConnected: jest.fn(),
    }
    const view = render(themed(<NewGameScreen {...props} connected={readyHost} />))
    const form = view.UNSAFE_getByType(Screen)
    const statusStyle = StyleSheet.flatten(view.getByTestId("setup-status").props.style)
    fireEvent.press(view.getByTestId("player-count-increment"))
    view.rerender(
      themed(
        <NewGameScreen
          {...props}
          connected={{
            ...readyHost,
            activeGames: [
              {
                publicId: "arriving",
                status: "active",
                isHost: true,
                playerCount: 2,
                ruleset: "standard",
                updatedAt: 1,
              },
            ],
          }}
        />,
      ),
    )
    expect(view.queryByTestId("resume-connected-arriving")).toBeNull()
    expect(StyleSheet.flatten(view.getByTestId("setup-status").props.style).height).toBe(
      statusStyle.height,
    )
    expect(within(form).getByLabelText("Seats, 3")).toBeTruthy()
    expect(within(form).queryByText("Games in progress")).toBeNull()
    fireEvent.press(view.getByTestId("setup-status"))
    expect(props.onResumeConnected).toHaveBeenCalledWith(
      expect.objectContaining({ publicId: "arriving" }),
    )
  })

  it("offers ending the current game before starting, preserving setup", () => {
    const onResumeLocal = jest.fn()
    const onEndLocal = jest.fn()
    const onStartLocal = jest.fn()
    const localGame = createLocalGame({
      players: [
        { name: "Ada", color: "#FF0000" },
        { name: "Grace", color: "#0000FF" },
      ],
      startingLife: 20,
    })
    const props = {
      defaults: DEFAULT_LOCAL_SETTINGS,
      mode: "local" as const,
      onModeChange: jest.fn(),
      onBack: jest.fn(),
      onResumeLocal,
      onEndLocal,
      onStartLocal,
    }
    const view = render(themed(<NewGameScreen {...props} localGame={localGame} />))
    fireEvent.press(view.getByTestId("player-count-increment"))
    expect(view.getByTestId("start-game-button")).toBeEnabled()
    expect(view.getByText("End current game…")).toBeTruthy()
    fireEvent.press(view.getByTestId("setup-status"))
    expect(onResumeLocal).toHaveBeenCalledTimes(1)

    fireEvent.press(view.getByTestId("start-game-button"))
    expect(view.getByTestId("end-game-dialog")).toBeTruthy()
    expect(onEndLocal).not.toHaveBeenCalled()
    expect(onStartLocal).not.toHaveBeenCalled()
    fireEvent.press(view.getByTestId("end-game-backdrop"))
    expect(view.queryByTestId("end-game-dialog")).toBeNull()
    expect(view.getByText("End current game…")).toBeTruthy()

    fireEvent.press(view.getByTestId("start-game-button"))
    fireEvent.press(view.getByTestId("end-game-result-draw"))
    fireEvent.press(view.getByTestId("confirm-end-game-button"))
    expect(onEndLocal).toHaveBeenCalledWith({ kind: "draw" })
    view.rerender(themed(<NewGameScreen {...props} />))
    expect(view.queryByText("End current game…")).toBeNull()
    expect(view.getByTestId("start-game-button")).toBeEnabled()
    expect(view.getByLabelText("Players, 3")).toBeTruthy()
    expect(onStartLocal).not.toHaveBeenCalled()
    fireEvent.press(view.getByTestId("start-game-button"))
    expect(onStartLocal.mock.calls[0][0]).toHaveLength(3)
  })

  it("autosaves valid names on blur and confirmed appearances for existing players", () => {
    const onSavePlayers = jest.fn()
    const initialGame = createLocalGame({
      players: [
        { name: "Ada", color: "#FF0000" },
        { name: "Grace", color: "#0000FF" },
      ],
      startingLife: 20,
    })
    const view = setup({ initialGame, onSavePlayers })
    fireEvent.changeText(view.getByTestId("player-name-1"), "Grace")
    fireEvent(view.getByTestId("player-name-1"), "blur")
    expect(onSavePlayers).not.toHaveBeenCalled()
    fireEvent.changeText(view.getByTestId("player-name-1"), "Katherine")
    expect(onSavePlayers).not.toHaveBeenCalled()
    fireEvent(view.getByTestId("player-name-1"), "blur")
    expect(onSavePlayers).toHaveBeenLastCalledWith([
      expect.objectContaining({ name: "Katherine" }),
      expect.objectContaining({ name: "Grace" }),
    ])

    fireEvent.press(view.getByTestId("player-count-increment"))
    fireEvent.press(view.getByTestId("player-appearance-1"))
    fireEvent.press(view.getByTestId("appearance-color-39755c"))
    expect(onSavePlayers).toHaveBeenCalledTimes(1)
    fireEvent.press(view.getByTestId("save-local-appearance-button"))
    expect(onSavePlayers).toHaveBeenLastCalledWith([
      expect.objectContaining({ name: "Katherine", color: "#39755C" }),
      expect.objectContaining({ name: "Grace" }),
    ])
    expect(view.getByLabelText("Players, 3")).toBeTruthy()
  })

  it("shows an autosave failure and lets the player retry on blur", () => {
    const onSavePlayers = jest.fn().mockImplementationOnce(() => {
      throw new Error("Could not save players.")
    })
    const initialGame = createLocalGame({
      players: [
        { name: "Ada", color: "#FF0000" },
        { name: "Grace", color: "#0000FF" },
      ],
      startingLife: 20,
    })
    const view = setup({ initialGame, onSavePlayers })
    fireEvent.changeText(view.getByTestId("player-name-1"), "Katherine")
    fireEvent(view.getByTestId("player-name-1"), "blur")
    expect(view.getByText("Could not save players.")).toBeTruthy()
    fireEvent(view.getByTestId("player-name-1"), "blur")
    expect(view.queryByText("Could not save players.")).toBeNull()
    expect(onSavePlayers).toHaveBeenCalledTimes(2)
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
    fireEvent.press(view.getByTestId("setup-options"))

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
    fireEvent.press(view.getByTestId("setup-options"))

    for (let count = 2; count < 6; count += 1)
      fireEvent.press(view.getByTestId("player-count-increment"))

    expect(view.getByTestId("player-layout-tabletop")).toBeTruthy()
  })

  it("starts Yu-Gi-Oh! at 8000 Life Points with the Advanced format", () => {
    const onStartLocal = jest.fn()
    const view = setup({ onStartLocal })

    fireEvent.press(view.getByTestId("play-system-ygo"))
    expect(view.getByLabelText("Life Points, 8000")).toBeTruthy()
    fireEvent.press(view.getByTestId("setup-options"))
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
    fireEvent.press(view.getByTestId("setup-options"))

    fireEvent.press(view.getByTestId("play-system-mtg"))
    expect(view.getByLabelText("Increase Life by 1")).toBeTruthy()
    fireEvent.press(view.getByTestId("starting-counter-increment"))
    fireEvent.press(view.getByTestId("life-step"))
    fireEvent.press(view.getByTestId("life-step-option-5"))
    fireEvent.press(view.getByTestId("starting-counter-increment"))
    fireEvent.press(view.getByTestId("start-game-button"))

    expect(onStartLocal).toHaveBeenCalledWith(expect.any(Array), 26, {
      format: "standard",
      layout: "auto",
      lifeStep: 5,
      system: "mtg",
    })
  })

  it("preserves custom life when changing formats", () => {
    const onStartLocal = jest.fn()
    const view = setup({ onStartLocal })
    fireEvent.press(view.getByTestId("play-system-mtg"))
    fireEvent.press(view.getByTestId("starting-counter-increment"))
    fireEvent.press(view.getByTestId("play-format"))
    fireEvent.press(view.getByTestId("play-format-option-commander"))
    fireEvent.press(view.getByTestId("start-game-button"))
    expect(onStartLocal).toHaveBeenCalledWith(
      expect.any(Array),
      21,
      expect.objectContaining({ format: "commander", lifeStep: 1 }),
    )
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
      startingLife: 40,
      ruleset: "commander",
      system: "mtg",
      format: "commander",
      deckRequired: false,
      layout: "auto",
      lifeStep: 1,
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

  it("opens resumable games without interrupting setup", () => {
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
      connected: { ...readyHost, ready: false, activeGames: [game] },
      joinContent: <JoinConnectedScreen embedded onJoined={jest.fn()} />,
      onResumeConnected,
    })

    expect(view.getByTestId("connected-action-join")).toBeEnabled()
    fireEvent.press(view.getByTestId("player-count-increment"))
    fireEvent.press(view.getByTestId("connected-action-join"))
    expect(view.getByTestId("manual-code-input")).toBeTruthy()
    expect(view.queryByTestId("play-system")).toBeNull()
    expect(view.queryByTestId("deck-requirement")).toBeNull()
    fireEvent.press(view.getByTestId("connected-action-host"))
    expect(view.getByLabelText("Seats, 3")).toBeTruthy()
    fireEvent.press(view.getByTestId("setup-status"))
    fireEvent.press(view.getByTestId("resume-connected-resume-game"))

    expect(onResumeConnected).toHaveBeenCalledWith(game)
  })

  it("ends a blocking hosted game from the primary action and keeps the host draft", async () => {
    const host = jest.fn()
    const exitGame = jest.fn(async () => true)
    const game = {
      publicId: "hosted",
      status: "active" as const,
      isHost: true,
      playerCount: 2,
      ruleset: "standard",
      updatedAt: 1,
    }
    const props = {
      defaults: DEFAULT_LOCAL_SETTINGS,
      mode: "connected" as const,
      onModeChange: jest.fn(),
      onBack: jest.fn(),
      onStartLocal: jest.fn(),
    }
    const view = render(
      themed(
        <NewGameScreen
          {...props}
          connected={{
            ...readyHost,
            host,
            exitGame,
            activeGames: [game],
            blockedReason: "End your hosted game before hosting another.",
          }}
        />,
      ),
    )
    fireEvent.press(view.getByTestId("player-count-increment"))
    fireEvent.press(view.getByTestId("host-connected-button"))
    expect(host).not.toHaveBeenCalled()
    expect(exitGame).not.toHaveBeenCalled()
    fireEvent.press(view.getByTestId("confirm-connected-game-exit"))
    await waitFor(() => expect(exitGame).toHaveBeenCalledWith(game))
    view.rerender(themed(<NewGameScreen {...props} connected={{ ...readyHost, host }} />))
    expect(view.getByText("Host lobby")).toBeTruthy()
    fireEvent.press(view.getByTestId("host-connected-button"))
    expect(host).toHaveBeenCalledWith(expect.objectContaining({ playerCount: 3 }))
  })

  it("confirms host end and participant leave actions without changing setup", async () => {
    const exitGame = jest.fn(async () => true)
    const hosted = {
      publicId: "hosted-game",
      status: "active" as const,
      isHost: true,
      playerCount: 2,
      ruleset: "standard",
      updatedAt: 1,
    }
    const joined = { ...hosted, publicId: "joined-game", isHost: false }
    const view = setup({
      mode: "connected",
      connected: { ...readyHost, activeGames: [hosted, joined], exitGame },
    })

    fireEvent.press(view.getByTestId("player-count-increment"))
    fireEvent.press(view.getByTestId("setup-status"))
    fireEvent.press(view.getByTestId("end-connected-hosted-game"))
    expect(view.getByText("End this game?")).toBeTruthy()
    fireEvent.press(view.getByTestId("cancel-connected-game-exit"))
    expect(view.getByTestId("player-count-increment")).toBeTruthy()

    fireEvent.press(view.getByTestId("setup-status"))
    fireEvent.press(view.getByTestId("leave-connected-joined-game"))
    expect(view.getByText("Leave this game?")).toBeTruthy()
    fireEvent.press(view.getByTestId("confirm-connected-game-exit"))
    await waitFor(() => expect(exitGame).toHaveBeenCalledWith(joined))
    expect(view.queryByTestId("connected-game-exit-confirmation")).toBeNull()
  })

  it("keeps the exit confirmation open and shows an exit failure", async () => {
    const exitGame = jest.fn(async () => false)
    const game = {
      publicId: "failed-exit",
      status: "lobby" as const,
      isHost: false,
      playerCount: 2,
      ruleset: "standard",
      updatedAt: 1,
    }
    const view = setup({
      mode: "connected",
      connected: {
        ...readyHost,
        activeGames: [game],
        exitGame,
        exitError: "Could not leave this game.",
      },
    })

    fireEvent.press(view.getByTestId("setup-status"))
    fireEvent.press(view.getByTestId("leave-connected-failed-exit"))
    fireEvent.press(view.getByTestId("confirm-connected-game-exit"))
    await waitFor(() => expect(exitGame).toHaveBeenCalledWith(game))
    expect(view.getAllByText("Could not leave this game.")).toHaveLength(1)
    expect(view.getByTestId("connected-game-exit-confirmation")).toBeTruthy()
  })

  it("hides brief preparation and retry flashes, but explains a slow connection", () => {
    jest.useFakeTimers()
    try {
      const view = setup({
        mode: "connected",
        connected: {
          ...readyHost,
          ready: false,
          status: "Checking your games…",
          retry: jest.fn(),
        },
      })
      expect(view.queryByTestId("connected-host-preparation")).toBeNull()
      expect(view.queryByText("Retry connection")).toBeNull()
      expect(view.getByTestId("host-connected-button")).toBeDisabled()
      act(() => jest.advanceTimersByTime(200))
      expect(view.getByTestId("connected-host-preparation")).toBeTruthy()
      expect(view.queryByText("Retry connection")).toBeNull()
    } finally {
      jest.useRealTimers()
    }
  })

  it("never reveals preparation when the connection finishes within the delay", () => {
    jest.useFakeTimers()
    try {
      const renderSetup = (connected: ConnectedHostFeed) =>
        themed(
          <NewGameScreen
            defaults={DEFAULT_LOCAL_SETTINGS}
            mode="connected"
            connected={connected}
            onModeChange={jest.fn()}
            onBack={jest.fn()}
            onStartLocal={jest.fn()}
          />,
        )
      const view = render(
        renderSetup({
          ...readyHost,
          ready: false,
          status: "Checking your games…",
          retry: jest.fn(),
        }),
      )
      act(() => jest.advanceTimersByTime(100))
      view.rerender(renderSetup(readyHost))
      act(() => jest.advanceTimersByTime(200))
      expect(view.queryByTestId("connected-host-preparation")).toBeNull()
      expect(view.queryByText("Retry connection")).toBeNull()
      expect(view.getByTestId("host-connected-button")).toBeEnabled()
    } finally {
      jest.useRealTimers()
    }
  })

  it("keeps hosting unavailable until the connected session is ready", async () => {
    const view = setup({
      mode: "connected",
      connected: {
        ...readyHost,
        ready: false,
        status: "Preparing your connected profile…",
      },
    })

    expect(view.getByTestId("host-connected-button").props.accessibilityState.disabled).toBe(true)
    await waitFor(() =>
      expect(view.getByTestId("connected-host-preparation")).toHaveTextContent(
        "Preparing your connected profile…",
      ),
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
        startingLife: 22,
        lifeStep: 1,
        ruleset: "standard",
      }),
    )
    expect(mockSyncUser).toHaveBeenCalledTimes(1)
  })

  it("dispatches connected game exit mutations by player role", async () => {
    connectedHarness.activeGames = [
      { publicId: "hosted-game", status: "active", ruleset: "standard", isHost: true },
      { publicId: "joined-game", status: "active", ruleset: "standard", isHost: false },
    ]
    render(hostSetup(jest.fn()))
    await waitFor(() => expect(screen.getByTestId("setup-status")).toBeEnabled())

    fireEvent.press(screen.getByTestId("setup-status"))
    fireEvent.press(screen.getByTestId("end-connected-hosted-game"))
    fireEvent.press(screen.getByTestId("confirm-connected-game-exit"))
    await waitFor(() => expect(mockAbandon).toHaveBeenCalledWith({ publicId: "hosted-game" }))

    fireEvent.press(screen.getByTestId("setup-status"))
    fireEvent.press(screen.getByTestId("leave-connected-joined-game"))
    fireEvent.press(screen.getByTestId("confirm-connected-game-exit"))
    await waitFor(() =>
      expect(mockLeave).toHaveBeenCalledWith(
        expect.objectContaining({ publicId: "joined-game", deviceId: expect.any(String) }),
      ),
    )
  })

  it("keeps the recovery action available when its mutation fails", async () => {
    connectedHarness.activeGames = [
      { publicId: "joined-game", status: "active", ruleset: "standard", isHost: false },
    ]
    mockLeave.mockRejectedValueOnce(new Error("Could not leave this game."))
    render(hostSetup(jest.fn()))
    await waitFor(() => expect(screen.getByTestId("setup-status")).toBeEnabled())

    fireEvent.press(screen.getByTestId("setup-status"))
    fireEvent.press(screen.getByTestId("leave-connected-joined-game"))
    fireEvent.press(screen.getByTestId("confirm-connected-game-exit"))
    await waitFor(() => expect(screen.getAllByText("Could not leave this game.")).toHaveLength(1))
    expect(screen.getByTestId("connected-game-exit-confirmation")).toBeTruthy()
  })

  it("blocks hosting a second lobby from the setup screen", async () => {
    connectedHarness.activeGames = [
      { publicId: "hosted-lobby", status: "lobby", ruleset: "standard", isHost: true },
    ]
    render(hostSetup(jest.fn()))

    await waitFor(() => expect(screen.getByText("End current game…")).toBeTruthy())
    expect(screen.getByTestId("host-connected-button")).toBeEnabled()
    fireEvent.press(screen.getByTestId("host-connected-button"))
    expect(screen.getByTestId("connected-game-exit-confirmation")).toBeTruthy()
    expect(mockCreateLobby).not.toHaveBeenCalled()
  })

  it("explains the hosted-game check before enabling Host", async () => {
    connectedHarness.activeGamesStatus = "LoadingFirstPage"
    render(hostSetup(jest.fn()))

    await waitFor(() => expect(screen.getByText("Checking your games…")).toBeTruthy())
    expect(screen.getByTestId("host-connected-button")).toBeDisabled()
  })
})
