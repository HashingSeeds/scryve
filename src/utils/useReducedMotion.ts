import { useEffect, useState } from "react"
import { AccessibilityInfo } from "react-native"

export type ReducedMotionPreference = boolean | null

// Unknown is fail-safe: suppress optional motion/haptics until the OS preference resolves.
let lastKnownPreference: ReducedMotionPreference = null

export function resetReducedMotionCacheForTests() {
  lastKnownPreference = null
}

export function useReducedMotion(): ReducedMotionPreference {
  const [enabled, setEnabled] = useState<ReducedMotionPreference>(lastKnownPreference)
  useEffect(() => {
    let active = true
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      lastKnownPreference = value
      if (active) setEnabled(value)
    })
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", (value) => {
      lastKnownPreference = value
      setEnabled(value)
    })
    return () => {
      active = false
      subscription.remove()
    }
  }, [])
  return enabled
}

export function motionDuration(preference: ReducedMotionPreference, duration: number): number {
  return preference === false ? duration : 0
}
