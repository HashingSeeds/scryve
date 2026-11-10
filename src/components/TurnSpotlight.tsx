import { createContext, useContext } from "react"
import type { StyleProp, ViewStyle } from "react-native"
import { View } from "react-native"

import { useAppTheme } from "@/theme/context"

import { seatCardRadius } from "./playerCardTypes"
import { useTurnStyle } from "./turnStyle"

export interface TurnSpotlight {
  active: readonly string[]
  next: readonly string[]
  passTo?: string
}

export const TurnSpotlightContext = createContext<TurnSpotlight | undefined>(undefined)

export const useTurnSpotlight = () => useContext(TurnSpotlightContext)

export function useSeatDimmed(playerId: string | undefined) {
  const spotlight = useTurnSpotlight()
  const style = useTurnStyle()
  return (
    style !== "frames" &&
    !!playerId &&
    !!spotlight?.active.length &&
    !spotlight.active.includes(playerId)
  )
}

export function SeatSpotlight({
  playerId,
  compact,
  corners,
}: {
  playerId: string
  compact?: boolean
  corners?: StyleProp<ViewStyle>
}) {
  const spotlight = useTurnSpotlight()
  const style = useTurnStyle()
  const {
    theme: { colors },
  } = useAppTheme()
  if (style !== "frames") return null
  const active = !!spotlight?.active.includes(playerId)
  const next = !!spotlight?.next.includes(playerId)
  if (!active && !next) return null
  return (
    <View
      pointerEvents="none"
      testID={active ? "seat-spotlight-active" : "seat-spotlight-next"}
      style={[
        $frame,
        { borderRadius: seatCardRadius(compact) },
        corners,
        active ? $active : $next,
        { borderColor: colors.gameMenu.anchorGlyph },
      ]}
    />
  )
}

const $frame: ViewStyle = {
  position: "absolute",
  left: 0,
  top: 0,
  right: 0,
  bottom: 0,
}
const $active: ViewStyle = { borderWidth: 4, borderStyle: "solid" }
const $next: ViewStyle = { borderWidth: 3, borderStyle: "dashed", opacity: 0.8 }
