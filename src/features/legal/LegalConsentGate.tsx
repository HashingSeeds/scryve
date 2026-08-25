import {
  type Dispatch,
  type ReactNode,
  type SetStateAction,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { Platform } from "react-native"
import { router, usePathname } from "expo-router"
import { useConvexAuth, useMutation, useQuery } from "convex/react"

import { CONSENT_DOCUMENT_IDS, type ConsentDocumentId } from "@/content/legal"
import { termsContent } from "@/content/terms"
import { useAuthAccess } from "@/features/auth/AuthContext"
import { LaunchFallback } from "@/features/launch/LaunchFallback"
import { LegalConsentScreen } from "@/screens/LegalConsentScreen"

import {
  accountAcceptanceCache,
  accountConsentSyncStore,
  type AcceptedVersions,
  deviceAcceptanceStore,
  missingConsent,
} from "./acceptanceStore"
import { AccountConsentSyncStatus } from "./AccountConsentSyncStatus"
import { REQUIRED_CONSENT_VERSIONS } from "./consent"
import { api } from "../../../convex/_generated/api"

const READABLE_WHILE_GATED = new Set(["/terms", "/privacy", "/cookie-policy", "/support"])

export const ACCOUNT_CONSENT_TIMEOUT_MS = 4000
export const AUTH_LOAD_TIMEOUT_MS = 4000

interface GateProps {
  children: ReactNode
  onResolved?: () => void
  behindSplashScreen?: boolean
}

export function LegalConsentGate({ children, onResolved }: GateProps) {
  const [hasDecidedOnce, setHasDecidedOnce] = useState(false)
  const resolve = useCallback(() => {
    setHasDecidedOnce(true)
    onResolved?.()
  }, [onResolved])
  const behindSplashScreen = !hasDecidedOnce
  const auth = useAuthAccess()
  const pathname = usePathname()
  const readingDocument = READABLE_WHILE_GATED.has(pathname)
  const isLoadingAuth = auth.configured && !auth.isLoaded && !readingDocument
  const deviceConsentIsCurrent =
    missingConsent(REQUIRED_CONSENT_VERSIONS, deviceAcceptanceStore.read()).length === 0
  const [authUnreachable, setAuthUnreachable] = useState(false)

  useEffect(() => {
    if (readingDocument) resolve()
  }, [readingDocument, resolve])

  useEffect(() => {
    if (isLoadingAuth && deviceConsentIsCurrent) resolve()
  }, [deviceConsentIsCurrent, isLoadingAuth, resolve])

  // Clerk reports isLoaded only once it has reached its backend, so an offline
  // or misconfigured instance would otherwise hold the splash screen forever.
  useEffect(() => {
    if (!isLoadingAuth) return
    const timer = setTimeout(() => setAuthUnreachable(true), AUTH_LOAD_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [isLoadingAuth])

  if (readingDocument) return <>{children}</>
  if (isLoadingAuth && !authUnreachable)
    return deviceConsentIsCurrent || !behindSplashScreen ? <>{children}</> : <LaunchFallback />
  if (auth.configured && auth.isSignedIn)
    return (
      <SignedInConsentGate
        userId={auth.userId}
        onResolved={resolve}
        behindSplashScreen={behindSplashScreen}
      >
        {children}
      </SignedInConsentGate>
    )
  return <DeviceConsentGate onResolved={resolve}>{children}</DeviceConsentGate>
}

function DeviceConsentGate({ children, onResolved }: GateProps) {
  const [accepted, setAccepted] = useState<AcceptedVersions>(() => deviceAcceptanceStore.read())
  const outstanding = useMemo(() => missingConsent(REQUIRED_CONSENT_VERSIONS, accepted), [accepted])

  useEffect(() => onResolved?.(), [onResolved])

  const accept = useCallback(() => {
    deviceAcceptanceStore.write(REQUIRED_CONSENT_VERSIONS)
    setAccepted(REQUIRED_CONSENT_VERSIONS)
  }, [])

  if (outstanding.length === 0) return <>{children}</>
  return <ConsentPrompt hasPriorAcceptance={hasPriorAcceptance(accepted)} onAccept={accept} />
}

function useCachedAcceptancesForUser(
  userId: string | undefined,
): [AcceptedVersions, Dispatch<SetStateAction<AcceptedVersions>>] {
  const [cached, setCached] = useState<AcceptedVersions>(() =>
    userId ? accountAcceptanceCache.read(userId) : {},
  )
  const [readForUserId, setReadForUserId] = useState(userId)

  if (userId !== readForUserId) {
    setReadForUserId(userId)
    setCached(userId ? accountAcceptanceCache.read(userId) : {})
  }

  return [cached, setCached]
}

function usePendingConsentForUser(
  userId: string | undefined,
): [AcceptedVersions, Dispatch<SetStateAction<AcceptedVersions>>] {
  const [pending, setPending] = useState<AcceptedVersions>(() =>
    userId ? accountConsentSyncStore.read(userId) : {},
  )
  const [readForUserId, setReadForUserId] = useState(userId)

  if (userId !== readForUserId) {
    setReadForUserId(userId)
    setPending(userId ? accountConsentSyncStore.read(userId) : {})
  }

  return [pending, setPending]
}

function accountCanInheritDeviceAcceptance(
  userId: string | undefined,
  deviceAccepted: AcceptedVersions,
): boolean {
  if (missingConsent(REQUIRED_CONSENT_VERSIONS, deviceAccepted).length > 0) return false
  return !accountAcceptanceCache.hasAccountsOtherThan(userId)
}

function SignedInConsentGate({
  children,
  userId,
  onResolved,
  behindSplashScreen,
}: GateProps & { userId?: string }) {
  const recordAcceptance = useMutation(api.legal.recordAcceptance)
  const accountAcceptances = useQuery(api.legal.currentAcceptances, {})
  const { isAuthenticated: backendReady } = useConvexAuth()
  const [cached, setCached] = useCachedAcceptancesForUser(userId)
  const [pendingSync, setPendingSync] = usePendingConsentForUser(userId)
  const [deviceAccepted, setDeviceAccepted] = useState<AcceptedVersions>(() =>
    deviceAcceptanceStore.read(),
  )
  const [accountUnreachable, setAccountUnreachable] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSyncingAcceptance, setIsSyncingAcceptance] = useState(false)
  const [retryFailed, setRetryFailed] = useState(false)
  const [recentlySyncedUserId, setRecentlySyncedUserId] = useState<string>()
  const currentUserId = useRef(userId)
  const syncAttemptedUserIds = useRef(new Set<string>())

  const cacheSaysAccepted = missingConsent(REQUIRED_CONSENT_VERSIONS, cached).length === 0
  const pendingSyncIsCurrent =
    Boolean(userId) && missingConsent(REQUIRED_CONSENT_VERSIONS, pendingSync).length === 0
  const recentlySyncedCurrentUser = Boolean(userId && recentlySyncedUserId === userId)
  const inheritsDeviceAcceptance = useMemo(
    () => accountCanInheritDeviceAcceptance(userId, deviceAccepted),
    [deviceAccepted, userId],
  )
  const backendAnswered = backendReady && accountAcceptances !== undefined
  const isLoadingAccount =
    !backendAnswered &&
    !accountUnreachable &&
    !cacheSaysAccepted &&
    !pendingSyncIsCurrent &&
    !inheritsDeviceAcceptance

  useEffect(() => {
    currentUserId.current = userId
  }, [userId])

  useEffect(() => {
    if (backendAnswered || cacheSaysAccepted || pendingSyncIsCurrent || inheritsDeviceAcceptance)
      return
    const timer = setTimeout(() => setAccountUnreachable(true), ACCOUNT_CONSENT_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [backendAnswered, cacheSaysAccepted, inheritsDeviceAcceptance, pendingSyncIsCurrent])

  useEffect(() => {
    if (!isLoadingAccount) onResolved?.()
  }, [isLoadingAccount, onResolved])

  const fromServer = useMemo<AcceptedVersions | undefined>(() => {
    if (!backendAnswered) return undefined
    const map: AcceptedVersions = {}
    for (const entry of accountAcceptances ?? []) map[entry.document] = entry.version
    return map
  }, [accountAcceptances, backendAnswered])

  const serverAcceptanceIsCurrent =
    Boolean(fromServer) && missingConsent(REQUIRED_CONSENT_VERSIONS, fromServer ?? {}).length === 0

  useEffect(() => {
    if (!userId || !fromServer) return
    if ((pendingSyncIsCurrent || recentlySyncedCurrentUser) && !serverAcceptanceIsCurrent) return
    accountAcceptanceCache.write(userId, fromServer)
    setCached(fromServer)
    if (serverAcceptanceIsCurrent && pendingSyncIsCurrent) {
      accountConsentSyncStore.clear(userId)
      setPendingSync({})
    }
    if (serverAcceptanceIsCurrent && recentlySyncedCurrentUser) setRecentlySyncedUserId(undefined)
  }, [
    fromServer,
    pendingSyncIsCurrent,
    recentlySyncedCurrentUser,
    serverAcceptanceIsCurrent,
    setCached,
    setPendingSync,
    userId,
  ])

  const sendAcceptance = useCallback(async () => {
    for (const document of CONSENT_DOCUMENT_IDS)
      await recordAcceptance({
        document,
        version: REQUIRED_CONSENT_VERSIONS[document],
        platform: Platform.OS,
      })
  }, [recordAcceptance])

  const trustsLocalAcceptance =
    inheritsDeviceAcceptance || pendingSyncIsCurrent || recentlySyncedCurrentUser
  const accepted = trustsLocalAcceptance
    ? REQUIRED_CONSENT_VERSIONS
    : (fromServer ??
      acceptedWithoutBackendAnswer({
        cacheSaysAccepted,
        cached,
        accountUnreachable,
        deviceAccepted,
      }))
  const outstanding = useMemo(() => missingConsent(REQUIRED_CONSENT_VERSIONS, accepted), [accepted])

  const keepAcceptanceOnThisDevice = useCallback(() => {
    deviceAcceptanceStore.write(REQUIRED_CONSENT_VERSIONS)
    if (userId) accountAcceptanceCache.write(userId, REQUIRED_CONSENT_VERSIONS)
    setCached(REQUIRED_CONSENT_VERSIONS)
    setDeviceAccepted(REQUIRED_CONSENT_VERSIONS)
  }, [setCached, userId])

  const markAcceptancePending = useCallback(() => {
    if (!userId) return
    accountConsentSyncStore.write(userId, REQUIRED_CONSENT_VERSIONS)
    setPendingSync(REQUIRED_CONSENT_VERSIONS)
  }, [setPendingSync, userId])

  const syncAcceptance = useCallback(async () => {
    if (!backendReady) throw new Error("The account backend is not authenticated yet")
    const syncingUserId = userId
    if (syncingUserId) syncAttemptedUserIds.current.add(syncingUserId)
    await sendAcceptance()
    if (!syncingUserId) return
    accountConsentSyncStore.clear(syncingUserId)
    if (currentUserId.current !== syncingUserId) return
    setPendingSync({})
    setRecentlySyncedUserId(syncingUserId)
  }, [backendReady, sendAcceptance, setPendingSync, userId])

  const accept = useCallback(async () => {
    setIsSubmitting(true)
    setRetryFailed(false)
    keepAcceptanceOnThisDevice()
    markAcceptancePending()
    try {
      await syncAcceptance()
    } catch {
      return
    } finally {
      setIsSubmitting(false)
    }
  }, [keepAcceptanceOnThisDevice, markAcceptancePending, syncAcceptance])

  useEffect(() => {
    if (!inheritsDeviceAcceptance || cacheSaysAccepted || pendingSyncIsCurrent || !backendReady)
      return
    keepAcceptanceOnThisDevice()
    markAcceptancePending()
    void syncAcceptance().catch(() => undefined)
  }, [
    backendReady,
    cacheSaysAccepted,
    inheritsDeviceAcceptance,
    keepAcceptanceOnThisDevice,
    markAcceptancePending,
    pendingSyncIsCurrent,
    syncAcceptance,
  ])

  useEffect(() => {
    if (!backendReady) {
      syncAttemptedUserIds.current.clear()
      return
    }
    if (
      !userId ||
      !pendingSyncIsCurrent ||
      serverAcceptanceIsCurrent ||
      syncAttemptedUserIds.current.has(userId)
    )
      return
    let cancelled = false
    setIsSyncingAcceptance(true)
    void syncAcceptance()
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setIsSyncingAcceptance(false)
      })
    return () => {
      cancelled = true
    }
  }, [backendReady, pendingSyncIsCurrent, serverAcceptanceIsCurrent, syncAcceptance, userId])

  const retryAcceptance = useCallback(async () => {
    setIsSyncingAcceptance(true)
    setRetryFailed(false)
    try {
      await syncAcceptance()
    } catch {
      setRetryFailed(true)
    } finally {
      setIsSyncingAcceptance(false)
    }
  }, [syncAcceptance])

  if (isLoadingAccount) return behindSplashScreen ? <LaunchFallback /> : <>{children}</>
  if (outstanding.length === 0)
    return (
      <>
        {pendingSyncIsCurrent ? (
          <AccountConsentSyncStatus
            isSyncing={isSyncingAcceptance}
            retryFailed={retryFailed}
            onRetry={() => void retryAcceptance()}
          />
        ) : null}
        {children}
      </>
    )
  return (
    <ConsentPrompt
      hasPriorAcceptance={hasPriorAcceptance(accepted)}
      isSubmitting={isSubmitting}
      onAccept={() => void accept()}
    />
  )
}

function ConsentPrompt({
  hasPriorAcceptance,
  isSubmitting,
  onAccept,
}: {
  hasPriorAcceptance: boolean
  isSubmitting?: boolean
  onAccept: () => void
}) {
  return (
    <LegalConsentScreen
      effectiveDate={termsContent.effectiveDate}
      isReturningUser={hasPriorAcceptance}
      isSubmitting={isSubmitting}
      onAccept={onAccept}
      onOpenTerms={() => router.push("/terms")}
      onOpenPrivacy={() => router.push("/privacy")}
    />
  )
}

function acceptedWithoutBackendAnswer({
  cacheSaysAccepted,
  cached,
  accountUnreachable,
  deviceAccepted,
}: {
  cacheSaysAccepted: boolean
  cached: AcceptedVersions
  accountUnreachable: boolean
  deviceAccepted: AcceptedVersions
}) {
  if (cacheSaysAccepted) return cached
  if (accountUnreachable) return deviceAccepted
  return cached
}

function hasPriorAcceptance(accepted: AcceptedVersions) {
  return CONSENT_DOCUMENT_IDS.some((id: ConsentDocumentId) => Boolean(accepted[id]))
}
