import { useEffect, useRef } from "react"

import { captureAnalytics } from "@/utils/analytics"

const SETTLE_MS = 1500

type Search = { query: string; results: readonly string[] }

/** why: rules search runs on device on every keystroke, so a search counts once typing settles, a result is opened, or the screen closes; opens are numbered within it so a wrong first pick shows up as a second open. */
export function useRulesSearchAnalytics(system: string, search: Search | undefined) {
  const latest = useRef({ system, search })
  latest.current = { system, search }
  const pending = useRef<Search | undefined>(undefined)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const opens = useRef(0)

  const flush = useRef(() => {
    clearTimeout(timer.current)
    timer.current = undefined
    const settled = pending.current
    if (!settled) return
    pending.current = undefined
    opens.current = 0
    captureAnalytics("rules_search", {
      system: latest.current.system,
      result_count: settled.results.length,
      top_results: settled.results.slice(0, 3).join(","),
      // why: analyticsProperties keeps the text only when nothing matched, shortened and lowercased.
      query: settled.query,
    })
  }).current

  const key = search ? `${search.query}\n${search.results.join(",")}` : ""
  useEffect(() => {
    const current = latest.current.search
    if (!current) {
      flush()
      return
    }
    clearTimeout(timer.current)
    pending.current = current
    timer.current = setTimeout(flush, SETTLE_MS)
  }, [key, flush])
  useEffect(() => flush, [flush])

  return (rank: number) => {
    flush()
    opens.current += 1
    captureAnalytics("rules_opened", {
      system: latest.current.system,
      rank,
      open_count: opens.current,
    })
  }
}
