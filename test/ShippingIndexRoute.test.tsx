import { render } from "@testing-library/react-native"

import { localGameRepository } from "@/features/game/localPersistence"
import { ThemeProvider } from "@/theme/context"

import Index from "../src/app/index"

const mockOpenAuth = jest.fn()

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({}),
  Redirect: () => null,
}))
jest.mock("@/features/auth/AuthContext", () => ({
  useAuthAccess: () => ({ isSignedIn: false, openAuth: mockOpenAuth }),
}))

describe("shipping index route", () => {
  beforeEach(() => localGameRepository.clearActiveGame())

  it("launches directly into an ephemeral play mat", () => {
    const view = render(
      <ThemeProvider initialContext="light">
        <Index />
      </ThemeProvider>,
    )
    expect(view.getByTestId("game-board")).toBeTruthy()
    expect(localGameRepository.loadActiveGame()).toBeNull()
  })
})
