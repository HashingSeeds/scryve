import { type ComponentProps, memo, useEffect } from "react"
import type { GestureResponderEvent, StyleProp, TextStyle, ViewStyle } from "react-native"
import { StyleSheet, View } from "react-native"
import Animated, {
  Easing,
  ReduceMotion,
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
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { GameMenuActionKind } from "@/theme/gameMenu"
import { radius } from "@/theme/radius"
import type { ThemedStyle } from "@/theme/types"
import { accessibleForeground } from "@/utils/colorContrast"
import { useCloseOnBack } from "@/utils/useCloseOnBack"
import {
  motionDuration,
  useReducedMotion,
  type ReducedMotionPreference,
} from "@/utils/useReducedMotion"

import { BoardPressable } from "./BoardPressable"
import {
  GameMenuButtonShape,
  PENTAGON_BADGE_ANCHOR,
  PENTAGON_RADIUS_SHARE,
} from "./GameMenuButtonShape"
import { Icon, type IconTypes } from "./Icon"
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
  actions: GameMenuActions
  onToggle: () => void
  onClose: () => void
  signal?: GameMenuSignal
  statusLine?: GameMenuStatusLine
}

export type GameMenuActions = readonly [
  RadialMenuAction,
  RadialMenuAction,
  RadialMenuAction,
  RadialMenuAction,
  RadialMenuAction,
]

export interface RadialActionPose {
  x: number
  y: number
  rotationDeg: number
  delayMs: number
}

export const MENU_BUTTON_SIZE = 80
export const COMPACT_MENU_BUTTON_SIZE = 70
const MENU_FALLBACK_ANIMATION_MS = 220

const PENTAGON_SIDES = 5
export const PENTAGON_OPEN_ROTATION_DEG = 360 / PENTAGON_SIDES / 2

const ACTION_WIDTH = 116
const ACTION_HEIGHT = 52
const ACTION_ICON_SIZE = 18

const ACTION_ICONS = {
  "layout": "panes",
  "dice": "more",
  "players": "account",
  "status": "info",
  "home": "back",
  "setup": "sliders",
  "decks": "decks",
  "history": "list",
  "rules": "book",
  "connect": "nearby",
  "invite": "plus",
  "end-game": "flag",
} satisfies Record<GameMenuActionKind, IconTypes>
const ACTION_ELEVATION = 12

const MOVING_SIGNAL_TONES: readonly GameMenuSignalTone[] = ["slow", "catchingUp"]
const STATUS_LINE_DISTANCE = 128
const STATUS_LINE_HEIGHT = 40
const STATUS_LINE_REACH = STATUS_LINE_DISTANCE + STATUS_LINE_HEIGHT
const APP_NAVIGATION_CLEARANCE = 96
export const ANCHOR_LOW_ON_SCREEN = 0.6

const ACTION_STAGGER_MS = 35
const ACTION_START_DISTANCE = 40
const ACTION_START_SCALE = 0.5
const ACTION_START_ROTATION_LAG_DEG = 25
const ACTION_POSE_SPRING = { damping: 13, stiffness: 210, mass: 0.8 } as const
const SIGNAL_BADGE_SCALE_MS = 180
const ATTENTION_POP_SCALE = 1.1
const ATTENTION_POP_RISE_MS = 130
const ATTENTION_POP_SETTLE_MS = 190
// why: flat at the start, so a first web frame that lands before the start time cannot shrink the button.
const POP_EASING = Easing.inOut(Easing.quad)
// why: Reanimated reads the system setting only at startup, so animations we already gate on the live preference must not consult it again.
const GATED_MOTION = ReduceMotion.Never
const BADGE_ENTERING = ZoomIn.duration(SIGNAL_BADGE_SCALE_MS).reduceMotion(GATED_MOTION)
const BADGE_EXITING = ZoomOut.duration(SIGNAL_BADGE_SCALE_MS).reduceMotion(GATED_MOTION)
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

