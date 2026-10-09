import "react-native-url-polyfill/auto"

import { useCallback, useEffect, useState } from "react"
import { AppMetrics, ObserveRoot } from "expo-observe"
import {
  SplashScreen,
  Stack,
  useNavigationContainerRef,
  type ErrorBoundaryProps,
} from "expo-router"
import { setOptions as setSplashScreenOptions } from "expo-splash-screen"
import * as Sentry from "@sentry/react-native"
import { KeyboardProvider } from "react-native-keyboard-controller"
import { initialWindowMetrics, SafeAreaProvider } from "react-native-safe-area-context"

import { AccountDeletionSessionGuard } from "@/features/auth/AccountDeletionSessionGuard"
import { CloudProviders } from "@/features/auth/AuthContext"
import { LocalGameClaimPrompt } from "@/features/game/LocalGameClaimPrompt"
import { LaunchFallback } from "@/features/launch/LaunchFallback"
import { useLaunchReadiness } from "@/features/launch/useLaunchReadiness"
import { LegalConsentGate } from "@/features/legal/LegalConsentGate"
import { UpdateReadyToastWithForegroundChecks } from "@/features/updates/UpdateReadyToast"
import { RootErrorFallback } from "@/screens/ErrorScreen/RootErrorFallback"
import { ThemeProvider } from "@/theme/context"
import { initAnalytics } from "@/utils/analytics"
import { reportCrash } from "@/utils/crashReporting"
import { initObservability, navigationTracing } from "@/utils/observability"

initObservability()

SplashScreen.preventAutoHideAsync()
// why: Android's default 400ms exit fade was ~80% of a warm launch on a Pixel 6a; this matches iOS's instant hide.
setSplashScreenOptions({ duration: 0 })

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

function Root() {
  const [isConsentResolved, setIsConsentResolved] = useState(false)
  const resolveConsent = useCallback(() => setIsConsentResolved(true), [])
  const ready = useLaunchReadiness(isConsentResolved)
  const navigationRef = useNavigationContainerRef()

  useEffect(() => {
    navigationTracing.registerNavigationContainer(navigationRef)
  }, [navigationRef])

  useEffect(() => {
    if (ready && isConsentResolved) {
      AppMetrics.markInteractive()
      initAnalytics()
    }
  }, [isConsentResolved, ready])

  if (!ready) {
    return <LaunchFallback />
  }

  return (
    <ThemeProvider>
      <CloudProviders>
        <SafeAreaProvider initialMetrics={initialWindowMetrics}>
          <KeyboardProvider>
            <LegalConsentGate onResolved={resolveConsent}>
              <AccountDeletionSessionGuard />
              <LocalGameClaimPrompt />
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen
                  name="index"
                  options={{ statusBarHidden: true, gestureEnabled: false }}
                />
                <Stack.Screen
                  name="game/current"
                  options={{ statusBarHidden: true, gestureEnabled: false }}
                />
                <Stack.Screen
                  name="connected/game/[gameId]"
                  options={{ statusBarHidden: true, gestureEnabled: false }}
                />
              </Stack>
              <UpdateReadyToastWithForegroundChecks />
            </LegalConsentGate>
          </KeyboardProvider>
        </SafeAreaProvider>
      </CloudProviders>
    </ThemeProvider>
  )
}

export default Sentry.wrap(ObserveRoot.wrap(Root))
