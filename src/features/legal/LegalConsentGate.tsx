import { type ReactNode, useCallback, useMemo, useState } from "react"
import { Platform } from "react-native"
import { router, usePathname } from "expo-router"
import { useMutation, useQuery } from "convex/react"

import { CONSENT_DOCUMENT_IDS, type ConsentDocumentId } from "@/content/legal"
import { termsContent } from "@/content/terms"
import { useAuthAccess } from "@/features/auth/AuthContext"
import { LegalConsentScreen } from "@/screens/LegalConsentScreen"

import { type AcceptedVersions, deviceAcceptanceStore, missingConsent } from "./acceptanceStore"
import { REQUIRED_CONSENT_VERSIONS } from "./consent"
import { api } from "../../../convex/_generated/api"

const READABLE_WHILE_GATED = new Set(["/terms", "/privacy", "/cookie-policy"])

export function LegalConsentGate({ children }: { children: ReactNode }) {
  const auth = useAuthAccess()
  const pathname = usePathname()
  if (READABLE_WHILE_GATED.has(pathname)) return <>{children}</>
  if (auth.configured && auth.isLoaded && auth.isSignedIn)
    return <SignedInConsentGate>{children}</SignedInConsentGate>
  return <DeviceConsentGate>{children}</DeviceConsentGate>
}

function DeviceConsentGate({ children }: { children: ReactNode }) {
  const [accepted, setAccepted] = useState<AcceptedVersions>(() => deviceAcceptanceStore.read())
  const outstanding = useMemo(() => missingConsent(REQUIRED_CONSENT_VERSIONS, accepted), [accepted])

  const accept = useCallback(() => {
    deviceAcceptanceStore.write(REQUIRED_CONSENT_VERSIONS)
    setAccepted(REQUIRED_CONSENT_VERSIONS)
  }, [])

  if (outstanding.length === 0) return <>{children}</>
  return <ConsentPrompt hasPriorAcceptance={hasPriorAcceptance(accepted)} onAccept={accept} />
}

function SignedInConsentGate({ children }: { children: ReactNode }) {
  const recordAcceptance = useMutation(api.legal.recordAcceptance)
  const accountAcceptances = useQuery(api.legal.currentAcceptances, {})
  const [deviceAccepted, setDeviceAccepted] = useState<AcceptedVersions>(() =>
    deviceAcceptanceStore.read(),
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string>()

  const accountAccepted = useMemo<AcceptedVersions | undefined>(() => {
    if (accountAcceptances === undefined) return undefined
    const map: AcceptedVersions = {}
    for (const entry of accountAcceptances ?? []) map[entry.document] = entry.version
    return map
  }, [accountAcceptances])

  const outstanding = useMemo(() => {
    if (!accountAccepted) return []
    const combined = new Set([
      ...missingConsent(REQUIRED_CONSENT_VERSIONS, deviceAccepted),
      ...missingConsent(REQUIRED_CONSENT_VERSIONS, accountAccepted),
    ])
    return CONSENT_DOCUMENT_IDS.filter((id) => combined.has(id))
  }, [accountAccepted, deviceAccepted])

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
      setDeviceAccepted(REQUIRED_CONSENT_VERSIONS)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save your response")
    } finally {
      setIsSubmitting(false)
    }
  }, [recordAcceptance])

  if (accountAccepted === undefined || outstanding.length === 0) return <>{children}</>
  return (
    <ConsentPrompt
      hasPriorAcceptance={hasPriorAcceptance(deviceAccepted) || hasPriorAcceptance(accountAccepted)}
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

function hasPriorAcceptance(accepted: AcceptedVersions) {
  return CONSENT_DOCUMENT_IDS.some((id: ConsentDocumentId) => Boolean(accepted[id]))
}
