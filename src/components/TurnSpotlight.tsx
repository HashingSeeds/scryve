import { createContext, useContext } from "react"
import type { ViewStyle } from "react-native"
import { View } from "react-native"

import { useAppTheme } from "@/theme/context"

export interface TurnSpotlight {
  active?: string
  next?: string
}

/** why: the board knows the seats' order around the table, so it names the active and next seats for every card and for the chip that passes between them. */
export const TurnSpotlightContext = createContext<TurnSpotlight | undefined>(undefined)

export const useTurnSpotlight = () => useContext(TurnSpotlightContext)

export function SeatSpotlight({ playerId }: { playerId: string }) {
  const spotlight = useTurnSpotlight()
  const {
    theme: { colors },
  } = useAppTheme()
  const active = spotlight?.active === playerId
  const next = spotlight?.next === playerId
  if (!active && !next) return null
  return (
    <View
      pointerEvents="none"
      testID={active ? "seat-spotlight-active" : "seat-spotlight-next"}
      style={[$frame, active ? $active : $next, { borderColor: colors.gameMenu.anchorGlyph }]}
    />
  )
}

const $frame: ViewStyle = {
  position: "absolute",
  left: 0,
  top: 0,
  right: 0,
  bottom: 0,
  borderRadius: 24,
}
const $active: ViewStyle = { borderWidth: 4 }
const $next: ViewStyle = { borderWidth: 3, borderStyle: "dashed", opacity: 0.8 }
