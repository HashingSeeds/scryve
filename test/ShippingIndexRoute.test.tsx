import { Pressable, StyleSheet } from "react-native"
import { router } from "expo-router"
import { act, fireEvent, render } from "@testing-library/react-native"

import { CHOICE_RADIUS } from "@/components/ChoiceButton"
import {
  applyGameCommand,
  asActorId,
  asDeviceId,
  asOperationId,
  createLocalGame,
  PLAYER_COLORS,
} from "@/features/game/domain"
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

  it.each(["light", "dark"] as const)(
    "styles stale-game prompt actions with the themed choice treatment (%s)",
    (initialContext) => {
      const fresh = createLocalGame({
        players: [
          { name: "Player 1", color: PLAYER_COLORS[0] },
          { name: "Player 2", color: PLAYER_COLORS[1] },
        ],
        startingLife: 20,
      })
      const started = applyGameCommand(
        fresh,
        { type: "life.change", playerId: fresh.players[0].id, delta: -1 },
        {
          actorId: asActorId("local"),
          deviceId: asDeviceId("device"),
          now: () => Date.now(),
          operationId: () => asOperationId("op-1"),
        },
      )
      localGameRepository.saveActiveGame({
        ...started,
        updatedAt: Date.now() - 25 * 60 * 60 * 1000,
      })

      const view = render(
        <ThemeProvider initialContext={initialContext}>
          <Index />
        </ThemeProvider>,
      )
      for (const [label, borderWidth] of [
        ["Continue", undefined],
        ["End game", 2],
        ["Abandon", 2],
      ] as const) {
        let node = view.getByText(label)
        while (node && node.type !== Pressable) node = node.parent as typeof node
        const style =
          typeof node.props.style === "function"
            ? node.props.style({ pressed: false })
            : node.props.style
        const flat = StyleSheet.flatten(style)
        expect(flat.borderRadius).toBe(CHOICE_RADIUS)
        if (borderWidth !== undefined) expect(flat.borderWidth).toBe(borderWidth)
      }
    },
  )
})
