import { useEffect } from "react"
import { AppState } from "react-native"

import type { SyncLatency } from "@/features/connected/syncLatency"

export function useLatencyReports(latency: SyncLatency) {
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      latency.setPaused(state !== "active")
      if (state !== "active") latency.report()
    })
    return () => {
      subscription.remove()
      latency.report()
    }
  }, [latency])
}
