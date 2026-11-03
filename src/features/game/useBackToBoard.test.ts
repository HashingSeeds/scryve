import { router } from "expo-router"
import { renderHook } from "@testing-library/react-native"

import { createLocalGame } from "./domain"
import { localGameRepository } from "./localPersistence"
import { useBackToBoard } from "./useBackToBoard"

let mockRoutes: { key: string; name: string }[] = []

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), canGoBack: jest.fn(() => true), replace: jest.fn() },
  useNavigation: () => ({ getState: () => ({ routes: mockRoutes }) }),
  useRoute: () => ({ key: "here" }),
}))

function labelOver(below?: string) {
  mockRoutes = [...(below ? [{ key: "below", name: below }] : []), { key: "here", name: "rules" }]
  return renderHook(() => useBackToBoard()).result.current.label
}

beforeEach(() => localGameRepository.clearActiveGame())

it("names the screen under this one", () => {
  expect(labelOver("connected/game/[gameId]")).toBe("Game")
  expect(labelOver("connected/lobby/[gameId]")).toBe("Lobby")
  expect(labelOver("rules")).toBe("Rules")
  expect(labelOver("history/index")).toBe("Back")
})

it("calls the board Game only while a local game is running", () => {
  expect(labelOver("index")).toBe("Play")
  expect(labelOver()).toBe("Play")
  localGameRepository.saveActiveGame(
    createLocalGame({
      startingLife: 20,
      players: [
        { name: "One", color: "#000" },
        { name: "Two", color: "#111" },
      ],
    }),
  )
  expect(labelOver("index")).toBe("Game")
})

it("goes back, or to Play when nothing is under it", () => {
  mockRoutes = [{ key: "here", name: "rules" }]
  const back = renderHook(() => useBackToBoard()).result.current
  back.onPress()
  expect(router.back).toHaveBeenCalledTimes(1)
  jest.mocked(router.canGoBack).mockReturnValueOnce(false)
  back.onPress()
  expect(router.replace).toHaveBeenCalledWith({ pathname: "/", params: { destination: "play" } })
})
