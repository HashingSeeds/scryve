import { useEffect, useReducer } from "react"

import type { PlaySystemId } from "./playSystems"
import { isRoundClockTicking, roundClockView, type RoundClock } from "./roundClock"

/** why: only the clock text re-renders each second, and nothing ticks while the clock is paused or done. */
export function useRoundClockView(clock: RoundClock | undefined, system: PlaySystemId | undefined) {
  const [, tick] = useReducer((count: number) => count + 1, 0)
  const ticking = clock ? isRoundClockTicking(clock, system) : false
  useEffect(() => {
    if (!ticking) return
    const timer = setInterval(tick, 1_000)
    return () => clearInterval(timer)
  }, [ticking])
  return clock ? roundClockView(clock, system) : undefined
}
