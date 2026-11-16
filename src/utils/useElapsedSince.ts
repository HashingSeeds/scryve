import { useEffect, useReducer } from "react"

import { formatDuration } from "@/i18n/format"

export function formatElapsed(ms: number): string {
  return formatDuration(Math.max(0, Math.floor(ms / 1000)))
}

export function useElapsedSince(since: number | undefined): string | undefined {
  const [, tick] = useReducer((count: number) => count + 1, 0)
  useEffect(() => {
    if (since === undefined) return
    const timer = setInterval(tick, 1_000)
    return () => clearInterval(timer)
  }, [since])
  return since === undefined ? undefined : formatElapsed(Date.now() - since)
}
