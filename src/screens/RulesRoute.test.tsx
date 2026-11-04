import { Linking } from "react-native"
import { render } from "@testing-library/react-native"

import { GAME_RULES } from "@/features/rules/gameRules"

import RulesRoute from "../app/rules"

const mockRulesScreen = jest.fn((_props: unknown) => null)
const mockBack = jest.fn()

let mockParams: { system?: string } = {}
let mockRulesShown = true

jest.mock("expo-router", () => ({
  router: { back: () => mockBack(), canGoBack: () => true, push: jest.fn(), replace: jest.fn() },
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
})

it("opens a link-only system's page instead of showing Magic rules", () => {
  const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true)
  mockParams = { system: "pokemon" }
  render(<RulesRoute />)
  expect(openURL).toHaveBeenCalledWith(GAME_RULES.pokemon.pageUrl)
  expect(mockRulesScreen).not.toHaveBeenCalled()
  expect(mockBack).toHaveBeenCalledTimes(1)
})

it("shows Magic rules for a missing or unknown system", () => {
  for (const system of [undefined, "chess"]) {
    mockParams = { system }
    render(<RulesRoute />)
    expect(mockRulesScreen).toHaveBeenLastCalledWith(
      expect.objectContaining({ source: GAME_RULES.mtg }),
    )
  }
})

it("links to the official page when the server switches a system's rules off", () => {
  const openURL = jest.spyOn(Linking, "openURL").mockResolvedValue(true)
  mockParams = { system: "mtg" }
  mockRulesShown = false
  render(<RulesRoute />)
  expect(openURL).toHaveBeenCalledWith(GAME_RULES.mtg.pageUrl)
  expect(mockRulesScreen).not.toHaveBeenCalled()
})
