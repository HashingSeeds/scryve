import { type ComponentProps, memo, useEffect } from "react"
import type { GestureResponderEvent, StyleProp, TextStyle, ViewStyle } from "react-native"
import { StyleSheet, View } from "react-native"
import Animated, {
  Easing,
  ReduceMotion,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  ZoomIn,
  ZoomOut,
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
import { useCloseOnBack } from "@/utils/useCloseOnBack"
import {
  motionDuration,
  useReducedMotion,
  type ReducedMotionPreference,
} from "@/utils/useReducedMotion"

import { BoardPressable } from "./BoardPressable"
import { DiceGlyph } from "./DiceGlyph"
import {
  DEFAULT_MENU_BUTTON_STYLE,
  GameMenuButtonShape,
  type MenuButtonStyle,
  mixColorsInLinearLight,
  PENTAGON_BADGE_ANCHOR,
} from "./GameMenuButtonShape"
import { PlayerMark } from "./PlayerMark"
import { Text } from "./Text"
import type { PlayerMarkShape } from "../../convex/lib/appearance"

export interface RadialMenuTool {
  key: string
  label: string
  accessibilityLabel: string
  selected?: boolean
  dimmed?: boolean
  onPress: () => void
}

/** why: an action is a plain pill, or a pill holding two round tools: `tools[0]` sits in the end nearer the pentagon and the other rolls out from under it as the pill lands. */
export type RadialMenuAction = {
  kind: GameMenuActionKind
  label: string
  detail?: string
  disabled?: boolean
  blocked?: boolean
} & (
  | { onPress: (event?: GestureResponderEvent) => void; tools?: undefined }
  | { tools: readonly RadialMenuTool[]; onPress?: undefined }
)

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

/** why: a one-tap offer that sits on the pentagon's upper corner while it applies, such as rolling for who goes first. */
export interface GameMenuBadge {
  color: string
  glyph: { tool: "d20" | "coin" } | { seatNumber: number; shape?: PlayerMarkShape }
  accessibilityLabel: string
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
  // why: this action stays out after the menu closes, so its tools keep working once the backdrop lifts and the seats are live.
  heldAction?: GameMenuActionKind
  badge?: GameMenuBadge
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

const TOOL_SIZE = 44
const TOOL_RADIUS = TOOL_SIZE / 2
const TOOL_INSET = (ACTION_HEIGHT - TOOL_SIZE) / 2
const TOOL_END_INSET = 8
// why: two tools sit inside the pill's own width, one in each half, with the pill's padding around them.
const TOOL_OFFSET = ACTION_WIDTH / 2 - TOOL_END_INSET - TOOL_RADIUS
// why: the outer tool starts rolling out a beat after the pill starts arriving, so it emerges from under the inner one as the pill lands.
const TOOL_ROLL_LAG_MS = 120
const TOOL_ROLL_MS = 400
const TOOL_ROLL_EASING = Easing.bezier(0.25, 1.15, 0.45, 1)
const TOOL_TINT = 0.45
const BADGE_SIZE = 28
const BADGE_POP_DELAY_MS = 260

const MOVING_SIGNAL_TONES: readonly GameMenuSignalTone[] = ["slow", "catchingUp"]
const STATUS_LINE_DISTANCE = 128
const STATUS_LINE_HEIGHT = 40
const STATUS_LINE_REACH = STATUS_LINE_DISTANCE + STATUS_LINE_HEIGHT
// why: the app navigation shown with the menu sits along the bottom of the window, so the status line must not land there.
const APP_NAVIGATION_CLEARANCE = 96
const ANCHOR_LOW_ON_SCREEN = 0.6

const ACTION_STAGGER_MS = 35
const ACTION_START_DISTANCE = 40
const ACTION_START_SCALE = 0.5
const ACTION_START_ROTATION_LAG_DEG = 25
const ACTION_POSE_SPRING = { damping: 13, stiffness: 210, mass: 0.8 } as const
const SIGNAL_BADGE_SCALE_MS = 180
// why: "needs you" is the one state worth interrupting for, so the button pops once when it arrives.
const ATTENTION_POP_SCALE = 1.1
const ATTENTION_POP_RISE_MS = 130
const ATTENTION_POP_SETTLE_MS = 190
// why: flat at the start, so a first web frame that lands before the start time cannot shrink the button.
const POP_EASING = Easing.inOut(Easing.quad)
// why: Reanimated reads the system setting only at startup, so animations we already gate on the live preference must not consult it again.
const GATED_MOTION = ReduceMotion.Never
const BADGE_ENTERING = ZoomIn.duration(SIGNAL_BADGE_SCALE_MS).reduceMotion(GATED_MOTION)
const BADGE_EXITING = ZoomOut.duration(SIGNAL_BADGE_SCALE_MS).reduceMotion(GATED_MOTION)
// why: the offer pops in after the board has dealt in, so it reads as an invitation rather than part of the button.
const START_BADGE_ENTERING = ZoomIn.delay(BADGE_POP_DELAY_MS)
  .duration(SIGNAL_BADGE_SCALE_MS)
  .reduceMotion(GATED_MOTION)
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

export function getRadialToolOffsets(
  pose: Pick<RadialActionPose, "x" | "y" | "rotationDeg">,
): readonly [number, number] {
  const angle = (pose.rotationDeg * Math.PI) / 180
  const plusEnd = {
    x: pose.x + TOOL_OFFSET * Math.cos(angle),
    y: pose.y + TOOL_OFFSET * Math.sin(angle),
  }
  const plusEndIsNearerThePentagon = Math.hypot(plusEnd.x, plusEnd.y) < Math.hypot(pose.x, pose.y)
  const inner = plusEndIsNearerThePentagon ? TOOL_OFFSET : -TOOL_OFFSET
  return [inner, -inner]
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
  heldAction,
  badge,
}: GameRadialMenuProps) {
  const { themed } = useAppTheme()
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
        heldAction={heldAction}
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
        badge={badge}
        onToggle={onToggle}
      />

      {menuOpen && statusLine ? (
        <GameMenuStatusRow
          statusLine={statusLine}
          above={anchor.y > ANCHOR_LOW_ON_SCREEN}
          atAnchorStyle={[themed($statusLineInset), { top: `${anchor.y * 100}%` }]}
        />
      ) : null}
    </View>
  )
})

