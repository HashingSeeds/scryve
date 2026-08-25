import "react-native-url-polyfill/auto"

import { useCallback, useEffect, useState } from "react"
import { Slot, SplashScreen, type ErrorBoundaryProps } from "expo-router"
import { KeyboardProvider } from "react-native-keyboard-controller"
import { initialWindowMetrics, SafeAreaProvider } from "react-native-safe-area-context"

import { CloudProviders } from "@/features/auth/AuthContext"
import { LaunchFallback } from "@/features/launch/LaunchFallback"
import { useLaunchReadiness } from "@/features/launch/useLaunchReadiness"
import { LegalConsentGate } from "@/features/legal/LegalConsentGate"
import { RootErrorFallback } from "@/screens/ErrorScreen/RootErrorFallback"
import { ThemeProvider } from "@/theme/context"
import { reportCrash } from "@/utils/crashReporting"
import { initObservability } from "@/utils/observability"

initObservability()

SplashScreen.preventAutoHideAsync()

if (__DEV__) {
  // Load Reactotron configuration in development. We don't want to
  // include this in our production bundle, so we are using `if (__DEV__)`
  // to only execute this in development.
  require("@/devtools/ReactotronConfig")
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  // The fallback renders behind a splash screen that only the happy path hides,
  // so without this a root error is indistinguishable from a frozen launch.
  useEffect(() => {
    reportCrash(error)
    SplashScreen.hideAsync()
  }, [error])

  return <RootErrorFallback error={error} onRetry={retry} />
}

export default function Root() {
  const [isConsentResolved, setIsConsentResolved] = useState(false)
  const resolveConsent = useCallback(() => setIsConsentResolved(true), [])
  const ready = useLaunchReadiness(isConsentResolved)

  if (!ready) {
    return <LaunchFallback />
  }

  return (
    <ThemeProvider>
      <CloudProviders>
        <SafeAreaProvider initialMetrics={initialWindowMetrics}>
          <KeyboardProvider>
            <LegalConsentGate onResolved={resolveConsent}>
              <Slot />
            </LegalConsentGate>
          </KeyboardProvider>
        </SafeAreaProvider>
      </CloudProviders>
    </ThemeProvider>
  )
}
