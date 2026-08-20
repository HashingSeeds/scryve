import type { ReactNode } from "react"
import { act, renderHook, waitFor } from "@testing-library/react-native"
import Purchases from "react-native-purchases"

import { RevenueCatProvider, useRevenueCat } from "./RevenueCatContext"

const customerInfo = {
  entitlements: {
    active: {
      "Count Pro": {
        identifier: "Count Pro",
        verification: "VERIFIED",
      },
    },
    all: {},
    verification: "VERIFIED",
  },
} as never
const monthlyPackage = {
  identifier: "$rc_monthly",
  product: { identifier: "monthly:base-monthly-plan" },
} as never
const offering = { availablePackages: [monthlyPackage] } as never

jest.mock("react-native-purchases", () => {
  return {
    __esModule: true,
    ENTITLEMENT_VERIFICATION_MODE: { INFORMATIONAL: "INFORMATIONAL" },
    LOG_LEVEL: { DEBUG: "DEBUG" },
    PURCHASES_ERROR_CODE: {
      CONFIGURATION_ERROR: "CONFIGURATION_ERROR",
      INVALID_CREDENTIALS_ERROR: "INVALID_CREDENTIALS_ERROR",
      NETWORK_ERROR: "NETWORK_ERROR",
      OFFLINE_CONNECTION_ERROR: "OFFLINE_CONNECTION_ERROR",
      PAYMENT_PENDING_ERROR: "PAYMENT_PENDING_ERROR",
      PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR: "PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR",
      PURCHASE_CANCELLED_ERROR: "PURCHASE_CANCELLED_ERROR",
      PURCHASE_NOT_ALLOWED_ERROR: "PURCHASE_NOT_ALLOWED_ERROR",
    },
    VERIFICATION_RESULT: { VERIFIED: "VERIFIED" },
    default: {
      ENTITLEMENT_VERIFICATION_MODE: { INFORMATIONAL: "INFORMATIONAL" },
      LOG_LEVEL: { DEBUG: "DEBUG" },
      isConfigured: jest.fn().mockResolvedValue(false),
      setLogLevel: jest.fn().mockResolvedValue(undefined),
      configure: jest.fn(),
      addCustomerInfoUpdateListener: jest.fn(),
      removeCustomerInfoUpdateListener: jest.fn(),
      getCustomerInfo: jest.fn(),
      getOfferings: jest.fn(),
      purchasePackage: jest.fn(),
      restorePurchases: jest.fn(),
      getAppUserID: jest.fn(),
      logIn: jest.fn(),
    },
  }
})
jest.mock("./revenueCatUi", () => ({
  presentCountProPaywall: jest.fn().mockResolvedValue("purchased"),
  presentCountCustomerCenter: jest.fn().mockResolvedValue(undefined),
}))

const purchasesMock = Purchases as jest.Mocked<typeof Purchases>

function wrapper({ children }: { children: ReactNode }) {
  return (
    <RevenueCatProvider apiKey="test_public" appUserID="user_123">
      {children}
    </RevenueCatProvider>
  )
}

describe("RevenueCatProvider", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    purchasesMock.isConfigured.mockResolvedValue(false)
    purchasesMock.getCustomerInfo.mockResolvedValue(customerInfo)
    purchasesMock.getOfferings.mockResolvedValue({ current: offering, all: {} })
    purchasesMock.purchasePackage.mockResolvedValue({ customerInfo } as never)
    purchasesMock.restorePurchases.mockResolvedValue(customerInfo)
  })

  it("identifies the Clerk user and derives Scryve Pro from CustomerInfo", async () => {
    const { result } = renderHook(() => useRevenueCat(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(Purchases.configure).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "test_public", appUserID: "user_123" }),
    )
    expect(result.current.isCountPro).toBe(true)
  })

  it("purchases the requested product from the current offering", async () => {
    const { result } = renderHook(() => useRevenueCat(), { wrapper })
    await waitFor(() => expect(result.current.currentOffering).toBe(offering))
    await act(async () => {
      expect(await result.current.purchase("monthly")).toMatchObject({ status: "purchased" })
    })
    expect(Purchases.purchasePackage).toHaveBeenCalledWith(monthlyPackage)
  })
})