function GameMenuStatusRow({
  statusLine,
  above,
  atAnchorStyle,
}: {
  statusLine: GameMenuStatusLine
  above: boolean
  atAnchorStyle: StyleProp<ViewStyle>
}) {
  const {
    themed,
    theme: { colors },
  } = useAppTheme()
  return (
    <View
      pointerEvents="box-none"
      style={[
        themed($statusLineRow),
        atAnchorStyle,
        {
          marginTop: above ? -STATUS_LINE_REACH : STATUS_LINE_DISTANCE,
        },
      ]}
    >
      <BoardPressable
        testID="game-menu-status-line"
        accessibilityRole="button"
        accessibilityLabel={statusLine.text}
        accessibilityHint="Shows connection details"
        style={({ pressed }) => [themed($statusLine), pressed && themed($pressedAction)]}
        onPress={statusLine.onPress}
      >
        <View
          style={[themed($statusDot), { backgroundColor: colors.gameMenu.signal[statusLine.tone] }]}
        />
        <Text text={statusLine.text} weight="medium" size="xs" style={themed($statusText)} />
        <Text text="›" size="xs" style={themed($statusText)} />
      </BoardPressable>
    </View>
  )
}

type AnchorStyle = ComponentProps<typeof Animated.View>["style"]

function percentAnchorStyle(anchor: { x: number; y: number }): ViewStyle {
  return { left: `${anchor.x * 100}%`, top: `${anchor.y * 100}%` }
}

