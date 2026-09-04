import { router } from "expo-router"
import { act, fireEvent, render } from "@testing-library/react-native"

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

  it("uses saved system defaults on the immediate play mat", () => {
    localGameRepository.saveSettings({
      ...DEFAULT_LOCAL_SETTINGS,
      defaultSystem: "ygo",
      defaultFormat: "advanced",
      defaultStartingLife: 8000,
    })

    const view = render(
      <ThemeProvider initialContext="dark">
        <Index />
      </ThemeProvider>,
    )

    expect(view.getAllByText("8000")).toHaveLength(2)
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

  it("opens connected setup from the fresh board", () => {
    const view = render(
      <ThemeProvider initialContext="light">
        <Index />
      </ThemeProvider>,
    )

    fireEvent.press(view.getByTestId("game-menu-button"))
    fireEvent.press(view.getByTestId("connect-button"))
    expect(router.push).toHaveBeenCalledWith("/game/new?mode=connected")
  })
})
