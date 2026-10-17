import { Linking } from "react-native"
import { render } from "@testing-library/react-native"

import { GAME_RULES } from "@/features/rules/gameRules"

import RulesRoute from "../app/rules"

const mockRulesScreen = jest.fn((_props: unknown) => null)
const mockBack = jest.fn()

let mockParams: { system?: string } = {}

jest.mock("expo-router", () => ({
  router: { back: () => mockBack(), canGoBack: () => true, push: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => mockParams,
}))

jest.mock("@/screens/RulesScreen", () => ({
  RulesScreen: (props: unknown) => mockRulesScreen(props),
}))

beforeEach(() => {
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
