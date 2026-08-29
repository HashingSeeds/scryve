import { fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import Index from "../src/app/index"

const mockOpenAuth = jest.fn()

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
}))
jest.mock("@/features/auth/AuthContext", () => ({
  useAuthAccess: () => ({ isSignedIn: false, openAuth: mockOpenAuth }),
}))
jest.mock("@/features/game/localPersistence", () => ({
  localGameRepository: { loadActiveGame: () => null },
}))

describe("shipping index route", () => {
  it("intentionally uses the resume-oriented Home screen as the landing route", () => {
    const view = render(
      <ThemeProvider initialContext="light">
        <Index />
      </ThemeProvider>,
    )
    expect(view.getByText("game:localPlayNote")).toBeTruthy()
    expect(view.queryByTestId("quick-local-game-button")).toBeNull()
    expect(view.queryByText("On this device")).toBeNull()
    expect(view.getByText("game:signUpOrLogIn")).toBeTruthy()
    fireEvent.press(view.getByTestId("new-game-button"))
    expect(jest.requireMock("expo-router").router.push).toHaveBeenCalledWith("/game/new")
    fireEvent.press(view.getByTestId("decks-button"))
    expect(jest.requireMock("expo-router").router.push).toHaveBeenCalledWith("/connected/decks")
  })
})
