import { useEffect, useState } from "react"
import { AccessibilityInfo } from "react-native"

export type ReducedMotionPreference = boolean | null

export function useReducedMotion(): ReducedMotionPreference {
  // Unknown is fail-safe: suppress optional motion/haptics until the OS preference resolves.
  const [enabled, setEnabled] = useState<ReducedMotionPreference>(null)
  useEffect(() => {
    let active = true
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (active) setEnabled(value)
    })
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setEnabled)
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
