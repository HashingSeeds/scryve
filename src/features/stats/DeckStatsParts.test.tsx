import { Platform } from "react-native"
import { act, fireEvent, render } from "@testing-library/react-native"

import { DialogCard } from "@/components/DialogCard"
import { ThemeProvider } from "@/theme/context"

import { listStats } from "./deckStatsMath"
import { DeckComparePrompt, listDateSpan, listLabel } from "./DeckStatsParts"
import { deckStatsSummary } from "../../../test/fixtures/deckStats"

const mockPaywall = jest.fn(async () => undefined)
jest.mock("@/features/billing/RevenueCatContext", () => ({
  useRevenueCat: () => ({ configured: true, isLoading: false, presentPaywall: mockPaywall }),
}))

it("labels current, previous and untracked lists with localized date spans", () => {
  const lists = listStats(deckStatsSummary, "scryve")
  expect(lists.map(listLabel)).toEqual(["Current", "Previous", "Not tracked"])
  const sep10 = new Date(2026, 8, 10, 12).getTime()
  const oct1 = new Date(2026, 9, 1, 12).getTime()
  expect(listDateSpan({ ...lists[0], firstAt: sep10, lastAt: oct1 })).toContain(" to ")
  expect(listDateSpan({ ...lists[0], firstAt: oct1, lastAt: oct1 + 60_000 })).not.toContain(" to ")
  expect(listDateSpan({ ...lists[0], firstAt: undefined })).toBe("Dates not tracked")
  expect(listLabel({ ...lists[0], label: "dated" })).toBe(listDateSpan(lists[0]))
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
