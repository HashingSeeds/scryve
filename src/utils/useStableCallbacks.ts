import { useLayoutEffect, useRef } from "react"

type Callback = (...args: never[]) => unknown

/** why: memoized consumers compare callbacks by identity, so each key keeps one identity. Closures become latest only after commit, so a discarded render never leaks into a handler. Keys a commit skipped are dropped, so a board kept across games doesn't retain finished games' closures. */
export function useStableCallbacks() {
  const entries = useRef(new Map<string, { latest: Callback; stable: Callback }>()).current
  const rendered = useRef(new Map<string, Callback>()).current
  rendered.clear()
  useLayoutEffect(() => {
    for (const key of entries.keys()) if (!rendered.has(key)) entries.delete(key)
    for (const [key, fn] of rendered) {
      const entry = entries.get(key)
      if (entry) entry.latest = fn
    }
  })
  return <Fn extends Callback>(key: string, fn: Fn): Fn => {
    rendered.set(key, fn)
    const existing = entries.get(key)
    if (existing) return existing.stable as Fn
    const entry: { latest: Callback; stable: Callback } = {
      latest: fn,
      stable: (...args) => entry.latest(...args),
    }
    entries.set(key, entry)
    return entry.stable as Fn
  }
}
