import { router } from "expo-router"
import { fireEvent, render } from "@testing-library/react-native"

import { Header } from "@/components/Header"
import type { ResumableGame } from "@/features/connected/connectedCopy"
import { createLocalGame } from "@/features/game/domain"
import { localGameRepository } from "@/features/game/localPersistence"
import { ThemeProvider } from "@/theme/context"

import NewLocalGameRoute from "../src/app/game/new"

let mockSearchParams: { mode?: string; setup?: string } = {}
let mockConnectedFeed: Record<string, unknown> = {}
let mockLocalConnectFeed: Record<string, unknown> = {}
let mockNewestResumeGame: ResumableGame | null = null
const mockPublish = jest.fn()
let publishedReporter: ((published: { publicId: string; manualCode: string }) => void) | undefined

jest.mock("@/features/connected/persistence", () => {
  const actual = jest.requireActual<typeof import("@/features/connected/persistence")>(
    "@/features/connected/persistence",
  )
  return { ...actual, loadNewestResumeGame: () => mockNewestResumeGame }
})

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => mockSearchParams,
  useFocusEffect: (effect: () => void) => {
    jest.requireActual<typeof import("react")>("react").useEffect(effect, [effect])
  },
}))
jest.mock("@/features/connected/ConnectedSetupSource", () => {
  const { memo, useEffect } = jest.requireActual<typeof import("react")>("react")
  return {
    ConnectedSetupSource: memo(function MockSource({
      onChange,
    }: {
      onChange: (feed: object) => void
    }) {
      useEffect(
        () => onChange({ ready: true, busy: false, host: jest.fn(), ...mockConnectedFeed }),
        [onChange],
      )
      return null
    }),
  }
})

// The feed is memoized like the real source: a fresh object per render would loop the
// effect the route reports it through.
jest.mock("@/features/connected/LocalGamePublishSource", () => {
  const { memo, useMemo } = jest.requireActual<typeof import("react")>("react")
  return {
    LocalGamePublishSource: memo(function MockPublishSource({
      onPublished,
      children,
    }: {
      onPublished: (published: { publicId: string; manualCode: string }) => void
      children: (feed: object) => import("react").ReactNode
    }) {
      publishedReporter = onPublished
      const feed = useMemo(
        () => ({ busy: false, publish: mockPublish, ...mockLocalConnectFeed }),
        [],
      )
      return children(feed)
    }),
  }
})

jest.mock("@/features/auth/CloudScreen", () => ({
  CloudScreen: ({ children }: { children: (access: object) => import("react").ReactNode }) =>
    children({ ready: true, loading: false, request: jest.fn() }),
}))
jest.mock("@/screens/JoinConnectedScreen", () => ({
  JoinConnectedScreen: () =>
    jest
      .requireActual<typeof import("react")>("react")
      .createElement(
        jest.requireActual<typeof import("react-native")>("react-native").Text,
        { testID: "inline-join" },
        "Join with code",
      ),
}))

