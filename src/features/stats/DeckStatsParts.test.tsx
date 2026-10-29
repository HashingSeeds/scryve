import { act, fireEvent, render } from "@testing-library/react-native"

import { DialogCard } from "@/components/DialogCard"
import { ThemeProvider } from "@/theme/context"

import { listStats } from "./deckStatsMath"
import { DeckComparePrompt, listDateSpan, listDetail, listLabel } from "./DeckStatsParts"
import { labelLists } from "./listLabels"
import { deckStatsSummary } from "../../../test/fixtures/deckStats"

const mockPaywall = jest.fn(async (_options?: { showsErrorInline?: boolean }) => "cancelled")
let mockBillingError: string | undefined
jest.mock("@/features/billing/RevenueCatContext", () => ({
  useRevenueCat: () => ({
    configured: true,
    isLoading: false,
    error: mockBillingError,
    presentPaywall: mockPaywall,
  }),
}))

it("names only the deck's current list Current, dates the rest and keeps untracked clear", () => {
  const lists = labelLists(listStats(deckStatsSummary), {
    currentFingerprint: "previous",
    cards: new Map(),
  })
  expect(lists.map((list) => [list.fingerprint, listLabel(list)])).toEqual([
    ["current", listDateSpan(lists[0])],
    ["previous", "Current"],
    [null, "Not tracked"],
  ])
  expect(listDetail(lists[0])).toBe("")
  expect(listDetail(lists[1])).toBe(listDateSpan(lists[1]))
})

it("caps a long card change summary", () => {
  const [current] = labelLists(listStats(deckStatsSummary), { cards: new Map() })
  const many = {
    ...current,
    changes: ["A", "B", "C", "D", "E"].map((name) => ({ name, quantity: 1 })),
  }
  expect(listDetail(many)).toBe("+1 A, +1 B, +1 C, 2 more")
})

it("presents the Pro paywall after dismissing the iOS prompt", async () => {
  const close = jest.fn()
  const view = render(
    <ThemeProvider initialContext="dark">
      <DeckComparePrompt onClose={close} />
    </ThemeProvider>,
  )
  fireEvent.press(view.getByText("See Pro"))
  expect(mockPaywall).not.toHaveBeenCalled()
  await act(async () => view.UNSAFE_getByType(DialogCard).props.onDismissed())
  expect(mockPaywall).toHaveBeenCalledTimes(1)
  expect(close).toHaveBeenCalledTimes(1)
})

it("keeps the prompt open with one inline message when the paywall fails", async () => {
  mockPaywall.mockClear()
  mockPaywall.mockImplementationOnce(async () => {
    mockBillingError = "Pro checkout could not open"
    return "error"
  })
  const close = jest.fn()
  const view = render(
    <ThemeProvider initialContext="dark">
      <DeckComparePrompt onClose={close} />
    </ThemeProvider>,
  )
  fireEvent.press(view.getByText("See Pro"))
  await act(async () => view.UNSAFE_getByType(DialogCard).props.onDismissed())
  expect(mockPaywall).toHaveBeenCalledWith({ showsErrorInline: true })
  expect(close).not.toHaveBeenCalled()
  expect(view.UNSAFE_getByType(DialogCard).props.visible).toBe(true)
  expect(view.getAllByText("Pro checkout could not open")).toHaveLength(1)
  mockBillingError = undefined
})
