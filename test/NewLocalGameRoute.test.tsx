import { router } from "expo-router"
import { fireEvent, render } from "@testing-library/react-native"

import { createLocalGame } from "@/features/game/domain"
import { localGameRepository } from "@/features/game/localPersistence"
import { ThemeProvider } from "@/theme/context"

import NewLocalGameRoute from "../src/app/game/new"

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({}),
}))

describe("new local game route", () => {
  beforeEach(() => jest.clearAllMocks())
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
    const view = render(
      <ThemeProvider initialContext="light">
        <NewLocalGameRoute />
      </ThemeProvider>,
    )
    expect(view.queryByTestId("start-game-button")).toBeNull()
    fireEvent.press(view.getByTestId("guard-resume-game-button"))
    expect(router.replace).toHaveBeenCalledWith("/game/current")
  })
})
