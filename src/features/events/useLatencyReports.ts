import { useEffect } from "react"
import { AppState } from "react-native"

import type { SyncLatency } from "@/features/connected/syncLatency"

/** why: an event can stay open until the app is closed, so its times go out when the player leaves the screen or puts the app away. */
export function useLatencyReports(latency: SyncLatency) {
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") latency.report()
    })
    return () => {
      subscription.remove()
      latency.report()
    }
  }, [latency])
}
