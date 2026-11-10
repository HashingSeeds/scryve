import { useEffect, useRef, useState } from "react"
import type { TextStyle } from "react-native"
import { AccessibilityInfo, Platform } from "react-native"

import { Text } from "./Text"

const LIVE_REGION_REISSUE_MS = 100

/**
 * why: repeating a result changes no text, so announce explicitly. react-native-web's announce is a no-op, so web gets a polite live region (`ResultLiveRegion`).
 */
export function useResultAnnouncer() {
  const [webMessage, setWebMessage] = useState("")
  const reissue = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(reissue.current), [])
  function announce(message: string) {
    if (Platform.OS !== "web") return AccessibilityInfo.announceForAccessibility(message)
    // why: a live region only speaks when its text changes, so it clears first and the message lands a beat later; a repeated roll is read again.
    clearTimeout(reissue.current)
    setWebMessage("")
    reissue.current = setTimeout(() => setWebMessage(message), LIVE_REGION_REISSUE_MS)
  }
  function reset() {
    clearTimeout(reissue.current)
    setWebMessage("")
  }
  return { announce, reset, webMessage }
}

export function ResultLiveRegion({ message, testID }: { message: string; testID: string }) {
  if (Platform.OS !== "web") return null
  return (
    <Text testID={testID} text={message} accessibilityLiveRegion="polite" style={$visuallyHidden} />
  )
}

const $visuallyHidden: TextStyle = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  opacity: 0,
}
