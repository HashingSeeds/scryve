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
  expect(listDateSpan(lists[0])).toContain("to")
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
