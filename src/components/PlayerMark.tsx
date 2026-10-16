import { memo, useEffect, useId } from "react"
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
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from "react-native-svg"

import { relativeLuminance } from "@/utils/colorContrast"
import { structurallyEqual } from "@/utils/structurallyEqual"
import { useReducedMotion } from "@/utils/useReducedMotion"

import type { LifeCardContentRotation } from "./playerCardTypes"
import { SWORD_VIEW_BOX, SwordShapes } from "./Sword"
import { shapeForSeat, type PlayerMarkShape } from "../../convex/lib/appearance"

const SPIN_DURATION_MS = 500

/** why: shapes sit inside their 44 unit box with different margins, so lining up boxes leaves drawn edges misaligned (the triangle floated above the prize grid). */
export const MARK_ART_BOUNDS: Record<
  PlayerMarkShape,
  { top: number; bottom: number; left: number; right: number }
> = {
  circle: { top: 10, bottom: 34, left: 10, right: 34 },
  triangle: { top: 8.56, bottom: 34.5, left: 7.59, right: 36.41 },
  square: { top: 11, bottom: 33, left: 11, right: 33 },
  diamond: { top: 9.04, bottom: 34.96, left: 9.04, right: 34.96 },
  star: { top: 8.43, bottom: 35.06, left: 8.08, right: 35.92 },
  hexagon: { top: 8.39, bottom: 35.61, left: 9.88, right: 34.12 },
  plus: { top: 8, bottom: 36, left: 8, right: 36 },
  shield: { top: 8.21, bottom: 37, left: 10, right: 34 },
  heart: { top: 9.15, bottom: 34.84, left: 8, right: 36 },
  crown: { top: 10.25, bottom: 35, left: 8.25, right: 35.75 },
  flame: { top: 8, bottom: 36, left: 11, right: 33 },
  bolt: { top: 7.75, bottom: 36.25, left: 10.25, right: 33.75 },
  eye: { top: 11.5, bottom: 32.5, left: 7.5, right: 36.5 },
}
export const MARK_VIEW_BOX = 44

export interface PlayerMarkProps {
  seatNumber: number
  color: string
  shape?: PlayerMarkShape
  rotation?: LifeCardContentRotation
  insetSwordColor?: string
  closeIcon?: boolean
  foil?: boolean
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
  foil = false,
  spinning = false,
  size = 44,
  style,
}: PlayerMarkProps) {
  const shape = chosenShape ?? shapeForSeat(seatNumber)
  const foilId = `foil-${useId().replace(/[^A-Za-z0-9]/g, "")}`
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
          {foil ? <FoilGradient id={foilId} color={color} /> : null}
          <MarkShape
            shape={shape}
            color={foil ? `url(#${foilId})` : color}
            solid={!!insetSwordColor}
            testID={`player-mark-shape-${shape}`}
          />
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

/** why: the Pro corner watermark is the mark's art at card scale; it skips PlayerMark's seat testIDs so each seat still has exactly one mark to find. */
export function MarkArt({
  shape,
  color,
  size,
}: {
  shape: PlayerMarkShape
  color: string
  size: number
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 44 44">
      <MarkShape shape={shape} color={color} />
    </Svg>
  )
}

// why: cards draw marks in black or white for contrast; a black mark gets the dark foil so it stays dark against a light card, every other mark the light foil.
const FOIL_STOPS = {
  light: ["#F6E7B0", "#FFFFFF", "#B9E9FF", "#E6C2FF", "#F3D27A"],
  dark: ["#4A3A0A", "#000000", "#0E3446", "#30184A", "#3D2E05"],
} as const

function FoilGradient({ id, color }: { id: string; color: string }) {
  const stops = FOIL_STOPS[relativeLuminance(color) < 0.05 ? "dark" : "light"]
  return (
    <Defs>
      <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
        {stops.map((stop, index) => (
          <Stop key={stop + index} offset={index / (stops.length - 1)} stopColor={stop} />
        ))}
      </LinearGradient>
    </Defs>
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
  crown: { centerX: 22, centerY: 22.5, size: 11 },
  flame: { centerX: 22, centerY: 27, size: 12 },
  bolt: { centerX: 22, centerY: 22.5, size: 9 },
  eye: { centerX: 22, centerY: 22, size: 13 },
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

const ROUNDED_STROKE = { strokeWidth: 2.5, strokeLinejoin: "round" } as const

/** why: a sword inset over the eye's hole would vanish into the card, so `solid` fills it. */
function MarkShape({
  shape,
  color,
  solid = false,
  testID,
}: {
  shape: PlayerMarkShape
  color: string
  solid?: boolean
  testID?: string
}) {
  const common = { fill: color, testID }
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
    case "crown":
      return (
        <G {...common}>
          <Path
            {...ROUNDED_STROKE}
            stroke={color}
            d="M9.5 14.5 16 20.5 22 11.5 28 20.5 34.5 14.5 33 28.5H11Z"
          />
          <Rect x="11" y="31" width="22" height="4" rx="1.5" />
        </G>
      )
    case "flame":
      return (
        <Path
          {...common}
          d="M22 36C15.4 36 11 31.8 11 26 11 21 14 18 16.4 15.2 16.8 18 18 19.8 19.6 20.6 19 15.6 21.2 11 25.6 8 25.8 12.6 28 15.2 30.2 17.8 32.2 20.2 33 22.8 33 26 33 31.8 28.6 36 22 36Z"
        />
      )
    case "bolt":
      return (
        <Path
          {...common}
          {...ROUNDED_STROKE}
          stroke={color}
          d="M26 9 11.5 25.5H20.5L18 35 32.5 18H24Z"
        />
      )
    case "eye":
      return (
        <Path
          {...common}
          fillRule="evenodd"
          d={`M7.5 22C11.6 14.6 16.6 11.5 22 11.5S32.4 14.6 36.5 22C32.4 29.4 27.4 32.5 22 32.5S11.6 29.4 7.5 22Z${
            solid
              ? ""
              : "M28.2 22A6.2 6.2 0 1 1 15.8 22 6.2 6.2 0 1 1 28.2 22ZM24.7 22A2.7 2.7 0 1 1 19.3 22 2.7 2.7 0 1 1 24.7 22Z"
          }`}
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
