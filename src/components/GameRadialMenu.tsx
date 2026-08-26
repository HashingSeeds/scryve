import { useEffect } from "react"
import type { GestureResponderEvent, TextStyle, ViewStyle } from "react-native"
import { Pressable, StyleSheet, View } from "react-native"
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated"
import Svg, { Polygon } from "react-native-svg"

import { useAppTheme } from "@/theme/context"
import type { Theme, ThemedStyle } from "@/theme/types"
import { accessibleForeground } from "@/utils/colorContrast"
import {
  motionDuration,
  useReducedMotion,
  type ReducedMotionPreference,
} from "@/utils/useReducedMotion"

import { Text } from "./Text"

export interface RadialMenuAction {
  id: string
  label: string
  tone: RadialMenuActionTone
  disabled?: boolean
  onPress: (event?: GestureResponderEvent) => void
}

export type RadialMenuActionTone = keyof Theme["colors"]["gameMenu"]["actions"]

export interface GameRadialMenuProps {
  open: boolean
  anchor: { x: number; y: number }
  compact?: boolean
  actions: readonly RadialMenuAction[]
  onToggle: () => void
  onClose: () => void
}

export interface RadialActionPose {
  x: number
  y: number
  rotationDeg: number
  delayMs: number
}

const MENU_BUTTON_SIZE = 80
const COMPACT_MENU_BUTTON_SIZE = 70
const MENU_FALLBACK_ANIMATION_MS = 220

const PENTAGON_SIDES = 5
const PENTAGON_VIEWBOX = 100
const PENTAGON_RADIUS = 46
const PENTAGON_STROKE_WIDTH = 7
export const PENTAGON_OPEN_ROTATION_DEG = 360 / PENTAGON_SIDES / 2

const ACTION_WIDTH = 116
const ACTION_HEIGHT = 52

const ACTION_STAGGER_MS = 35
const ACTION_START_DISTANCE = 40
const ACTION_START_SCALE = 0.5
const ACTION_START_ROTATION_LAG_DEG = 25
const ACTION_POSE_SPRING = { damping: 13, stiffness: 210, mass: 0.8 } as const
const PENTAGON_SPIN_SPRING = {
  damping: 18,
  stiffness: 220,
  mass: 0.6,
  overshootClamping: true,
} as const

const BASE_ACTION_POSE = { x: -30, y: -86, rotationDeg: 22 } as const
const CENTER_ACTION_SIDE_STEPS = [-1, 0, 1, -2, 2] as const

function rotateBasePoseToSide(stepsFromTopSide: number): RadialActionPose {
  const angleDeg = stepsFromTopSide * (360 / PENTAGON_SIDES)
  const angleRad = (angleDeg * Math.PI) / 180
  const clockwiseRank = ((stepsFromTopSide % PENTAGON_SIDES) + PENTAGON_SIDES) % PENTAGON_SIDES
  return {
    x: BASE_ACTION_POSE.x * Math.cos(angleRad) - BASE_ACTION_POSE.y * Math.sin(angleRad),
    y: BASE_ACTION_POSE.x * Math.sin(angleRad) + BASE_ACTION_POSE.y * Math.cos(angleRad),
    rotationDeg: BASE_ACTION_POSE.rotationDeg + angleDeg,
    delayMs: clockwiseRank * ACTION_STAGGER_MS,
  }
}

const CENTER_ACTION_POSES: readonly RadialActionPose[] =
  CENTER_ACTION_SIDE_STEPS.map(rotateBasePoseToSide)
const EDGE_POSE_DISTANCE = 112
const LEFT_EDGE_POSE_ANGLES = [0, 45, 90, 135, 180] as const
const FOUR_CENTER_POSE_ANGLES = [-54, 54, -126, 126] as const
const FOUR_LEFT_EDGE_POSE_ANGLES = [0, 60, 120, 180] as const

function poseAlongAngle(angleDeg: number, order: number): RadialActionPose {
  const angleRad = (angleDeg * Math.PI) / 180
  return {
    x: Math.sin(angleRad) * EDGE_POSE_DISTANCE,
    y: -Math.cos(angleRad) * EDGE_POSE_DISTANCE,
    rotationDeg: angleDeg / 2,
    delayMs: order * ACTION_STAGGER_MS,
  }
}

function mirrorPose(pose: RadialActionPose): RadialActionPose {
  return { ...pose, x: -pose.x, rotationDeg: -pose.rotationDeg }
}

export function getRadialActionPoses(
  anchor: { x: number; y: number },
  actionCount = 5,
): readonly RadialActionPose[] {
  const anchorNearLeftEdge = anchor.x < 0.4
  const anchorNearRightEdge = anchor.x > 0.6
  const edgeAngles = actionCount === 4 ? FOUR_LEFT_EDGE_POSE_ANGLES : LEFT_EDGE_POSE_ANGLES
  if (anchorNearLeftEdge) return edgeAngles.map(poseAlongAngle)
  if (anchorNearRightEdge) return edgeAngles.map(poseAlongAngle).map(mirrorPose)
  if (actionCount === 4) return FOUR_CENTER_POSE_ANGLES.map(poseAlongAngle)
  return CENTER_ACTION_POSES
}

