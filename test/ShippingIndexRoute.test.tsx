import { fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import en from "../app/i18n/en"
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
    expect(view.getByText("localGame:localPlayNote")).toBeTruthy()
    expect(en.localGame.localPlayNote).toBe(
      "Local play stays available without an account or network.",
    )
    expect(view.queryByTestId("quick-local-game-button")).toBeNull()
    expect(view.queryByText("On this device")).toBeNull()
    expect(view.getByText("localGame:signUpOrLogIn")).toBeTruthy()
    expect(en.localGame.signUpOrLogIn).toBe("Sign up / log in")
    expect(en.localGame.account).toBe("Account")
    fireEvent.press(view.getByTestId("new-game-button"))
    expect(jest.requireMock("expo-router").router.push).toHaveBeenCalledWith("/game/new")
  })
})
