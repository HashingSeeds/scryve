import { act, fireEvent, render, within } from "@testing-library/react-native"

import type { CloudAccess } from "@/features/auth/CloudScreen"
import { ThemeProvider } from "@/theme/context"
import { captureAnalytics } from "@/utils/analytics"

import { DeckStatsScreen } from "./DeckStatsScreen"
import { deckStatsAccess, deckStatsParams, deckStatsSummary } from "../../test/fixtures/deckStats"

let mockFocused = true
jest.mock("@/utils/analytics", () => ({ captureAnalytics: jest.fn() }))

const mockPush = jest.fn()
const mockLoadMore = jest.fn()
const mockPaywall = jest.fn(async () => undefined)
const mockPagination = jest.fn()
let mockListCards: {
  currentFingerprint?: string
  cards: Map<string, { name: string; quantity: number }[]>
} = { cards: new Map() }
jest.mock("@/features/stats/useListCards", () => ({ useListCards: () => mockListCards }))
let mockPremium = true
let mockSummary: typeof deckStatsSummary | undefined = deckStatsSummary
let mockError = false
let mockEmptyGames = false
let mockGamesStatus = "CanLoadMore"
jest.mock("expo-router", () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
  useFocusEffect: (callback: () => void) =>
    require("react").useEffect(() => {
      if (mockFocused) return callback()
    }, [callback, mockFocused]),
}))
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
const screen = (access: CloudAccess = deckStatsAccess) => (
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
  mockFocused = true
  mockSummary = deckStatsSummary
  mockPremium = true
  mockError = false
  mockEmptyGames = false
  mockGamesStatus = "CanLoadMore"
  mockListCards = { cards: new Map() }
})

it("shows one record with games and manual results together, and filters paginated games", () => {
  const view = render(screen())
  expect(view.getByTestId("stats-headline")).toHaveTextContent("60%")
  expect(view.queryByTestId("stats-source-all")).toBeNull()
  expect(view.getByText("Breakdowns cover the latest 200 results.")).toBeTruthy()
  expect(within(view.getByTestId("stats-list-current")).getByText("4-4")).toBeTruthy()
  expect(mockPagination).toHaveBeenLastCalledWith(
    "games",
    { deckKey: "key" },
    { initialNumItems: 20 },
  )
  fireEvent.press(view.getByTestId("stats-list-current"))
  expect(mockPagination).toHaveBeenLastCalledWith(
    "games",
    { deckKey: "key", fingerprint: "current" },
    { initialNumItems: 20 },
  )
  fireEvent.press(view.getByText("All"))
  fireEvent.press(view.getByTestId("stats-list-untracked"))
  expect(mockPagination).toHaveBeenLastCalledWith(
    "games",
    { deckKey: "key", fingerprint: null },
    { initialNumItems: 20 },
  )
})

it("explains small samples once and dims their rows instead of repeating too few", () => {
  const view = render(screen())
  expect(view.queryByText("too few")).toBeNull()
  expect(view.queryByText("of 8")).toBeNull()
  expect(view.getAllByText("Under 10 results is a small sample.")).toHaveLength(1)
  const rated = { ...deckStatsSummary.lists[0], games: 20, wins: 10, losses: 10 }
  mockSummary = {
    ...deckStatsSummary,
    all: { ...rated, fingerprint: "all" },
    lists: [rated],
    slices: [{ ...deckStatsSummary.slices[0], games: 20, wins: 10, losses: 10 }],
  }
  view.rerender(screen())
  expect(within(view.getByTestId("stats-list-current")).getByText("of 20")).toBeTruthy()
  expect(view.queryByText("Under 10 results is a small sample.")).toBeNull()
})

it("breaks the record down by source once, and filters games by it", () => {
  const view = render(screen())
  expect(within(view.getByTestId("stats-source-scryve")).getByText("60%")).toBeTruthy()
  expect(within(view.getByTestId("stats-source-manual")).getByText("3-2")).toBeTruthy()
  fireEvent.press(view.getByTestId("stats-source-manual"))
  expect(mockPagination).toHaveBeenLastCalledWith(
    "games",
    { deckKey: "key", source: "manual" },
    { initialNumItems: 20 },
  )
  mockSummary = { ...deckStatsSummary, all: { ...deckStatsSummary.all!, manualMatches: undefined } }
  view.rerender(screen())
  expect(view.queryByTestId("stats-source-manual")).toBeNull()
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
    params: deckStatsParams,
  })
  mockPremium = false
  view.rerender(screen())
  mockPush.mockClear()
  fireEvent.press(view.getByTestId("stats-compare"))
  expect(view.getByText("Compare lists with Scryve Pro.")).toBeTruthy()
  const preview = within(view.getByTestId("compare-preview"))
  expect(preview.getByText("4-4")).toBeTruthy()
  expect(preview.getByText("8-4")).toBeTruthy()
  expect(preview.getByText("Card changes")).toBeTruthy()
  expect(view.getByText("See Pro")).toBeTruthy()
  expect(mockPush).not.toHaveBeenCalled()
})

