import { useEffect } from "react"
import { AppState } from "react-native"

import type { SyncLatency } from "@/features/connected/syncLatency"

const away = (state: string) => state === "background" || state === "inactive"

export function useLatencyReports(latency: SyncLatency) {
  useEffect(() => {
    latency.setPaused(away(AppState.currentState))
    const subscription = AppState.addEventListener("change", (state) => {
      latency.setPaused(away(state))
      if (away(state)) latency.report()
    })
    return () => {
      subscription.remove()
      latency.report()
    }
  }, [latency])
}
