import { useEffect, useRef } from "react"

const SETTLE_MS = 120

/** why: while a transition resizes a card every frame, re-rendering it on each layout event holds the animation near 30 fps; while `live`, only the layout it settles on is kept. */
export function useSettledLayout<T>(set: (value: T) => void, live: boolean) {
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  return (value: T) => {
    clearTimeout(timer.current)
    if (!live) return set(value)
    timer.current = setTimeout(() => set(value), SETTLE_MS)
  }
}
