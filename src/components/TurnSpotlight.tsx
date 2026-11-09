import { createContext, useContext } from "react"
import type { StyleProp, ViewStyle } from "react-native"
import { View } from "react-native"

import { useAppTheme } from "@/theme/context"

import { seatCardRadius } from "./playerCardTypes"

/** why: `passTo` is the next group's first seat, the seat a pass names; `active` and `next` are every seat in those groups, so a shared turn frames each of its seats. */
export interface TurnSpotlight {
  active: readonly string[]
  next: readonly string[]
  passTo?: string
}

/** why: the board knows the seats' order around the table, so it names the active and next seats for every card and for the chip that passes between them. */
export const TurnSpotlightContext = createContext<TurnSpotlight | undefined>(undefined)

export const useTurnSpotlight = () => useContext(TurnSpotlightContext)

/**
 * why: the frame sits on its card's own rounded rect, with the card's radius and any corner the
 * card squares against the screen, so no card color shows outside it at a corner. `corners` is the
 * same corner style the card gets.
 */
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
  const {
    theme: { colors },
  } = useAppTheme()
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
