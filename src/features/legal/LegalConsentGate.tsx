import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react"
import { Platform } from "react-native"
import { router, usePathname } from "expo-router"
import { useMutation, useQuery } from "convex/react"

import { CONSENT_DOCUMENT_IDS, type ConsentDocumentId } from "@/content/legal"
import { termsContent } from "@/content/terms"
import { useAuthAccess } from "@/features/auth/AuthContext"
import { LegalConsentScreen } from "@/screens/LegalConsentScreen"

import {
  accountAcceptanceCache,
  type AcceptedVersions,
  deviceAcceptanceStore,
  missingConsent,
} from "./acceptanceStore"
import { REQUIRED_CONSENT_VERSIONS } from "./consent"
import { api } from "../../../convex/_generated/api"

const READABLE_WHILE_GATED = new Set(["/terms", "/privacy", "/cookie-policy"])

export const ACCOUNT_CONSENT_TIMEOUT_MS = 4000
export const AUTH_LOAD_TIMEOUT_MS = 4000

interface GateProps {
  children: ReactNode
  onResolved?: () => void
}

export function LegalConsentGate({ children, onResolved }: GateProps) {
  const auth = useAuthAccess()
  const pathname = usePathname()
  const readingDocument = READABLE_WHILE_GATED.has(pathname)
  const isLoadingAuth = auth.configured && !auth.isLoaded && !readingDocument
  const [authUnreachable, setAuthUnreachable] = useState(false)

  useEffect(() => {
    if (readingDocument) onResolved?.()
  }, [readingDocument, onResolved])

  // Clerk reports isLoaded only once it has reached its backend, so an offline
  // or misconfigured instance would otherwise hold the splash screen forever.
  useEffect(() => {
    if (!isLoadingAuth) return
    const timer = setTimeout(() => setAuthUnreachable(true), AUTH_LOAD_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [isLoadingAuth])

  if (readingDocument) return <>{children}</>
  if (isLoadingAuth && !authUnreachable) return null
  if (auth.configured && auth.isSignedIn)
    return (
      <SignedInConsentGate userId={auth.userId} onResolved={onResolved}>
        {children}
      </SignedInConsentGate>
    )
  return <DeviceConsentGate onResolved={onResolved}>{children}</DeviceConsentGate>
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

function SignedInConsentGate({ children, userId, onResolved }: GateProps & { userId?: string }) {
  const recordAcceptance = useMutation(api.legal.recordAcceptance)
  const accountAcceptances = useQuery(api.legal.currentAcceptances, {})
  const [cached, setCached] = useState<AcceptedVersions>(() =>
    userId ? accountAcceptanceCache.read(userId) : {},
  )
  const [deviceAccepted, setDeviceAccepted] = useState<AcceptedVersions>(() =>
    deviceAcceptanceStore.read(),
  )
  const [accountUnreachable, setAccountUnreachable] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string>()

  const cacheSaysAccepted = missingConsent(REQUIRED_CONSENT_VERSIONS, cached).length === 0
  const isLoadingAccount =
    accountAcceptances === undefined && !accountUnreachable && !cacheSaysAccepted

  useEffect(() => {
    if (accountAcceptances !== undefined || cacheSaysAccepted) return
    const timer = setTimeout(() => setAccountUnreachable(true), ACCOUNT_CONSENT_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [accountAcceptances, cacheSaysAccepted])

  useEffect(() => {
    if (!isLoadingAccount) onResolved?.()
  }, [isLoadingAccount, onResolved])

  const fromServer = useMemo<AcceptedVersions | undefined>(() => {
    if (accountAcceptances === undefined) return undefined
    const map: AcceptedVersions = {}
    for (const entry of accountAcceptances ?? []) map[entry.document] = entry.version
    return map
  }, [accountAcceptances])

  useEffect(() => {
    if (!userId || !fromServer) return
    accountAcceptanceCache.write(userId, fromServer)
    setCached(fromServer)
  }, [fromServer, userId])

  const accepted =
    fromServer ??
    acceptedWithoutBackendAnswer({ cacheSaysAccepted, cached, accountUnreachable, deviceAccepted })
  const outstanding = useMemo(() => missingConsent(REQUIRED_CONSENT_VERSIONS, accepted), [accepted])

  const accept = useCallback(async () => {
    setIsSubmitting(true)
    setError(undefined)
    try {
      for (const document of CONSENT_DOCUMENT_IDS)
        await recordAcceptance({
          document,
          version: REQUIRED_CONSENT_VERSIONS[document],
          platform: Platform.OS,
        })
      deviceAcceptanceStore.write(REQUIRED_CONSENT_VERSIONS)
      if (userId) accountAcceptanceCache.write(userId, REQUIRED_CONSENT_VERSIONS)
      setCached(REQUIRED_CONSENT_VERSIONS)
      setDeviceAccepted(REQUIRED_CONSENT_VERSIONS)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save your response")
    } finally {
      setIsSubmitting(false)
    }
  }, [recordAcceptance, userId])

  if (isLoadingAccount) return null
  if (outstanding.length === 0) return <>{children}</>
  return (
    <ConsentPrompt
      hasPriorAcceptance={hasPriorAcceptance(accepted)}
      isSubmitting={isSubmitting}
      error={error}
      onAccept={() => void accept()}
    />
  )
}

function ConsentPrompt({
  hasPriorAcceptance,
  isSubmitting,
  error,
  onAccept,
}: {
  hasPriorAcceptance: boolean
  isSubmitting?: boolean
  error?: string
  onAccept: () => void
}) {
  return (
    <LegalConsentScreen
      effectiveDate={termsContent.effectiveDate}
      isReturningUser={hasPriorAcceptance}
      isSubmitting={isSubmitting}
      error={error}
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
