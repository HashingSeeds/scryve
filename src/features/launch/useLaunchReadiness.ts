import { useEffect, useRef, useState } from "react"
import { SplashScreen } from "expo-router"
import { useFonts } from "@expo-google-fonts/space-grotesk"

import { initI18n } from "@/i18n"
import { customFontsToLoad } from "@/theme/typography"
import { reportCrash } from "@/utils/crashReporting"
import { loadDateFnsLocale } from "@/utils/formatDate"

export const LAUNCH_DEADLINE_MS = 8000
export const LAUNCH_FALLBACK_REVEAL_MS = 700

export function useLaunchReadiness(isConsentResolved: boolean) {
  const [fontsLoaded, fontError] = useFonts(customFontsToLoad)
  const [isI18nInitialized, setIsI18nInitialized] = useState(false)
  const [launchDeadlineReached, setLaunchDeadlineReached] = useState(false)
  const [fallbackRevealReached, setFallbackRevealReached] = useState(false)
  const nativeSplashHidden = useRef(false)

  useEffect(() => {
    const revealTimer = setTimeout(() => setFallbackRevealReached(true), LAUNCH_FALLBACK_REVEAL_MS)
    const deadlineTimer = setTimeout(() => setLaunchDeadlineReached(true), LAUNCH_DEADLINE_MS)
    return () => {
      clearTimeout(revealTimer)
      clearTimeout(deadlineTimer)
    }
  }, [])

  useEffect(() => {
    initI18n()
      .then(() => loadDateFnsLocale())
      .catch(reportCrash)
      .finally(() => setIsI18nInitialized(true))
  }, [])

  const ready = ((fontsLoaded || !!fontError) && isI18nInitialized) || launchDeadlineReached

  useEffect(() => {
    if (fontError) reportCrash(fontError)
  }, [fontError])

  useEffect(() => {
    if (nativeSplashHidden.current || (!fallbackRevealReached && !(ready && isConsentResolved)))
      return
    nativeSplashHidden.current = true
    void SplashScreen.hideAsync().catch(reportCrash)
  }, [fallbackRevealReached, isConsentResolved, ready])

  return ready
}