it("handles loading, empty, and disconnected states without inventing rates", () => {
  mockSummary = undefined
  const view = render(screen())
  expect(view.getByText("Loading stats…")).toBeTruthy()
  mockSummary = { all: null, lists: [], slices: [], scannedAll: true }
  view.rerender(screen())
  expect(view.getByText("No results yet")).toBeTruthy()
  expect(view.getByText(/Play a game with this deck/)).toBeTruthy()
  for (const header of ["Lists", "Pod size", "Games", "Source"])
    expect(view.queryByText(header)).toBeNull()
  expect(view.queryByTestId("stats-headline")).toBeNull()
})

it("asks signed-out players to sign in instead of saying reconnect", () => {
  const request = jest.fn()
  const view = render(
    screen({ ready: false, loading: false, signedIn: false, actionLabel: "Sign in", request }),
  )
  expect(view.getByText("Sign in to see deck stats")).toBeTruthy()
  expect(view.queryByText(/Reconnect/)).toBeNull()
  fireEvent.press(view.getByText("Sign in"))
  expect(request).toHaveBeenCalled()
  expect(mockPagination).toHaveBeenLastCalledWith("games", "skip", { initialNumItems: 20 })
})

it("offers a retry while offline, and waits quietly while access loads", () => {
  const request = jest.fn()
  const offline = {
    ...deckStatsAccess,
    ready: false,
    message: "Reconnect to continue.",
    actionLabel: "Try again",
    request,
  }
  const view = render(screen(offline))
  expect(view.getByText("Stats unavailable.")).toBeTruthy()
  expect(view.getByText("Reconnect to continue.")).toBeTruthy()
  fireEvent.press(view.getByText("Try again"))
  expect(request).toHaveBeenCalled()
  view.rerender(screen({ ...offline, loading: true }))
  expect(view.getByText("Loading stats…")).toBeTruthy()
  expect(view.queryByText("Try again")).toBeNull()
})

it("says a deck without a stats key has no results yet", () => {
  const view = render(
    <ThemeProvider initialContext="dark">
      <DeckStatsScreen
        {...deckStatsParams}
        deckKey=""
        access={deckStatsAccess}
        onBack={jest.fn()}
      />
    </ThemeProvider>,
  )
  expect(view.getByText("No results yet")).toBeTruthy()
  expect(view.getByText(/Play a game with this deck/)).toBeTruthy()
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

it("shows honest turn order rates and filters games by each", () => {
  const view = render(screen())
  expect(view.getByText("Turn order")).toBeTruthy()
  expect(within(view.getByTestId("stats-turn-order-true")).getByText("4-4")).toBeTruthy()
  expect(within(view.getByTestId("stats-turn-order-false")).getByText("67%")).toBeTruthy()
  expect(view.getByText("Turn order not tracked")).toBeTruthy()
  view.unmount()
  for (const wentFirst of [true, false, null]) {
    const filtered = render(screen())
    fireEvent.press(filtered.getByTestId(`stats-turn-order-${wentFirst}`))
    expect(mockPagination).toHaveBeenLastCalledWith(
      "games",
      { deckKey: "key", wentFirst },
      { initialNumItems: 20 },
    )
    filtered.unmount()
  }
})

it("leaves out turn order rows with no games", () => {
  mockSummary = {
    ...deckStatsSummary,
    slices: deckStatsSummary.slices.map((slice) => ({
      ...slice,
      wentFirst: slice.wentFirst ?? true,
    })),
  }
  const view = render(screen())
  expect(view.getByTestId("stats-turn-order-true")).toBeTruthy()
  expect(view.queryByTestId("stats-turn-order-null")).toBeNull()
})

it("hides turn order when no result tracked it", () => {
  const view = render(screen())
  expect(view.getByText("Turn order")).toBeTruthy()
  mockSummary = {
    ...deckStatsSummary,
    slices: deckStatsSummary.slices.map((slice) => ({ ...slice, wentFirst: null })),
  }
  view.rerender(screen())
  expect(view.queryByText("Turn order")).toBeNull()
})

it("captures deck_stats once per open, including returning to a mounted screen", async () => {
  const view = render(screen())
  view.rerender(screen())
  expect(captureAnalytics).toHaveBeenCalledTimes(1)
  expect(captureAnalytics).toHaveBeenCalledWith("stats_viewed", { surface: "deck_stats" })
  mockFocused = false
  view.rerender(screen())
  mockFocused = true
  view.rerender(screen())
  expect(captureAnalytics).toHaveBeenCalledTimes(2)
})
