import "react-native-url-polyfill/auto"

import { useEffect, useState } from "react"
import { Slot, SplashScreen, type ErrorBoundaryProps } from "expo-router"
import { useFonts } from "@expo-google-fonts/space-grotesk"
import * as Sentry from "@sentry/react-native"
import { KeyboardProvider } from "react-native-keyboard-controller"
import { initialWindowMetrics, SafeAreaProvider } from "react-native-safe-area-context"

import { CloudProviders } from "@/features/auth/AuthContext"
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
  useEffect(() => reportCrash(error), [error])

  return <RootErrorFallback error={error} onRetry={retry} />
}

export default function Root() {
  const [fontsLoaded, fontError] = useFonts(customFontsToLoad)
  const [isI18nInitialized, setIsI18nInitialized] = useState(false)

  useEffect(() => {
    initI18n()
      .then(() => setIsI18nInitialized(true))
      .then(() => loadDateFnsLocale())
  }, [])

  const loaded = fontsLoaded && isI18nInitialized

  useEffect(() => {
    if (fontError) throw fontError
  }, [fontError])

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync()
    }
  }, [loaded])

  if (!loaded) {
    return null
  }

  return (
    <ThemeProvider>
      <CloudProviders>
        <SafeAreaProvider initialMetrics={initialWindowMetrics}>
          <KeyboardProvider>
            <Slot />
          </KeyboardProvider>
        </SafeAreaProvider>
      </CloudProviders>
    </ThemeProvider>
  )
}