export function GameMenuBackdrop({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { themed } = useAppTheme()
  useCloseOnBack(open, onClose)
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
  heldAction,
  anchor,
  anchorStyle = percentAnchorStyle(anchor),
  actions,
  poseTurnMs = 0,
}: {
  open: boolean
  heldAction?: GameMenuActionKind
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
          open={open || action.kind === heldAction}
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
  badge?: GameMenuBadge
  onToggle: () => void
}

/** why: a hardware-pinned board does not turn with the window, so the pentagon and its fan stay put through the system rotation and then turn together about the anchor to face the holder (`facingAngle`, clockwise degrees). `holderAnchor` is where the anchor sits in the holder's view and picks the side the fan opens toward. The box is large enough to contain the fan, because Android drops touches outside a parent's bounds. */
export const GameMenuCluster = memo(function GameMenuCluster({
  holderAnchor,
  holderHeight,
  facingAngle,
  actions,
  statusLine,
  heldAction,
  ...anchorProps
}: Omit<GameMenuAnchorProps, "anchorStyle"> & {
  holderAnchor: { x: number; y: number }
  holderHeight: number
  facingAngle: number
  actions: readonly RadialMenuAction[]
  statusLine?: GameMenuStatusLine
  heldAction?: GameMenuActionKind
}) {
  const menuOpen = anchorProps.open && !anchorProps.exitAction
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
        open={menuOpen}
        heldAction={heldAction}
        anchor={holderAnchor}
        anchorStyle={$clusterCenter}
        actions={actions}
        poseTurnMs={FACING_TURN_MS}
      />
      <GameMenuAnchor {...anchorProps} anchorStyle={$clusterCenter} />
      {menuOpen && statusLine ? (
        <GameMenuStatusRow
          statusLine={statusLine}
          above={
            holderAnchor.y > ANCHOR_LOW_ON_SCREEN ||
            (1 - holderAnchor.y) * holderHeight < STATUS_LINE_REACH + APP_NAVIGATION_CLEARANCE
          }
          atAnchorStyle={$clusterStatusRow}
        />
      ) : null}
    </Animated.View>
  )
})

