import { useEffect } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { Pressable, StyleSheet, View } from "react-native"
import Animated, {
  Easing,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated"

import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { accessibleForeground } from "@/utils/colorContrast"
import { motionDuration, useReducedMotion } from "@/utils/useReducedMotion"

import { Text } from "./Text"

export interface RadialMenuAction {
  id: string
  label: string
  glyph: string
  color: string
  disabled?: boolean
  onPress: () => void
}

export interface GameRadialMenuProps {
  open: boolean
  anchor: { x: number; y: number }
  compact?: boolean
  actions: readonly RadialMenuAction[]
  onToggle: () => void
  onClose: () => void
}

const CENTER_ACTION_OFFSETS = [
  { x: -112, y: -68 },
  { x: 0, y: -126 },
  { x: 112, y: -68 },
  { x: -112, y: 68 },
  { x: 112, y: 68 },
] as const
const LEFT_ACTION_OFFSETS = [
  { x: 104, y: -98 },
  { x: 0, y: -126 },
  { x: 148, y: 0 },
  { x: 104, y: 98 },
  { x: 0, y: 126 },
] as const
const RIGHT_ACTION_OFFSETS = LEFT_ACTION_OFFSETS.map(({ x, y }) => ({ x: -x, y }))
const FOUR_CENTER_ACTION_OFFSETS = [
  { x: -108, y: -72 },
  { x: 108, y: -72 },
  { x: -108, y: 72 },
  { x: 108, y: 72 },
] as const
const FOUR_LEFT_ACTION_OFFSETS = [
  { x: 0, y: -116 },
  { x: 132, y: -54 },
  { x: 132, y: 54 },
  { x: 0, y: 116 },
] as const
const FOUR_RIGHT_ACTION_OFFSETS = FOUR_LEFT_ACTION_OFFSETS.map(({ x, y }) => ({ x: -x, y }))

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
  const progress = useSharedValue(open ? 1 : 0)
  const actionOffsets = getRadialActionOffsets(anchor, actions.length)

  useEffect(() => {
    progress.value = withTiming(open ? 1 : 0, {
      duration: motionDuration(reducedMotion, 220),
      easing: Easing.out(Easing.cubic),
    })
  }, [open, progress, reducedMotion])

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
            .slice(0, actionOffsets.length)
            .map((action, index) => (
              <RadialAction
                key={action.id}
                action={action}
                anchorStyle={anchorStyle}
                offset={actionOffsets[index]}
                progress={progress}
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
          style={({ pressed }) => [
            themed($menuButton),
            pressed && { backgroundColor: colors.separator },
          ]}
          onPress={onToggle}
        >
          <Text text={open ? "×" : "≡"} style={themed($menuGlyph)} />
        </Pressable>
      </Animated.View>
    </View>
  )
}

export function getRadialActionOffsets(anchor: { x: number; y: number }, actionCount = 5) {
  if (actionCount === 4) {
    if (anchor.x < 0.4) return FOUR_LEFT_ACTION_OFFSETS
    if (anchor.x > 0.6) return FOUR_RIGHT_ACTION_OFFSETS
    return FOUR_CENTER_ACTION_OFFSETS
  }
  if (anchor.x < 0.4) return LEFT_ACTION_OFFSETS
  if (anchor.x > 0.6) return RIGHT_ACTION_OFFSETS
  return CENTER_ACTION_OFFSETS
}

function RadialAction({
  action,
  anchorStyle,
  offset,
  progress,
}: {
  action: RadialMenuAction
  anchorStyle: ViewStyle
  offset: { x: number; y: number }
  progress: SharedValue<number>
}) {
  const { themed } = useAppTheme()
  const foreground = accessibleForeground(action.color)
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateX: offset.x * progress.value },
      { translateY: offset.y * progress.value },
      { scale: 0.65 + progress.value * 0.35 },
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
          { backgroundColor: action.color },
          action.disabled && themed($disabledAction),
          pressed && !action.disabled && themed($pressedAction),
        ]}
        onPress={action.onPress}
      >
        <Text
          text={`${action.glyph}  ${action.label}`}
          weight="bold"
          numberOfLines={1}
          maxFontSizeMultiplier={1.2}
          style={[themed($actionText), { color: foreground }]}
        />
      </Pressable>
    </Animated.View>
  )
}

const $backdrop: ThemedStyle<ViewStyle> = () => ({
  ...StyleSheet.absoluteFillObject,
  zIndex: 10,
  backgroundColor: "rgba(0,0,0,0.56)",
})
const $anchor: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
  zIndex: 30,
})
const $largeAnchor: ThemedStyle<ViewStyle> = () => ({
  width: 68,
  height: 68,
  marginLeft: -34,
  marginTop: -34,
})
const $compactAnchor: ThemedStyle<ViewStyle> = () => ({
  width: 60,
  height: 60,
  marginLeft: -30,
  marginTop: -30,
})
const $menuButton: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 999,
  borderWidth: 5,
  borderColor: "rgba(255,255,255,0.78)",
  backgroundColor: "#050505",
  shadowColor: "#000000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.35,
  shadowRadius: 6,
  elevation: 12,
})
const $menuGlyph: ThemedStyle<TextStyle> = () => ({
  color: "#FFFFFF",
  fontSize: 38,
  lineHeight: 42,
})
const $actionAnchor: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
  zIndex: 20,
  width: 112,
  height: 48,
  marginLeft: -56,
  marginTop: -24,
})
const $action: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  alignItems: "center",
  justifyContent: "center",
  paddingHorizontal: 10,
  borderRadius: 24,
  borderWidth: 2,
  borderColor: "rgba(255,255,255,0.72)",
  shadowColor: "#000000",
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.28,
  shadowRadius: 4,
  elevation: 10,
})
const $actionText: ThemedStyle<TextStyle> = () => ({
  fontSize: 14,
  lineHeight: 18,
  textAlign: "center",
})
const $disabledAction: ThemedStyle<ViewStyle> = () => ({ opacity: 0.42 })
const $pressedAction: ThemedStyle<ViewStyle> = () => ({ opacity: 0.72 })
