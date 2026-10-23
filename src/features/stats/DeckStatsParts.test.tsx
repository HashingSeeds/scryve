import { Platform } from "react-native"
import { act, fireEvent, render } from "@testing-library/react-native"

import { DialogCard } from "@/components/DialogCard"
import { ThemeProvider } from "@/theme/context"

import { listStats } from "./deckStatsMath"
import { DeckComparePrompt, listDateSpan, listDetail, listLabel } from "./DeckStatsParts"
import { labelLists } from "./listLabels"
import { deckStatsSummary } from "../../../test/fixtures/deckStats"

const mockPaywall = jest.fn(async () => undefined)
jest.mock("@/features/billing/RevenueCatContext", () => ({
  useRevenueCat: () => ({ configured: true, isLoading: false, presentPaywall: mockPaywall }),
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

it("summarizes card changes against the previous list, and caps long summaries", () => {
  const cards = new Map([
    ["current", [{ name: "Forest", quantity: 2 }]],
    [
      "previous",
      [
        { name: "Forest", quantity: 1 },
        { name: "Plains", quantity: 1 },
      ],
    ],
  ])
  const [current] = labelLists(listStats(deckStatsSummary), { cards })
  expect(listDetail(current)).toBe("+1 Forest, −1 Plains")
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
  if (Platform.OS === "ios") {
    expect(mockPaywall).not.toHaveBeenCalled()
    await act(async () => view.UNSAFE_getByType(DialogCard).props.onDismissed())
  } else await act(async () => undefined)
  expect(mockPaywall).toHaveBeenCalledTimes(1)
  expect(close).toHaveBeenCalledTimes(1)
})
