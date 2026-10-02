import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import { Platform } from "react-native"
import Purchases, {
  PURCHASES_ERROR_CODE,
  type CustomerInfo,
  type CustomerInfoUpdateListener,
  type PurchasesError,
  type PurchasesOffering,
  type PurchasesPackage,
} from "react-native-purchases"

import {
  COUNT_PACKAGE_IDS,
  COUNT_PRO_ENTITLEMENT_ID,
  FOIL_PRODUCT_ID,
  FOIL_SUPPORTER_OFFERING_ID,
  type CountProductId,
} from "./config"
import {
  presentCountCustomerCenter,
  presentCountProPaywall,
  type CountPaywallResult,
} from "./revenueCatUi"

export type PurchaseResult =
  | { status: "purchased"; customerInfo: CustomerInfo }
  | { status: "cancelled" }
  | { status: "failed"; message: string }

interface RevenueCatAccess {
  configured: boolean
  isReady: boolean
  configurationMessage?: string
  isLoading: boolean
  isCountPro: boolean
  customerInfo: CustomerInfo | null
  currentOffering: PurchasesOffering | null
  error?: string
  refreshCustomerInfo: (force?: boolean) => Promise<CustomerInfo | null>
  purchase: (productId: CountProductId | typeof FOIL_PRODUCT_ID) => Promise<PurchaseResult>
  restorePurchases: () => Promise<PurchaseResult>
  presentPaywall: () => Promise<CountPaywallResult>
  presentCustomerCenter: () => Promise<void>
}

const unavailable = async () => null
const RevenueCatContext = createContext<RevenueCatAccess>({
  configured: false,
  isReady: false,
  isLoading: false,
  isCountPro: false,
  customerInfo: null,
  currentOffering: null,
  refreshCustomerInfo: unavailable,
  purchase: async () => ({ status: "failed", message: "RevenueCat is not configured." }),
  restorePurchases: async () => ({
    status: "failed",
    message: "RevenueCat is not configured.",
  }),
  presentPaywall: async () => "error",
  presentCustomerCenter: async () => undefined,
})

function purchasesError(cause: unknown): PurchasesError | null {
  if (typeof cause !== "object" || cause === null) return null
  const candidate = cause as Partial<PurchasesError>
  return typeof candidate.code === "string" && typeof candidate.message === "string"
    ? (candidate as PurchasesError)
    : null
}

export function revenueCatErrorMessage(cause: unknown) {
  const error = purchasesError(cause)
  if (!error)
    return cause instanceof Error ? cause.message : "An unexpected purchase error occurred."
  switch (error.code) {
    case PURCHASES_ERROR_CODE.NETWORK_ERROR:
    case PURCHASES_ERROR_CODE.OFFLINE_CONNECTION_ERROR:
      return "Connect to the internet and try again."
    case PURCHASES_ERROR_CODE.PURCHASE_NOT_ALLOWED_ERROR:
      return "Purchases are not allowed on this device or store account."
    case PURCHASES_ERROR_CODE.PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR:
      return "This Scryve Pro option is not available from the current store."
    case PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR:
      return "The store is still processing this purchase. Access will update when it completes."
    case PURCHASES_ERROR_CODE.CONFIGURATION_ERROR:
    case PURCHASES_ERROR_CODE.INVALID_CREDENTIALS_ERROR:
      return "Scryve Pro is not configured correctly for this build."
    default:
      return error.message || "The purchase could not be completed."
  }
}

export function hasCountPro(customerInfo: CustomerInfo | null) {
  const entitlement = customerInfo?.entitlements.active[COUNT_PRO_ENTITLEMENT_ID]
  return Boolean(entitlement && entitlement.verification !== "FAILED")
}

function mostRecentlyFetchedCustomerInfo(current: CustomerInfo | null, next: CustomerInfo) {
  return current && Date.parse(current.requestDate) > Date.parse(next.requestDate) ? current : next
}

async function configureForUser(apiKey: string, appUserID: string) {
  const configured = await Purchases.isConfigured()
  if (!configured) {
    if (__DEV__) await Purchases.setLogLevel(Purchases.LOG_LEVEL.DEBUG)
    Purchases.configure({
      apiKey,
      appUserID,
      entitlementVerificationMode: Purchases.ENTITLEMENT_VERIFICATION_MODE.INFORMATIONAL,
    })
    return
  }

  const currentUserId = await Purchases.getAppUserID()
  if (currentUserId !== appUserID) await Purchases.logIn(appUserID)
}

function packageForProduct(offering: PurchasesOffering | null, productId: CountProductId) {
  const packageId = COUNT_PACKAGE_IDS[productId]
  return offering?.availablePackages.find((candidate) => candidate.identifier === packageId) ?? null
}

