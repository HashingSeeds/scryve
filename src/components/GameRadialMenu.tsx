import { type ComponentProps, memo, useEffect, useState } from "react"
import type { GestureResponderEvent, TextStyle, ViewStyle } from "react-native"
import { Pressable, StyleSheet, View } from "react-native"
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated"

import { nearestEquivalentAngle } from "@/features/game/pinnedBoardGeometry"
import {
  rotateGameBoardAnchor,
  type useGameBoardOrientation,
} from "@/features/game/useGameBoardOrientation"
import { useAppTheme } from "@/theme/context"
import type { GameMenuActionKind } from "@/theme/gameMenu"
import type { ThemedStyle } from "@/theme/types"
import { accessibleForeground } from "@/utils/colorContrast"
import {
  motionDuration,
  useReducedMotion,
  type ReducedMotionPreference,
} from "@/utils/useReducedMotion"

import { BoardPressable } from "./BoardPressable"
import {
  DEFAULT_MENU_BUTTON_STYLE,
  GameMenuButtonShape,
  type MenuButtonStyle,
} from "./GameMenuButtonShape"
import { Text } from "./Text"

export interface RadialMenuAction {
  kind: GameMenuActionKind
  label: string
  detail?: string
  disabled?: boolean
  blocked?: boolean
  onPress: (event?: GestureResponderEvent) => void
}

export type GameMenuSignalTone = "slow" | "offline" | "catchingUp" | "caughtUp" | "attention"

export interface GameMenuSignal {
  tone: GameMenuSignalTone
  badge?: string
  accessibilityText?: string
}

export interface GameMenuStatusLine {
  text: string
  tone: GameMenuSignalTone
  onPress: () => void
}

export interface GameRadialMenuProps {
  open: boolean
  anchor: { x: number; y: number }
  boardAnchor?: { x: number; y: number }
  nativeFrame?: ReturnType<typeof useGameBoardOrientation>["nativeFrame"]
  compact?: boolean
  actions: readonly RadialMenuAction[]
  onToggle: () => void
  onClose: () => void
  variant?: MenuButtonStyle
  seatColors?: readonly string[]
  exitAction?: { label: string; onPress: () => void }
  signal?: GameMenuSignal
  statusLine?: GameMenuStatusLine
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
export const PENTAGON_OPEN_ROTATION_DEG = 360 / PENTAGON_SIDES / 2

const ACTION_WIDTH = 116
const ACTION_HEIGHT = 52

const BORDER_CHASE_STEP_MS = 180
const MOVING_SIGNAL_TONES: readonly GameMenuSignalTone[] = ["slow", "catchingUp"]
const STATUS_LINE_DISTANCE = 128
const STATUS_LINE_HEIGHT = 40
const ANCHOR_LOW_ON_SCREEN = 0.6

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
  const anchorNearLeftEdge = anchor.x < 0.25
  const anchorNearRightEdge = anchor.x > 0.75
  const edgeAngles = actionCount === 4 ? FOUR_LEFT_EDGE_POSE_ANGLES : LEFT_EDGE_POSE_ANGLES
  if (anchorNearLeftEdge) return edgeAngles.map(poseAlongAngle)
  if (anchorNearRightEdge) return edgeAngles.map(poseAlongAngle).map(mirrorPose)
  if (actionCount === 4) return FOUR_CENTER_POSE_ANGLES.map(poseAlongAngle)
  return CENTER_ACTION_POSES
}

export function getRadialActionStart(pose: { x: number; y: number }): { x: number; y: number } {
  "worklet"
  const distance = Math.hypot(pose.x, pose.y) || 1
  return {
    x: (pose.x / distance) * ACTION_START_DISTANCE,
    y: (pose.y / distance) * ACTION_START_DISTANCE,
  }
}