describe("new local game route", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSearchParams = {}
    mockConnectedFeed = {}
    mockLocalConnectFeed = {}
    mockNewestResumeGame = null
    publishedReporter = undefined
  })
  afterEach(() => localGameRepository.clearActiveGame())

  it("connects setup to persisted current-game navigation", () => {
    const view = render(
      <ThemeProvider initialContext="light">
        <NewLocalGameRoute />
      </ThemeProvider>,
    )
    fireEvent.press(view.getByTestId("start-game-button"))
    expect(localGameRepository.loadActiveGame()).toBeNull()
    expect(router.replace).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: "/",
        params: expect.objectContaining({ destination: "play" }),
      }),
    )
  })

  it("returns from Connected to setup for an untouched saved board", () => {
    const game = createLocalGame({
      startingLife: 40,
      players: [
        { name: "One", color: "#000" },
        { name: "Two", color: "#111" },
      ],
    })
    localGameRepository.saveActiveGame(game)
    mockSearchParams = { setup: "1" }
    const renderRoute = () => (
      <ThemeProvider initialContext="dark">
        <NewLocalGameRoute />
      </ThemeProvider>
    )
    const view = render(renderRoute())
    fireEvent.press(view.getByTestId("mode-connected"))
    mockSearchParams = { mode: "connected" }
    view.rerender(renderRoute())
    fireEvent.press(view.getByTestId("mode-local"))
    mockSearchParams = {}
    view.rerender(renderRoute())
    expect(view.queryByTestId("guard-resume-game-button")).toBeNull()
    expect(view.getByLabelText("Life, 40")).toBeTruthy()
    fireEvent.press(view.getByTestId("start-game-button"))
    expect(view.queryByText("Reset this game?")).toBeNull()
    expect(localGameRepository.loadActiveGame()).toBeNull()
  })

  it("does not replace an existing active game", () => {
    localGameRepository.saveActiveGame(
      createLocalGame({
        startingLife: 20,
        players: [
          { name: "One", color: "#000" },
          { name: "Two", color: "#111" },
        ],
      }),
    )
    const active = localGameRepository.loadActiveGame()!
    active.players[0].life -= 1
    localGameRepository.saveActiveGame(active)
    const view = render(
      <ThemeProvider initialContext="light">
        <NewLocalGameRoute />
      </ThemeProvider>,
    )
    expect(view.getByText("End current game…")).toBeTruthy()
    fireEvent.press(view.getByTestId("setup-status"))
    expect(router.replace).toHaveBeenCalledWith("/game/current")
  })

  it("ends the current game inside setup and preserves the new draft", () => {
    const game = createLocalGame({
      startingLife: 20,
      players: [
        { name: "One", color: "#000" },
        { name: "Two", color: "#111" },
      ],
    })
    game.players[0].life = 19
    localGameRepository.saveActiveGame(game)
    const view = render(
      <ThemeProvider initialContext="dark">
        <NewLocalGameRoute />
      </ThemeProvider>,
    )
    fireEvent.changeText(view.getByTestId("player-name-1"), "Alex")
    fireEvent.press(view.getByTestId("starting-counter-increment"))
    fireEvent.press(view.getByTestId("mode-connected"))
    fireEvent.press(view.getByTestId("mode-local"))
    expect(view.getByTestId("player-name-1").props.value).toBe("Alex")
    expect(view.getByLabelText("Life, 21")).toBeTruthy()
    fireEvent.press(view.getByTestId("start-game-button"))
    fireEvent.press(view.getByTestId("end-game-backdrop"))
    expect(localGameRepository.loadActiveGame()?.id).toBe(game.id)
    fireEvent.press(view.getByTestId("start-game-button"))
    fireEvent.press(view.getByTestId("end-game-winner-1"))
    fireEvent.press(view.getByTestId("confirm-end-game-button"))
    expect(localGameRepository.loadActiveGame()).toBeNull()
    expect(localGameRepository.loadHistoryDetail(game.id)?.game.result).toEqual({
      kind: "win",
      winnerPlayerIds: [game.players.find((player) => player.seat === 1)!.id],
    })
    expect(view.queryByTestId("end-game-dialog")).toBeNull()
    expect(view.getByTestId("player-name-1").props.value).toBe("Alex")
    expect(view.getByTestId("start-game-button")).toBeEnabled()
    expect(router.replace).not.toHaveBeenCalled()
    fireEvent.press(view.getByTestId("start-game-button"))
    expect(router.replace).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({ prepared: expect.stringContaining('"startingLife":21') }),
      }),
    )
  })

  it("keeps the current game and confirmation when saving its result fails", () => {
    const game = createLocalGame({
      startingLife: 20,
      players: [
        { name: "One", color: "#000" },
        { name: "Two", color: "#111" },
      ],
    })
    game.players[0].life = 19
    localGameRepository.saveActiveGame(game)
    const archive = jest.spyOn(localGameRepository, "archiveGame").mockImplementationOnce(() => {
      throw new Error("Could not save result")
    })
    const view = render(
      <ThemeProvider initialContext="dark">
        <NewLocalGameRoute />
      </ThemeProvider>,
    )
    fireEvent.press(view.getByTestId("start-game-button"))
    fireEvent.press(view.getByTestId("end-game-result-draw"))
    fireEvent.press(view.getByTestId("confirm-end-game-button"))
    expect(view.getByText("Could not save result")).toBeTruthy()
    expect(localGameRepository.loadActiveGame()?.id).toBe(game.id)
    expect(view.getByTestId("end-game-dialog")).toBeTruthy()
    archive.mockRestore()
    fireEvent.press(view.getByTestId("abandon-game-button"))
    expect(localGameRepository.loadActiveGame()).toBeNull()
    expect(localGameRepository.loadHistoryDetail(game.id)).toBeNull()
    expect(view.getByTestId("start-game-button")).toBeEnabled()
  })

  it("saves player identity without resetting the active game", () => {
    const game = createLocalGame({
      startingLife: 40,
      players: [
        { name: "One", color: "#000" },
        { name: "Two", color: "#111" },
      ],
    })
    game.players[0].life = 17
    localGameRepository.saveActiveGame(game)
    mockSearchParams = { setup: "1" }
    const view = render(
      <ThemeProvider initialContext="dark">
        <NewLocalGameRoute />
      </ThemeProvider>,
    )
    fireEvent.changeText(view.getByTestId("player-name-1"), "Alex")
    fireEvent(view.getByTestId("player-name-1"), "blur")
    expect(localGameRepository.loadActiveGame()).toMatchObject({
      id: game.id,
      startingLife: 40,
      players: [
        { id: game.players[0].id, name: "Alex", life: 17 },
        { id: game.players[1].id, name: "Two", life: 40 },
      ],
    })
    expect(router.replace).not.toHaveBeenCalled()
  })

  it("uses the shared setup route for connected games", () => {
    mockSearchParams = { mode: "connected" }
    mockConnectedFeed = {
      activeGames: [
        {
          publicId: "active-game",
          status: "active",
          isHost: false,
          playerCount: 2,
          ruleset: "commander",
          updatedAt: Date.now(),
        },
      ],
    }
    const view = render(
      <ThemeProvider initialContext="light">
        <NewLocalGameRoute />
      </ThemeProvider>,
    )

    expect(view.getByTestId("host-connected-button")).toBeTruthy()
    fireEvent.press(view.getByTestId("connected-action-join"))
    expect(router.push).not.toHaveBeenCalled()
    expect(view.getByTestId("inline-join")).toBeTruthy()
    fireEvent.press(view.getByTestId("connected-action-host"))
    fireEvent.press(view.getByTestId("setup-status"))
    fireEvent.press(view.getByTestId("resume-connected-active-game"))
    expect(router.replace).toHaveBeenCalledWith({
      pathname: "/connected/game/[gameId]",
      params: { gameId: "active-game" },
    })
    fireEvent.press(view.getByTestId("mode-local"))
    expect(view.getByTestId("start-game-button")).toBeTruthy()
  })

  it("surfaces a hosted live game while setting up locally", () => {
    mockConnectedFeed = {
      activeGames: [
        {
          publicId: "hosted-live",
          status: "active",
          isHost: true,
          playerCount: 2,
          ruleset: "commander",
          updatedAt: Date.now(),
        },
      ],
    }
    const view = render(
      <ThemeProvider initialContext="light">
        <NewLocalGameRoute />
      </ThemeProvider>,
    )
    fireEvent.press(view.getByTestId("resume-hosted-connected-button"))
    expect(router.replace).toHaveBeenCalledWith({
      pathname: "/connected/game/[gameId]",
      params: { gameId: "hosted-live" },
    })
  })

  it("publishes the running local game under the chosen seat, then hands it to the server", () => {
    const game = createLocalGame({
      startingLife: 40,
      players: [
        { name: "One", color: "#000" },
        { name: "Two", color: "#111" },
      ],
    })
    game.players[0].life = 38
    localGameRepository.saveActiveGame(game)
    const view = render(
      <ThemeProvider initialContext="dark">
        <NewLocalGameRoute />
      </ThemeProvider>,
    )

    fireEvent.press(view.getByTestId("connect-local-button"))
    fireEvent.press(view.getByTestId("host-seat-2"))
    expect(mockPublish).toHaveBeenCalledWith(game.players[1].id)

    publishedReporter?.({ publicId: "published-public-id", manualCode: "AB12CD" })
    // The server owns the game once it is published, so the local copy must not linger.
    expect(localGameRepository.loadActiveGame()).toBeNull()
    expect(router.replace).toHaveBeenCalledWith({
      pathname: "/connected/game/[gameId]",
      params: { gameId: "published-public-id", invite: "1" },
    })
  })

  it("sends setup Back to the running local game instead of leaving it behind", () => {
    const game = createLocalGame({
      startingLife: 20,
      players: [
        { name: "One", color: "#000" },
        { name: "Two", color: "#111" },
      ],
    })
    game.players[0].life = 19
    localGameRepository.saveActiveGame(game)
    const view = render(
      <ThemeProvider initialContext="light">
        <NewLocalGameRoute />
      </ThemeProvider>,
    )
    view.UNSAFE_getByType(Header).props.onLeftPress()
    expect(router.replace).toHaveBeenCalledWith("/game/current")
    expect(router.back).not.toHaveBeenCalled()
  })

  it("sends setup Back to a newer connected game before the local one", () => {
    const game = createLocalGame({
      startingLife: 20,
      players: [
        { name: "One", color: "#000" },
        { name: "Two", color: "#111" },
      ],
    })
    game.players[0].life = 19
    localGameRepository.saveActiveGame(game)
    mockNewestResumeGame = {
      publicId: "resume-live",
      status: "active",
      isHost: true,
      playerCount: 2,
      ruleset: "commander",
      updatedAt: Date.now() + 60_000,
    }
    const view = render(
      <ThemeProvider initialContext="light">
        <NewLocalGameRoute />
      </ThemeProvider>,
    )
    view.UNSAFE_getByType(Header).props.onLeftPress()
    expect(router.replace).toHaveBeenCalledWith({
      pathname: "/connected/game/[gameId]",
      params: { gameId: "resume-live" },
    })
    expect(router.back).not.toHaveBeenCalled()
  })

  it("sends setup Back out when no game is running", () => {
    const view = render(
      <ThemeProvider initialContext="light">
        <NewLocalGameRoute />
      </ThemeProvider>,
    )
    view.UNSAFE_getByType(Header).props.onLeftPress()
    expect(router.back).toHaveBeenCalledTimes(1)
    expect(router.replace).not.toHaveBeenCalled()
  })
})
