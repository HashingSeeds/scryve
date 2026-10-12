import { memo, useEffect } from "react"
import type { StyleProp, ViewStyle } from "react-native"
import { StyleSheet, View } from "react-native"
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  ZoomIn,
} from "react-native-reanimated"
import Svg, { Circle, G, Path, Rect } from "react-native-svg"

import { structurallyEqual } from "@/utils/structurallyEqual"
import { useReducedMotion } from "@/utils/useReducedMotion"

import type { LifeCardContentRotation } from "./playerCardTypes"
import { SWORD_VIEW_BOX, SwordShapes } from "./Sword"
import { shapeForSeat, type PlayerMarkShape } from "../../convex/lib/appearance"

const SPIN_DURATION_MS = 500

/** why: shapes sit inside their 44 unit box with different margins, so lining up boxes leaves drawn edges misaligned (the triangle floated above the prize grid). */
export const MARK_ART_BOUNDS: Record<PlayerMarkShape, { top: number; bottom: number }> = {
  circle: { top: 10, bottom: 34 },
  triangle: { top: 8.56, bottom: 34.5 },
  square: { top: 11, bottom: 33 },
  diamond: { top: 9.04, bottom: 34.96 },
  star: { top: 8.43, bottom: 35.06 },
  hexagon: { top: 8.39, bottom: 35.61 },
  plus: { top: 8, bottom: 36 },
  shield: { top: 8.21, bottom: 37 },
  heart: { top: 9.15, bottom: 34.84 },
}
export const MARK_VIEW_BOX = 44

export interface PlayerMarkProps {
  seatNumber: number
  color: string
  shape?: PlayerMarkShape
  rotation?: LifeCardContentRotation
  insetSwordColor?: string
  closeIcon?: boolean
  spinning?: boolean
  size?: number
  style?: StyleProp<ViewStyle>
}

const CLOSE_POP_MS = 200

