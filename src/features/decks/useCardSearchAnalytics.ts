import { useEffect, useLayoutEffect, useRef } from "react"

import { captureAnalytics } from "@/utils/analytics"

const SETTLE_MS = 1500

type Search = { query: string; results: readonly string[] }

const searchKey = (search: Search) => `${search.query}\n${search.results.join("\n")}`

export function useCardSearchAnalytics(system: string, search: Search | undefined) {
  const latest = useRef({ system, search })
  const shown = useRef(search)
  const pending = useRef<Search | undefined>(undefined)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const picks = useRef(0)
  const counted = useRef("")

  const flush = useRef(() => {
    clearTimeout(timer.current)
    timer.current = undefined
    const settled = pending.current
    if (!settled) return
    pending.current = undefined
    counted.current = searchKey(settled)
    picks.current = 0
    captureAnalytics("card_search", {
      system: latest.current.system,
      result_count: settled.results.length,
      query: settled.query,
    })
  }).current

  const key = search ? searchKey(search) : ""
  useLayoutEffect(() => {
    latest.current = { system, search }
    if (search) shown.current = search
  })
  useLayoutEffect(() => {
    clearTimeout(timer.current)
    pending.current = latest.current.search
    if (pending.current) timer.current = setTimeout(flush, SETTLE_MS)
  }, [key, flush])
  useEffect(() => flush, [flush])

  return (rank: number, card: string) => {
    const picked = shown.current
    if (picked && searchKey(picked) !== counted.current) pending.current = picked
    flush()
    picks.current += 1
    captureAnalytics("card_picked", {
      system: latest.current.system,
      rank,
      pick_count: picks.current,
      card,
      query: picked?.query ?? "",
    })
  }
}
