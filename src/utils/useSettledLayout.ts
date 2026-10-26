import { createContext, useContext, useEffect, useRef } from "react"

const SETTLE_MS = 120

/** why: a seat card a transition resizes every frame tells everything inside it, so measurements wait for the size it settles on instead of re-rendering the card each frame. */
export const LayoutSettlingContext = createContext(false)

/** why: re-rendering a moving card on every layout event held its animation near 30 fps and could stack nested updates past React's limit; while settling, only the last layout is kept. */
export function useSettledLayout<T>(set: (value: T) => void, settling?: boolean) {
  const insideMovingCard = useContext(LayoutSettlingContext)
  const live = settling ?? insideMovingCard
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])
  return (value: T) => {
    clearTimeout(timer.current)
    if (!live) return set(value)
    timer.current = setTimeout(() => set(value), SETTLE_MS)
  }
}
