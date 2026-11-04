import { router } from "expo-router"
import { renderHook } from "@testing-library/react-native"

import { useBackToBoard } from "./useBackToBoard"

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), canGoBack: jest.fn(() => true), replace: jest.fn() },
}))

it("goes back, or to Play when nothing is under it", () => {
  const back = renderHook(() => useBackToBoard()).result.current
  back.onPress()
  expect(router.back).toHaveBeenCalledTimes(1)
  jest.mocked(router.canGoBack).mockReturnValueOnce(false)
  back.onPress()
  expect(router.replace).toHaveBeenCalledWith({ pathname: "/", params: { destination: "play" } })
})
