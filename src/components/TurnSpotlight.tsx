import { createContext, useContext, useEffect } from "react"
import { Easing, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated"

import { useAppTheme } from "@/theme/context"
import { useReducedMotion } from "@/utils/useReducedMotion"

import { mixColorsInLinearLight } from "./GameMenuButtonShape"
import { HANDOFF_MS } from "./playerCardTypes"

export interface TurnSpotlight {
  active: readonly string[]
  passTo?: string
}

export const TurnSpotlightContext = createContext<TurnSpotlight | undefined>(undefined)

export const useTurnSpotlight = () => useContext(TurnSpotlightContext)

export function useSeatDimmed(playerId: string | undefined) {
  const spotlight = useTurnSpotlight()
  return !!playerId && !!spotlight?.active.length && !spotlight.active.includes(playerId)
}

/** why: a seat out of the turn dims only its fill, so its life total stays full white; the fill hands off with the turn chip. */
export function useSeatFill(color: string, playerId: string | undefined) {
  const {
    theme: { colors },
  } = useAppTheme()
  const reducedMotion = useReducedMotion()
  const fill = useSeatDimmed(playerId)
    ? mixColorsInLinearLight(color, colors.board.background, 0.55)
    : color
  const shown = useSharedValue(fill)
  useEffect(() => {
    shown.value = reducedMotion
      ? fill
      : withTiming(fill, { duration: HANDOFF_MS, easing: Easing.out(Easing.cubic) })
  }, [shown, fill, reducedMotion])
  return useAnimatedStyle(() => ({ backgroundColor: shown.value }))
}
