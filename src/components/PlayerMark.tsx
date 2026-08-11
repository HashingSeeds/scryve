import { useEffect } from "react"
import type { StyleProp, ViewStyle } from "react-native"
import { View } from "react-native"
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated"
import Svg, { Circle, Line, Path, Polygon, Rect } from "react-native-svg"

import { useReducedMotion } from "@/utils/useReducedMotion"

import type { LifeCardContentRotation } from "./playerCardTypes"

export type PlayerMarkShape = "circle" | "triangle" | "square" | "diamond" | "star" | "hexagon"

const SHAPES: readonly PlayerMarkShape[] = [
  "circle",
  "triangle",
  "square",
  "diamond",
  "star",
  "hexagon",
]
const SPIN_DURATION_MS = 7000

export interface PlayerMarkProps {
  seatNumber: number
  color: string
  rotation?: LifeCardContentRotation
  spinning?: boolean
  size?: number
  style?: StyleProp<ViewStyle>
}

export function PlayerMark({
  seatNumber,
  color,
  rotation = 0,
  spinning = false,
  size = 44,
  style,
}: PlayerMarkProps) {
  const markIndex = Math.abs(seatNumber - 1) % SHAPES.length
  const shape = SHAPES[markIndex]
  const insetColor = color.toUpperCase() === "#FFFFFF" ? "#000000" : "#FFFFFF"
  const reducedMotion = useReducedMotion()
  const spin = useSharedValue(0)
  const rotationStyle: ViewStyle | undefined = rotation
    ? { transform: [{ rotate: `${rotation}deg` }] }
    : undefined
  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value}deg` }],
  }))

  useEffect(() => {
    cancelAnimation(spin)
    spin.value = 0
    if (spinning && reducedMotion === false) {
      spin.value = withRepeat(
        withTiming(360, { duration: SPIN_DURATION_MS, easing: Easing.linear }),
        -1,
        false,
      )
    }
    return () => cancelAnimation(spin)
  }, [reducedMotion, spin, spinning])

  return (
    <View
      testID={`player-mark-seat-${seatNumber}`}
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[{ width: size, height: size }, rotationStyle, style]}
    >
      <Animated.View
        testID={`player-mark-spinner-seat-${seatNumber}`}
        style={[{ width: size, height: size }, spinStyle]}
      >
        <Svg width="100%" height="100%" viewBox="0 0 44 44">
          <MarkShape shape={shape} color={color} />
          {spinning ? (
            <Line
              testID="player-mark-spin-line"
              x1="22"
              y1="23"
              x2="22"
              y2="14"
              stroke={insetColor}
              strokeWidth="3.2"
              strokeLinecap="round"
            />
          ) : null}
        </Svg>
      </Animated.View>
    </View>
  )
}

export function DrawMark({ color, size = 44 }: { color: string; size?: number }) {
  return (
    <View
      testID="draw-mark"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={{ width: size, height: size }}
    >
      <Svg width="100%" height="100%" viewBox="0 0 44 44">
        <Rect fill={color} x="10" y="20" width="24" height="4" rx="2" />
      </Svg>
    </View>
  )
}

function MarkShape({ shape, color }: { shape: PlayerMarkShape; color: string }) {
  const common = { fill: color, testID: `player-mark-shape-${shape}` }
  switch (shape) {
    case "circle":
      return <Circle {...common} cx="22" cy="22" r="10" />
    case "triangle":
      return <Polygon {...common} points="22,9 35,33 9,33" />
    case "square":
      return <Rect {...common} x="12" y="12" width="20" height="20" rx="2" />
    case "diamond":
      return <Polygon {...common} points="22,9 35,22 22,35 9,22" />
    case "star":
      return (
        <Path
          {...common}
          d="M22 8l4.2 8.5 9.4 1.4-6.8 6.6 1.6 9.3-8.4-4.4-8.4 4.4 1.6-9.3-6.8-6.6 9.4-1.4z"
        />
      )
    case "hexagon":
      return <Polygon {...common} points="22,8 34,15 34,29 22,36 10,29 10,15" />
  }
}