// why: the board keeps the pentagon off its edges (getFourCardMenuJunction), so one fan fits every layout.
const ACTION_POSES: readonly RadialActionPose[] = CENTER_ACTION_SIDE_STEPS.map(rotateBasePoseToSide)

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
  signal,
  statusLine,
}: GameRadialMenuProps) {
  const { themed } = useAppTheme()
  const anchorStyle = percentAnchorStyle(anchor)

  const nativeAnchorStyle = useAnimatedStyle(() => {
    const frame = nativeFrame?.value
    if (!boardAnchor || !frame) return { left: `${anchor.x * 100}%`, top: `${anchor.y * 100}%` }
    const position = rotateGameBoardAnchor(boardAnchor, frame.rotation)
    return { left: position.x * frame.width, top: position.y * frame.height }
  })

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <GameMenuBackdrop open={open} onClose={onClose} />
      <GameRadialFan open={open} anchorStyle={[anchorStyle, nativeAnchorStyle]} actions={actions} />
      <GameMenuAnchor
        open={open}
        anchor={anchor}
        anchorStyle={[anchorStyle, nativeAnchorStyle]}
        compact={compact}
        signal={signal}
        onToggle={onToggle}
      />

      {open && statusLine ? (
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
        accessibilityHint={translate("board:menu.showsConnectionDetails")}
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
      accessibilityLabel={translate("board:menu.close")}
      style={themed($backdrop)}
      onPress={onClose}
    />
  )
}

function GameRadialFan({
  open,
  anchorStyle,
  actions,
  poseTurnMs = 0,
}: {
  open: boolean
  anchorStyle: AnchorStyle
  actions: GameMenuActions
  poseTurnMs?: number
}) {
  const reducedMotion = useReducedMotion()
  return (
    <>
      {actions.map((action, index) => (
        <RadialAction
          key={action.kind}
          action={action}
          anchorStyle={anchorStyle}
          pose={ACTION_POSES[index]}
          reducedMotion={reducedMotion}
          open={open}
          poseTurnMs={poseTurnMs}
        />
      ))}
    </>
  )
}

const FACING_TURN_MS = 260
// why: wide enough for the fan and the status line's text, and Android drops touches outside the box.
const CLUSTER_SIZE = 456

type GameMenuAnchorProps = {
  open: boolean
  anchor: { x: number; y: number }
  anchorStyle?: AnchorStyle
  compact?: boolean
  signal?: GameMenuSignal
  onToggle: () => void
}

/** why: a hardware-pinned board does not turn with the window, so the pentagon and its fan stay put through the system rotation and then turn together about the anchor to face the holder (`facingAngle`, clockwise degrees). `holderAnchor` is where the anchor sits in the holder's view and picks the side the status line opens toward. The box is large enough to contain the fan, because Android drops touches outside a parent's bounds. */
export const GameMenuCluster = memo(function GameMenuCluster({
  holderAnchor,
  holderHeight,
  facingAngle,
  actions,
  statusLine,
  ...anchorProps
}: Omit<GameMenuAnchorProps, "anchorStyle"> & {
  holderAnchor: { x: number; y: number }
  holderHeight: number
  facingAngle: number
  actions: GameMenuActions
  statusLine?: GameMenuStatusLine
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
        open={anchorProps.open}
        anchorStyle={$clusterCenter}
        actions={actions}
        poseTurnMs={FACING_TURN_MS}
      />
      <GameMenuAnchor {...anchorProps} anchorStyle={$clusterCenter} />
      {anchorProps.open && statusLine ? (
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
  signal,
  onToggle,
}: GameMenuAnchorProps) {
  const {
    themed,
    theme: { colors, isDark },
  } = useAppTheme()
  const reducedMotion = useReducedMotion()
  const animateFully = reducedMotion === false
  const spinTarget = open ? PENTAGON_OPEN_ROTATION_DEG : 0
  const pentagonRotation = useSharedValue(spinTarget)
  useEffect(() => {
    pentagonRotation.value = animateFully
      ? withSpring(spinTarget, PENTAGON_SPIN_SPRING)
      : withTiming(spinTarget, {
          duration: motionDuration(reducedMotion, MENU_FALLBACK_ANIMATION_MS),
        })
  }, [animateFully, spinTarget, pentagonRotation, reducedMotion])

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
          open ? translate("board:menu.close") : translate("board:menu.open"),
          signal?.accessibilityText,
        ]
          .filter(Boolean)
          .join(". ")}
        accessibilityHint={
          open ? translate("board:menu.collapses") : translate("board:menu.expands")
        }
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [themed($menuButton), pressed && $menuButtonPressed]}
        onPress={onToggle}
      >
        <Animated.View style={[StyleSheet.absoluteFill, pentagonSpinStyle]}>
          <SignalledMenuButtonShape
            isDark={isDark}
            tone={signal?.tone}
            reducedMotion={reducedMotion}
          />
        </Animated.View>
        <MenuGlyph
          buttonSize={compact ? COMPACT_MENU_BUTTON_SIZE : MENU_BUTTON_SIZE}
          color={colors.gameMenu.anchorGlyph}
          pose={open ? 1 : 0}
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
    </Animated.View>
  )
}

function SignalledMenuButtonShape({
  isDark,
  tone,
  reducedMotion,
}: {
  isDark: boolean
  tone?: GameMenuSignalTone
  reducedMotion: ReducedMotionPreference
}) {
  const {
    theme: { colors },
  } = useAppTheme()
  return (
    <GameMenuButtonShape
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
    />
  )
}

