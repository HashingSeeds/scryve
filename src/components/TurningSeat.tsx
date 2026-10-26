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

export function TurningSeat({
  angle,
  unfolded,
  folded,
  cell,
  table,
  board,
  corners,
  children,
}: {
  angle: SharedValue<number>
  unfolded: SharedValue<number>
  folded: LayoutRectangle
  cell: LayoutRectangle
  table: LayoutRectangle
  board: { width: number; height: number }
  corners: {
    radius: number
    resting: SquaredCorners
    landingClockwise: SquaredCorners
    landingCounterclockwise: SquaredCorners
  }
  children: (liveSize: SharedValue<{ width: number; height: number }>) => ReactNode
}) {
  const placed = useDerivedValue(() => {
    const open = unfolded.value
    const mix = (from: number, to: number) => from + (to - from) * open
    const resting = {
      x: mix(folded.x, cell.x),
      y: mix(folded.y, cell.y),
      width: mix(folded.width, cell.width),
      height: mix(folded.height, cell.height),
    }
    return tableTurnPlacement({ cell: resting, table, board, angle: angle.value })
  })
  const liveSize = useDerivedValue(() => ({
    width: placed.value.width,
    height: placed.value.height,
  }))
  // why: position, turn and growth move by transform, since layout props would relayout the card every frame.
  const style = useAnimatedStyle(() => {
    const { centerX, centerY, width, height, scale } = placed.value
    return {
      position: "absolute",
      left: 0,
      top: 0,
      width,
      height,
      transform: [
        { translateX: centerX - cell.x - width / 2 },
        { translateY: centerY - cell.y - height / 2 },
        { rotate: `${placed.value.angle}deg` },
        { scale },
      ],
      overflow: "hidden",
      ...turningCornerRadii({ ...corners, unfolded: unfolded.value, angle: angle.value }),
    }
  })
  return (
    <Animated.View style={style}>
      <LayoutSettlingContext.Provider value>{children(liveSize)}</LayoutSettlingContext.Provider>
    </Animated.View>
  )
}