export function RevenueCatProvider({
  apiKey,
  appUserID,
  configurationMessage,
  children,
}: {
  apiKey?: string
  appUserID?: string
  configurationMessage?: string
  children: ReactNode
}) {
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null)
  const [currentOffering, setCurrentOffering] = useState<PurchasesOffering | null>(null)
  const [isLoading, setIsLoading] = useState(Boolean(apiKey && appUserID))
  const [error, setError] = useState<string>()
  const [configuredUserId, setConfiguredUserId] = useState<string>()
  const configured = Boolean(apiKey)
  const isReady = Boolean(apiKey && appUserID && configuredUserId === appUserID)
  const acceptCustomerInfo = useCallback((next: CustomerInfo) => {
    setCustomerInfo((current) => mostRecentlyFetchedCustomerInfo(current, next))
  }, [])

  const refreshCustomerInfo = useCallback(
    async (force = false) => {
      if (!apiKey || !appUserID) return null
      try {
        if (force && Platform.OS !== "web") await Purchases.invalidateCustomerInfoCache()
        const next = await Purchases.getCustomerInfo()
        acceptCustomerInfo(next)
        setError(undefined)
        return next
      } catch (cause) {
        setError(revenueCatErrorMessage(cause))
        return null
      }
    },
    [acceptCustomerInfo, apiKey, appUserID],
  )

  useEffect(() => {
    setConfiguredUserId(undefined)
    if (!apiKey || !appUserID) {
      setCustomerInfo(null)
      setCurrentOffering(null)
      setIsLoading(false)
      return
    }

    let cancelled = false
    setCustomerInfo(null)
    const listener: CustomerInfoUpdateListener = (next) => {
      if (!cancelled) acceptCustomerInfo(next)
    }
    setIsLoading(true)
    setError(undefined)

    void configureForUser(apiKey, appUserID)
      .then(async () => {
        if (cancelled) return
        setConfiguredUserId(appUserID)
        Purchases.addCustomerInfoUpdateListener(listener)
        const [, offerings] = await Promise.all([
          Purchases.getCustomerInfo().then((next) => {
            if (!cancelled) acceptCustomerInfo(next)
          }),
          Purchases.getOfferings(),
        ])
        if (!cancelled) setCurrentOffering(offerings.current)
      })
      .catch((cause) => {
        if (!cancelled) setError(revenueCatErrorMessage(cause))
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
      Purchases.removeCustomerInfoUpdateListener(listener)
    }
  }, [acceptCustomerInfo, apiKey, appUserID])

  const purchase = useCallback(
    async (productId: CountProductId | typeof FOIL_PRODUCT_ID): Promise<PurchaseResult> => {
      try {
        setError(undefined)
        if (!isReady || (await Purchases.getAppUserID()) !== appUserID)
          throw new Error("Wait for billing to connect to your account, then try again.")
        if (productId === FOIL_PRODUCT_ID) {
          if (Platform.OS !== "web")
            throw new Error("Foil purchases are only available on the web.")
          if (hasCountPro(await Purchases.getCustomerInfo()))
            throw new Error("Manage your existing subscription before switching to Foil.")
        }
        const selectedPackage: PurchasesPackage | null | undefined =
          productId === FOIL_PRODUCT_ID
            ? (await Purchases.getOfferings()).all[
                FOIL_SUPPORTER_OFFERING_ID
              ]?.availablePackages.find((candidate) => candidate.identifier === FOIL_PRODUCT_ID)
            : packageForProduct(currentOffering, productId)
        if (!selectedPackage)
          throw new Error(`${productId} is not available from the current store.`)
        const result = await Purchases.purchasePackage(selectedPackage)
        acceptCustomerInfo(result.customerInfo)
        return { status: "purchased", customerInfo: result.customerInfo }
      } catch (cause) {
        const error = purchasesError(cause)
        if (error?.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR)
          return { status: "cancelled" }
        const message = revenueCatErrorMessage(cause)
        setError(message)
        return { status: "failed", message }
      }
    },
    [acceptCustomerInfo, appUserID, currentOffering, isReady],
  )

  const restorePurchases = useCallback(async (): Promise<PurchaseResult> => {
    try {
      setError(undefined)
      const restored = await Purchases.restorePurchases()
      acceptCustomerInfo(restored)
      return { status: "purchased", customerInfo: restored }
    } catch (cause) {
      const message = revenueCatErrorMessage(cause)
      setError(message)
      return { status: "failed", message }
    }
  }, [acceptCustomerInfo])

  const presentPaywall = useCallback(async () => {
    try {
      setError(undefined)
      if (!isReady || (await Purchases.getAppUserID()) !== appUserID)
        throw new Error("Wait for billing to connect to your account, then try again.")
      const result = await presentCountProPaywall(currentOffering)
      if (result === "error") setError("The Scryve Pro paywall could not complete the request.")
      if (result === "purchased" || result === "restored") await refreshCustomerInfo()
      return result
    } catch (cause) {
      setError(revenueCatErrorMessage(cause))
      return "error" as const
    }
  }, [appUserID, currentOffering, isReady, refreshCustomerInfo])

  const presentCustomerCenter = useCallback(async () => {
    try {
      setError(undefined)
      await presentCountCustomerCenter(customerInfo)
      await refreshCustomerInfo()
    } catch (cause) {
      setError(revenueCatErrorMessage(cause))
    }
  }, [customerInfo, refreshCustomerInfo])

  const value = useMemo<RevenueCatAccess>(
    () => ({
      configured,
      isReady,
      configurationMessage,
      isLoading,
      isCountPro: hasCountPro(customerInfo),
      customerInfo,
      currentOffering,
      error,
      refreshCustomerInfo,
      purchase,
      restorePurchases,
      presentPaywall,
      presentCustomerCenter,
    }),
    [
      configured,
      configurationMessage,
      customerInfo,
      currentOffering,
      error,
      isLoading,
      isReady,
      presentCustomerCenter,
      presentPaywall,
      purchase,
      refreshCustomerInfo,
      restorePurchases,
    ],
  )

  return <RevenueCatContext.Provider value={value}>{children}</RevenueCatContext.Provider>
}

export function useRevenueCat() {
  return useContext(RevenueCatContext)
}
