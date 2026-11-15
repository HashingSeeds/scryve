import { render } from "@testing-library/react-native"

import { DeckStatsScreen } from "@/screens/DeckStatsScreen"
import { ThemeProvider } from "@/theme/context"

import { PSEUDO_LOCALE } from "./format"
import { deckStatsAccess, deckStatsParams } from "../../test/fixtures/deckStats"
import { localeProblems } from "../../test/pseudoLocale"

import { i18n } from "."

jest.mock("@/utils/analytics", () => ({ captureAnalytics: jest.fn() }))
jest.mock("@/features/stats/useListCards", () => ({ useListCards: () => ({ cards: new Map() }) }))
jest.mock("expo-router", () => ({ router: { push: jest.fn() }, useFocusEffect: jest.fn() }))
jest.mock("../../convex/_generated/api", () => ({
  api: { deckStats: { summary: "summary", games: "games" }, decks: { capacity: "capacity" } },
}))
jest.mock("convex/react", () => ({
  useQuery: (reference: unknown) =>
    reference === "summary"
      ? jest.requireActual("../../test/fixtures/deckStats").deckStatsSummary
      : { premium: true },
  usePaginatedQuery: () => ({
    results: [
      {
        resultId: "game",
        source: "local",
        outcome: "win",
        finishedAt: 30,
        podSize: 4,
        gamePublicId: "game-public",
        matchPublicId: null,
        opponents: [{ name: "Alex", deckName: "Elves" }],
      },
    ],
    status: "Exhausted",
    loadMore: jest.fn(),
  }),
}))
jest.mock("@/features/billing/RevenueCatContext", () => ({
  useRevenueCat: () => ({ configured: true, isLoading: false, presentPaywall: jest.fn() }),
}))

describe(`deck stats in the ${PSEUDO_LOCALE} pseudo-locale`, () => {
  beforeAll(() => i18n.changeLanguage(PSEUDO_LOCALE))
  afterAll(() => i18n.changeLanguage("en-US"))

  it("formats every number and translates every label", () => {
    const view = render(
      <ThemeProvider initialContext="dark">
        <DeckStatsScreen {...deckStatsParams} access={deckStatsAccess} onBack={jest.fn()} />
      </ThemeProvider>,
    )

    expect(localeProblems(view, ["Burn", "Alex", "Elves"])).toEqual([])
  })
})
