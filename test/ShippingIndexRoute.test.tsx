import { Pressable, StyleSheet } from "react-native"
import { router } from "expo-router"
import { act, fireEvent, render } from "@testing-library/react-native"

import { CHOICE_RADIUS } from "@/components/ChoiceButton"
import type { ResumableGame } from "@/features/connected/connectedCopy"
import { ConnectedGameRepository, connectedDeploymentScope } from "@/features/connected/persistence"
import {
  applyGameCommand,
  asActorId,
  asDeviceId,
  asOperationId,
  createLocalGame,
  PLAYER_COLORS,
} from "@/features/game/domain"
import { DEFAULT_LOCAL_SETTINGS, localGameRepository } from "@/features/game/localPersistence"
import { ThemeProvider } from "@/theme/context"
import { darkTheme } from "@/theme/theme"

import Index from "../src/app/index"

const mockOpenAuth = jest.fn()
const mockRedirect = jest.fn()
const mockFocusEffects: (() => void)[] = []
let mockSearchParams: Record<string, string> = {}

function refocusAfter(mutate: () => void) {
  act(() => {
    mutate()
    mockFocusEffects[mockFocusEffects.length - 1]?.()
  })
}

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => mockSearchParams,
  useFocusEffect: (effect: () => void) => {
    mockFocusEffects.push(effect)
    require("react").useEffect(effect, [effect])
  },
  Redirect: (props: unknown) => {
    mockRedirect(props)
    return null
  },
}))
jest.mock("@/features/auth/AuthContext", () => ({
  useAuthAccess: () => ({ isSignedIn: false, openAuth: mockOpenAuth }),
}))

const RESUME_OWNER = "resume-test-user"
const RESUME_PUBLIC_IDS = ["resume-newer", "resume-older", "resume-lobby"] as const

function resumeRepository() {
  return new ConnectedGameRepository(undefined, RESUME_OWNER, {}, connectedDeploymentScope())
}

function seedResume(game: ResumableGame) {
  resumeRepository().syncResumeIndex([game], true)
}

function clearResume() {
  const repository = resumeRepository()
  for (const publicId of RESUME_PUBLIC_IDS) repository.removeResumeEntry(publicId)
}

