import type { ReactNode } from "react"
import { Platform } from "react-native"
import { act, renderHook, waitFor } from "@testing-library/react-native"
import Purchases from "react-native-purchases"

import { RevenueCatProvider, useRevenueCat } from "./RevenueCatContext"
import { presentCountProPaywall } from "./revenueCatUi"

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
  requestDate: "2026-09-27T06:08:26Z",
} as never
const expiredCustomerInfo = {
  entitlements: { active: {}, all: {}, verification: "VERIFIED" },
  requestDate: "2026-09-27T06:01:00Z",
} as never
const revokedCustomerInfo = {
  entitlements: { active: {}, all: {}, verification: "VERIFIED" },
  requestDate: "2026-09-27T06:09:00Z",
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
      invalidateCustomerInfoCache: jest.fn().mockResolvedValue(undefined),
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
    purchasesMock.getAppUserID.mockResolvedValue("user_123")
    purchasesMock.getCustomerInfo.mockResolvedValue(customerInfo)
    purchasesMock.getOfferings.mockResolvedValue({ current: offering, all: {} })
    purchasesMock.purchasePackage.mockResolvedValue({ customerInfo } as never)
    purchasesMock.restorePurchases.mockResolvedValue(customerInfo)
  })

  afterEach(() => jest.restoreAllMocks())

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

  it("blocks checkout when the signed-in account has no billing user ID", async () => {
    const { result } = renderHook(() => useRevenueCat(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <RevenueCatProvider apiKey="test_public">{children}</RevenueCatProvider>
      ),
    })
    expect(result.current.isReady).toBe(false)
    await act(async () => {
      expect(await result.current.purchase("foil_yearly")).toMatchObject({ status: "failed" })
      expect(await result.current.presentPaywall()).toBe("error")
    })
    expect(Purchases.purchasePackage).not.toHaveBeenCalled()
    expect(presentCountProPaywall).not.toHaveBeenCalled()
  })

  it("blocks checkout while RevenueCat is switching away from a stale account", async () => {
    purchasesMock.isConfigured.mockResolvedValue(true)
    purchasesMock.getAppUserID.mockResolvedValue("previous_user")
    let finishLogin!: () => void
    purchasesMock.logIn.mockReturnValueOnce(
      new Promise((resolve) => {
        finishLogin = () => resolve({ customerInfo, created: false })
      }),
    )
    const { result } = renderHook(() => useRevenueCat(), { wrapper })
    await waitFor(() => expect(Purchases.logIn).toHaveBeenCalledWith("user_123"))
    expect(result.current.isReady).toBe(false)
    await act(async () => {
      expect(await result.current.purchase("monthly")).toMatchObject({ status: "failed" })
      expect(await result.current.presentPaywall()).toBe("error")
    })
    expect(Purchases.purchasePackage).not.toHaveBeenCalled()
    expect(presentCountProPaywall).not.toHaveBeenCalled()

    purchasesMock.getAppUserID.mockResolvedValue("user_123")
    await act(async () => finishLogin())
    await waitFor(() => expect(result.current.isReady).toBe(true))
    purchasesMock.getAppUserID.mockResolvedValue("previous_user")
    await act(async () => {
      expect(await result.current.purchase("monthly")).toMatchObject({ status: "failed" })
    })
    expect(Purchases.purchasePackage).not.toHaveBeenCalled()
  })

  it("purchases web Foil only from its separate offering", async () => {
    jest.replaceProperty(Platform, "OS", "web")
    const foilPackage = { identifier: "foil_yearly" } as never
    purchasesMock.getCustomerInfo.mockResolvedValue(expiredCustomerInfo)
    purchasesMock.getOfferings.mockResolvedValue({
      current: offering,
      all: { foil_supporter: { availablePackages: [foilPackage] } },
    } as never)
    const { result } = renderHook(() => useRevenueCat(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      expect(await result.current.purchase("foil_yearly")).toMatchObject({ status: "purchased" })
    })

    expect(Purchases.purchasePackage).toHaveBeenCalledWith(foilPackage)
    expect(result.current.isCountPro).toBe(true)
    expect(result.current.currentOffering).toBe(offering)
  })

  it("checks the account again after loading the Foil offering", async () => {
    jest.replaceProperty(Platform, "OS", "web")
    purchasesMock.getCustomerInfo.mockResolvedValue(expiredCustomerInfo)
    const { result } = renderHook(() => useRevenueCat(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    purchasesMock.getOfferings.mockImplementationOnce(async () => {
      purchasesMock.getAppUserID.mockResolvedValue("previous_user")
      return {
        current: offering,
        all: { foil_supporter: { availablePackages: [{ identifier: "foil_yearly" }] } },
      } as never
    })
    await act(async () => {
      expect(await result.current.purchase("foil_yearly")).toMatchObject({ status: "failed" })
    })
    expect(Purchases.purchasePackage).not.toHaveBeenCalled()
  })

  it.each(["ios", "android"] as const)("blocks Foil purchases on %s", async (platform) => {
    jest.replaceProperty(Platform, "OS", platform)
    const { result } = renderHook(() => useRevenueCat(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))

    await act(async () => {
      expect(await result.current.purchase("foil_yearly")).toEqual({
        status: "failed",
        message: "Foil purchases are only available on the web.",
      })
    })

    expect(Purchases.purchasePackage).not.toHaveBeenCalled()
    expect(Purchases.getOfferings).toHaveBeenCalledTimes(1)
  })

  it("does not buy another subscription for an existing Pro subscriber", async () => {
    jest.replaceProperty(Platform, "OS", "web")
    purchasesMock.getCustomerInfo.mockResolvedValueOnce(expiredCustomerInfo)
    const { result } = renderHook(() => useRevenueCat(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isCountPro).toBe(false)

    await act(async () => {
      expect(await result.current.purchase("foil_yearly")).toEqual({
        status: "failed",
        message: "Manage your existing subscription before switching to Foil.",
      })
    })

    expect(Purchases.purchasePackage).not.toHaveBeenCalled()
  })

  it("keeps a newer listener update when stale customer info resolves later", async () => {
    let resolveCustomerInfo!: (value: never) => void
    purchasesMock.getCustomerInfo.mockReturnValue(
      new Promise((resolve) => {
        resolveCustomerInfo = resolve
      }),
    )
    const { result } = renderHook(() => useRevenueCat(), { wrapper })
    await waitFor(() => expect(Purchases.addCustomerInfoUpdateListener).toHaveBeenCalled())
    const listener = purchasesMock.addCustomerInfoUpdateListener.mock.calls[0][0]

    act(() => listener(customerInfo))
    await act(async () => resolveCustomerInfo(expiredCustomerInfo))

    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isCountPro).toBe(true)
  })

  it("forces fresh customer info after reconnect to remove revoked Pro access", async () => {
    const { result } = renderHook(() => useRevenueCat(), { wrapper })
    await waitFor(() => expect(result.current.isCountPro).toBe(true))
    purchasesMock.getCustomerInfo.mockResolvedValue(revokedCustomerInfo)

    await act(async () => {
      await result.current.refreshCustomerInfo(true)
    })

    expect(Purchases.invalidateCustomerInfoCache).toHaveBeenCalledTimes(1)
    expect(result.current.isCountPro).toBe(false)
  })

  it("drops the previous user's newer CustomerInfo after switching accounts", async () => {
    let appUserID = "user_123"
    const { result, rerender } = renderHook(() => useRevenueCat(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <RevenueCatProvider apiKey="test_public" appUserID={appUserID}>
          {children}
        </RevenueCatProvider>
      ),
    })
    await waitFor(() => expect(result.current.isCountPro).toBe(true))

    purchasesMock.isConfigured.mockResolvedValue(true)
    purchasesMock.getAppUserID.mockResolvedValue("user_123")
    purchasesMock.getCustomerInfo.mockResolvedValue(expiredCustomerInfo)
    appUserID = "user_456"
    rerender({})

    await waitFor(() => expect(Purchases.logIn).toHaveBeenCalledWith("user_456"))
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isCountPro).toBe(false)
  })
})
