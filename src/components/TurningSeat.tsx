import type { ReactNode } from "react"
import type { LayoutRectangle } from "react-native"
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
} from "react-native-reanimated"

import {
  type SquaredCorners,
  tableTurnPlacement,
  turningCornerRadii,
} from "@/features/game/tableTurn"
import { LayoutSettlingContext } from "@/utils/useSettledLayout"

export interface SeatTurn {
  angle: SharedValue<number>
  unfolded: SharedValue<number>
  folded: LayoutRectangle & { turn: number }
  cell: LayoutRectangle
  table: LayoutRectangle
  board: { width: number; height: number }
  corners: {
    radius: number
    resting: SquaredCorners
    landingClockwise: SquaredCorners
    landingCounterclockwise: SquaredCorners
  }
}

const RESTING = {
  position: "absolute",
  left: 0,
  top: 0,
  width: "100%",
  height: "100%",
  transform: [{ translateX: 0 }, { translateY: 0 }, { rotate: "0deg" }, { scale: 1 }],
  overflow: "visible",
  borderTopLeftRadius: 0,
  borderTopRightRadius: 0,
  borderBottomRightRadius: 0,
  borderBottomLeftRadius: 0,
} as const

/** why: a seat keeps this wrapper whether or not it is turning, so its card stays mounted when the board starts or stops unfolding; remounting six cards froze the switch for over a second on an iPad mini. */
export function TurningSeat({
  turn,
  children,
}: {
  turn?: SeatTurn
  children: (liveSize?: SharedValue<{ width: number; height: number }>) => ReactNode
}) {
  const placed = useDerivedValue(() => {
    if (!turn) return null
    const { folded, cell, table, board } = turn
    const open = turn.unfolded.value
    const mix = (from: number, to: number) => from + (to - from) * open
    const sideways = Math.abs(folded.turn) === 90
    const width = mix(sideways ? folded.height : folded.width, cell.width)
    const height = mix(sideways ? folded.width : folded.height, cell.height)
    const resting = {
      x: mix(folded.x + folded.width / 2, cell.x + cell.width / 2) - width / 2,
      y: mix(folded.y + folded.height / 2, cell.y + cell.height / 2) - height / 2,
      width,
      height,
    }
    const placement = tableTurnPlacement({ cell: resting, table, board, angle: turn.angle.value })
    return { ...placement, angle: placement.angle + folded.turn * (1 - open) }
  })
  const liveSize = useDerivedValue(() => ({
    width: placed.value?.width ?? 0,
    height: placed.value?.height ?? 0,
  }))
  // why: position, turn and growth move by transform, since layout props would relayout the card every frame. Every key is always set, since a key the style dropped would keep its last turning value.
  const style = useAnimatedStyle(() => {
    const at = placed.value
    if (!turn || !at) return RESTING
    const { centerX, centerY, width, height, scale } = at
    return {
      ...RESTING,
      width,
      height,
      transform: [
        { translateX: centerX - turn.cell.x - width / 2 },
        { translateY: centerY - turn.cell.y - height / 2 },
        { rotate: `${at.angle}deg` },
        { scale },
      ],
      overflow: "hidden",
      ...turningCornerRadii({
        ...turn.corners,
        unfolded: turn.unfolded.value,
        angle: turn.angle.value,
      }),
    }
  })
  return (
    <Animated.View style={style}>
      <LayoutSettlingContext.Provider value={!!turn}>
        {children(turn ? liveSize : undefined)}
      </LayoutSettlingContext.Provider>
    </Animated.View>
  )
}
