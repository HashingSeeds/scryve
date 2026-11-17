import { router } from "expo-router"
import { fireEvent, render } from "@testing-library/react-native"

import { createLocalGame } from "@/features/game/domain"
import { localGameRepository } from "@/features/game/localPersistence"
import { ThemeProvider } from "@/theme/context"

import NewLocalGameRoute from "../src/app/game/new"

jest.mock("@/features/auth/AuthContext", () => ({
  useAuthAccess: () => ({ configured: false, isLoaded: true, isSignedIn: false }),
}))
jest.mock("@clerk/expo", () => ({ useUser: () => ({ isLoaded: true, user: null }) }))
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), dismissTo: jest.fn(), push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({}),
  useFocusEffect: (effect: () => void) => {
    jest.requireActual<typeof import("react")>("react").useEffect(effect, [effect])
  },
}))

afterEach(() => localGameRepository.clearActiveGame())

it("replaces a started local game without cloud config", () => {
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

  fireEvent.press(view.getByTestId("start-game-button"))
  fireEvent.press(view.getByTestId("end-game-winner-1"))
  fireEvent.press(view.getByTestId("confirm-end-game-button"))

  expect(localGameRepository.loadActiveGame()?.id).not.toBe(game.id)
  expect(router.dismissTo).toHaveBeenCalled()
})