describe("shipping index route", () => {
  beforeEach(() => {
    localGameRepository.clearActiveGame()
    localGameRepository.saveSettings(DEFAULT_LOCAL_SETTINGS)
    mockFocusEffects.length = 0
    mockSearchParams = {}
    jest.clearAllMocks()
    clearResume()
  })

  afterEach(() => act(clearResume))

  it("launches directly into an ephemeral play mat", () => {
    const view = render(
      <ThemeProvider initialContext="light">
        <Index />
      </ThemeProvider>,
    )
    expect(view.getByTestId("game-board")).toBeTruthy()
    expect(localGameRepository.loadActiveGame()).toBeNull()
  })

  it.each(["Continue", "End game", "Abandon"])(
    "handles %s from the themed stale game page",
    (choice) => {
      const game = createLocalGame({
        players: [
          { name: "Player 1", color: PLAYER_COLORS[0] },
          { name: "Player 2", color: PLAYER_COLORS[1] },
        ],
        startingLife: 20,
      })
      game.players[0].life = 19
      game.updatedAt = Date.now() - 25 * 60 * 60 * 1000
      localGameRepository.saveActiveGame(game)

      const view = render(
        <ThemeProvider initialContext="dark">
          <Index />
        </ThemeProvider>,
      )

      expect(view.getByText("Continue game?")).toBeTruthy()
      expect(view.getByRole("button", { name: "Continue" })).toHaveStyle({
        backgroundColor: darkTheme.colors.tint,
      })
      expect(view.queryByTestId("game-board")).toBeNull()
      fireEvent.press(view.getByRole("button", { name: choice }))
      expect(view.queryByText("Continue game?")).toBeNull()
      expect(view.getByTestId("game-board")).toBeTruthy()
      if (choice === "Abandon") {
        expect(localGameRepository.loadActiveGame()).toBeNull()
      } else {
        expect(localGameRepository.loadActiveGame()?.id).toBe(game.id)
        expect(view.getByText("19")).toBeTruthy()
        if (choice === "End game") expect(view.getByTestId("end-game-dialog")).toBeTruthy()
      }
    },
  )

  it("uses saved system defaults on the immediate play mat", () => {
    localGameRepository.saveSettings({
      ...DEFAULT_LOCAL_SETTINGS,
      defaultSystem: "ygo",
      defaultFormat: "advanced",
      defaultStartingLife: 8000,
    })

    const view = render(
      <ThemeProvider initialContext="dark">
        <Index />
      </ThemeProvider>,
    )

    expect(view.getAllByText("8000")).toHaveLength(2)
  })

  it("picks up a launch destination saved while it stayed mounted", () => {
    const view = render(
      <ThemeProvider initialContext="light">
        <Index />
      </ThemeProvider>,
    )
    expect(view.getByTestId("game-board")).toBeTruthy()

    refocusAfter(() =>
      localGameRepository.saveSettings({
        ...DEFAULT_LOCAL_SETTINGS,
        launchDestination: "decks",
      }),
    )

    expect(view.queryByTestId("game-board")).toBeNull()
  })

  it("opens connected setup from the fresh board", () => {
    const view = render(
      <ThemeProvider initialContext="light">
        <Index />
      </ThemeProvider>,
    )

    fireEvent.press(view.getByTestId("game-menu-button"))
    fireEvent.press(view.getByTestId("connect-button"))
    expect(router.push).toHaveBeenCalledWith("/game/new?mode=connected")
  })

  function seedStartedLocal(updatedAt: number) {
    const fresh = createLocalGame({
      players: [
        { name: "Player 1", color: PLAYER_COLORS[0] },
        { name: "Player 2", color: PLAYER_COLORS[1] },
      ],
      startingLife: 20,
    })
    const started = applyGameCommand(
      fresh,
      { type: "life.change", playerId: fresh.players[0].id, delta: -1 },
      {
        actorId: asActorId("local"),
        deviceId: asDeviceId("device"),
        now: () => Date.now(),
        operationId: () => asOperationId("op-1"),
      },
    )
    localGameRepository.saveActiveGame({ ...started, updatedAt })
  }

  function renderIndex() {
    return render(
      <ThemeProvider initialContext="light">
        <Index />
      </ThemeProvider>,
    )
  }

  it("resumes the connected board when its resume is newer than the local game", () => {
    const now = Date.now()
    seedStartedLocal(now - 60_000)
    seedResume({
      publicId: "resume-newer",
      status: "active",
      isHost: true,
      playerCount: 2,
      ruleset: "standard",
      updatedAt: now,
    })

    const view = renderIndex()

    expect(view.queryByTestId("game-board")).toBeNull()
    expect(mockRedirect).toHaveBeenCalledWith({
      href: {
        pathname: "/connected/game/[gameId]",
        params: { gameId: "resume-newer" },
      },
    })
  })

  it("sends a lobby resume to the lobby instead of the board", () => {
    seedResume({
      publicId: "resume-lobby",
      status: "lobby",
      isHost: false,
      playerCount: 3,
      ruleset: "standard",
      updatedAt: Date.now(),
    })

    renderIndex()

    expect(mockRedirect).toHaveBeenCalledWith({
      href: {
        pathname: "/connected/lobby/[gameId]",
        params: { gameId: "resume-lobby" },
      },
    })
  })

  it("keeps the local game when it is newer than the connected resume", () => {
    const now = Date.now()
    seedStartedLocal(now)
    seedResume({
      publicId: "resume-older",
      status: "active",
      isHost: true,
      playerCount: 2,
      ruleset: "standard",
      updatedAt: now - 60_000,
    })

    const view = renderIndex()

    expect(mockRedirect).not.toHaveBeenCalled()
    expect(view.getByTestId("game-board")).toBeTruthy()
  })

  it("redirects when a newer connected resume lands while play is open", () => {
    const now = Date.now()
    seedStartedLocal(now)
    const view = renderIndex()
    expect(view.getByTestId("game-board")).toBeTruthy()
    expect(mockRedirect).not.toHaveBeenCalled()

    act(() => {
      seedResume({
        publicId: "resume-newer",
        status: "active",
        isHost: true,
        playerCount: 2,
        ruleset: "standard",
        updatedAt: now + 60_000,
      })
    })

    expect(mockRedirect).toHaveBeenCalledWith({
      href: {
        pathname: "/connected/game/[gameId]",
        params: { gameId: "resume-newer" },
      },
    })
  })

  it("never redirects explicit play intent", () => {
    mockSearchParams = { destination: "play" }
    seedResume({
      publicId: "resume-newer",
      status: "active",
      isHost: true,
      playerCount: 2,
      ruleset: "standard",
      updatedAt: Date.now(),
    })

    const view = renderIndex()

    expect(mockRedirect).not.toHaveBeenCalled()
    expect(view.getByTestId("game-board")).toBeTruthy()
  })

  it.each(["light", "dark"] as const)(
    "styles stale-game prompt actions with the themed choice treatment (%s)",
    (initialContext) => {
      const fresh = createLocalGame({
        players: [
          { name: "Player 1", color: PLAYER_COLORS[0] },
          { name: "Player 2", color: PLAYER_COLORS[1] },
        ],
        startingLife: 20,
      })
      const started = applyGameCommand(
        fresh,
        { type: "life.change", playerId: fresh.players[0].id, delta: -1 },
        {
          actorId: asActorId("local"),
          deviceId: asDeviceId("device"),
          now: () => Date.now(),
          operationId: () => asOperationId("op-1"),
        },
      )
      localGameRepository.saveActiveGame({
        ...started,
        updatedAt: Date.now() - 25 * 60 * 60 * 1000,
      })

      const view = render(
        <ThemeProvider initialContext={initialContext}>
          <Index />
        </ThemeProvider>,
      )
      for (const [label, borderWidth] of [
        ["Continue", undefined],
        ["End game", 2],
        ["Abandon", 2],
      ] as const) {
        let node = view.getByText(label)
        while (node && node.type !== Pressable) node = node.parent as typeof node
        const style =
          typeof node.props.style === "function"
            ? node.props.style({ pressed: false })
            : node.props.style
        const flat = StyleSheet.flatten(style)
        expect(flat.borderRadius).toBe(CHOICE_RADIUS)
        if (borderWidth !== undefined) expect(flat.borderWidth).toBe(borderWidth)
      }
    },
  )
})
