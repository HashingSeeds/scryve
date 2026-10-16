import { useEffect, useRef, useState } from "react"
import { useFonts } from "expo-font"
import { SplashScreen } from "expo-router"

import { fontsToLoad } from "@/theme/fontsToLoad"
import { reportCrash } from "@/utils/crashReporting"

export const LAUNCH_DEADLINE_MS = 8000
export const LAUNCH_FALLBACK_REVEAL_MS = 700

export function useLaunchReadiness(isConsentResolved: boolean) {
  const [fontsLoaded, fontError] = useFonts(fontsToLoad)
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

  const ready = fontsLoaded || !!fontError || launchDeadlineReached

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
