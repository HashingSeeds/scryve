import { Dimensions, StyleSheet } from "react-native"
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native"

import { Screen } from "@/components/Screen"
import * as authAccess from "@/features/auth/AuthContext"
import { ConnectedHostSource } from "@/features/connected/ConnectedHostSource"
import {
  ConnectedProfileProvider,
  resetConnectedProfileBootstrapForTests,
} from "@/features/connected/useConnectedProfile"
import {
  applyGameCommand,
  asDeviceId,
  createLocalGame,
  defaultCommandContext,
} from "@/features/game/domain"
import { DEFAULT_LOCAL_SETTINGS } from "@/features/game/localPersistence"
import { ThemeProvider } from "@/theme/context"

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

function openOptions() {
  fireEvent.press(screen.getByTestId("setup-change-button"))
}

function closeOptions() {
  fireEvent.press(screen.getByTestId("setup-options-done"))
}

/** A two-player local game in progress, which puts the setup screen in its managing state. */
function runningLocalGame() {
  return createLocalGame({
    players: [
      { name: "Ada", color: "#FF0000" },
      { name: "Grace", color: "#0000FF" },
    ],
    startingLife: 20,
    system: "mtg",
    format: "commander",
  })
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
  afterEach(() => jest.restoreAllMocks())

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
    openOptions()
    fireEvent.press(view.getByTestId("player-count-increment"))
    closeOptions()
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
    expect(within(form).getByText("3 seats · 20 life · Decks optional")).toBeTruthy()
    expect(within(form).queryByText("Games in progress")).toBeNull()
    fireEvent.press(view.getByTestId("setup-status"))
    expect(props.onResumeConnected).toHaveBeenCalledWith(
      expect.objectContaining({ publicId: "arriving" }),
    )
  })

  it("publishes the running local game under the seat the host picks", () => {
    const publish = jest.fn()
    const localGame = runningLocalGame()
    const view = setup({ localGame, localConnect: { publish } })

    fireEvent.press(view.getByTestId("connect-local-button"))
    fireEvent.press(view.getByTestId("host-seat-2"))

    expect(publish).toHaveBeenCalledWith(localGame.players[1].id)
  })

  it("sends a signed-out host to the account gate instead of the seat picker", () => {
    const publish = jest.fn()
    const request = jest.fn()
    const view = setup({
      localGame: runningLocalGame(),
      localConnect: { publish, access: { label: "Sign in to host", request } },
    })

    fireEvent.press(view.getByText("Sign in to host"))

    expect(request).toHaveBeenCalledTimes(1)
    expect(view.queryByTestId("host-seat-dialog")).toBeNull()
    expect(publish).not.toHaveBeenCalled()
  })

  it("hides the connect action without a local game to connect", () => {
    expect(
      setup({ localConnect: { publish: jest.fn() } }).queryByTestId("connect-local-button"),
    ).toBeNull()
    expect(
      setup({ localGame: runningLocalGame() }).queryByTestId("connect-local-button"),
    ).toBeNull()
  })

  it("drops the empty status row from a fresh local setup", () => {
    expect(setup().queryByTestId("setup-status")).toBeNull()
    expect(setup({ localGame: runningLocalGame() }).getByTestId("setup-status")).toBeTruthy()
  })

  it("surfaces a hosted live game in local setup only", () => {
    const onResumeConnected = jest.fn()
    const hosted = {
      publicId: "hosted-game",
      status: "active" as const,
      isHost: true,
      playerCount: 2,
      ruleset: "standard",
      updatedAt: 1,
    }
    const local = setup({
      connected: { ...readyHost, activeGames: [hosted] },
      onResumeConnected,
    })
    fireEvent.press(local.getByTestId("resume-hosted-connected-button"))
    expect(onResumeConnected).toHaveBeenCalledWith(hosted)

    const connected = setup({
      mode: "connected",
      connected: { ...readyHost, activeGames: [hosted] },
      onResumeConnected,
    })
    expect(connected.queryByTestId("resume-hosted-connected-button")).toBeNull()
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
    openOptions()
    fireEvent.press(view.getByTestId("player-count-increment"))
    closeOptions()
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
    expect(view.getByText("3 players · 20 life")).toBeTruthy()
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
    expect(onSavePlayers).toHaveBeenLastCalledWith(
      [expect.objectContaining({ name: "Katherine" }), expect.objectContaining({ name: "Grace" })],
      undefined,
    )

    openOptions()
    fireEvent.press(view.getByTestId("player-count-increment"))
    closeOptions()
    fireEvent.press(view.getByTestId("player-appearance-1"))
    fireEvent.press(view.getByTestId("appearance-color-117b9c"))
    expect(onSavePlayers).toHaveBeenCalledTimes(1)
    fireEvent.press(view.getByTestId("save-local-appearance-button"))
    expect(onSavePlayers).toHaveBeenLastCalledWith(
      [
        expect.objectContaining({ name: "Katherine", color: "#117B9C" }),
        expect.objectContaining({ name: "Grace" }),
      ],
      undefined,
    )
    expect(view.getByText("3 players · 20 life")).toBeTruthy()
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

    openOptions()
    for (let count = 2; count < 6; count += 1)
      fireEvent.press(view.getByTestId("player-count-increment"))
    closeOptions()
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
    openOptions()

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
    closeOptions()
    fireEvent.press(view.getByTestId("start-game-button"))

    expect(onStartLocal).toHaveBeenCalledWith(expect.any(Array), 20, {
      layout: "tabletop",
      lifeStep: 1,
    })
  })

  it("offers the Table layout to six players", () => {
    const view = setup()
    openOptions()

    for (let count = 2; count < 6; count += 1)
      fireEvent.press(view.getByTestId("player-count-increment"))

    expect(view.getByTestId("player-layout-tabletop")).toBeTruthy()
  })

  it("starts Yu-Gi-Oh! at 8000 Life Points with the Advanced format", () => {
    const onStartLocal = jest.fn()
    const view = setup({ onStartLocal })

    fireEvent.press(view.getByTestId("game-type-ygo-advanced"))
    openOptions()
    expect(view.getByLabelText("Life Points, 8000")).toBeTruthy()
    expect(view.getByLabelText("Change by, 1000")).toBeTruthy()
    closeOptions()
    fireEvent.press(view.getByTestId("start-game-button"))

    expect(onStartLocal).toHaveBeenCalledWith(expect.any(Array), 8000, {
      format: "advanced",
      layout: "auto",
      lifeStep: 1000,
      system: "ygo",
    })
  })

  it("follows Speed Duel to 4000 Life Points and back to 8000 for Advanced", () => {
    const view = setup()

    fireEvent.press(view.getByTestId("game-type-ygo-advanced"))
    fireEvent.press(view.getByTestId("game-type-all-formats"))
    fireEvent.press(view.getByTestId("game-type-ygo-speed"))
    openOptions()
    expect(view.getByLabelText("Life Points, 4000")).toBeTruthy()
    closeOptions()
    fireEvent.press(view.getByTestId("game-type-ygo-advanced"))
    openOptions()
    expect(view.getByLabelText("Life Points, 8000")).toBeTruthy()
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

    expect(view.getByTestId("game-type-ygo-advanced").props.accessibilityState.selected).toBe(true)
    expect(view.getByText("2 players · 8000 Life Points")).toBeTruthy()
    fireEvent.press(view.getByTestId("start-game-button"))

    expect(onStartLocal).toHaveBeenCalledWith(expect.any(Array), 8000, {
      format: "advanced",
      layout: "auto",
      lifeStep: 1000,
      system: "ygo",
    })
  })

  it("keeps a No system board's setup instead of the saved system default", () => {
    const initialGame = createLocalGame({
      players: [
        { name: "Ada", color: "#FF0000" },
        { name: "Grace", color: "#0000FF" },
      ],
      startingLife: 40,
    })
    const view = setup({
      initialGame,
      defaults: { ...DEFAULT_LOCAL_SETTINGS, defaultSystem: "mtg", defaultFormat: "commander" },
    })

    expect(view.getByTestId("game-type-none").props.accessibilityState.selected).toBe(true)
    expect(view.getByText("2 players · 40 life")).toBeTruthy()
  })

  it("starts Pokémon at six Prize cards", () => {
    const onStartLocal = jest.fn()
    const view = setup({ onStartLocal })

    fireEvent.press(view.getByTestId("game-type-all-formats"))
    fireEvent.press(view.getByTestId("game-type-pokemon-standard"))
    expect(view.getByText("2 players · 6 Prize cards")).toBeTruthy()
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

  function authAs(isSignedIn: boolean) {
    const openAuth = jest.fn()
    jest.spyOn(authAccess, "useAuthAccess").mockReturnValue({
      configured: true,
      isLoaded: true,
      isSignedIn,
      authVisible: false,
      openAuth,
      closeAuth: jest.fn(),
    })
    return openAuth
  }

  const crownGame = () =>
    createLocalGame({
      players: [
        { name: "Ada", color: "#B85636", shape: "crown" },
        { name: "Grace", color: "#41476E" },
      ],
      startingLife: 20,
    })

  it("keeps saved Pro marks while a signed-in account's billing is still loading", () => {
    authAs(true)
    const view = setup({ initialGame: crownGame() })

    fireEvent.press(view.getByTestId("player-appearance-1"))
    expect(view.getByTestId("appearance-shape-crown")).toHaveProp("accessibilityState", {
      selected: true,
      disabled: false,
    })
  })

  it("gives a signed-out device free marks and sends its Pro taps to sign-in", () => {
    const openAuth = authAs(false)
    const view = setup({ initialGame: crownGame() })

    fireEvent.press(view.getByTestId("player-appearance-1"))
    expect(view.getByTestId("appearance-shape-heart")).toHaveProp("accessibilityState", {
      selected: true,
      disabled: false,
    })
    fireEvent.press(view.getByTestId("appearance-shape-flame"))
    expect(openAuth).toHaveBeenCalledTimes(1)
    expect(view.queryByTestId("local-appearance-dialog")).toBeNull()
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

  it("does not offer another local player's color or mark", () => {
    const view = setup()

    fireEvent.press(view.getByTestId("player-appearance-2"))
    expect(view.getByTestId("appearance-color-b85636")).toBeDisabled()
    fireEvent.press(view.getByTestId("appearance-color-b85636"))
    expect(view.getByTestId("appearance-shape-heart")).toBeDisabled()
  })

  it("keeps customized appearances when activating seats with conflicting defaults", () => {
    const onStartLocal = jest.fn()
    const view = setup({ onStartLocal })

    fireEvent.press(view.getByTestId("player-appearance-2"))
    fireEvent.press(view.getByTestId("appearance-color-39755c"))
    fireEvent.press(view.getByTestId("appearance-shape-square"))
    fireEvent.press(view.getByTestId("save-local-appearance-button"))
    openOptions()
    for (let count = 2; count < 6; count += 1)
      fireEvent.press(view.getByTestId("player-count-increment"))
    fireEvent.press(view.getByTestId("player-count-decrement"))
    fireEvent.press(view.getByTestId("player-count-increment"))
    closeOptions()
    fireEvent.press(view.getByTestId("start-game-button"))

    const players = onStartLocal.mock.calls[0][0] as Parameters<
      NewGameScreenProps["onStartLocal"]
    >[0]
    expect(players[1]).toMatchObject({ color: "#39755C", shape: "square" })
    expect(new Set(players.map(({ color }) => color)).size).toBe(6)
    expect(new Set(players.map(({ shape }) => shape)).size).toBe(6)
  })

  it("uses the Life box as the starting value and saves a per-game change amount", () => {
    const onStartLocal = jest.fn()
    const view = setup({ onStartLocal })

    fireEvent.press(view.getByTestId("game-type-mtg-standard"))
    openOptions()
    expect(view.getByLabelText("Increase Life by 1")).toBeTruthy()
    fireEvent.press(view.getByTestId("starting-counter-increment"))
    fireEvent.press(view.getByTestId("life-step"))
    fireEvent.press(view.getByTestId("life-step-option-5"))
    fireEvent.press(view.getByTestId("starting-counter-increment"))
    closeOptions()
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
    fireEvent.press(view.getByTestId("game-type-mtg-standard"))
    openOptions()
    fireEvent.press(view.getByTestId("starting-counter-increment"))
    closeOptions()
    fireEvent.press(view.getByTestId("game-type-commander"))
    fireEvent.press(view.getByTestId("start-game-button"))
    expect(onStartLocal).toHaveBeenCalledWith(
      expect.any(Array),
      21,
      expect.objectContaining({ format: "commander", lifeStep: 1 }),
    )
  })

  it("reveals Brawl under All formats and follows its life from two players to multiplayer", () => {
    const onStartLocal = jest.fn()
    const view = setup({ onStartLocal })
    expect(view.queryByTestId("game-type-mtg-brawl")).toBeNull()
    expect(view.getByTestId("game-type-all-formats")).toHaveTextContent(/^All formats\d+ more$/)
    fireEvent.press(view.getByTestId("game-type-all-formats"))
    expect(view.queryByTestId("game-type-all-formats")).toBeNull()
    fireEvent.press(view.getByTestId("game-type-mtg-brawl"))
    expect(view.getByText("2 players · 25 life")).toBeTruthy()
    openOptions()
    fireEvent.press(view.getByTestId("player-count-increment"))
    fireEvent.press(view.getByTestId("player-count-increment"))
    closeOptions()
    fireEvent.press(view.getByTestId("start-game-button"))
    expect(onStartLocal).toHaveBeenCalledWith(
      expect.any(Array),
      30,
      expect.objectContaining({ format: "brawl" }),
    )
  })

  it("keeps the start button pinned outside the scrollable form", () => {
    const view = setup()

    openOptions()
    for (let count = 2; count < 6; count += 1)
      fireEvent.press(view.getByTestId("player-count-increment"))
    closeOptions()
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

  it("offers Nearby beside hosting only in connected mode, with the same setup", () => {
    const onNearby = jest.fn()
    const connected = setup({ mode: "connected", connected: readyHost, onNearby })

    fireEvent.press(connected.getByTestId("nearby-game-button"))
    expect(onNearby).toHaveBeenCalledWith(
      expect.objectContaining({
        playerCount: expect.any(Number),
        startingLife: expect.any(Number),
      }),
    )
    connected.unmount()
    expect(setup({ mode: "local", onNearby }).queryByTestId("nearby-game-button")).toBeNull()
  })

  it("swaps to seats, ruleset, and hosting in connected mode", () => {
    const host = jest.fn()
    const view = setup({ mode: "connected", connected: { ...readyHost, host } })

    expect(view.queryByTestId("player-name-1")).toBeNull()
    fireEvent.press(view.getByTestId("game-type-mtg-standard"))
    openOptions()
    fireEvent.press(view.getByTestId("player-count-increment"))
    fireEvent.press(view.getByTestId("player-count-increment"))
    closeOptions()
    fireEvent.press(view.getByTestId("game-type-commander"))
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

    openOptions()
    expect(view.getByTestId("deck-requirement-optional").props.accessibilityState.selected).toBe(
      true,
    )
    fireEvent.press(view.getByTestId("deck-requirement-required"))
    fireEvent.press(view.getByTestId("host-connected-button"))

    expect(host).toHaveBeenCalledWith(expect.objectContaining({ deckRequired: true }))
    expect(view.queryByTestId("player-name-1")).toBeNull()
  })

  it("hosts Treachery with 4–6 seats and drops it once the seats no longer fit", () => {
    const host = jest.fn()
    const props = { mode: "connected" as const, connected: { ...readyHost, host } }
    const view = setup(props)
    const rerender = (mode: "local" | "connected") =>
      view.rerender(
        <ThemeProvider initialContext="light">
          <NewGameScreen
            defaults={DEFAULT_LOCAL_SETTINGS}
            onModeChange={jest.fn()}
            onBack={jest.fn()}
            onStartLocal={jest.fn()}
            {...props}
            mode={mode}
          />
        </ThemeProvider>,
      )

    fireEvent.press(view.getByTestId("game-type-treachery"))
    expect(view.getByTestId("game-type-treachery").props.accessibilityState.selected).toBe(true)
    expect(view.getByText("4 seats · 40 life · Decks optional")).toBeTruthy()
    fireEvent.press(view.getByTestId("host-connected-button"))
    expect(host).toHaveBeenLastCalledWith(
      expect.objectContaining({
        playerCount: 4,
        startingLife: 40,
        ruleset: "commander",
        system: "mtg",
        format: "commander",
        variant: "treachery",
      }),
    )

    rerender("local")
    openOptions()
    fireEvent.press(view.getByTestId("player-count-decrement"))
    closeOptions()
    rerender("connected")
    expect(view.getByTestId("game-type-commander").props.accessibilityState.selected).toBe(true)
    fireEvent.press(view.getByTestId("host-connected-button"))
    expect(host).toHaveBeenLastCalledWith(expect.not.objectContaining({ variant: "treachery" }))
  })

  it("opens resumable games and Join without interrupting setup", () => {
    const onJoin = jest.fn()
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
      onJoin,
      onResumeConnected,
    })

    openOptions()
    fireEvent.press(view.getByTestId("player-count-increment"))
    closeOptions()
    fireEvent.press(view.getByTestId("join-with-code-button"))
    expect(onJoin).toHaveBeenCalledTimes(1)
    expect(view.getByText("3 seats · 20 life · Decks optional")).toBeTruthy()
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
    openOptions()
    fireEvent.press(view.getByTestId("player-count-increment"))
    closeOptions()
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

  it("blocks hosting while a local game is active and ends it explicitly", () => {
    const host = jest.fn()
    const onEndLocal = jest.fn()
    const localGame = createLocalGame({
      players: [
        { name: "Ada", color: "#FF0000" },
        { name: "Grace", color: "#0000FF" },
      ],
      startingLife: 20,
    })
    const view = render(
      themed(
        <NewGameScreen
          defaults={DEFAULT_LOCAL_SETTINGS}
          mode="connected"
          onModeChange={jest.fn()}
          onBack={jest.fn()}
          onStartLocal={jest.fn()}
          localGame={localGame}
          onEndLocal={onEndLocal}
          connected={{ ...readyHost, host }}
        />,
      ),
    )
    expect(view.getByText("End current game…")).toBeTruthy()
    fireEvent.press(view.getByTestId("host-connected-button"))
    expect(host).not.toHaveBeenCalled()
    expect(view.getByTestId("end-game-dialog")).toBeTruthy()
    fireEvent.press(view.getByTestId("end-game-result-draw"))
    fireEvent.press(view.getByTestId("confirm-end-game-button"))
    expect(onEndLocal).toHaveBeenCalledWith({ kind: "draw" })
  })

  it("blocks starting local while a connected game is live and exits it explicitly", async () => {
    const onStartLocal = jest.fn()
    const onResumeConnected = jest.fn()
    const exitGame = jest.fn(async () => true)
    const game = {
      publicId: "live-connected",
      status: "active" as const,
      isHost: false,
      playerCount: 2,
      ruleset: "standard",
      updatedAt: 1,
    }
    const view = setup({
      connected: { ...readyHost, exitGame, activeGames: [game] },
      onStartLocal,
      onResumeConnected,
    })
    expect(view.getByText("End current game…")).toBeTruthy()
    fireEvent.press(view.getByTestId("setup-status"))
    expect(onResumeConnected).toHaveBeenCalledWith(game)

    fireEvent.press(view.getByTestId("start-game-button"))
    expect(onStartLocal).not.toHaveBeenCalled()
    expect(view.getByTestId("connected-game-exit-confirmation")).toBeTruthy()
    fireEvent.press(view.getByTestId("confirm-connected-game-exit"))
    await waitFor(() => expect(exitGame).toHaveBeenCalledWith(game))
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

    openOptions()
    fireEvent.press(view.getByTestId("player-count-increment"))
    closeOptions()
    fireEvent.press(view.getByTestId("setup-status"))
    fireEvent.press(view.getByTestId("end-connected-hosted-game"))
    expect(view.getByText("End this game?")).toBeTruthy()
    fireEvent.press(view.getByTestId("cancel-connected-game-exit"))
    expect(view.getByText("3 seats · 20 life · Decks optional")).toBeTruthy()

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
    fireEvent.press(screen.getByTestId("game-type-mtg-standard"))
    openOptions()
    fireEvent.press(screen.getByTestId("player-count-increment"))
    fireEvent.press(screen.getByTestId("player-count-increment"))
    fireEvent.press(screen.getByTestId("starting-counter-increment"))
    fireEvent.press(screen.getByTestId("starting-counter-increment"))
    closeOptions()
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

  it("hides the account seat while signed out", () => {
    setup()
    expect(screen.queryByTestId("me-seat")).toBeNull()
  })

  it("pre-marks the account's seat, offers matching decks, and starts the game with both", () => {
    const onStartLocal = jest.fn()
    setup({
      onStartLocal,
      account: {
        ownerId: "owner-a",
        defaultMeSeat: 1,
        decks: [
          { versionId: "v-commander", name: "Atraxa", system: "mtg", format: "commander" },
          { versionId: "v-standard", name: "Mono Red", system: "mtg", format: "standard" },
        ],
      },
    })
    expect(screen.getByLabelText("This is me, Player 2")).toBeTruthy()
    expect(screen.queryByTestId("me-deck")).toBeNull()

    fireEvent.press(screen.getByTestId("game-type-commander"))
    fireEvent.press(screen.getByTestId("me-deck"))
    expect(screen.queryByTestId("me-deck-option-v-standard")).toBeNull()
    fireEvent.press(screen.getByTestId("me-deck-option-v-commander"))
    fireEvent.press(screen.getByTestId("start-game-button"))
    expect(onStartLocal).toHaveBeenCalledWith(
      expect.any(Array),
      40,
      expect.objectContaining({
        system: "mtg",
        format: "commander",
        account: {
          ownerId: "owner-a",
          meSeat: 1,
          deckVersionId: "v-commander",
          deckName: "Atraxa",
        },
      }),
    )
  })

  it("drops the previous account's seat and deck when the signed-in owner changes", () => {
    const onStartLocal = jest.fn()
    const decks = [{ versionId: "v-standard", name: "Mono Red", system: "mtg", format: "standard" }]
    const view = render(
      <ThemeProvider initialContext="light">
        <NewGameScreen
          defaults={DEFAULT_LOCAL_SETTINGS}
          mode="local"
          onModeChange={jest.fn()}
          onBack={jest.fn()}
          onStartLocal={onStartLocal}
          account={{ ownerId: "owner-a", defaultMeSeat: 1, decks }}
        />
      </ThemeProvider>,
    )
    fireEvent.press(screen.getByTestId("game-type-mtg-standard"))
    fireEvent.press(screen.getByTestId("me-deck"))
    fireEvent.press(screen.getByTestId("me-deck-option-v-standard"))
    expect(screen.getByLabelText("Your deck, Mono Red")).toBeTruthy()

    view.rerender(
      <ThemeProvider initialContext="light">
        <NewGameScreen
          defaults={DEFAULT_LOCAL_SETTINGS}
          mode="local"
          onModeChange={jest.fn()}
          onBack={jest.fn()}
          onStartLocal={onStartLocal}
          account={{ ownerId: "owner-b", defaultMeSeat: 0, decks: [] }}
        />
      </ThemeProvider>,
    )
    expect(screen.getByLabelText("This is me, Player 1")).toBeTruthy()
    expect(screen.getByLabelText("Your deck, No matching decks")).toBeTruthy()
    fireEvent.press(screen.getByTestId("start-game-button"))
    expect(onStartLocal).toHaveBeenCalledWith(
      expect.any(Array),
      20,
      expect.objectContaining({ account: { ownerId: "owner-b", meSeat: 0 } }),
    )
  })

  it("keeps a running game's owner when another account renames a player", () => {
    const onSavePlayers = jest.fn()
    const fresh = createLocalGame({
      players: [
        { name: "Ada", color: "#FF0000" },
        { name: "Grace", color: "#0000FF" },
      ],
      startingLife: 20,
      account: { ownerId: "owner-a", meSeat: 1 },
    })
    const initialGame = applyGameCommand(
      fresh,
      { type: "life.change", playerId: fresh.players[0].id, delta: -1 },
      defaultCommandContext(asDeviceId("device_test")),
    )
    setup({ initialGame, onSavePlayers, account: { ownerId: "owner-b", decks: [] } })
    expect(screen.getByLabelText("This is me, Grace")).toBeTruthy()
    fireEvent.changeText(screen.getByTestId("player-name-1"), "Katherine")
    fireEvent(screen.getByTestId("player-name-1"), "blur")
    expect(onSavePlayers).toHaveBeenLastCalledWith(
      [expect.objectContaining({ name: "Katherine" }), expect.objectContaining({ name: "Grace" })],
      undefined,
    )
  })

  it("saves a changed account seat for a running game instead of pre-marking one", () => {
    const onSavePlayers = jest.fn()
    const fresh = runningLocalGame()
    const initialGame = applyGameCommand(
      fresh,
      { type: "life.change", playerId: fresh.players[0].id, delta: -1 },
      defaultCommandContext(asDeviceId("device_test")),
    )
    setup({ initialGame, onSavePlayers, account: { ownerId: "owner-a", decks: [] } })
    expect(screen.getByLabelText("This is me, No seat")).toBeTruthy()
    fireEvent.press(screen.getByTestId("me-seat"))
    fireEvent.press(screen.getByTestId("me-seat-option-0"))
    expect(onSavePlayers).toHaveBeenLastCalledWith(expect.any(Array), {
      ownerId: "owner-a",
      meSeat: 0,
    })
  })

  it("starts a single game unless match mode is on, defaulting the best of by format", () => {
    const onStartLocal = jest.fn()
    setup({ onStartLocal })
    fireEvent.press(screen.getByTestId("start-game-button"))
    expect(onStartLocal.mock.calls[0][2].match).toBeUndefined()

    openOptions()
    fireEvent.press(screen.getByTestId("match-mode-on"))
    expect(screen.getByTestId("match-best-of-3").props.accessibilityState.selected).toBe(true)
    fireEvent.press(screen.getByTestId("match-best-of-5"))
    fireEvent.press(screen.getByTestId("start-game-button"))
    expect(onStartLocal.mock.calls[1][2]).toMatchObject({ match: { bestOf: 5 } })

    fireEvent.press(screen.getByTestId("match-mode-off"))
    closeOptions()
    fireEvent.press(screen.getByTestId("game-type-commander"))
    openOptions()
    fireEvent.press(screen.getByTestId("match-mode-on"))
    expect(screen.getByTestId("match-best-of-1").props.accessibilityState.selected).toBe(true)
  })

  it("starts without a clock unless one is chosen, counting down from the minutes left", () => {
    const onStartLocal = jest.fn()
    setup({ onStartLocal })
    fireEvent.press(screen.getByTestId("start-game-button"))
    expect(onStartLocal.mock.calls[0][2].clock).toBeUndefined()

    openOptions()
    fireEvent.press(screen.getByTestId("clock-mode-countdown"))
    fireEvent.press(screen.getByTestId("clock-minutes-decrement"))
    fireEvent.press(screen.getByTestId("start-game-button"))
    expect(onStartLocal.mock.calls[1][2].clock).toEqual({ mode: "countdown", minutes: 49 })

    fireEvent.press(screen.getByTestId("clock-mode-stopwatch"))
    fireEvent.press(screen.getByTestId("start-game-button"))
    expect(onStartLocal.mock.calls[2][2].clock).toEqual({ mode: "stopwatch" })
  })

  it("keeps match mode off the form while a game is running", () => {
    setup({ localGame: runningLocalGame() })
    openOptions()
    expect(screen.getByTestId("player-count-increment")).toBeTruthy()
    expect(screen.queryByTestId("match-mode")).toBeNull()
  })

  it("follows the table for the best of until the player picks one", () => {
    setup()
    openOptions()
    fireEvent.press(screen.getByTestId("match-mode-on"))
    expect(screen.getByTestId("match-best-of-3").props.accessibilityState.selected).toBe(true)
    fireEvent.press(screen.getByTestId("player-count-increment"))
    expect(screen.getByTestId("match-best-of-1").props.accessibilityState.selected).toBe(true)
    fireEvent.press(screen.getByTestId("match-best-of-5"))
    fireEvent.press(screen.getByTestId("player-count-decrement"))
    expect(screen.getByTestId("match-best-of-5").props.accessibilityState.selected).toBe(true)
  })

  it("locks the seat and deck once a match is under way", () => {
    const first = createLocalGame({
      players: [
        { name: "Ada", color: "#FF0000" },
        { name: "Grace", color: "#0000FF" },
      ],
      startingLife: 20,
      system: "mtg",
      format: "modern",
      account: { ownerId: "owner-a", meSeat: 0, deckVersionId: "v1", deckName: "Burn" },
      match: { bestOf: 3 },
    })
    const second = { ...first, match: { ...first.match!, gameNumber: 2, wins: [1, 0] } }
    setup({ initialGame: second, onSavePlayers: jest.fn(), account: { ownerId: "owner-a" } })
    expect(screen.getByLabelText("This is me, Ada")).toBeTruthy()
    fireEvent.press(screen.getByTestId("me-seat"))
    expect(screen.queryByTestId("me-seat-option-1")).toBeNull()
    fireEvent.press(screen.getByTestId("me-deck"))
    expect(screen.queryByTestId("me-deck-option-none")).toBeNull()
  })

  it("keeps Treachery and Join with code on the Connected tab", () => {
    setup({ onJoin: jest.fn() })
    fireEvent.press(screen.getByTestId("game-type-all-formats"))
    expect(screen.queryByTestId("game-type-treachery")).toBeNull()
    expect(screen.queryByTestId("join-with-code-button")).toBeNull()

    setup({ mode: "connected", connected: readyHost, onJoin: jest.fn() })
    expect(screen.getByTestId("game-type-treachery")).toBeEnabled()
    expect(screen.getByTestId("join-with-code-button")).toBeTruthy()
  })

  it("suggests the format picked at onboarding first and selects it", () => {
    setup({
      defaults: { ...DEFAULT_LOCAL_SETTINGS, defaultSystem: "mtg", defaultFormat: "modern" },
    })
    expect(screen.getByTestId("game-type-mtg-modern").props.accessibilityState.selected).toBe(true)
    expect(screen.getByTestId("game-type-all-formats")).toBeTruthy()
  })

  it("opens on the recent setup, and choosing it again starts over from it", () => {
    const host = jest.fn()
    const lobby = {
      playerCount: 5,
      startingLife: 40,
      ruleset: "commander",
      system: "mtg" as const,
      format: "commander",
      variant: "treachery" as const,
      deckRequired: true,
      layout: "auto" as const,
      lifeStep: 1,
    }
    setup({
      mode: "connected",
      connected: { ...readyHost, host },
      recentSetups: [{ savedAt: 1, mode: "connected", lobby }],
    })
    const recent = () => screen.getByTestId("recent-setup")
    expect(recent()).toHaveTextContent("TreacheryMagic · 5 seats✓")
    expect(recent().props.accessibilityState.selected).toBe(true)
    expect(screen.queryByTestId("game-type-treachery")).toBeNull()

    fireEvent.press(screen.getByTestId("game-type-mtg-standard"))
    expect(recent().props.accessibilityState.selected).toBe(false)
    fireEvent.press(recent())
    expect(recent().props.accessibilityState.selected).toBe(true)
    fireEvent.press(screen.getByTestId("host-connected-button"))
    expect(host).toHaveBeenCalledWith(lobby)
  })

  it("keeps an ended game's format selected in the list, not a different recent setup", () => {
    const game = runningLocalGame()
    const props = {
      defaults: DEFAULT_LOCAL_SETTINGS,
      mode: "local" as const,
      onModeChange: jest.fn(),
      onBack: jest.fn(),
      onStartLocal: jest.fn(),
      initialGame: game,
      recentSetups: [
        {
          savedAt: 1,
          mode: "local" as const,
          game: {
            players: [
              { name: "Linus", color: "#B85636" },
              { name: "Ken", color: "#41476E" },
            ],
            startingLife: 20,
            system: "mtg" as const,
            format: "commander",
          },
        },
      ],
    }
    const view = render(themed(<NewGameScreen {...props} localGame={game} />))
    view.rerender(themed(<NewGameScreen {...props} />))

    expect(view.getByTestId("recent-setup").props.accessibilityState.selected).toBe(false)
    expect(view.getByTestId("game-type-commander").props.accessibilityState.selected).toBe(true)
    expect(view.queryByTestId("game-type-mtg-modern")).toBeNull()
    fireEvent.press(view.getByTestId("start-game-button"))
    expect(props.onStartLocal).toHaveBeenCalledWith(
      [expect.objectContaining({ name: "Ada" }), expect.objectContaining({ name: "Grace" })],
      20,
      expect.objectContaining({ format: "commander" }),
    )
  })

  it("leaves the recent setup off a running game's setup", () => {
    setup({
      initialGame: runningLocalGame(),
      localGame: runningLocalGame(),
      recentSetups: [
        {
          savedAt: 1,
          mode: "local",
          game: { players: runningLocalGame().players, startingLife: 20 },
        },
      ],
    })
    expect(screen.queryByTestId("recent-setup")).toBeNull()
  })

  it("summarizes the options and closes their sheet with Done", () => {
    setup({ mode: "connected", connected: readyHost })
    fireEvent.press(screen.getByTestId("game-type-commander"))
    openOptions()
    fireEvent.press(screen.getByTestId("deck-requirement-required"))
    closeOptions()
    expect(screen.queryByTestId("setup-options-dialog")).toBeNull()
    expect(screen.getByText("2 seats · 40 life · Decks required")).toBeTruthy()

    setup()
    openOptions()
    fireEvent.press(screen.getByTestId("match-mode-on"))
    fireEvent.press(screen.getByTestId("clock-mode-countdown"))
    closeOptions()
    expect(screen.getByText("2 players · 20 life · Best of 3 · 50 min clock")).toBeTruthy()
  })
})
