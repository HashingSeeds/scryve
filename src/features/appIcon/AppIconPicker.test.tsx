import { setAlternateAppIcon } from "expo-alternate-app-icons"
import { fireEvent, render, waitFor } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { AppIconPicker } from "./AppIconPicker"

jest.mock("expo-alternate-app-icons", () => ({
  supportsAlternateIcons: true,
  getAppIconName: () => null,
  setAlternateAppIcon: jest.fn(async (name: string | null) => name),
}))
const mockPresentPaywall = jest.fn()
let mockPlan = { isCountPro: false, isFoil: false }
jest.mock("@/features/billing/RevenueCatContext", () => ({
  useRevenueCat: () => ({ ...mockPlan, presentPaywall: mockPresentPaywall }),
}))

function renderFor(plan: typeof mockPlan) {
  mockPlan = plan
  return render(
    <ThemeProvider initialContext="dark">
      <AppIconPicker />
    </ThemeProvider>,
  )
}

describe("AppIconPicker", () => {
  beforeEach(() => jest.clearAllMocks())

  it("sends free players to the paywall instead of changing the icon", () => {
    const view = renderFor({ isCountPro: false, isFoil: false })
    fireEvent.press(view.getByTestId("app-icon-midnight"))
    expect(mockPresentPaywall).toHaveBeenCalledTimes(1)
    expect(setAlternateAppIcon).not.toHaveBeenCalled()
  })

  it("lets Pro pick variants but keeps the Foil icon for Foil supporters", async () => {
    const view = renderFor({ isCountPro: true, isFoil: false })
    fireEvent.press(view.getByTestId("app-icon-foil"))
    expect(mockPresentPaywall).toHaveBeenCalledTimes(1)
    fireEvent.press(view.getByTestId("app-icon-midnight"))
    await waitFor(() =>
      expect(view.getByTestId("app-icon-midnight").props.accessibilityState.selected).toBe(true),
    )
    expect(setAlternateAppIcon).toHaveBeenCalledWith("Midnight")
  })
})
