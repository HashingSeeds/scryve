import { router } from "expo-router"
import { fireEvent, render } from "@testing-library/react-native"

import { applyGameCommand, createLocalGame, defaultCommandContext } from "@/features/game/domain"
import { gameSetupHref } from "@/features/game/gameSetup"
import { LOCAL_KEYS, localGameRepository } from "@/features/game/localPersistence"
import type { ConnectedSetup, LocalSetup } from "@/features/game/recentSetups"
import { ThemeProvider } from "@/theme/context"
import { storage } from "@/utils/storage"

import StartGameRoute from "../src/app/game/start"

let mockConnectedFeed: Record<string, unknown> = {}
const mockHost = jest.fn()

jest.mock("@/features/auth/AuthContext", () => ({
  useAuthAccess: () => ({ configured: false, isLoaded: true, isSignedIn: false }),
}))
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), dismissTo: jest.fn(), push: jest.fn(), replace: jest.fn() },
  Redirect: ({ href }: { href: string }) =>
    jest
      .requireActual<typeof import("react")>("react")
      .createElement(
        jest.requireActual<typeof import("react-native")>("react-native").Text,
        { testID: "redirect" },
        href,
      ),
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
        () => onChange({ ready: true, busy: false, host: mockHost, ...mockConnectedFeed }),
        [onChange],
      )
      return null
    }),
  }
})

const game: LocalSetup = {
  players: [
    { name: "Ada", color: "#B85636" },
    { name: "Grace", color: "#41476E" },
  ],
  startingLife: 40,
  system: "mtg",
  format: "commander",
}
const lobby: ConnectedSetup = {
  playerCount: 5,
  startingLife: 40,
  ruleset: "commander",
  system: "mtg",
  format: "commander",
  variant: "treachery",
  deckRequired: false,
  layout: "auto",
  lifeStep: 1,
}
const localSetup = { mode: "local" as const, game }
const connectedSetup = { mode: "connected" as const, lobby }

const renderRoute = () =>
  render(
    <ThemeProvider initialContext="dark">
      <StartGameRoute />
    </ThemeProvider>,
  )

describe("Recent setups", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockConnectedFeed = {}
    storage.delete(LOCAL_KEYS.recentSetups)
    localGameRepository.clearActiveGame()
  })

  it("opens setup directly until there is a recent setup, and while a game is running", () => {
    expect(gameSetupHref()).toBe("/game/new")
    expect(renderRoute().getByTestId("redirect").props.children).toBe("/game/new")

    localGameRepository.rememberSetup(localSetup)
    expect(gameSetupHref()).toBe("/game/start")

    const running = createLocalGame(game)
    localGameRepository.saveActiveGame(
      applyGameCommand(
        running,
        { type: "life.change", playerId: running.players[0].id, delta: -1 },
        defaultCommandContext(localGameRepository.getDeviceId()),
      ),
    )
    expect(gameSetupHref()).toBe("/game/new")
  })

  it("replays a local setup on the board and a connected one as a new lobby", () => {
    localGameRepository.rememberSetup(localSetup, 1)
    localGameRepository.rememberSetup(connectedSetup, 2)
    const view = renderRoute()

    expect(view.getByText("Treachery")).toBeTruthy()
    fireEvent.press(view.getByTestId("recent-setup-0"))
    expect(mockHost).toHaveBeenCalledWith(lobby)

    fireEvent.press(view.getByTestId("recent-setup-1"))
    expect(router.dismissTo).toHaveBeenCalledWith({
      pathname: "/",
      params: expect.objectContaining({
        destination: "play",
        prepared: JSON.stringify(game),
      }),
    })
    expect(localGameRepository.loadRecentSetups()[0]).toMatchObject({ mode: "local" })
  })

  it("holds a local replay while a connected game is running", () => {
    mockConnectedFeed = {
      activeGames: [
        {
          publicId: "live",
          status: "active",
          isHost: false,
          playerCount: 2,
          ruleset: "commander",
          updatedAt: 1,
        },
      ],
    }
    localGameRepository.rememberSetup(localSetup)
    const view = renderRoute()

    expect(view.getByText("Finish your connected game first.")).toBeTruthy()
    fireEvent.press(view.getByTestId("recent-setup-0"))
    expect(router.dismissTo).not.toHaveBeenCalled()
  })

  it("leads to a new setup and to Join", () => {
    localGameRepository.rememberSetup(localSetup)
    const view = renderRoute()

    fireEvent.press(view.getByTestId("new-setup-button"))
    fireEvent.press(view.getByTestId("join-with-code-button"))
    expect(router.push).toHaveBeenNthCalledWith(1, "/game/new")
    expect(router.push).toHaveBeenNthCalledWith(2, "/connected/join")
  })
})