/** why: each mark is an SVG, and cards re-render around it on every life change with the same mark. */
export const PlayerMark = memo(function PlayerMark({
  seatNumber,
  color,
  shape: chosenShape,
  rotation = 0,
  insetSwordColor,
  closeIcon = false,
  spinning = false,
  size = 44,
  style,
}: PlayerMarkProps) {
  const shape = chosenShape ?? shapeForSeat(seatNumber)
  const reducedMotion = useReducedMotion()
  const spin = useSharedValue(0)
  const rotationStyle: ViewStyle | undefined = rotation
    ? { transform: [{ rotate: `${rotation}deg` }] }
    : undefined
  const spinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${spin.value}deg` }],
  }))
  const closeEntering = reducedMotion === false ? ZoomIn.duration(CLOSE_POP_MS) : undefined

  useEffect(() => {
    cancelAnimation(spin)
    spin.value = 0
    if (spinning && reducedMotion === false) {
      spin.value = withTiming(360, { duration: SPIN_DURATION_MS, easing: Easing.out(Easing.quad) })
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
          {insetSwordColor && !closeIcon ? (
            <SwordInset shape={shape} color={insetSwordColor} />
          ) : null}
        </Svg>
      </Animated.View>
      {insetSwordColor && closeIcon ? (
        <CloseIconOverlay shape={shape} color={insetSwordColor} entering={closeEntering} />
      ) : null}
    </View>
  )
}, structurallyEqual)

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

const SWORD_INSET_THAT_FITS_SHAPE: Record<
  PlayerMarkShape,
  { centerX: number; centerY: number; size: number }
> = {
  circle: { centerX: 22, centerY: 22, size: 14 },
  square: { centerX: 22, centerY: 22, size: 15 },
  diamond: { centerX: 22, centerY: 22, size: 14 },
  hexagon: { centerX: 22, centerY: 22, size: 16 },
  triangle: { centerX: 22, centerY: 25, size: 14 },
  star: { centerX: 22, centerY: 23, size: 12 },
  plus: { centerX: 22, centerY: 22, size: 12 },
  shield: { centerX: 22, centerY: 21.5, size: 15 },
  heart: { centerX: 22, centerY: 22.5, size: 13 },
}

function CloseIconOverlay({
  shape,
  color,
  entering,
}: {
  shape: PlayerMarkShape
  color: string
  entering: ReturnType<typeof ZoomIn.duration> | undefined
}) {
  const inset = SWORD_INSET_THAT_FITS_SHAPE[shape]
  return (
    <Animated.View
      testID="player-mark-close"
      entering={entering}
      pointerEvents="none"
      style={[
        styles.closeIcon,
        {
          left: `${((inset.centerX - inset.size / 2) / 44) * 100}%`,
          top: `${((inset.centerY - inset.size / 2) / 44) * 100}%`,
          width: `${(inset.size / 44) * 100}%`,
          height: `${(inset.size / 44) * 100}%`,
        },
      ]}
    >
      <View style={styles.closeIconPop}>
        <View
          style={[styles.closeBar, { backgroundColor: color, transform: [{ rotate: "45deg" }] }]}
        />
        <View
          style={[styles.closeBar, { backgroundColor: color, transform: [{ rotate: "-45deg" }] }]}
        />
      </View>
    </Animated.View>
  )
}

function SwordInset({ shape, color }: { shape: PlayerMarkShape; color: string }) {
  const { centerX, centerY, size } = SWORD_INSET_THAT_FITS_SHAPE[shape]
  return (
    <G
      testID="player-mark-sword"
      transform={`translate(${centerX - size / 2} ${centerY - size / 2}) scale(${
        size / SWORD_VIEW_BOX
      })`}
    >
      <SwordShapes color={color} />
    </G>
  )
}

function MarkShape({ shape, color }: { shape: PlayerMarkShape; color: string }) {
  const common = { fill: color, testID: `player-mark-shape-${shape}` }
  switch (shape) {
    case "circle":
      return <Circle {...common} cx="22" cy="22" r="12" />
    case "triangle":
      return (
        <Path
          {...common}
          d="M19.83 9.82a2.5 2.5 0 0 1 4.34 0l11.91 20.94a2.5 2.5 0 0 1-2.18 3.74H10.1a2.5 2.5 0 0 1-2.18-3.74Z"
        />
      )
    case "square":
      return <Rect {...common} x="11" y="11" width="22" height="22" rx="3" />
    case "diamond":
      return (
        <Path
          {...common}
          d="M20.23 9.77a2.5 2.5 0 0 1 3.54 0l10.46 10.46a2.5 2.5 0 0 1 0 3.54L23.77 34.23a2.5 2.5 0 0 1-3.54 0L9.77 23.77a2.5 2.5 0 0 1 0-3.54Z"
        />
      )
    case "star":
      return (
        <Path
          {...common}
          d="M20.61 9.37a1.5 1.5 0 0 1 2.78 0l2.84 6.91a1 1 0 0 0 .85.62l7.45.57a1.5 1.5 0 0 1 .86 2.64l-5.69 4.84a1 1 0 0 0-.33 1l1.76 7.26a1.5 1.5 0 0 1-2.24 1.63l-6.37-3.92a1 1 0 0 0-1.04 0l-6.37 3.92a1.5 1.5 0 0 1-2.24-1.63l1.76-7.26a1 1 0 0 0-.33-1l-5.69-4.84a1.5 1.5 0 0 1 .86-2.64l7.45-.57a1 1 0 0 0 .85-.62Z"
        />
      )
    case "hexagon":
      return (
        <Path
          {...common}
          d="M20.75 8.72a2.5 2.5 0 0 1 2.5 0l9.62 5.56a2.5 2.5 0 0 1 1.25 2.16v11.12a2.5 2.5 0 0 1-1.25 2.16l-9.62 5.56a2.5 2.5 0 0 1-2.5 0l-9.62-5.56a2.5 2.5 0 0 1-1.25-2.16V16.44a2.5 2.5 0 0 1 1.25-2.16Z"
        />
      )
    case "plus":
      return (
        <Path
          {...common}
          d="M17 10.5A2.5 2.5 0 0 1 19.5 8h5a2.5 2.5 0 0 1 2.5 2.5V16a1 1 0 0 0 1 1h5.5a2.5 2.5 0 0 1 2.5 2.5v5a2.5 2.5 0 0 1-2.5 2.5H28a1 1 0 0 0-1 1v5.5a2.5 2.5 0 0 1-2.5 2.5h-5a2.5 2.5 0 0 1-2.5-2.5V28a1 1 0 0 0-1-1h-5.5A2.5 2.5 0 0 1 8 24.5v-5a2.5 2.5 0 0 1 2.5-2.5H16a1 1 0 0 0 1-1Z"
        />
      )
    case "shield":
      return (
        <Path
          {...common}
          d="M21.04 8.4a2.5 2.5 0 0 1 1.92 0l9.5 3.96A2.5 2.5 0 0 1 34 14.67V23c0 6-5 10-12 14-7-4-12-8-12-14v-8.33a2.5 2.5 0 0 1 1.54-2.31Z"
        />
      )
    case "heart":
      return (
        <Path
          {...common}
          d="M22 34.84 19.97 32.99C12.76 26.45 8 22.14 8 16.85 8 12.54 11.39 9.15 15.7 9.15c2.44 0 4.77 1.13 6.3 2.93 1.53-1.8 3.86-2.93 6.3-2.93 4.31 0 7.7 3.39 7.7 7.7 0 5.29-4.76 9.6-11.97 16.14Z"
        />
      )
  }
}

const styles = StyleSheet.create({
  closeBar: {
    borderRadius: 999,
    height: "20%",
    left: "6%",
    position: "absolute",
    top: "40%",
    width: "88%",
  },
  closeIcon: {
    position: "absolute",
  },
  closeIconPop: {
    height: "100%",
    width: "100%",
  },
})
