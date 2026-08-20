import { fireEvent, render } from "@testing-library/react-native"

import { ThemeProvider } from "@/theme/context"

import { COUNT_PRO_ENTITLEMENT_ID } from "./config"
import { SubscriptionControls } from "./SubscriptionControls"

const presentPaywall = jest.fn().mockResolvedValue("purchased")
const presentCustomerCenter = jest.fn().mockResolvedValue(undefined)

const mockBilling = {
  configured: true,
  configurationMessage: undefined as string | undefined,
  isLoading: false,
  isCountPro: false,
  customerInfo: null as unknown,
  currentOffering: null,
  error: undefined as string | undefined,
  refreshCustomerInfo: jest.fn(),
  purchase: jest.fn(),
  restorePurchases: jest.fn(),
  presentPaywall,
  presentCustomerCenter,
}

jest.mock("./RevenueCatContext", () => ({ useRevenueCat: () => mockBilling }))

function entitledCustomerInfo(entitlement: { expirationDate: string | null; willRenew: boolean }) {
  return { entitlements: { all: { [COUNT_PRO_ENTITLEMENT_ID]: entitlement } } }
}

function renderControls() {
  return render(
    <ThemeProvider initialContext="light">
      <SubscriptionControls />
    </ThemeProvider>,
  )
}

describe("SubscriptionControls", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    Object.assign(mockBilling, {
      configured: true,
      configurationMessage: undefined,
      isLoading: false,
      isCountPro: false,
      customerInfo: null,
      error: undefined,
    })
  })

  it("sends a subscriber without Scryve Pro to the paywall", () => {
    const view = renderControls()

    fireEvent.press(view.getByTestId("count-pro-paywall-button"))

    expect(presentPaywall).toHaveBeenCalledTimes(1)
    expect(presentCustomerCenter).not.toHaveBeenCalled()
    expect(view.queryByTestId("count-pro-customer-center-button")).toBeNull()
  })

  it("sends a Scryve Pro subscriber to the customer center and shows the renewal date", () => {
    mockBilling.isCountPro = true
    mockBilling.customerInfo = entitledCustomerInfo({
      expirationDate: "2026-09-01T00:00:00Z",
      willRenew: true,
    })
    const view = renderControls()

    expect(
      view.getByText(`Renews ${new Date("2026-09-01T00:00:00Z").toLocaleDateString()}`),
    ).toBeTruthy()
    fireEvent.press(view.getByTestId("count-pro-customer-center-button"))

    expect(presentCustomerCenter).toHaveBeenCalledTimes(1)
    expect(presentPaywall).not.toHaveBeenCalled()
  })

  it("marks a cancelled entitlement as available until it lapses", () => {
    mockBilling.isCountPro = true
    mockBilling.customerInfo = entitledCustomerInfo({
      expirationDate: "2026-09-01T00:00:00Z",
      willRenew: false,
    })
    const view = renderControls()

    expect(
      view.getByText(`Available until ${new Date("2026-09-01T00:00:00Z").toLocaleDateString()}`),
    ).toBeTruthy()
  })

  it("describes a non-expiring entitlement as lifetime access", () => {
    mockBilling.isCountPro = true
    mockBilling.customerInfo = entitledCustomerInfo({ expirationDate: null, willRenew: false })

    expect(renderControls().getByText("Lifetime access")).toBeTruthy()
  })

  it("blocks purchase actions while billing is loading", () => {
    mockBilling.isLoading = true
    const view = renderControls()

    fireEvent.press(view.getByTestId("count-pro-paywall-button"))

    expect(presentPaywall).not.toHaveBeenCalled()
    expect(view.getByLabelText("Loading Scryve Pro")).toBeTruthy()
  })

  it("explains why purchases are unavailable when RevenueCat is not configured", () => {
    mockBilling.configured = false
    mockBilling.configurationMessage = "Scryve Pro purchases are unavailable in this build."
    const view = renderControls()

    expect(view.queryByTestId("count-pro-paywall-button")).toBeNull()
    expect(view.getByText("Scryve Pro purchases are unavailable in this build.")).toBeTruthy()
  })

  it("surfaces billing errors to the subscriber", () => {
    mockBilling.error = "The purchase could not be completed."

    expect(renderControls().getByText("The purchase could not be completed.")).toBeTruthy()
  })
})