export const GameRadialMenu = memo(function GameRadialMenu({
  open,
  anchor,
  boardAnchor,
  nativeFrame,
  compact,
  actions,
  onToggle,
  onClose,
  variant = DEFAULT_MENU_BUTTON_STYLE,
  seatColors,
  exitAction,
  signal,
  statusLine,
}: GameRadialMenuProps) {
  const {
    themed,
    theme: { colors },
  } = useAppTheme()
  const menuOpen = open && !exitAction

  const anchorStyle = percentAnchorStyle(anchor)

  const nativeAnchorStyle = useAnimatedStyle(() => {
    const frame = nativeFrame?.value
    if (!boardAnchor || !frame) return { left: `${anchor.x * 100}%`, top: `${anchor.y * 100}%` }
    const position = rotateGameBoardAnchor(boardAnchor, frame.rotation)
    return { left: position.x * frame.width, top: position.y * frame.height }
  })

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <GameMenuBackdrop open={menuOpen} onClose={onClose} />
      <GameRadialFan
        open={menuOpen}
        anchor={anchor}
        anchorStyle={[anchorStyle, nativeAnchorStyle]}
        actions={actions}
      />
      <GameMenuAnchor
        open={menuOpen}
        anchor={anchor}
        anchorStyle={[anchorStyle, nativeAnchorStyle]}
        compact={compact}
        variant={variant}
        seatColors={seatColors}
        exitAction={exitAction}
        signal={signal}
        onToggle={onToggle}
      />

      {menuOpen && statusLine ? (
        <View
          pointerEvents="box-none"
          style={[
            themed($statusLineRow),
            {
              top: `${anchor.y * 100}%`,
              marginTop:
                anchor.y > ANCHOR_LOW_ON_SCREEN
                  ? -STATUS_LINE_DISTANCE - STATUS_LINE_HEIGHT
                  : STATUS_LINE_DISTANCE,
            },
          ]}
        >
          <Pressable
            testID="game-menu-status-line"
            accessibilityRole="button"
            accessibilityLabel={statusLine.text}
            accessibilityHint="Shows connection details"
            style={({ pressed }) => [themed($statusLine), pressed && themed($pressedAction)]}
            onPress={statusLine.onPress}
          >
            <View
              style={[
                themed($statusDot),
                { backgroundColor: colors.gameMenu.signal[statusLine.tone] },
              ]}
            />
            <Text text={statusLine.text} weight="medium" size="xs" style={themed($statusText)} />
            <Text text="›" size="xs" style={themed($statusText)} />
          </Pressable>
        </View>
      ) : null}
    </View>
  )
})

type AnchorStyle = ComponentProps<typeof Animated.View>["style"]

function percentAnchorStyle(anchor: { x: number; y: number }): ViewStyle {
  return { left: `${anchor.x * 100}%`, top: `${anchor.y * 100}%` }
}