function GameMenuAnchor({
  open,
  anchor,
  anchorStyle = percentAnchorStyle(anchor),
  compact,
  variant = DEFAULT_MENU_BUTTON_STYLE,
  seatColors,
  exitAction,
  signal,
  badge,
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
  useCloseOnBack(suppressed, () => exitAction?.onPress())
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

  const pop = useSharedValue(1)
  const needsAttention = signal?.tone === "attention"
  useEffect(() => {
    if (!animateFully) {
      pop.value = 1
      return
    }
    if (!needsAttention) return
    pop.value = withSequence(
      GATED_MOTION,
      withTiming(ATTENTION_POP_SCALE, {
        duration: ATTENTION_POP_RISE_MS,
        easing: POP_EASING,
        reduceMotion: GATED_MOTION,
      }),
      withTiming(1, {
        duration: ATTENTION_POP_SETTLE_MS,
        easing: POP_EASING,
        reduceMotion: GATED_MOTION,
      }),
    )
  }, [animateFully, needsAttention, pop])
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }))

  return (
    <Animated.View
      testID="game-menu-anchor"
      pointerEvents="box-none"
      style={[
        themed($anchor),
        compact ? themed($compactAnchor) : themed($largeAnchor),
        anchorStyle,
        popStyle,
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
          pointerEvents="none"
          style={[
            $signalBadgeCenter,
            compact ? $compactSignalBadgeCenter : $largeSignalBadgeCenter,
          ]}
        >
          <Animated.View
            testID="game-menu-signal-badge"
            entering={animateFully ? BADGE_ENTERING : undefined}
            exiting={animateFully ? BADGE_EXITING : undefined}
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
          </Animated.View>
        </View>
      ) : null}
      {badge && !menuOpen && !suppressed ? (
        <View
          pointerEvents="box-none"
          style={[$signalBadgeCenter, compact ? $compactStartBadgeCenter : $largeStartBadgeCenter]}
        >
          <Animated.View entering={animateFully ? START_BADGE_ENTERING : undefined}>
            <BoardPressable
              testID="first-player-badge"
              accessibilityRole="button"
              accessibilityLabel={badge.accessibilityLabel}
              hitSlop={9}
              onPress={badge.onPress}
              style={({ pressed }) => [
                themed($startBadge),
                { backgroundColor: badge.color },
                pressed && themed($pressedAction),
              ]}
            >
              {"tool" in badge.glyph ? (
                <DiceGlyph
                  tool={badge.glyph.tool}
                  size={15}
                  color={accessibleForeground(badge.color)}
                />
              ) : (
                <PlayerMark
                  seatNumber={badge.glyph.seatNumber}
                  shape={badge.glyph.shape}
                  color={accessibleForeground(badge.color)}
                  size={15}
                />
              )}
            </BoardPressable>
          </Animated.View>
        </View>
      ) : null}
    </Animated.View>
  )
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
  return (
    <GameMenuButtonShape
      variant={variant}
      isDark={isDark}
      boardBackgroundColor={colors.gameMenu.anchorBorder}
      signal={
        tone
          ? {
              color: colors.gameMenu.signal[tone],
              motion: MOVING_SIGNAL_TONES.includes(tone) ? "trace" : "ring",
            }
          : undefined
      }
      animateSignal={reducedMotion === false}
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

  if (action.tools) {
    return (
      <Animated.View
        style={[themed($actionAnchor), anchorStyle, animatedStyle]}
        pointerEvents={open ? "box-none" : "none"}
        aria-hidden={!open}
      >
        <View pointerEvents="box-none" style={[themed($action), { backgroundColor: background }]}>
          <RadialToolRow
            kind={action.kind}
            tools={action.tools}
            pose={pose}
            open={open}
            animateFully={animateFully}
            background={background}
          />
        </View>
      </Animated.View>
    )
  }

  return (
    <Animated.View
      style={[themed($actionAnchor), anchorStyle, animatedStyle]}
      pointerEvents={open ? "auto" : "none"}
      aria-hidden={!open}
    >
      <BoardPressable
        testID={open ? `${action.kind}-button` : undefined}
        // why: a hidden action stays mounted, so it must leave the tab order or a keyboard could fire it unseen on web.
        disabled={action.disabled || !open}
        tabIndex={open ? undefined : -1}
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

/** why: the outer tool starts under the inner one and rolls out to its half of the pill, turning one radian per radius traveled so it rolls without slipping and lands upright in the pill's frame. */
function RadialToolRow({
  kind,
  tools,
  pose,
  open,
  animateFully,
  background,
}: {
  kind: GameMenuActionKind
  tools: readonly RadialMenuTool[]
  pose: RadialActionPose
  open: boolean
  animateFully: boolean
  background: string
}) {
  const offsets = getRadialToolOffsets(pose)
  const firstLeft = ACTION_WIDTH / 2 + offsets[0] - TOOL_RADIUS
  const roll = useSharedValue(0)

  useEffect(() => {
    if (!open) {
      roll.value = 0
      return
    }
    roll.value = animateFully
      ? withDelay(
          pose.delayMs + TOOL_ROLL_LAG_MS,
          withTiming(1, { duration: TOOL_ROLL_MS, easing: TOOL_ROLL_EASING }),
        )
      : 1
  }, [animateFully, open, pose.delayMs, roll])

  // why: drawn outer first so the inner tool paints on top and the other emerges from beneath it.
  return (
    <>
      {tools
        .slice(0, offsets.length)
        .map((tool, index) => (
          <RadialTool
            key={tool.key}
            testID={open ? `${kind}-${tool.key}` : undefined}
            open={open}
            tool={tool}
            left={firstLeft}
            travel={offsets[index] - offsets[0]}
            roll={roll}
            background={background}
          />
        ))
        .reverse()}
    </>
  )
}

function RadialTool({
  testID,
  open,
  tool,
  left,
  travel,
  roll,
  background,
}: {
  testID?: string
  open: boolean
  tool: RadialMenuTool
  left: number
  travel: number
  roll: SharedValue<number>
  background: string
}) {
  const {
    themed,
    theme: { colors },
  } = useAppTheme()
  const fill = tool.selected
    ? colors.gameMenu.anchorGlyph
    : mixColorsInLinearLight(background, "#FFFFFF", TOOL_TINT)
  const foreground = accessibleForeground(fill)
  const rollStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: travel * roll.value },
      { rotate: `${(-travel / TOOL_RADIUS) * (1 - roll.value)}rad` },
    ],
  }))

  return (
    <Animated.View style={[$toolSlot, { left }, rollStyle]}>
      <BoardPressable
        testID={testID}
        disabled={!open}
        tabIndex={open ? undefined : -1}
        accessibilityRole="button"
        accessibilityLabel={tool.accessibilityLabel}
        accessibilityState={tool.selected === undefined ? undefined : { selected: tool.selected }}
        style={({ pressed }) => [
          $tool,
          { backgroundColor: fill },
          tool.dimmed && $dimmedTool,
          pressed && themed($pressedAction),
        ]}
        onPress={tool.onPress}
      >
        <Text
          text={tool.label}
          weight="bold"
          numberOfLines={1}
          maxFontSizeMultiplier={1.2}
          style={[$toolText, { color: foreground }]}
        />
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
// why: the row stays inside the cluster box (half the box is larger than the status line's reach), because Android drops touches outside it.
const $clusterStatusRow: ViewStyle = { left: 0, right: 0, top: CLUSTER_SIZE / 2 }
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
const $toolSlot: ViewStyle = {
  position: "absolute",
  top: TOOL_INSET,
  width: TOOL_SIZE,
  height: TOOL_SIZE,
}
const $tool: ViewStyle = {
  flex: 1,
  alignItems: "center",
  justifyContent: "center",
  borderRadius: TOOL_RADIUS,
}
const $toolText: TextStyle = { fontSize: 14, lineHeight: 18, letterSpacing: 0.2 }
const $dimmedTool: ViewStyle = { opacity: 0.45 }
const SIGNAL_BADGE_SIZE = 22
// why: a zero-size box at the anchor centers the badge on its real width, so "100" sits where "1" does.
const $signalBadgeCenter: ViewStyle = {
  position: "absolute",
  width: 0,
  height: 0,
  alignItems: "center",
  justifyContent: "center",
}
function signalBadgeAt(buttonSize: number): ViewStyle {
  return {
    left: PENTAGON_BADGE_ANCHOR.x * buttonSize,
    top: PENTAGON_BADGE_ANCHOR.y * buttonSize,
  }
}
const $largeSignalBadgeCenter = signalBadgeAt(MENU_BUTTON_SIZE)
const $compactSignalBadgeCenter = signalBadgeAt(COMPACT_MENU_BUTTON_SIZE)
// why: the offer takes the upper-left corner, the mirror of the sync badge's, so the two never share a spot.
function startBadgeAt(buttonSize: number): ViewStyle {
  return {
    left: (1 - PENTAGON_BADGE_ANCHOR.x) * buttonSize,
    top: PENTAGON_BADGE_ANCHOR.y * buttonSize,
  }
}
const $largeStartBadgeCenter = startBadgeAt(MENU_BUTTON_SIZE)
const $compactStartBadgeCenter = startBadgeAt(COMPACT_MENU_BUTTON_SIZE)
const $startBadge: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: BADGE_SIZE,
  height: BADGE_SIZE,
  borderRadius: BADGE_SIZE / 2,
  borderWidth: 2.5,
  borderColor: colors.gameMenu.anchorBorder,
  alignItems: "center",
  justifyContent: "center",
  shadowColor: colors.gameMenu.shadow,
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.45,
  shadowRadius: 4,
  elevation: 6,
})
const $signalBadge: ThemedStyle<ViewStyle> = ({ colors }) => ({
  minWidth: SIGNAL_BADGE_SIZE,
  height: SIGNAL_BADGE_SIZE,
  paddingHorizontal: 5,
  borderRadius: SIGNAL_BADGE_SIZE / 2,
  borderWidth: 2,
  borderColor: colors.board.background,
  alignItems: "center",
  justifyContent: "center",
})
const $signalBadgeText: ThemedStyle<TextStyle> = () => ({
  fontSize: 12,
  lineHeight: 15,
})
const $statusLineRow: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
  zIndex: 25,
  height: STATUS_LINE_HEIGHT,
  alignItems: "center",
})
const $statusLineInset: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  left: spacing.lg,
  right: spacing.lg,
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
