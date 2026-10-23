import { render } from "@testing-library/react-native"

import HistoryRoute from "@/app/history/index"
import {
  applyGameCommand,
  asDeviceId,
  createLocalGame,
  defaultCommandContext,
} from "@/features/game/domain"
import { localGameRepository } from "@/features/game/localPersistence"
import type { HistoryScreen } from "@/screens/HistoryScreen"
import { storage } from "@/utils/storage"

const mockHistoryProps = jest.fn()
jest.mock("@/features/auth/AuthContext", () => ({
  useAuthAccess: () => ({ configured: true, isSignedIn: true, userId: "owner-a" }),
}))
jest.mock("@/features/async/ConvexQueryBoundary", () => ({
  ConvexQueryBoundary: ({ children }: { children: unknown }) => children,
}))
jest.mock("@/features/connected/ConnectedHistorySource", () => ({
  ConnectedHistorySource: () => null,
}))
jest.mock("@/screens/HistoryScreen", () => ({
  HistoryScreen: (props: Parameters<typeof HistoryScreen>[0]) => {
    mockHistoryProps(props)
    return null
  },
}))
jest.mock("expo-router", () => {
  const { useEffect } = jest.requireActual("react")
  return {
    router: { push: jest.fn() },
    useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
    useLocalSearchParams: () => ({}),
  }
})

const context = defaultCommandContext(asDeviceId("device_test"))

function finishedGame() {
  const game = createLocalGame({
    now: 1,
    startingLife: 20,
    players: [
      { name: "Ada", color: "#000000" },
      { name: "Grace", color: "#111111" },
    ],
  })
  return applyGameCommand(
    game,
    { type: "game.finish", result: { kind: "win", winnerPlayerIds: [game.players[0].id] } },
    { ...context, now: () => 2 },
  )
}

function runningGame() {
  const game = createLocalGame({
    now: 20,
    startingLife: 20,
    players: [
      { name: "Ada", color: "#000000" },
      { name: "Grace", color: "#111111" },
    ],
  })
  return applyGameCommand(
    game,
    { type: "life.change", playerId: game.players[0].id, delta: -1 },
    context,
  )
}

const lastProps = () => mockHistoryProps.mock.lastCall?.[0]

describe("history route", () => {
  beforeEach(() => {
    mockHistoryProps.mockClear()
    storage.clearAll()
    localGameRepository.archiveGame(finishedGame())
  })

  it("offers past games when no game is running", () => {
    render(<HistoryRoute />)
    expect(lastProps().onAddPastGames).toBeInstanceOf(Function)
  })

  it("hides the past games link while a game is running", () => {
    localGameRepository.saveActiveGame(runningGame())
    render(<HistoryRoute />)
    expect(lastProps().onAddPastGames).toBeUndefined()
  })
})
