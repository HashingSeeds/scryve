import { useEffect, useReducer } from "react"

export function formatElapsed(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
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
