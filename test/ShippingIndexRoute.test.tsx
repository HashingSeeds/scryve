import { act, render } from "@testing-library/react-native"

import { DEFAULT_LOCAL_SETTINGS, localGameRepository } from "@/features/game/localPersistence"
import { ThemeProvider } from "@/theme/context"

import Index from "../src/app/index"

const mockOpenAuth = jest.fn()
const mockFocusEffects: (() => void)[] = []

function refocusAfter(mutate: () => void) {
  act(() => {
    mutate()
    mockFocusEffects[mockFocusEffects.length - 1]?.()
  })
}

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({}),
  useFocusEffect: (effect: () => void) => {
    mockFocusEffects.push(effect)
    require("react").useEffect(effect, [effect])
  },
  Redirect: () => null,
}))
jest.mock("@/features/auth/AuthContext", () => ({
  useAuthAccess: () => ({ isSignedIn: false, openAuth: mockOpenAuth }),
}))

describe("shipping index route", () => {
  beforeEach(() => {
    localGameRepository.clearActiveGame()
    localGameRepository.saveSettings(DEFAULT_LOCAL_SETTINGS)
    mockFocusEffects.length = 0
  })

  it("launches directly into an ephemeral play mat", () => {
    const view = render(
      <ThemeProvider initialContext="light">
        <Index />
      </ThemeProvider>,
    )
    expect(view.getByTestId("game-board")).toBeTruthy()
    expect(localGameRepository.loadActiveGame()).toBeNull()
  })

  it("picks up a launch destination saved while it stayed mounted", () => {
    const view = render(
      <ThemeProvider initialContext="light">
        <Index />
      </ThemeProvider>,
    )
    expect(view.getByTestId("game-board")).toBeTruthy()

    refocusAfter(() =>
      localGameRepository.saveSettings({
        ...DEFAULT_LOCAL_SETTINGS,
        launchDestination: "decks",
      }),
    )

    expect(view.queryByTestId("game-board")).toBeNull()
  })
})