export function getRadialActionStart(pose: RadialActionPose): { x: number; y: number } {
  const distance = Math.hypot(pose.x, pose.y) || 1
  return {
    x: (pose.x / distance) * ACTION_START_DISTANCE,
    y: (pose.y / distance) * ACTION_START_DISTANCE,
  }
}

export function buildRegularPolygonPoints(input: {
  sides: number
  center: number
  radius: number
}): string {
  const pointingUp = -Math.PI / 2
  return Array.from({ length: input.sides }, (_, corner) => {
    const angle = pointingUp + (Math.PI * 2 * corner) / input.sides
    const x = input.center + input.radius * Math.cos(angle)
    const y = input.center + input.radius * Math.sin(angle)
    return `${x.toFixed(2)},${y.toFixed(2)}`
  }).join(" ")
}

const PENTAGON_POINTS = buildRegularPolygonPoints({
  sides: PENTAGON_SIDES,
  center: PENTAGON_VIEWBOX / 2,
  radius: PENTAGON_RADIUS,
})

export function GameRadialMenu({
  open,
  anchor,
  compact,
  actions,
  onToggle,
  onClose,
}: GameRadialMenuProps) {
  const {
    themed,
    theme: { colors },
  } = useAppTheme()
  const reducedMotion = useReducedMotion()
  const animateFully = reducedMotion === false
  const pentagonRotation = useSharedValue(open ? PENTAGON_OPEN_ROTATION_DEG : 0)
  const poses = getRadialActionPoses(anchor, actions.length)

  useEffect(() => {
    const spinTarget = open ? PENTAGON_OPEN_ROTATION_DEG : 0
    pentagonRotation.value = animateFully
      ? withSpring(spinTarget, PENTAGON_SPIN_SPRING)
      : withTiming(spinTarget, {
          duration: motionDuration(reducedMotion, MENU_FALLBACK_ANIMATION_MS),
        })
  }, [animateFully, open, pentagonRotation, reducedMotion])

  const pentagonSpinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${pentagonRotation.value}deg` }],
  }))

  const anchorStyle: ViewStyle = {
    left: `${anchor.x * 100}%`,
    top: `${anchor.y * 100}%`,
  }

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      {open ? (
        <Pressable
          testID="game-menu-backdrop"
          accessibilityRole="button"
          accessibilityLabel="Close game options"
          style={themed($backdrop)}
          onPress={onClose}
        />
      ) : null}

      {open
        ? actions
            .slice(0, poses.length)
            .map((action, index) => (
              <RadialAction
                key={action.id}
                action={action}
                anchorStyle={anchorStyle}
                pose={poses[index]}
                reducedMotion={reducedMotion}
              />
            ))
        : null}

      <Animated.View
        testID="game-menu-anchor"
        pointerEvents="box-none"
        style={[
          themed($anchor),
          compact ? themed($compactAnchor) : themed($largeAnchor),
          anchorStyle,
        ]}
      >
        <Pressable
          testID="game-menu-button"
          accessibilityRole="button"
          accessibilityLabel={open ? "Close game options" : "Game options"}
          accessibilityHint={open ? "Collapses the game controls" : "Expands the game controls"}
          accessibilityState={{ expanded: open }}
          style={({ pressed }) => [themed($menuButton), pressed && $menuButtonPressed]}
          onPress={onToggle}
        >
          <Animated.View style={[StyleSheet.absoluteFill, pentagonSpinStyle]}>
            <Svg
              testID="game-menu-pentagon"
              width="100%"
              height="100%"
              viewBox={`0 0 ${PENTAGON_VIEWBOX} ${PENTAGON_VIEWBOX}`}
            >
              <Polygon
                points={PENTAGON_POINTS}
                fill={colors.gameMenu.anchor}
                stroke={colors.gameMenu.anchorBorder}
                strokeWidth={PENTAGON_STROKE_WIDTH}
                strokeLinejoin="round"
              />
            </Svg>
          </Animated.View>
          <MenuGlyph color={colors.gameMenu.anchorGlyph} open={open} />
        </Pressable>
      </Animated.View>
    </View>
  )
}

function MenuGlyph({ color, open }: { color: string; open: boolean }) {
  return (
    <View testID="game-menu-glyph" style={$menuGlyph}>
      {open ? (
        <>
          <View style={[$menuGlyphBar, { backgroundColor: color }, $closeGlyphForward]} />
          <View style={[$menuGlyphBar, { backgroundColor: color }, $closeGlyphBackward]} />
        </>
      ) : (
        <>
          <View style={[$menuGlyphBar, { backgroundColor: color }]} />
          <View style={[$menuGlyphBar, { backgroundColor: color }]} />
          <View style={[$menuGlyphBar, { backgroundColor: color }]} />
        </>
      )}
    </View>
  )
}

function RadialAction({
  action,
  anchorStyle,
  pose,
  reducedMotion,
}: {
  action: RadialMenuAction
  anchorStyle: ViewStyle
  pose: RadialActionPose
  reducedMotion: ReducedMotionPreference
}) {
  const {
    themed,
    theme: { colors },
  } = useAppTheme()
  const background = colors.gameMenu.actions[action.tone]
  const foreground = accessibleForeground(background)
  const animateFully = reducedMotion === false
  const arrive = useSharedValue(0)
  const start = getRadialActionStart(pose)

  useEffect(() => {
    arrive.value = animateFully
      ? withDelay(pose.delayMs, withSpring(1, ACTION_POSE_SPRING))
      : withTiming(1, { duration: motionDuration(reducedMotion, MENU_FALLBACK_ANIMATION_MS) })
  }, [animateFully, arrive, pose.delayMs, reducedMotion])

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: arrive.value,
    transform: [
      { translateX: start.x + (pose.x - start.x) * arrive.value },
      { translateY: start.y + (pose.y - start.y) * arrive.value },
      { rotate: `${pose.rotationDeg - ACTION_START_ROTATION_LAG_DEG * (1 - arrive.value)}deg` },
      { scale: ACTION_START_SCALE + (1 - ACTION_START_SCALE) * arrive.value },
    ],
  }))

  return (
    <Animated.View style={[themed($actionAnchor), anchorStyle, animatedStyle]}>
      <Pressable
        testID={`${action.id}-button`}
        disabled={action.disabled}
        accessibilityRole="button"
        accessibilityLabel={action.label}
        accessibilityState={{ disabled: !!action.disabled }}
        style={({ pressed }) => [
          themed($action),
          { backgroundColor: background },
          action.disabled && themed($disabledAction),
          pressed && !action.disabled && themed($pressedAction),
        ]}
        onPress={action.onPress}
      >
        <Text
          text={action.label}
          weight="bold"
          numberOfLines={1}
          maxFontSizeMultiplier={1.2}
          style={[themed($actionText), { color: foreground }]}
        />
      </Pressable>
    </Animated.View>
  )
}

const $backdrop: ThemedStyle<ViewStyle> = ({ colors }) => ({
  ...StyleSheet.absoluteFillObject,
  zIndex: 10,
  backgroundColor: colors.gameMenu.backdrop,
})
const $anchor: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
  zIndex: 30,
})
const $largeAnchor: ThemedStyle<ViewStyle> = () => ({
  width: MENU_BUTTON_SIZE,
  height: MENU_BUTTON_SIZE,
  marginLeft: -MENU_BUTTON_SIZE / 2,
  marginTop: -MENU_BUTTON_SIZE / 2,
})
const $compactAnchor: ThemedStyle<ViewStyle> = () => ({
  width: COMPACT_MENU_BUTTON_SIZE,
  height: COMPACT_MENU_BUTTON_SIZE,
  marginLeft: -COMPACT_MENU_BUTTON_SIZE / 2,
  marginTop: -COMPACT_MENU_BUTTON_SIZE / 2,
})
const $menuButton: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  alignItems: "center",
  justifyContent: "center",
})
const $menuButtonPressed: ViewStyle = {
  transform: [{ scale: 0.93 }],
}
const $menuGlyph: ViewStyle = {
  width: 24,
  height: 24,
  alignItems: "center",
  justifyContent: "center",
  gap: 4,
}
const $menuGlyphBar: ViewStyle = {
  width: 16,
  height: 2,
  borderRadius: 1,
}
const $closeGlyphForward: ViewStyle = {
  position: "absolute",
  transform: [{ rotate: "45deg" }],
}
const $closeGlyphBackward: ViewStyle = {
  position: "absolute",
  transform: [{ rotate: "-45deg" }],
}
const $actionAnchor: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
  zIndex: 20,
  width: ACTION_WIDTH,
  height: ACTION_HEIGHT,
  marginLeft: -ACTION_WIDTH / 2,
  marginTop: -ACTION_HEIGHT / 2,
})
const $action: ThemedStyle<ViewStyle> = ({ colors }) => ({
  flex: 1,
  alignItems: "center",
  justifyContent: "center",
  paddingHorizontal: 12,
  borderRadius: ACTION_HEIGHT / 2,
  shadowColor: colors.gameMenu.shadow,
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.35,
  shadowRadius: 7,
  elevation: 12,
})
const $actionText: ThemedStyle<TextStyle> = () => ({
  fontSize: 16,
  lineHeight: 20,
  letterSpacing: 0.3,
  textAlign: "center",
})
const $disabledAction: ThemedStyle<ViewStyle> = () => ({ opacity: 0.42 })
const $pressedAction: ThemedStyle<ViewStyle> = () => ({ opacity: 0.72 })
