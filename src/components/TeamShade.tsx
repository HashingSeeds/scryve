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

const END_DEPTH = 0.48
const MIDDLE_DEPTH = 0.9

/** why: each end of the zone is its teammate's color darkened, and the middle under the total stays near the board so it never blends the two into a third color. */
export function teamZoneShades(colors: readonly [string, string], background: string) {
  return {
    ends: colors.map((color) => mixColorsInLinearLight(color, background, END_DEPTH)) as [
      string,
      string,
    ],
    middle: mixColorsInLinearLight(
      mixColorsInLinearLight(colors[0], colors[1], 0.5),
      background,
      MIDDLE_DEPTH,
    ),
  }
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

/** why: a team zone runs from the first teammate's strip to the second's along its content's left-to-right, and dims with the seat fill when the team is out of the turn. */
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
  const { ends, middle } = teamZoneShades(colors, theme.board.background)
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
          <LinearGradient id={id} {...GRADIENT_AXIS[rotation]}>
            <Stop offset="0" stopColor={ends[0]} />
            <Stop offset="0.5" stopColor={middle} />
            <Stop offset="1" stopColor={ends[1]} />
          </LinearGradient>
        </Defs>
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