export function GameMenuBackdrop({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { themed } = useAppTheme()
  if (!open) return null
  return (
    <BoardPressable
      testID="game-menu-backdrop"
      accessibilityRole="button"
      accessibilityLabel="Close game options"
      style={themed($backdrop)}
      onPress={onClose}
    />
  )
}

function GameRadialFan({
  open,
  anchor,
  anchorStyle = percentAnchorStyle(anchor),
  actions,
  poseTurnMs = 0,
}: {
  open: boolean
  anchor: { x: number; y: number }
  anchorStyle?: AnchorStyle
  actions: readonly RadialMenuAction[]
  poseTurnMs?: number
}) {
  const reducedMotion = useReducedMotion()
  const poses = getRadialActionPoses(anchor, actions.length)
  return (
    <>
      {actions.slice(0, poses.length).map((action, index) => (
        <RadialAction
          key={action.kind}
          action={action}
          anchorStyle={anchorStyle}
          pose={poses[index]}
          reducedMotion={reducedMotion}
          open={open}
          poseTurnMs={poseTurnMs}
        />
      ))}
    </>
  )
}

const FACING_TURN_MS = 260
const CLUSTER_SIZE = 2 * (EDGE_POSE_DISTANCE + ACTION_WIDTH)

type GameMenuAnchorProps = {
  open: boolean
  anchor: { x: number; y: number }
  anchorStyle?: AnchorStyle
  compact?: boolean
  variant?: MenuButtonStyle
  seatColors?: readonly string[]
  exitAction?: { label: string; onPress: () => void }
  signal?: GameMenuSignal
  onToggle: () => void
}

/** why: a hardware-pinned board does not turn with the window, so the pentagon and its fan stay put through the system rotation and then turn together about the anchor to face the holder (`facingAngle`, clockwise degrees). `holderAnchor` is where the anchor sits in the holder's view and picks the side the fan opens toward. The box is large enough to contain the fan, because Android drops touches outside a parent's bounds. */
export function GameMenuCluster({
  holderAnchor,
  facingAngle,
  actions,
  ...anchorProps
}: Omit<GameMenuAnchorProps, "anchorStyle"> & {
  holderAnchor: { x: number; y: number }
  facingAngle: number
  actions: readonly RadialMenuAction[]
}) {
  const reducedMotion = useReducedMotion()
  const animateFully = reducedMotion === false
  const facing = useSharedValue(facingAngle)

  useEffect(() => {
    const target = nearestEquivalentAngle(facing.value, facingAngle)
    facing.value = animateFully ? withTiming(target, { duration: FACING_TURN_MS }) : target
  }, [animateFully, facing, facingAngle])

  const facingStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${facing.value}deg` }],
  }))

  return (
    <Animated.View
      testID="game-menu-cluster"
      pointerEvents="box-none"
      style={[$cluster, percentAnchorStyle(anchorProps.anchor), facingStyle]}
    >
      <GameRadialFan
        open={anchorProps.open && !anchorProps.exitAction}
        anchor={holderAnchor}
        anchorStyle={$clusterCenter}
        actions={actions}
        poseTurnMs={FACING_TURN_MS}
      />
      <GameMenuAnchor {...anchorProps} anchorStyle={$clusterCenter} />
    </Animated.View>
  )
}

function GameMenuAnchor({
  open,
  anchor,
  anchorStyle = percentAnchorStyle(anchor),
  compact,
  variant = DEFAULT_MENU_BUTTON_STYLE,
  seatColors,
  exitAction,
  signal,
  onToggle,
}: GameMenuAnchorProps) {
  const {
    themed,
    theme: { colors, isDark },
  } = useAppTheme()
  const reducedMotion = useReducedMotion()
  const animateFully = reducedMotion === false
  const suppressed = !!exitAction
  const menuOpen = open && !suppressed
  const pentagonRotation = useSharedValue(
    menuOpen ? PENTAGON_OPEN_ROTATION_DEG : suppressed ? -PENTAGON_OPEN_ROTATION_DEG : 0,
  )
  useEffect(() => {
    const spinTarget = menuOpen
      ? PENTAGON_OPEN_ROTATION_DEG
      : suppressed
        ? -PENTAGON_OPEN_ROTATION_DEG
        : 0
    pentagonRotation.value = animateFully
      ? withSpring(spinTarget, PENTAGON_SPIN_SPRING)
      : withTiming(spinTarget, {
          duration: motionDuration(reducedMotion, MENU_FALLBACK_ANIMATION_MS),
        })
  }, [animateFully, menuOpen, suppressed, pentagonRotation, reducedMotion])

  const pentagonSpinStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${pentagonRotation.value}deg` }],
  }))
  return (
    <Animated.View
      testID="game-menu-anchor"
      pointerEvents="box-none"
      style={[
        themed($anchor),
        compact ? themed($compactAnchor) : themed($largeAnchor),
        anchorStyle,
      ]}
    >
      <BoardPressable
        testID="game-menu-button"
        accessibilityRole="button"
        accessibilityLabel={[
          exitAction ? exitAction.label : menuOpen ? "Close game options" : "Game options",
          signal?.accessibilityText,
        ]
          .filter(Boolean)
          .join(". ")}
        accessibilityHint={
          exitAction
            ? undefined
            : menuOpen
              ? "Collapses the game controls"
              : "Expands the game controls"
        }
        accessibilityState={{ expanded: menuOpen }}
        style={({ pressed }) => [themed($menuButton), pressed && $menuButtonPressed]}
        onPress={exitAction ? exitAction.onPress : onToggle}
      >
        <Animated.View style={[StyleSheet.absoluteFill, pentagonSpinStyle]}>
          <SignalledMenuButtonShape
            variant={variant}
            isDark={isDark}
            seatColors={seatColors}
            tone={signal?.tone}
            reducedMotion={reducedMotion}
          />
        </Animated.View>
        <MenuGlyph
          color={colors.gameMenu.anchorGlyph}
          pose={menuOpen ? 1 : exitAction ? -1 : 0}
          animateFully={animateFully}
          reducedMotion={reducedMotion}
        />
      </BoardPressable>
      {signal?.badge ? (
        <View
          testID="game-menu-signal-badge"
          pointerEvents="none"
          style={[themed($signalBadge), { backgroundColor: colors.gameMenu.signal[signal.tone] }]}
        >
          <Text
            text={signal.badge}
            weight="bold"
            maxFontSizeMultiplier={1.2}
            style={[
              themed($signalBadgeText),
              { color: accessibleForeground(colors.gameMenu.signal[signal.tone]) },
            ]}
          />
        </View>
      ) : null}
    </Animated.View>
  )
}

