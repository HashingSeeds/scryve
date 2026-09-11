import { router } from "expo-router"

import { goBack } from "./navigation"

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), canGoBack: jest.fn(() => true), replace: jest.fn() },
}))

const mocked = router as unknown as {
  back: jest.Mock
  canGoBack: jest.Mock
  replace: jest.Mock
}

beforeEach(() => {
  jest.clearAllMocks()
  mocked.canGoBack.mockReturnValue(true)
})

it("goes back when there is a route to go back to", () => {
  goBack("/fallback")

  expect(mocked.back).toHaveBeenCalledTimes(1)
  expect(mocked.replace).not.toHaveBeenCalled()
})

it("replaces with the fallback at the navigation root", () => {
  mocked.canGoBack.mockReturnValue(false)

  goBack("/fallback")

  expect(mocked.back).not.toHaveBeenCalled()
  expect(mocked.replace).toHaveBeenCalledWith("/fallback")
})

it("defaults the fallback to home", () => {
  mocked.canGoBack.mockReturnValue(false)

  goBack()

  expect(mocked.replace).toHaveBeenCalledWith("/")
})
