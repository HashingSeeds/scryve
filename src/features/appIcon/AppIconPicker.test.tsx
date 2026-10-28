import { Image } from "react-native"
import { setAlternateAppIcon } from "expo-alternate-app-icons"
import {
  fireEvent,
  isHiddenFromAccessibility,
  render,
  waitFor,
} from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { AppIconPicker } from "./AppIconPicker"

let mockCurrentIcon: string | null = null
jest.mock("expo-alternate-app-icons", () => ({
  supportsAlternateIcons: true,
  getAppIconName: () => mockCurrentIcon,
  setAlternateAppIcon: jest.fn(async (name: string | null) => name),
}))
const mockPresentPaywall = jest.fn()
const mockOpenAuth = jest.fn()
let mockPlan: { isSignedIn: boolean; isCountPro: boolean; isFoil: boolean; failed?: boolean } = {
  isSignedIn: true,
  isCountPro: false,
  isFoil: false,
}
jest.mock("@/features/billing/RevenueCatContext", () => ({
  useRevenueCat: () => ({
    isCountPro: mockPlan.isCountPro,
    isFoil: mockPlan.isFoil,
    isLoading: false,
    error: mockPlan.failed ? "Network error" : undefined,
    customerInfo: mockPlan.isSignedIn && !mockPlan.failed ? {} : null,
    presentPaywall: mockPresentPaywall,
  }),
}))
jest.mock("@/features/auth/AuthContext", () => ({
  useAuthAccess: () => ({ isSignedIn: mockPlan.isSignedIn, openAuth: mockOpenAuth }),
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
  beforeEach(() => {
    jest.clearAllMocks()
    mockCurrentIcon = null
  })

  it("reads each choice as a button and hides the preview image", () => {
    const view = renderFor({ isSignedIn: true, isCountPro: false, isFoil: false })
    const two = view.getByRole("button", { name: "Two, Scryve Pro" })
    expect(two.props.accessibilityHint).toBe("Opens Scryve Pro")
    expect(view.getByRole("button", { name: "Default" }).props.accessibilityState).toEqual({
      selected: true,
      disabled: false,
    })
    const previews = view.UNSAFE_getAllByType(Image)
    expect(previews.length).toBeGreaterThan(0)
    expect(previews.every((preview) => isHiddenFromAccessibility(preview))).toBe(true)
  })

  it("sends free players to the paywall and signed-out players to sign in", () => {
    const view = renderFor({ isSignedIn: true, isCountPro: false, isFoil: false })
    fireEvent.press(view.getByTestId("app-icon-midnight"))
    expect(mockPresentPaywall).toHaveBeenCalledTimes(1)
    view.unmount()
    fireEvent.press(
      renderFor({ isSignedIn: false, isCountPro: false, isFoil: false }).getByTestId(
        "app-icon-midnight",
      ),
    )
    expect(mockOpenAuth).toHaveBeenCalledTimes(1)
    expect(mockPresentPaywall).toHaveBeenCalledTimes(1)
    expect(setAlternateAppIcon).not.toHaveBeenCalled()
  })

  it("lets Pro pick variants", async () => {
    const view = renderFor({ isSignedIn: true, isCountPro: true, isFoil: false })
    fireEvent.press(view.getByTestId("app-icon-midnight"))
    await waitFor(() =>
      expect(view.getByTestId("app-icon-midnight").props.accessibilityState.selected).toBe(true),
    )
    expect(setAlternateAppIcon).toHaveBeenCalledWith("Midnight")
  })

  it("shows the Foil icons to Foil supporters alone", () => {
    const pro = renderFor({ isSignedIn: true, isCountPro: true, isFoil: false })
    expect(pro.queryByTestId("app-icon-foil")).toBeNull()
    expect(pro.queryByTestId("app-icon-gilded")).toBeNull()
    pro.unmount()
    const foil = renderFor({ isSignedIn: true, isCountPro: true, isFoil: true })
    fireEvent.press(foil.getByTestId("app-icon-gilded"))
    expect(setAlternateAppIcon).toHaveBeenCalledWith("Gilded")
  })

  it("keeps a lapsed Foil icon selected", () => {
    mockCurrentIcon = "Gilded"
    const view = renderFor({ isSignedIn: true, isCountPro: false, isFoil: false })
    expect(view.getByTestId("app-icon-gilded").props.accessibilityState).toEqual({
      selected: true,
      disabled: true,
    })
    expect(view.queryByTestId("app-icon-holo")).toBeNull()
  })

  it("says why Pro icons are locked when Pro fails to load", () => {
    const view = renderFor({ isSignedIn: true, isCountPro: false, isFoil: false })
    expect(view.queryByText("Couldn't check Scryve Pro, so Pro icons are locked.")).toBeNull()
    view.unmount()
    const failed = renderFor({ isSignedIn: true, isCountPro: false, isFoil: false, failed: true })
    expect(failed.getByText("Couldn't check Scryve Pro, so Pro icons are locked.")).toBeTruthy()
  })
})