function useChasingSide(active: boolean): number | undefined {
  const [side, setSide] = useState(0)
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setSide((current) => (current + 1) % 5), BORDER_CHASE_STEP_MS)
    return () => clearInterval(timer)
  }, [active])
  return active ? side : undefined
}

function SignalledMenuButtonShape({
  variant,
  isDark,
  seatColors,
  tone,
  reducedMotion,
}: {
  variant: MenuButtonStyle
  isDark: boolean
  seatColors?: readonly string[]
  tone?: GameMenuSignalTone
  reducedMotion: ReducedMotionPreference
}) {
  const {
    theme: { colors },
  } = useAppTheme()
  const moving = tone !== undefined && MOVING_SIGNAL_TONES.includes(tone)
  const animateMovement = moving && reducedMotion === false
  const litSideIndex = useChasingSide(animateMovement)
  const toneColor = tone ? colors.gameMenu.signal[tone] : undefined
  return (
    <GameMenuButtonShape
      variant={variant}
      isDark={isDark}
      boardBackgroundColor={colors.gameMenu.anchorBorder}
      borderColor={moving && animateMovement ? undefined : toneColor}
      litSide={
        toneColor && litSideIndex !== undefined
          ? { index: litSideIndex, color: toneColor }
          : undefined
      }
      seatColors={seatColors}
    />
  )
}

const GLYPH_MORPH_SPRING = { damping: 16, stiffness: 220, mass: 0.5 } as const

function MenuGlyph({
  color,
  pose,
  animateFully,
  reducedMotion,
}: {
  color: string
  pose: -1 | 0 | 1
  animateFully: boolean
  reducedMotion: ReducedMotionPreference
}) {
  const morph = useSharedValue(pose)

  useEffect(() => {
    morph.value = animateFully
      ? withSpring(pose, GLYPH_MORPH_SPRING)
      : withTiming(pose, {
          duration: motionDuration(reducedMotion, MENU_FALLBACK_ANIMATION_MS),
        })
  }, [animateFully, morph, pose, reducedMotion])

  const topBar = useAnimatedStyle(() => ({
    transform: [{ translateY: 5 * Math.abs(morph.value) }, { rotate: `${45 * morph.value}deg` }],
  }))
  const midBar = useAnimatedStyle(() => ({
    opacity: 1 - Math.abs(morph.value),
    transform: [{ scaleX: 1 - 0.6 * Math.abs(morph.value) }],
  }))
  const bottomBar = useAnimatedStyle(() => ({
    transform: [{ translateY: -5 * Math.abs(morph.value) }, { rotate: `${-45 * morph.value}deg` }],
  }))

  return (
    <View testID="game-menu-glyph" style={$menuGlyph}>
      <Animated.View style={[$menuGlyphBar, { backgroundColor: color }, topBar]} />
      <Animated.View style={[$menuGlyphBar, { backgroundColor: color }, midBar]} />
      <Animated.View style={[$menuGlyphBar, { backgroundColor: color }, bottomBar]} />
    </View>
  )
}

