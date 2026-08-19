import "react-native-url-polyfill/auto"

import { useCallback, useEffect, useState } from "react"
import { Slot, SplashScreen, type ErrorBoundaryProps } from "expo-router"
import { useFonts } from "@expo-google-fonts/space-grotesk"
import * as Sentry from "@sentry/react-native"
import { KeyboardProvider } from "react-native-keyboard-controller"
import { initialWindowMetrics, SafeAreaProvider } from "react-native-safe-area-context"

import { CloudProviders } from "@/features/auth/AuthContext"
import { LegalConsentGate } from "@/features/legal/LegalConsentGate"
import { initI18n } from "@/i18n"
import { RootErrorFallback } from "@/screens/ErrorScreen/RootErrorFallback"
import { ThemeProvider } from "@/theme/context"
import { customFontsToLoad } from "@/theme/typography"
import { reportCrash } from "@/utils/crashReporting"
import { loadDateFnsLocale } from "@/utils/formatDate"

Sentry.init({
  dsn: "https://fb85fd67adf134394a15190b8a488404@o4507118738669568.ingest.us.sentry.io/4511870328635392",

  sendDefaultPii: false,

  // Enable Logs
  enableLogs: true,

  // Configure Session Replay
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1,
  integrations: [Sentry.mobileReplayIntegration(), Sentry.feedbackIntegration()],
})

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

export const LAUNCH_DEADLINE_MS = 8000

export default function Root() {
  const [fontsLoaded, fontError] = useFonts(customFontsToLoad)
  const [isI18nInitialized, setIsI18nInitialized] = useState(false)
  const [isConsentResolved, setIsConsentResolved] = useState(false)
  const [launchDeadlineReached, setLaunchDeadlineReached] = useState(false)
  const resolveConsent = useCallback(() => setIsConsentResolved(true), [])

  // Asset and locale loading can stall without ever resolving or rejecting, and
  // a splash screen that never lifts is worse than the system typeface or an
  // untranslated key.
  useEffect(() => {
    const timer = setTimeout(() => setLaunchDeadlineReached(true), LAUNCH_DEADLINE_MS)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    initI18n()
      .then(() => loadDateFnsLocale())
      // Untranslated keys are a better failure than a launch that never ends.
      .catch(reportCrash)
      .finally(() => setIsI18nInitialized(true))
  }, [])

  // A font that fails to download should degrade to the system typeface, not
  // take down the whole app through the root error boundary.
  const loaded = ((fontsLoaded || !!fontError) && isI18nInitialized) || launchDeadlineReached

  useEffect(() => {
    if (fontError) reportCrash(fontError)
  }, [fontError])

  useEffect(() => {
    if (loaded && isConsentResolved) {
      SplashScreen.hideAsync()
    }
  }, [loaded, isConsentResolved])

  if (!loaded) {
    return null
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
