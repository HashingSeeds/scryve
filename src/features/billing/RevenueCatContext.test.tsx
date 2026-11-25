import type { ReactNode } from "react"
import { Alert, Platform } from "react-native"
import { act, render, renderHook, waitFor } from "@testing-library/react-native"
import Purchases from "react-native-purchases"

import type { ConnectedProfileState } from "@/features/connected/useConnectedProfile"

import {
  hasFoil,
  proSubscriptionManagement,
  renewsYearly,
  RevenueCatProvider,
  useRevenueCat,
} from "./RevenueCatContext"
import { RevenueCatSyncSession } from "./RevenueCatSyncSession"
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
      isAnonymous: jest.fn(),
      logIn: jest.fn(),
      logOut: jest.fn(),
      syncPurchasesForResult: jest.fn(),
    },
  }
})
let mockProfile: ConnectedProfileState
jest.mock("convex/react", () => ({ useAction: () => jest.fn().mockResolvedValue({}) }))
jest.mock("@/features/connected/useConnectedProfile", () => ({
  ConnectedProfileProvider: ({ children }: { children: ReactNode }) => children,
  useConnectedProfile: () => mockProfile,
}))
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

  it("blocks checkout and explains a paywall tap when the account has no billing user ID", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined)
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
    expect(alert).toHaveBeenCalledTimes(1)
    expect(alert).toHaveBeenCalledWith(
      "Scryve Pro didn't open",
      "Wait for billing to connect to your account, then try again.",
    )
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

  it("lets a signed-out player buy anonymously, then offers sign in", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined)
    purchasesMock.isAnonymous.mockResolvedValue(true)
    const signIn = jest.fn()
    const { result } = renderHook(() => useRevenueCat(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <RevenueCatProvider apiKey="test_public" appUserID={null} signIn={signIn}>
          {children}
        </RevenueCatProvider>
      ),
    })
    await waitFor(() => expect(result.current.isReady).toBe(true))
    expect(Purchases.configure).toHaveBeenCalledWith(expect.objectContaining({ appUserID: null }))
    await act(async () => {
      expect(await result.current.presentPaywall()).toBe("purchased")
    })
    expect(alert).toHaveBeenCalledTimes(1)
    const [title, , buttons] = alert.mock.calls[0]
    expect(title).toBe("Keep Pro on all your devices?")
    buttons?.find((button) => button.text === "Sign in")?.onPress?.()
    expect(signIn).toHaveBeenCalledTimes(1)
  })

  it("does not offer sign in when a restore finds no Pro", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined)
    purchasesMock.isAnonymous.mockResolvedValue(true)
    purchasesMock.getCustomerInfo.mockResolvedValue(expiredCustomerInfo)
    jest.mocked(presentCountProPaywall).mockResolvedValueOnce("restored")
    const { result } = renderHook(() => useRevenueCat(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <RevenueCatProvider apiKey="test_public" appUserID={null} signIn={jest.fn()}>
          {children}
        </RevenueCatProvider>
      ),
    })
    await waitFor(() => expect(result.current.isReady).toBe(true))
    await act(async () => {
      expect(await result.current.presentPaywall()).toBe("restored")
    })
    expect(alert).not.toHaveBeenCalled()
  })

  it("syncs an anonymous buyer's purchase to an account RevenueCat will not merge", async () => {
    purchasesMock.isConfigured.mockResolvedValue(true)
    purchasesMock.getAppUserID.mockResolvedValue("$RCAnonymousID:abc")
    purchasesMock.isAnonymous.mockResolvedValue(true)
    purchasesMock.logIn.mockResolvedValue({ customerInfo: expiredCustomerInfo, created: false })
    renderHook(() => useRevenueCat(), { wrapper })
    await waitFor(() => expect(Purchases.syncPurchasesForResult).toHaveBeenCalledTimes(1))
    expect(Purchases.logIn).toHaveBeenCalledWith("user_123")
  })

  it("still loads billing when that sync fails, so Restore Purchases stays reachable", async () => {
    purchasesMock.isConfigured.mockResolvedValue(true)
    purchasesMock.getAppUserID.mockResolvedValue("$RCAnonymousID:abc")
    purchasesMock.isAnonymous.mockResolvedValue(true)
    purchasesMock.logIn.mockResolvedValue({ customerInfo: expiredCustomerInfo, created: false })
    purchasesMock.syncPurchasesForResult.mockRejectedValueOnce(
      Object.assign(new Error("offline"), { code: "10" }),
    )
    const { result } = renderHook(() => useRevenueCat(), { wrapper })
    await waitFor(() => expect(result.current.isLoading).toBe(false))
    expect(result.current.isReady).toBe(true)
    expect(result.current.error).toBeTruthy()
  })

  it("logs out the account an earlier build left saved when a signed-out phone configures, even offline", async () => {
    let anonymous = false
    purchasesMock.isAnonymous.mockImplementation(async () => anonymous)
    purchasesMock.logOut.mockImplementationOnce(async () => {
      anonymous = true
      throw Object.assign(new Error("offline"), { code: "35" })
    })
    const { result } = renderHook(() => useRevenueCat(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <RevenueCatProvider apiKey="test_public" appUserID={null}>
          {children}
        </RevenueCatProvider>
      ),
    })
    await waitFor(() => expect(result.current.isReady).toBe(true))
    expect(Purchases.logOut).toHaveBeenCalledTimes(1)
  })

  it("still logs out when the player signs out while signing in is pending", async () => {
    purchasesMock.isConfigured.mockResolvedValue(true)
    purchasesMock.getAppUserID.mockResolvedValue("$RCAnonymousID:abc")
    let loggedIn = false
    purchasesMock.isAnonymous.mockImplementation(async () => !loggedIn)
    purchasesMock.getCustomerInfo.mockResolvedValue(expiredCustomerInfo)
    let finishLogin!: () => void
    purchasesMock.logIn.mockReturnValueOnce(
      new Promise((resolve) => {
        finishLogin = () => {
          loggedIn = true
          resolve({ customerInfo: expiredCustomerInfo, created: false })
        }
      }),
    )
    const billingFor = (appUserID: string | null) => (
      <RevenueCatProvider apiKey="test_public" appUserID={appUserID}>
        {null}
      </RevenueCatProvider>
    )
    const { rerender } = render(billingFor("user_123"))
    await waitFor(() => expect(Purchases.logIn).toHaveBeenCalledWith("user_123"))
    rerender(billingFor(null))
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)))
    await act(async () => finishLogin())
    await waitFor(() => expect(Purchases.logOut).toHaveBeenCalledTimes(1))
  })

  it("logs RevenueCat out of the previous account when the player signs out", async () => {
    purchasesMock.isConfigured.mockResolvedValue(true)
    purchasesMock.isAnonymous.mockResolvedValue(false)
    const { result } = renderHook(() => useRevenueCat(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <RevenueCatProvider apiKey="test_public" appUserID={null}>
          {children}
        </RevenueCatProvider>
      ),
    })
    await waitFor(() => expect(Purchases.logOut).toHaveBeenCalledTimes(1))
    expect(Purchases.logIn).not.toHaveBeenCalled()
    await waitFor(() => expect(result.current.isLoading).toBe(false))
  })

  it("tells the player when the paywall itself errors, and stays quiet when they close it", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined)
    const { result } = renderHook(() => useRevenueCat(), { wrapper })
    await waitFor(() => expect(result.current.isReady).toBe(true))
    jest.mocked(presentCountProPaywall).mockResolvedValueOnce("cancelled")
    await act(async () => {
      expect(await result.current.presentPaywall()).toBe("cancelled")
    })
    expect(alert).not.toHaveBeenCalled()
    jest.mocked(presentCountProPaywall).mockResolvedValueOnce("error")
    await act(async () => {
      expect(await result.current.presentPaywall()).toBe("error")
    })
    expect(alert).toHaveBeenCalledWith(
      "Scryve Pro didn't open",
      "The Scryve Pro paywall could not complete the request.",
    )
    expect(result.current.error).toBe("The Scryve Pro paywall could not complete the request.")
  })

  it("leaves the message to callers that show billing errors inline", async () => {
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => undefined)
    const { result } = renderHook(() => useRevenueCat(), { wrapper })
    await waitFor(() => expect(result.current.isReady).toBe(true))
    jest.mocked(presentCountProPaywall).mockResolvedValueOnce("error")
    await act(async () => {
      expect(await result.current.presentPaywall({ showsErrorInline: true })).toBe("error")
    })
    expect(alert).not.toHaveBeenCalled()
    expect(result.current.error).toBe("The Scryve Pro paywall could not complete the request.")
  })

  it("uses the browser alert on web, where Alert.alert does nothing", async () => {
    jest.replaceProperty(Platform, "OS", "web")
    const browserAlert = jest.fn()
    globalThis.alert = browserAlert
    const { result } = renderHook(() => useRevenueCat(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <RevenueCatProvider apiKey="test_public">{children}</RevenueCatProvider>
      ),
    })
    await act(async () => {
      expect(await result.current.presentPaywall()).toBe("error")
    })
    expect(browserAlert).toHaveBeenCalledWith(
      "Scryve Pro didn't open\n\nWait for billing to connect to your account, then try again.",
    )
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

  it("forced refreshes replace cached Pro with the server's answer", async () => {
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

describe("offline Pro", () => {
  // why: models the native SDK with RevenueCat unreachable: getCustomerInfo serves the saved CustomerInfo and invalidating deletes it.
  let savedCustomerInfo: typeof customerInfo | null
  const offline = { code: "10", message: "offline" }

  beforeEach(() => {
    jest.clearAllMocks()
    savedCustomerInfo = customerInfo
    purchasesMock.isConfigured.mockResolvedValue(false)
    purchasesMock.getOfferings.mockRejectedValue(offline)
    purchasesMock.getCustomerInfo.mockImplementation(async () => {
      if (savedCustomerInfo) return savedCustomerInfo
      throw offline
    })
    purchasesMock.invalidateCustomerInfoCache.mockImplementation(async () => {
      savedCustomerInfo = null
    })
  })

  let isCountPro = false
  function ProProbe() {
    isCountPro = useRevenueCat().isCountPro
    return null
  }

  function app(withSync: boolean) {
    return (
      <RevenueCatProvider apiKey="test_public" appUserID="user_123">
        {withSync ? <RevenueCatSyncSession /> : null}
        <ProProbe />
      </RevenueCatProvider>
    )
  }

  it("keeps Pro on the next offline launch after reconnecting while RevenueCat is unreachable", async () => {
    mockProfile = { status: "offline", retry: jest.fn() }
    const session = render(app(true))
    await waitFor(() => expect(isCountPro).toBe(true))

    mockProfile = {
      status: "ready",
      profile: { userId: "user_123", displayName: "Player" },
      retry: jest.fn(),
    }
    session.rerender(app(true))
    await waitFor(() => expect(purchasesMock.getCustomerInfo).toHaveBeenCalledTimes(2))
    session.unmount()

    isCountPro = false
    render(app(false))
    await waitFor(() => expect(isCountPro).toBe(true))
  })
})

describe("hasFoil", () => {
  function entitledTo(productIdentifier: string, verification = "VERIFIED") {
    return {
      entitlements: {
        active: { "Count Pro": { identifier: "Count Pro", productIdentifier, verification } },
        all: {},
        verification: "VERIFIED",
      },
      requestDate: "2026-09-27T06:08:26Z",
    } as never
  }

  it("tells Foil supporters apart from Pro subscribers by product", () => {
    expect(hasFoil(entitledTo("foil_yearly"))).toBe(true)
    expect(hasFoil(entitledTo("yearly"))).toBe(false)
    expect(hasFoil(entitledTo("foil_yearly", "FAILED"))).toBe(false)
    expect(hasFoil(expiredCustomerInfo)).toBe(false)
  })
})

describe("renewsYearly", () => {
  const renewing = (productIdentifier: string, willRenew = true) =>
    ({ entitlements: { active: { "Count Pro": { productIdentifier, willRenew } } } }) as never

  it("matches yearly plans across store id formats, only while they renew", () => {
    expect(renewsYearly(renewing("yearly"))).toBe(true)
    expect(renewsYearly(renewing("yearly:annual"))).toBe(true)
    expect(renewsYearly(renewing("foil_yearly"))).toBe(true)
    expect(renewsYearly(renewing("monthly"))).toBe(false)
    expect(renewsYearly(renewing("yearly", false))).toBe(false)
    expect(renewsYearly(null)).toBe(false)
  })
})

describe("proSubscriptionManagement", () => {
  const withPro = (store: string, managementURL: string | null = null) =>
    ({
      entitlements: { active: { "Count Pro": { store, productIdentifier: "foil_yearly" } } },
      subscriptionsByProductIdentifier: { foil_yearly: { managementURL } },
    }) as never

  it.each([
    ["APP_STORE", { store: "app_store" }],
    ["PLAY_STORE", { store: "play_store" }],
    ["STRIPE", { store: "unknown" }],
    ["PROMOTIONAL", { store: "unknown" }],
  ] as const)("maps %s to where it is cancelled", (store, management) => {
    expect(proSubscriptionManagement(withPro(store))).toEqual(management)
  })

  it("links a Web Billing subscription to its customer portal", () => {
    expect(
      proSubscriptionManagement(withPro("RC_BILLING", "https://billing.revenuecat.com/m/1")),
    ).toEqual({ store: "web", url: "https://billing.revenuecat.com/m/1" })
    expect(proSubscriptionManagement(withPro("RC_BILLING", "javascript:alert(1)"))).toEqual({
      store: "web",
      url: undefined,
    })
  })

  it("does not know the store before billing loads or without Pro", () => {
    expect(proSubscriptionManagement(null)).toEqual({ store: "unknown" })
    expect(proSubscriptionManagement(expiredCustomerInfo)).toEqual({ store: "unknown" })
  })
})