function RadialAction({
  action,
  anchorStyle,
  pose,
  reducedMotion,
  open,
  poseTurnMs,
}: {
  action: RadialMenuAction
  anchorStyle: ComponentProps<typeof Animated.View>["style"]
  pose: RadialActionPose
  reducedMotion: ReducedMotionPreference
  open: boolean
  poseTurnMs: number
}) {
  const {
    themed,
    theme: { colors },
  } = useAppTheme()
  const background = colors.gameMenu.actions[action.kind]
  const foreground = accessibleForeground(background)
  const animateFully = reducedMotion === false
  const arrive = useSharedValue(0)
  const poseX = useSharedValue(pose.x)
  const poseY = useSharedValue(pose.y)
  const poseRotation = useSharedValue(pose.rotationDeg)

  useEffect(() => {
    const duration = animateFully ? poseTurnMs : 0
    poseX.value = withTiming(pose.x, { duration })
    poseY.value = withTiming(pose.y, { duration })
    poseRotation.value = withTiming(nearestEquivalentAngle(poseRotation.value, pose.rotationDeg), {
      duration,
    })
  }, [animateFully, pose.x, pose.y, pose.rotationDeg, poseRotation, poseTurnMs, poseX, poseY])

  useEffect(() => {
    if (!open) {
      arrive.value = 0
      return
    }
    arrive.value = animateFully
      ? withDelay(pose.delayMs, withSpring(1, ACTION_POSE_SPRING))
      : withTiming(1, {
          duration: motionDuration(reducedMotion, MENU_FALLBACK_ANIMATION_MS),
        })
  }, [animateFully, arrive, open, pose.delayMs, reducedMotion])

  const animatedStyle = useAnimatedStyle(() => {
    const target = { x: poseX.value, y: poseY.value }
    const start = getRadialActionStart(target)
    return {
      opacity: arrive.value,
      transform: [
        { translateX: start.x + (target.x - start.x) * arrive.value },
        { translateY: start.y + (target.y - start.y) * arrive.value },
        {
          rotate: `${poseRotation.value - ACTION_START_ROTATION_LAG_DEG * (1 - arrive.value)}deg`,
        },
        { scale: ACTION_START_SCALE + (1 - ACTION_START_SCALE) * arrive.value },
      ],
    }
  })

  return (
    <Animated.View
      style={[themed($actionAnchor), anchorStyle, animatedStyle]}
      pointerEvents={open ? "auto" : "none"}
      aria-hidden={!open}
    >
      <BoardPressable
        testID={open ? `${action.kind}-button` : undefined}
        disabled={action.disabled}
        accessibilityRole="button"
        accessibilityLabel={action.detail ? `${action.label}, ${action.detail}` : action.label}
        accessibilityState={{ disabled: !!action.disabled }}
        style={({ pressed }) => [
          themed($action),
          { backgroundColor: background },
          (action.disabled || action.blocked) && themed($disabledAction),
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
        {action.detail ? (
          <Text
            text={action.detail}
            size="xxs"
            numberOfLines={1}
            maxFontSizeMultiplier={1.1}
            style={[themed($actionDetail), { color: foreground }]}
          />
        ) : null}
      </BoardPressable>
    </Animated.View>
  )
}

const $cluster: ViewStyle = {
  position: "absolute",
  zIndex: 30,
  width: CLUSTER_SIZE,
  height: CLUSTER_SIZE,
  marginLeft: -CLUSTER_SIZE / 2,
  marginTop: -CLUSTER_SIZE / 2,
}
const $clusterCenter: ViewStyle = { left: CLUSTER_SIZE / 2, top: CLUSTER_SIZE / 2 }
const $backdrop: ThemedStyle<ViewStyle> = ({ colors }) => ({
  ...StyleSheet.absoluteFill,
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
  gap: 3,
}
const $menuGlyphBar: ViewStyle = {
  width: 16,
  height: 2,
  borderRadius: 1,
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
const $actionDetail: ThemedStyle<TextStyle> = () => ({
  fontSize: 10,
  lineHeight: 12,
  textAlign: "center",
})
const $signalBadge: ThemedStyle<ViewStyle> = ({ colors }) => ({
  position: "absolute",
  top: -4,
  right: -4,
  minWidth: 22,
  height: 22,
  paddingHorizontal: 5,
  borderRadius: 11,
  borderWidth: 2,
  borderColor: colors.board.background,
  alignItems: "center",
  justifyContent: "center",
})
const $signalBadgeText: ThemedStyle<TextStyle> = () => ({
  fontSize: 12,
  lineHeight: 15,
})
const $statusLineRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  position: "absolute",
  zIndex: 25,
  left: spacing.lg,
  right: spacing.lg,
  height: STATUS_LINE_HEIGHT,
  alignItems: "center",
})
const $statusLine: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  height: STATUS_LINE_HEIGHT,
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
  paddingHorizontal: spacing.md,
  borderRadius: STATUS_LINE_HEIGHT / 2,
  borderWidth: 1,
  borderColor: colors.board.border,
  backgroundColor: colors.board.surface,
})
const $statusDot: ThemedStyle<ViewStyle> = () => ({ width: 9, height: 9, borderRadius: 4.5 })
const $statusText: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.board.text })
const $disabledAction: ThemedStyle<ViewStyle> = () => ({ opacity: 0.42 })
const $pressedAction: ThemedStyle<ViewStyle> = () => ({ opacity: 0.72 })
