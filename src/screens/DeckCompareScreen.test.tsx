import { fireEvent, render, waitFor } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"
import { captureAnalytics } from "@/utils/analytics"

import { DeckCompareScreen } from "./DeckCompareScreen"
import { deckStatsAccess, deckStatsParams, deckStatsSummary } from "../../test/fixtures/deckStats"

let mockFocused = true
jest.mock("@/utils/analytics", () => ({ captureAnalytics: jest.fn() }))

jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => void) =>
    require("react").useEffect(() => {
      if (mockFocused) return callback()
    }, [callback, mockFocused]),
}))
let mockPremium = true
let mockSummary = deckStatsSummary
const mockLookup = jest.fn(async (_deckKey: string, fingerprint: string) =>
  fingerprint === "current" ? [{ name: "Bolt", quantity: 4 }] : [{ name: "Land", quantity: 2 }],
)
const mockPaywall = jest.fn(async () => undefined)
jest.mock("../../convex/_generated/api", () => ({
  api: { deckStats: { summary: "summary" }, decks: { capacity: "capacity" } },
}))
jest.mock("convex/react", () => ({
  useQuery: (reference: unknown) =>
    reference === "capacity" ? { premium: mockPremium } : mockSummary,
}))
jest.mock("@/features/billing/RevenueCatContext", () => ({
  useRevenueCat: () => ({ configured: true, isLoading: false, presentPaywall: mockPaywall }),
}))
jest.mock("@/features/stats/listSnapshots", () => ({
  ...jest.requireActual("@/features/stats/listSnapshots"),
  lookupListSnapshot: (...args: [string, string]) => mockLookup(...args),
}))
const screen = () => (
  <ThemeProvider initialContext="dark">
    <DeckCompareScreen {...deckStatsParams} access={deckStatsAccess} onBack={jest.fn()} />
  </ThemeProvider>
)
beforeEach(() => {
  jest.clearAllMocks()
  mockFocused = true
  mockPremium = true
  mockSummary = deckStatsSummary
})

it("defaults to current versus previous with exact records and card changes", async () => {
  const view = render(screen())
  expect(view.getByText("Current ▾")).toBeTruthy()
  expect(view.getByText("Previous ▾")).toBeTruthy()
  expect(view.getByText("4-4")).toBeTruthy()
  expect(view.getByText("8-4")).toBeTruthy()
  expect(view.getByText("50%")).toBeTruthy()
  expect(view.getByText("too few")).toBeTruthy()
  expect(view.getAllByText(/Likely/)).toHaveLength(2)
  await waitFor(() => expect(view.getByText("+4 Bolt")).toBeTruthy())
  expect(view.getByText("−2 Land")).toBeTruthy()
  fireEvent.press(view.getByTestId("compare-pick-left"))
  fireEvent.press(view.getByTestId("compare-option-previous"))
  await waitFor(() => expect(view.getByText("No card changes.")).toBeTruthy())
})

it("shows a short missing contents message for untracked lists", async () => {
  const view = render(screen())
  await waitFor(() => expect(view.getByText("+4 Bolt")).toBeTruthy())
  fireEvent.press(view.getByTestId("compare-pick-right"))
  fireEvent.press(view.getByTestId("compare-option-untracked"))
  await waitFor(() =>
    expect(view.getByText("One or both lists are not on this device.")).toBeTruthy(),
  )
})

it("excludes unknown outcomes from comparison win rates", async () => {
  mockSummary = {
    ...deckStatsSummary,
    lists: deckStatsSummary.lists.map((list) => ({ ...list, games: list.games + 20 })),
  }
  const view = render(screen())
  expect(view.getByText("50%")).toBeTruthy()
  expect(view.getByText("67%")).toBeTruthy()
  expect(view.getByText("too few")).toBeTruthy()
  await waitFor(() => expect(view.getByText("+4 Bolt")).toBeTruthy())
})

it("gates direct access for non-Pro players without looking up cards", () => {
  mockPremium = false
  const view = render(screen())
  expect(view.getByText("Compare lists with Scryve Pro.")).toBeTruthy()
  expect(mockLookup).not.toHaveBeenCalled()
  expect(view.queryByText("Card changes")).toBeNull()
})

it("renders an empty history", async () => {
  mockSummary = { all: null, lists: [], slices: [], scannedAll: true }
  const view = render(screen())
  await waitFor(() => expect(view.getByText("No results yet")).toBeTruthy())
})

it("reports a device read failure without stale card changes", async () => {
  mockLookup.mockRejectedValueOnce(new Error("storage unavailable"))
  const view = render(screen())
  await waitFor(() => expect(view.getByText("Could not load lists on this device.")).toBeTruthy())
  expect(view.queryByText("+4 Bolt")).toBeNull()
})

it("captures compare once per open, including returning to a mounted screen", async () => {
  const view = render(screen())
  await waitFor(() => expect(view.getByText("+4 Bolt")).toBeTruthy())
  view.rerender(screen())
  expect(captureAnalytics).toHaveBeenCalledTimes(1)
  expect(captureAnalytics).toHaveBeenCalledWith("stats_viewed", { surface: "compare" })
  mockFocused = false
  view.rerender(screen())
  mockFocused = true
  view.rerender(screen())
  expect(captureAnalytics).toHaveBeenCalledTimes(2)
})