const GLYPH_MORPH_SPRING = { damping: 16, stiffness: 220, mass: 0.5 } as const

// why: the splash hands off to this button, so the bars keep splash-ios-source.svg's proportions.
const SPLASH_MENU_GLYPH = { pentagonRadius: 92, barWidth: 70, barHeight: 10, pitch: 26 } as const

function menuGlyphSize(buttonSize: number) {
  const splashUnit = (buttonSize * PENTAGON_RADIUS_SHARE) / SPLASH_MENU_GLYPH.pentagonRadius
  return {
    barWidth: SPLASH_MENU_GLYPH.barWidth * splashUnit,
    barHeight: SPLASH_MENU_GLYPH.barHeight * splashUnit,
    pitch: SPLASH_MENU_GLYPH.pitch * splashUnit,
  }
}

function MenuGlyph({
  buttonSize,
  color,
  pose,
  animateFully,
  reducedMotion,
}: {
  buttonSize: number
  color: string
  pose: 0 | 1
  animateFully: boolean
  reducedMotion: ReducedMotionPreference
}) {
  const morph = useSharedValue(pose)
  const { barWidth, barHeight, pitch } = menuGlyphSize(buttonSize)

  useEffect(() => {
    morph.value = animateFully
      ? withSpring(pose, GLYPH_MORPH_SPRING)
      : withTiming(pose, {
          duration: motionDuration(reducedMotion, MENU_FALLBACK_ANIMATION_MS),
        })
  }, [animateFully, morph, pose, reducedMotion])

  const topBar = useAnimatedStyle(() => ({
    transform: [
      { translateY: pitch * Math.abs(morph.value) },
      { rotate: `${45 * morph.value}deg` },
    ],
  }))
  const midBar = useAnimatedStyle(() => ({
    opacity: 1 - Math.abs(morph.value),
    transform: [{ scaleX: 1 - 0.6 * Math.abs(morph.value) }],
  }))
  const bottomBar = useAnimatedStyle(() => ({
    transform: [
      { translateY: -pitch * Math.abs(morph.value) },
      { rotate: `${-45 * morph.value}deg` },
    ],
  }))

  return (
    <View
      testID="game-menu-glyph"
      style={[$menuGlyph, { width: barWidth, height: barWidth, gap: pitch - barHeight }]}
    >
      {[topBar, midBar, bottomBar].map((barStyle, index) => (
        <Animated.View
          key={index}
          style={[
            {
              width: barWidth,
              height: barHeight,
              borderRadius: barHeight / 2,
              backgroundColor: color,
            },
            barStyle,
          ]}
        />
      ))}
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
      accessibilityElementsHidden={!open}
      importantForAccessibility={open ? "auto" : "no-hide-descendants"}
    >
      <BoardPressable
        testID={open ? `${action.kind}-button` : undefined}
        // why: a hidden action stays mounted, so it must leave the tab order or a keyboard could fire it unseen on web.
        disabled={action.disabled || !open}
        tabIndex={open ? undefined : -1}
        accessibilityRole="button"
        accessibilityLabel={
          action.detail
            ? translate("board:menu.actionWithDetail", {
                label: action.label,
                detail: action.detail,
              })
            : action.label
        }
        accessibilityState={{ disabled: !!action.disabled }}
        style={({ pressed }) => [
          themed($action),
          { backgroundColor: background },
          (action.disabled || action.blocked) && themed($disabledAction),
          pressed && !action.disabled && themed($pressedAction),
        ]}
        onPress={action.onPress}
      >
        <View style={themed($actionTitle)}>
          <Icon icon={ACTION_ICONS[action.kind]} size={ACTION_ICON_SIZE} color={foreground} />
          <Text
            text={action.label}
            weight="bold"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
            maxFontSizeMultiplier={1.2}
            style={[themed($actionText), { color: foreground }]}
          />
        </View>
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
// why: Android drops touches outside the cluster box, so half the box must stay larger than the status line's reach.
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
  alignItems: "center",
  justifyContent: "center",
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
  paddingHorizontal: 10,
  borderRadius: ACTION_HEIGHT / 2,
  shadowColor: colors.gameMenu.shadow,
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.35,
  shadowRadius: 7,
  elevation: ACTION_ELEVATION,
})
const $actionTitle: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xxs,
  maxWidth: "100%",
})
const $actionText: ThemedStyle<TextStyle> = () => ({
  flexShrink: 1,
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
const $statusDot: ThemedStyle<ViewStyle> = () => ({
  width: 9,
  height: 9,
  borderRadius: radius.full,
})
const $statusText: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.board.text })
const $disabledAction: ThemedStyle<ViewStyle> = () => ({ opacity: 0.42 })
const $pressedAction: ThemedStyle<ViewStyle> = () => ({ opacity: 0.72 })
