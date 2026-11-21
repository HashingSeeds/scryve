import { useEffect, useRef } from "react"

import { captureAnalytics } from "@/utils/analytics"

const SETTLE_MS = 1500

type Search = { query: string; results: readonly string[] }

/** why: search runs per keystroke, so it counts once typing settles, a card is picked, or the screen closes (clearing first drops it); picks are numbered so a wrong first pick shows as a second one. */
export function useCardSearchAnalytics(system: string, search: Search | undefined) {
  const latest = useRef({ system, search })
  latest.current = { system, search }
  const pending = useRef<Search | undefined>(undefined)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const picks = useRef(0)

  const flush = useRef(() => {
    clearTimeout(timer.current)
    timer.current = undefined
    const settled = pending.current
    if (!settled) return
    pending.current = undefined
    picks.current = 0
    captureAnalytics("card_search", {
      system: latest.current.system,
      result_count: settled.results.length,
      query: settled.query,
    })
  }).current

  const key = search ? `${search.query}\n${search.results.join("\n")}` : ""
  useEffect(() => {
    clearTimeout(timer.current)
    pending.current = latest.current.search
    if (pending.current) timer.current = setTimeout(flush, SETTLE_MS)
  }, [key, flush])
  useEffect(() => flush, [flush])

  return (rank: number, card: string) => {
    const query = latest.current.search?.query ?? ""
    flush()
    picks.current += 1
    captureAnalytics("card_picked", {
      system: latest.current.system,
      rank,
      pick_count: picks.current,
      card,
      query,
    })
  }
}
