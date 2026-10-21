import { act, fireEvent, render, within } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { DeckStatsScreen } from "./DeckStatsScreen"
import { deckStatsAccess, deckStatsParams, deckStatsSummary } from "../../test/fixtures/deckStats"

const mockPush = jest.fn()
const mockLoadMore = jest.fn()
const mockPaywall = jest.fn(async () => undefined)
const mockPagination = jest.fn()
let mockPremium = true
let mockSummary: typeof deckStatsSummary | undefined = deckStatsSummary
let mockError = false
jest.mock("expo-router", () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }))
jest.mock("../../convex/_generated/api", () => ({
  api: { deckStats: { summary: "summary", games: "games" }, decks: { capacity: "capacity" } },
}))
jest.mock("convex/react", () => ({
  useQuery: (reference: unknown, args: unknown) => {
    if (args === "skip") return undefined
    if (mockError) throw new Error("offline")
    return reference === "summary" ? mockSummary : { premium: mockPremium }
  },
  usePaginatedQuery: (...args: unknown[]) => {
    mockPagination(...args)
    return {
      results: [
        {
          resultId: "game",
          outcome: "win",
          finishedAt: 30,
          podSize: 4,
          gamePublicId: "game-public",
          matchPublicId: null,
          opponents: [{ name: "Alex", deckName: "Elves" }],
        },
        {
          resultId: "match",
          outcome: "loss",
          finishedAt: 20,
          podSize: 2,
          gamePublicId: null,
          matchPublicId: "match-public",
          opponents: [],
        },
        {
          resultId: "missing",
          outcome: "draw",
          finishedAt: 10,
          podSize: null,
          gamePublicId: null,
          matchPublicId: null,
          opponents: [],
        },
      ],
      status: "CanLoadMore",
      loadMore: mockLoadMore,
    }
  },
}))
jest.mock("@/features/billing/RevenueCatContext", () => ({
  useRevenueCat: () => ({ configured: true, isLoading: false, presentPaywall: mockPaywall }),
}))
const screen = (access = deckStatsAccess) => (
  <ThemeProvider initialContext="dark">
    <DeckStatsScreen {...deckStatsParams} access={access} onBack={jest.fn()} />
  </ThemeProvider>
)
afterEach(() => {
  act(() => jest.runOnlyPendingTimers())
  jest.useRealTimers()
})
beforeEach(() => {
  jest.useFakeTimers()
  jest.clearAllMocks()
  mockSummary = deckStatsSummary
  mockPremium = true
  mockError = false
})

it("uses exact totals, shows bounded breakdowns, and filters paginated list games", () => {
  const view = render(screen())
  expect(view.getByTestId("stats-headline")).toHaveTextContent("60%")
  expect(view.getByText("Breakdowns cover the latest 1,000 results.")).toBeTruthy()
  expect(within(view.getByTestId("stats-list-current")).getByText("4-4")).toBeTruthy()
  expect(view.getAllByText("too few").length).toBeGreaterThan(0)
  fireEvent.press(view.getByTestId("stats-list-current"))
  expect(mockPagination).toHaveBeenLastCalledWith(
    "games",
    { deckKey: "key", source: "scryve", fingerprint: "current" },
    { initialNumItems: 20 },
  )
  fireEvent.press(view.getByTestId("stats-source-manual"))
  expect(view.getByTestId("stats-headline")).toHaveTextContent("3-2")
  expect(view.getByText("Matches 3-2-0")).toBeTruthy()
  expect(mockPagination).toHaveBeenLastCalledWith(
    "games",
    { deckKey: "key", source: "manual" },
    { initialNumItems: 20 },
  )
  fireEvent.press(view.getByTestId("stats-source-all"))
  expect(view.getByText("Source")).toBeTruthy()
  expect(mockPagination).toHaveBeenLastCalledWith(
    "games",
    { deckKey: "key" },
    { initialNumItems: 20 },
  )
  fireEvent.press(view.getByTestId("stats-list-untracked"))
  expect(mockPagination).toHaveBeenLastCalledWith(
    "games",
    { deckKey: "key", fingerprint: null },
    { initialNumItems: 20 },
  )
})

it("opens game and match history, disables missing history, and loads another page", () => {
  const view = render(screen())
  expect(view.getByText("Alex · Elves")).toBeTruthy()
  expect(view.getAllByText("Opponents not tracked")).toHaveLength(2)
  fireEvent.press(view.getByTestId("stats-game-game"))
  expect(mockPush).toHaveBeenLastCalledWith({
    pathname: "/history/[gameId]",
    params: { gameId: "game-public", source: "connected" },
  })
  fireEvent.press(view.getByTestId("stats-game-match"))
  expect(mockPush).toHaveBeenLastCalledWith({
    pathname: "/history/match/[publicId]",
    params: { publicId: "match-public" },
  })
  expect(view.getByTestId("stats-game-missing")).toBeDisabled()
  fireEvent.press(view.getByTestId("stats-more-games"))
  expect(mockLoadMore).toHaveBeenCalledWith(20)
})

it("opens Compare for Pro and prompts other players", () => {
  const view = render(screen())
  fireEvent.press(view.getByTestId("stats-compare"))
  expect(mockPush).toHaveBeenCalledWith({
    pathname: "/connected/decks/compare",
    params: { ...deckStatsParams, source: "scryve" },
  })
  mockPremium = false
  view.rerender(screen())
  mockPush.mockClear()
  fireEvent.press(view.getByTestId("stats-compare"))
  expect(view.getByText("Compare lists with Scryve Pro.")).toBeTruthy()
  expect(view.getByText("See Pro")).toBeTruthy()
  expect(mockPush).not.toHaveBeenCalled()
})

it("handles loading, empty, and disconnected states without inventing rates", () => {
  mockSummary = undefined
  const view = render(screen())
  expect(view.getByText("Loading stats…")).toBeTruthy()
  mockSummary = { all: null, lists: [], slices: [], scannedAll: true }
  view.rerender(screen())
  expect(view.getByTestId("stats-headline")).toHaveTextContent("0-0")
  expect(view.queryByText(/Chance/)).toBeNull()
  view.rerender(screen({ ...deckStatsAccess, ready: false }))
  expect(view.getByText("Reconnect to load your decks.")).toBeTruthy()
  expect(mockPagination).toHaveBeenLastCalledWith("games", "skip", { initialNumItems: 20 })
})

it("offers retry when stats fail", () => {
  const error = jest.spyOn(console, "error").mockImplementation(() => undefined)
  mockError = true
  const view = render(screen())
  expect(view.getByText("Stats unavailable.")).toBeTruthy()
  mockError = false
  fireEvent.press(view.getByText("Retry"))
  expect(view.getByTestId("stats-headline")).toHaveTextContent("60%")
  error.mockRestore()
})
