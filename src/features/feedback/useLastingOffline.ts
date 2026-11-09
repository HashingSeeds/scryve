import { useEffect, useState, useSyncExternalStore } from "react"
import { AppState } from "react-native"

import { OFFLINE_AFTER_MS } from "@/features/connected/boardSyncSignal"

function subscribeToAppState(onChange: () => void) {
  const subscription = AppState.addEventListener("change", onChange)
  return () => subscription.remove()
}

const appActive = () => AppState.currentState === "active"

export function useLastingOffline(online: boolean) {
  const active = useSyncExternalStore(subscribeToAppState, appActive, () => true)
  // why: a timer started before suspension fires on resume, before the socket has had a chance to reconnect.
  const waiting = !online && active
  const [lasting, setLasting] = useState(false)
  if (!waiting && lasting) setLasting(false)
  useEffect(() => {
    if (!waiting) return
    const timer = setTimeout(() => setLasting(true), OFFLINE_AFTER_MS)
    return () => clearTimeout(timer)
  }, [waiting])
  return lasting
}
