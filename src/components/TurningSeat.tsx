import type { ReactNode } from "react"
import type { LayoutRectangle } from "react-native"
import Animated, {
  type SharedValue,
  useAnimatedStyle,
  useDerivedValue,
} from "react-native-reanimated"

import { tableTurnPlacement } from "@/features/game/tableTurn"
import { LayoutSettlingContext } from "@/utils/useSettledLayout"

export function TurningSeat({
  angle,
  cell,
  table,
  board,
  children,
}: {
  angle: SharedValue<number>
  cell: LayoutRectangle
  table: LayoutRectangle
  board: { width: number; height: number }
  children: (liveSize: SharedValue<{ width: number; height: number }>) => ReactNode
}) {
  const placed = useDerivedValue(() =>
    tableTurnPlacement({ cell, table, board, angle: angle.value }),
  )
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
    }
  })
  return (
    <Animated.View style={style}>
      <LayoutSettlingContext.Provider value>{children(liveSize)}</LayoutSettlingContext.Provider>
    </Animated.View>
  )
}
