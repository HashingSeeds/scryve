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
let mockEmptyGames = false
let mockGamesStatus = "CanLoadMore"
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
      results: mockEmptyGames
        ? []
        : [
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
      status: mockGamesStatus,
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
  mockEmptyGames = false
  mockGamesStatus = "CanLoadMore"
})

it("uses exact totals, shows bounded breakdowns, and filters paginated list games", () => {
  const view = render(screen())
  expect(view.getByTestId("stats-headline")).toHaveTextContent("60%")
  expect(view.getByText("Breakdowns cover the latest 200 results.")).toBeTruthy()
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

it("names the most common pod size and compares its own rate against chance", () => {
  const view = render(screen())
  expect(view.getByText("67% in 2-player games · chance 50%")).toBeTruthy()
  expect(view.queryByText(/chance 40%/)).toBeNull()
  mockSummary = {
    ...deckStatsSummary,
    slices: deckStatsSummary.slices.map((slice) =>
      slice.podSize === 4 ? { ...slice, games: 20, wins: 10, losses: 10 } : slice,
    ),
  }
  view.rerender(screen())
  expect(view.getByText("50% in 4-player games · chance 25%")).toBeTruthy()
  fireEvent.press(view.getByTestId("stats-source-manual"))
  expect(view.queryByText(/chance/)).toBeNull()
})

it.each(["CanLoadMore", "LoadingMore", "LoadingFirstPage", "Exhausted"])(
  "only shows no results once filtered pagination is exhausted, not %s",
  (status) => {
    mockEmptyGames = true
    mockGamesStatus = status
    const view = render(screen())
    fireEvent.press(view.getByTestId("stats-list-current"))
    if (status === "Exhausted") expect(view.getByText("No results yet")).toBeTruthy()
    else expect(view.queryByText("No results yet")).toBeNull()
    if (status === "LoadingFirstPage") expect(view.getByText("Loading stats…")).toBeTruthy()
    if (status === "CanLoadMore" || status === "LoadingMore")
      expect(view.getByTestId("stats-more-games")).toBeTruthy()
  },
)

it("opens game and match history, disables missing history, and loads another page", () => {
  const view = render(screen())
  expect(view.getByText("Alex · Elves")).toBeTruthy()
  expect(view.getAllByText("Opponents not tracked")).toHaveLength(2)
  fireEvent.press(view.getByTestId("stats-game-game"))
  expect(mockPush).toHaveBeenLastCalledWith({
    pathname: "/history/[gameId]",
    params: { gameId: "game-public" },
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
