import { Linking } from "react-native"
import { act, render } from "@testing-library/react-native"

import { GAME_RULES } from "@/features/rules/gameRules"
import { ThemeProvider } from "@/theme/context"

import RulesRoute from "../app/rules"

function renderRoute() {
  return render(
    <ThemeProvider initialContext="dark">
      <RulesRoute />
    </ThemeProvider>,
  )
}

const mockRulesScreen = jest.fn((_props: unknown) => null)
const mockBack = jest.fn()
const mockPush = jest.fn()

let mockParams: { system?: string; rule?: string } = {}
let mockRulesShown = true

jest.mock("expo-router", () => ({
  router: { back: () => mockBack(), canGoBack: () => true, push: mockPush, replace: jest.fn() },
  useLocalSearchParams: () => mockParams,
  useRoute: () => ({ key: "rules" }),
}))
jest.mock("expo-router/react-navigation", () => ({
  ...jest.requireActual("expo-router/react-navigation"),
  useNavigationState: () => undefined,
}))

jest.mock("@/features/decks/useCapabilityReleased", () => ({
  useCapabilityReleased: () => () => mockRulesShown,
}))

jest.mock("@/screens/RulesScreen", () => ({
  RulesScreen: (props: unknown) => mockRulesScreen(props),
}))

beforeEach(() => {
  mockRulesShown = true
  mockRulesScreen.mockClear()
  mockBack.mockClear()
  mockPush.mockClear()
})

it("opens a link-only system's page instead of showing Magic rules", () => {
  const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true)
  mockParams = { system: "pokemon" }
  renderRoute()
  expect(openURL).toHaveBeenCalledWith(GAME_RULES.pokemon.pageUrl)
  expect(mockRulesScreen).not.toHaveBeenCalled()
  expect(mockBack).toHaveBeenCalledTimes(1)
})

it("shows Magic rules for a missing or unknown system", () => {
  for (const system of [undefined, "chess"]) {
    mockParams = { system }
    renderRoute()
    expect(mockRulesScreen).toHaveBeenLastCalledWith(
      expect.objectContaining({ source: GAME_RULES.mtg }),
    )
  }
})

it("links to the official page when the server switches a system's rules off", () => {
  const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true)
  mockParams = { system: "mtg" }
  mockRulesShown = false
  renderRoute()
  expect(openURL).toHaveBeenCalledWith(GAME_RULES.mtg.pageUrl)
  expect(mockRulesScreen).not.toHaveBeenCalled()
})

it("tracks rule navigation inside the sheet and only shows back for rule history", () => {
  mockParams = { system: "mtg" }
  renderRoute()
  const activeProps = () => {
    for (let i = mockRulesScreen.mock.calls.length - 1; i >= 0; i--) {
      const props = mockRulesScreen.mock.calls[i][0] as {
        active?: boolean
        ruleId?: string
        back?: { label: string; onPress: () => void }
        onOpenRule: (id: string) => void
        onCards?: () => void
      }
      if (props.active) return props
    }
    throw new Error("no active RulesScreen render")
  }

  expect(activeProps().ruleId).toBeUndefined()
  expect(activeProps().back).toBeUndefined()
  expect(activeProps().onCards).toBeUndefined()

  act(() => activeProps().onOpenRule("702.19"))
  expect(mockPush).not.toHaveBeenCalled()
  expect(activeProps().ruleId).toBe("702.19")
  expect(activeProps().back?.label).toBe("Rules")

  act(() => activeProps().onOpenRule("704.5"))
  expect(activeProps().ruleId).toBe("704.5")
  expect(activeProps().back?.label).toBe("702.19")

  act(() => activeProps().back?.onPress())
  expect(activeProps().ruleId).toBe("702.19")
  expect(mockBack).not.toHaveBeenCalled()

  act(() => activeProps().back?.onPress())
  expect(activeProps().ruleId).toBeUndefined()
  expect(activeProps().back).toBeUndefined()
  expect(mockBack).not.toHaveBeenCalled()
})
