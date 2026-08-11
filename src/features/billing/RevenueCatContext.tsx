import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react"
import Purchases, {
  PURCHASES_ERROR_CODE,
  type CustomerInfo,
  type CustomerInfoUpdateListener,
  type PurchasesError,
  type PurchasesOffering,
  type PurchasesPackage,
} from "react-native-purchases"

import { COUNT_PRODUCT_IDS, COUNT_PRO_ENTITLEMENT_ID, type CountProductId } from "./config"
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
  configurationMessage?: string
  isLoading: boolean
  isCountPro: boolean
  customerInfo: CustomerInfo | null
  currentOffering: PurchasesOffering | null
  error?: string
  refreshCustomerInfo: () => Promise<CustomerInfo | null>
  purchase: (productId: CountProductId) => Promise<PurchaseResult>
  restorePurchases: () => Promise<PurchaseResult>
  presentPaywall: () => Promise<CountPaywallResult>
  presentCustomerCenter: () => Promise<void>
}

const unavailable = async () => null
const RevenueCatContext = createContext<RevenueCatAccess>({
  configured: false,
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
      return "This Count Pro option is not available from the current store."
    case PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR:
      return "The store is still processing this purchase. Access will update when it completes."
    case PURCHASES_ERROR_CODE.CONFIGURATION_ERROR:
    case PURCHASES_ERROR_CODE.INVALID_CREDENTIALS_ERROR:
      return "Count Pro is not configured correctly for this build."
    default:
      return error.message || "The purchase could not be completed."
  }
}

export function hasCountPro(customerInfo: CustomerInfo | null) {
  const entitlement = customerInfo?.entitlements.active[COUNT_PRO_ENTITLEMENT_ID]
  return Boolean(entitlement && entitlement.verification !== "FAILED")
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
  return (
    offering?.availablePackages.find((candidate) => candidate.product.identifier === productId) ??
    null
  )
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
  const configured = Boolean(apiKey)

  const refreshCustomerInfo = useCallback(async () => {
    if (!apiKey || !appUserID) return null
    try {
      const next = await Purchases.getCustomerInfo()
      setCustomerInfo(next)
      setError(undefined)
      return next
    } catch (cause) {
      setError(revenueCatErrorMessage(cause))
      return null
    }
  }, [apiKey, appUserID])

  useEffect(() => {
    if (!apiKey || !appUserID) {
      setCustomerInfo(null)
      setCurrentOffering(null)
      setIsLoading(false)
      return
    }

    let cancelled = false
    const listener: CustomerInfoUpdateListener = (next) => {
      if (!cancelled) setCustomerInfo(next)
    }
    setIsLoading(true)
    setError(undefined)

    void configureForUser(apiKey, appUserID)
      .then(async () => {
        if (cancelled) return
        Purchases.addCustomerInfoUpdateListener(listener)
        const [nextCustomerInfo, offerings] = await Promise.all([
          Purchases.getCustomerInfo(),
          Purchases.getOfferings(),
        ])
        if (!cancelled) {
          setCustomerInfo(nextCustomerInfo)
          setCurrentOffering(offerings.current)
        }
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
  }, [apiKey, appUserID])

  const purchase = useCallback(
    async (productId: CountProductId): Promise<PurchaseResult> => {
      const selectedPackage: PurchasesPackage | null = packageForProduct(currentOffering, productId)
      if (!selectedPackage) {
        const message = `${productId} is missing from the current RevenueCat offering.`
        setError(message)
        return { status: "failed", message }
      }
      try {
        setError(undefined)
        const result = await Purchases.purchasePackage(selectedPackage)
        setCustomerInfo(result.customerInfo)
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
    [currentOffering],
  )

  const restorePurchases = useCallback(async (): Promise<PurchaseResult> => {
    try {
      setError(undefined)
      const restored = await Purchases.restorePurchases()
      setCustomerInfo(restored)
      return { status: "purchased", customerInfo: restored }
    } catch (cause) {
      const message = revenueCatErrorMessage(cause)
      setError(message)
      return { status: "failed", message }
    }
  }, [])

  const presentPaywall = useCallback(async () => {
    try {
      setError(undefined)
      const result = await presentCountProPaywall(currentOffering)
      if (result === "error") setError("The Count Pro paywall could not complete the request.")
      if (result === "purchased" || result === "restored") await refreshCustomerInfo()
      return result
    } catch (cause) {
      setError(revenueCatErrorMessage(cause))
      return "error" as const
    }
  }, [currentOffering, refreshCustomerInfo])

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

export function useCountPro() {
  const { isCountPro, isLoading, customerInfo, error } = useRevenueCat()
  return { isCountPro, isLoading, customerInfo, error }
}

export const COUNT_PRO_PRODUCTS = Object.values(COUNT_PRODUCT_IDS)
