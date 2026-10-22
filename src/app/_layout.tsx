import "react-native-url-polyfill/auto"

import { useCallback, useEffect, useState } from "react"
import type { ViewStyle } from "react-native"
import { AppMetrics, ObserveRoot } from "expo-observe"
import {
  SplashScreen,
  Stack,
  useNavigationContainerRef,
  type ErrorBoundaryProps,
} from "expo-router"
import { setOptions as setSplashScreenOptions } from "expo-splash-screen"
import * as Sentry from "@sentry/react-native"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { KeyboardProvider } from "react-native-keyboard-controller"
import { initialWindowMetrics, SafeAreaProvider } from "react-native-safe-area-context"

import { AccountDeletionSessionGuard } from "@/features/auth/AccountDeletionSessionGuard"
import { CloudProviders } from "@/features/auth/AuthContext"
import { LocalGameClaimPrompt } from "@/features/game/LocalGameClaimPrompt"
import { LaunchFallback } from "@/features/launch/LaunchFallback"
import { useLaunchReadiness } from "@/features/launch/useLaunchReadiness"
import { LegalConsentGate } from "@/features/legal/LegalConsentGate"
import { RestartCurtain } from "@/features/updates/RestartCurtain"
import { UpdateReadyToastWithForegroundChecks } from "@/features/updates/UpdateReadyToast"
import { RootErrorFallback } from "@/screens/ErrorScreen/RootErrorFallback"
import { ThemeProvider, useAppTheme } from "@/theme/context"
import { initAnalytics } from "@/utils/analytics"
import { reportCrash } from "@/utils/crashReporting"
import { initObservability, navigationTracing } from "@/utils/observability"

initObservability()

SplashScreen.preventAutoHideAsync()
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
    <GestureHandlerRootView style={$root}>
      <ThemeProvider>
        <CloudProviders>
          <SafeAreaProvider initialMetrics={initialWindowMetrics}>
            <KeyboardProvider>
              <LegalConsentGate onResolved={resolveConsent}>
                <AccountDeletionSessionGuard />
                <LocalGameClaimPrompt />
                <AppStack />
                <UpdateReadyToastWithForegroundChecks />
                <RestartCurtain />
              </LegalConsentGate>
            </KeyboardProvider>
          </SafeAreaProvider>
        </CloudProviders>
      </ThemeProvider>
    </GestureHandlerRootView>
  )
}

const $root: ViewStyle = { flex: 1 }

const BOARD_OPTIONS = { statusBarHidden: true, gestureEnabled: false }

function AppStack() {
  const { themeContext } = useAppTheme()
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        freezeOnBlur: true,
        // why: once a board sets statusBarHidden, react-native-screens styles every screen's bar itself, white unless told otherwise.
        statusBarStyle: themeContext === "dark" ? "light" : "dark",
      }}
    >
      <Stack.Screen name="index" options={BOARD_OPTIONS} />
      <Stack.Screen name="game/current" options={BOARD_OPTIONS} />
      <Stack.Screen name="connected/game/[gameId]" options={BOARD_OPTIONS} />
    </Stack>
  )
}

export default Sentry.wrap(ObserveRoot.wrap(Root))
