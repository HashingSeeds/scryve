import { useEffect } from "react"
import { StyleSheet } from "react-native"
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated"
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg"

import { useAppTheme } from "@/theme/context"
import { useReducedMotion } from "@/utils/useReducedMotion"

import { mixColorsInLinearLight } from "./GameMenuButtonShape"
import { HANDOFF_MS, type LifeCardContentRotation } from "./playerCardTypes"
import { useSeatDimmed } from "./TurnSpotlight"

const MIDDLE_DEPTH = 0.88

/** why: the middle under the total stays near the board, tinted by both teammates, so the two colors never blend into a bright third one. */
export function teamZoneMiddle(colors: readonly [string, string], background: string) {
  return mixColorsInLinearLight(
    mixColorsInLinearLight(colors[0], colors[1], 0.5),
    background,
    MIDDLE_DEPTH,
  )
}

const GRADIENT_AXIS: Record<
  LifeCardContentRotation,
  { x1: number; y1: number; x2: number; y2: number }
> = {
  0: { x1: 0, y1: 0, x2: 1, y2: 0 },
  180: { x1: 1, y1: 0, x2: 0, y2: 0 },
  90: { x1: 0, y1: 0, x2: 0, y2: 1 },
  [-90]: { x1: 0, y1: 1, x2: 0, y2: 0 },
}

/** why: a team zone runs from the first teammate's color at its content-left edge to the second's at its right, and dims with the seat fill when the team is out of the turn. */
export function TeamShade({
  colors,
  rotation,
  playerId,
  seatNumber,
  size,
}: {
  colors: readonly [string, string]
  rotation: LifeCardContentRotation
  playerId?: string
  seatNumber: number
  size: { width: number; height: number }
}) {
  const {
    theme: { colors: theme },
  } = useAppTheme()
  const reducedMotion = useReducedMotion()
  const dimmed = useSeatDimmed(playerId)
  const shade = useSharedValue(dimmed ? DIM : 0)
  useEffect(() => {
    shade.value = reducedMotion
      ? dimmed
        ? DIM
        : 0
      : withTiming(dimmed ? DIM : 0, { duration: HANDOFF_MS, easing: Easing.out(Easing.cubic) })
  }, [dimmed, reducedMotion, shade])
  const dimStyle = useAnimatedStyle(() => ({ opacity: shade.value }))
  const middle = teamZoneMiddle(colors, theme.board.background)
  const id = `team-shade-${seatNumber}`
  return (
    <>
      <Svg
        testID={`team-zone-shade-seat-${seatNumber}`}
        pointerEvents="none"
        style={StyleSheet.absoluteFill}
        width={size.width}
        height={size.height}
      >
        <Defs>
          {/* why: each teammate's full color starts at their outer edge and fades over the dark middle, with no hard edge anywhere. */}
          <LinearGradient id={id} {...GRADIENT_AXIS[rotation]}>
            <Stop offset="0" stopColor={colors[0]} />
            <Stop offset="0.14" stopColor={colors[0]} stopOpacity={EDGE_FADE} />
            <Stop offset="0.5" stopColor={colors[0]} stopOpacity={0} />
            <Stop offset="0.5" stopColor={colors[1]} stopOpacity={0} />
            <Stop offset="0.86" stopColor={colors[1]} stopOpacity={EDGE_FADE} />
            <Stop offset="1" stopColor={colors[1]} />
          </LinearGradient>
        </Defs>
        <Rect width={size.width} height={size.height} fill={middle} />
        <Rect width={size.width} height={size.height} fill={`url(#${id})`} />
      </Svg>
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: theme.board.background }, dimStyle]}
      />
    </>
  )
}

const DIM = 0.55
const EDGE_FADE = 0.62
