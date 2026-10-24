import { useEffect, useRef, useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { StyleSheet, View } from "react-native"
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated"
import Svg, { Path } from "react-native-svg"

import { MAX_COMMANDER_DAMAGE } from "@/features/game/domain"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { accessibleForeground } from "@/utils/colorContrast"
import { motionDuration, useReducedMotion } from "@/utils/useReducedMotion"

import { BoardPressable } from "./BoardPressable"
import type { CommanderFacing } from "./commanderDamageLayout"
import { overlayTint } from "./LifeControls"
import type {
  LifeCardContentInsets,
  LifeCardContentRotation,
  LifeCardMenuCorner,
  LifeCardMenuEdge,
} from "./playerCardTypes"
import { MarkArt, PlayerMark } from "./PlayerMark"
import { Text } from "./Text"
import { shapeForSeat, type PlayerMarkShape } from "../../convex/lib/appearance"

export type CommanderAttacker = {
  color: string
  shape?: PlayerMarkShape
  seatNumber: number
  rotation?: LifeCardContentRotation
}

type AssignmentTarget = {
  kind: "target"
  attackerName: string
  attacker?: CommanderAttacker
  total: number
  power: number
  facing: CommanderFacing
  onChange: (step: number) => void
}

type AssignmentSource = {
  kind: "source"
  playerName: string
  submit: "done" | "send"
  mark?: CommanderAttacker
  power: number
  onPowerStep: (step: 1 | -1) => void
  onSubmit: () => void
}

export type CommanderDamageCardMode = AssignmentTarget | AssignmentSource

export interface CommanderDamageCardControlsProps {
  seatNumber: number
  playerName: string
  foreground: string
  contentRotation: LifeCardContentRotation
  contentInsets?: LifeCardContentInsets
  menuCorner?: LifeCardMenuCorner
  menuEdgeCenter?: LifeCardMenuEdge
  compact?: boolean
  mode: CommanderDamageCardMode
}

export function CommanderDamageCardControls({
  seatNumber,
  playerName,
  foreground,
  contentRotation,
  contentInsets,
  menuCorner,
  menuEdgeCenter,
  compact,
  mode,
}: CommanderDamageCardControlsProps) {
  const { themed } = useAppTheme()
  const reducedMotion = useReducedMotion()
  const progress = useSharedValue(reducedMotion === false ? 0 : 1)

  useEffect(() => {
    progress.value = withTiming(1, { duration: motionDuration(reducedMotion, 160) })
  }, [progress, reducedMotion])

  const entranceStyle = useAnimatedStyle(() => ({ opacity: progress.value }))

  return (
    <Animated.View
      testID={`commander-card-mode-seat-${seatNumber}`}
      style={[themed($overlay), compact && themed($compactOverlay), entranceStyle]}
    >
      {mode.kind === "target" ? (
        <DefenderControls
          seatNumber={seatNumber}
          playerName={playerName}
          foreground={foreground}
          contentInsets={contentInsets}
          menuCorner={menuCorner}
          menuEdgeCenter={menuEdgeCenter}
          compact={compact}
          mode={mode}
        />
      ) : (
        <AttackerControls
          seatNumber={seatNumber}
          foreground={foreground}
          contentRotation={contentRotation}
          compact={compact}
          mode={mode}
        />
      )}
    </Animated.View>
  )
}

function DefenderControls({
  seatNumber,
  playerName,
  foreground,
  contentInsets,
  menuCorner,
  menuEdgeCenter,
  compact,
  mode,
}: {
  seatNumber: number
  playerName: string
  foreground: string
  contentInsets?: LifeCardContentInsets
  menuCorner?: LifeCardMenuCorner
  menuEdgeCenter?: LifeCardMenuEdge
  compact?: boolean
  mode: AssignmentTarget
}) {
  const { themed, theme } = useAppTheme()
  const reducedMotion = useReducedMotion()
  const [hits, setHits] = useState<number[]>([])
  const pop = useSharedValue(1)
  const previousTotal = useRef(mode.total)
  const { attacker, facing, total } = mode
  const step = Math.min(mode.power, MAX_COMMANDER_DAMAGE - total)
  const attackerColor = attacker?.color ?? theme.colors.board.surfaceRaised
  const attackerForeground = accessibleForeground(attackerColor)
  const rotation = attacker?.rotation ?? 0
  const thickness = compact ? COMPACT_EDGE : EDGE
  const menuInCorner = !!facing.x && !!facing.y && cornerName(facing.x, facing.y) === menuCorner
  const badgeSize = menuInCorner ? thickness * 0.58 : thickness * 0.8
  const edgeColors = {
    backgroundColor: attackerColor,
    borderColor: overlayTint(attackerForeground, 0.5),
  }
  const menuOnStrip = !facing.y ? menuEdgeCenter === facing.x : menuEdgeCenter === facing.y
  const badgePlacement: ViewStyle = menuInCorner
    ? { justifyContent: awayFrom(facing.y), alignItems: awayFrom(facing.x) }
    : !facing.x !== !facing.y && menuOnStrip
      ? stripStart(facing, contentInsets, theme.spacing.lg)
      : $centered

  useEffect(() => {
    const previous = previousTotal.current
    previousTotal.current = total
    if (total <= previous || reducedMotion !== false) return
    pop.value = withSequence(withTiming(1.35, { duration: 90 }), withTiming(1, { duration: 200 }))
  }, [pop, reducedMotion, total])

  const popStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation}deg` }, { scale: pop.value }],
  }))

  function hit() {
    if (step <= 0) return
    setHits((current) => [...current, step])
    mode.onChange(step)
  }

  const takeBack = Math.min(hits.at(-1) ?? mode.power, total)

  function undo() {
    if (takeBack <= 0) return
    setHits((current) => current.slice(0, -1))
    mode.onChange(-takeBack)
  }

  const undoCorner = freeCorner(menuCorner, facing)
  const inset = (edge: keyof LifeCardContentInsets) =>
    (contentInsets?.[edge] ?? 0) + theme.spacing.xxs

  return (
    <>
      <BoardPressable
        testID={`commander-hit-seat-${seatNumber}`}
        accessibilityRole="button"
        accessibilityLabel={translate("board:commander.dealTo", {
          damage: step,
          name: playerName,
        })}
        accessibilityState={{ disabled: step <= 0 }}
        disabled={step <= 0}
        onPress={hit}
        style={StyleSheet.absoluteFill}
      />
      <View
        testID={`commander-edge-seat-${seatNumber}`}
        pointerEvents="none"
        accessible
        accessibilityLabel={translate("board:commander.totalFrom", {
          damage: total,
          name: mode.attackerName,
        })}
        accessibilityLiveRegion="polite"
        style={[themed($edge), edgeStyle(facing, thickness), edgeColors, badgePlacement]}
      >
        <Animated.View style={popStyle}>
          <CommanderBadge
            testID={`commander-total-seat-${seatNumber}`}
            shape={attacker?.shape ?? shapeForSeat(attacker?.seatNumber ?? 1)}
            total={total}
            fill={attackerForeground}
            labelColor={attackerColor}
            size={badgeSize}
          />
        </Animated.View>
      </View>
      {takeBack > 0 ? (
        <BoardPressable
          testID={`commander-undo-seat-${seatNumber}`}
          accessibilityRole="button"
          accessibilityLabel={translate("board:commander.undoHit", { damage: takeBack })}
          onPress={undo}
          style={[
            themed($undo),
            {
              [undoCorner.x]: inset(undoCorner.x),
              [undoCorner.y]: inset(undoCorner.y),
              transform: [{ rotate: `${rotation}deg` }],
            },
          ]}
        >
          <UndoGlyph size={compact ? 22 : 28} color={foreground} />
        </BoardPressable>
      ) : null}
    </>
  )
}

function AttackerControls({
  seatNumber,
  foreground,
  contentRotation,
  compact,
  mode,
}: {
  seatNumber: number
  foreground: string
  contentRotation: LifeCardContentRotation
  compact?: boolean
  mode: AssignmentSource
}) {
  const { themed } = useAppTheme()
  const reducedMotion = useReducedMotion()
  const ring = useSharedValue(0)
  const markSize = compact ? 64 : 84
  const power = mode.power

  useEffect(() => {
    if (reducedMotion !== false) return
    ring.value = withRepeat(withTiming(1, { duration: 1600, easing: Easing.out(Easing.quad) }), -1)
    return () => cancelAnimation(ring)
  }, [reducedMotion, ring])

  const ringStyle = useAnimatedStyle(() => ({
    opacity: reducedMotion === false ? 0.7 * (1 - ring.value) : 0.5,
    transform: [{ scale: reducedMotion === false ? 0.75 + ring.value * 0.7 : 1.05 }],
  }))

  return (
    <View style={themed($attackerCenter)}>
      <View
        style={[
          themed($attackerRow),
          contentRotation ? { transform: [{ rotate: `${contentRotation}deg` }] } : null,
        ]}
      >
        <BoardPressable
          testID={`commander-exit-seat-${seatNumber}`}
          accessibilityRole="button"
          accessibilityLabel={translate(`board:commander.submitAssigningFromSeat.${mode.submit}`, {
            seat: seatNumber,
          })}
          onPress={mode.onSubmit}
          style={[themed($markButton), { width: markSize * 1.3, height: markSize * 1.3 }]}
        >
          <Animated.View
            pointerEvents="none"
            style={[
              themed($ring),
              {
                width: markSize * 1.15,
                height: markSize * 1.15,
                borderRadius: markSize,
                borderColor: foreground,
              },
              ringStyle,
            ]}
          />
          {mode.mark ? (
            <PlayerMark
              seatNumber={mode.mark.seatNumber}
              shape={mode.mark.shape}
              color={foreground}
              insetSwordColor={mode.mark.color}
              size={markSize}
            />
          ) : null}
        </BoardPressable>
        <View style={themed($power)}>
          <PowerStep
            testID={`commander-power-up-seat-${seatNumber}`}
            label={translate("board:commander.raisePower")}
            direction="up"
            color={foreground}
            disabled={power >= MAX_COMMANDER_DAMAGE}
            onPress={() => mode.onPowerStep(1)}
          />
          <Text
            testID={`commander-power-seat-${seatNumber}`}
            text={String(power)}
            weight="bold"
            accessibilityLabel={translate("board:commander.power", { power })}
            accessibilityLiveRegion="polite"
            maxFontSizeMultiplier={1.2}
            style={[themed(compact ? $compactPowerValue : $powerValue), { color: foreground }]}
          />
          <PowerStep
            testID={`commander-power-down-seat-${seatNumber}`}
            label={translate("board:commander.lowerPower")}
            direction="down"
            color={foreground}
            disabled={power <= 1}
            onPress={() => mode.onPowerStep(-1)}
          />
        </View>
      </View>
    </View>
  )
}

function PowerStep({
  testID,
  label,
  direction,
  color,
  disabled,
  onPress,
}: {
  testID: string
  label: string
  direction: "up" | "down"
  color: string
  disabled: boolean
  onPress: () => void
}) {
  const { themed } = useAppTheme()
  return (
    <BoardPressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        themed($step),
        pressed && { backgroundColor: overlayTint(color, 0.14) },
        disabled && themed($disabledStep),
      ]}
    >
      <Svg width={34} height={20} viewBox="0 0 34 20">
        <Path
          d={direction === "up" ? "M5 15 17 4l12 11" : "M5 5l12 11L29 5"}
          stroke={color}
          strokeWidth={3.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    </BoardPressable>
  )
}

/** why: a number centred in a mark's box sits off the drawn shape for the triangle and heart, so the label follows each shape's visual middle. */
const LABEL_CENTER_Y: Partial<Record<PlayerMarkShape, number>> = {
  triangle: 27,
  heart: 21,
  shield: 21,
  star: 23.5,
  crown: 24,
  spade: 21,
}

function CommanderBadge({
  testID,
  shape,
  total,
  fill,
  labelColor,
  size,
}: {
  testID: string
  shape: PlayerMarkShape
  total: number
  fill: string
  labelColor: string
  size: number
}) {
  const fontSize = size * (total >= 10 ? 0.27 : 0.34)
  const centerY = ((LABEL_CENTER_Y[shape] ?? 22) / 44) * size
  return (
    <View style={{ width: size, height: size }}>
      <MarkArt shape={shape} color={fill} size={size} />
      <Text
        testID={testID}
        text={String(total)}
        weight="bold"
        maxFontSizeMultiplier={1}
        style={[
          $badgeLabel,
          {
            top: centerY - fontSize * 0.6,
            fontSize,
            lineHeight: fontSize * 1.2,
            color: labelColor,
          },
        ]}
      />
    </View>
  )
}

function UndoGlyph({ size, color }: { size: number; color: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11"
        stroke={color}
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  )
}

/** why: a menu centred on the strip's edge would cover a centred badge, so the badge moves to the strip's start. */
function stripStart(
  facing: CommanderFacing,
  insets: LifeCardContentInsets | undefined,
  gap: number,
): ViewStyle {
  return facing.x
    ? { justifyContent: "flex-start", alignItems: "center", paddingTop: (insets?.top ?? 0) + gap }
    : { justifyContent: "center", alignItems: "flex-start", paddingLeft: (insets?.left ?? 0) + gap }
}

function cornerName(x: "left" | "right", y: "top" | "bottom"): LifeCardMenuCorner {
  return `${y}${x === "left" ? "Left" : "Right"}`
}

function edgeStyle(facing: CommanderFacing, thickness: number): ViewStyle {
  if (facing.x && facing.y)
    return { width: thickness, height: thickness, [facing.x]: 0, [facing.y]: 0 }
  if (facing.x) return { top: 0, bottom: 0, width: thickness, [facing.x]: 0 }
  return { left: 0, right: 0, height: thickness, [facing.y ?? "top"]: 0 }
}

/** why: the menu covers the inner corner of a corner square, so its badge leans toward the square's outer corner. */
function awayFrom(edge: "left" | "right" | "top" | "bottom" | undefined) {
  return edge === "left" || edge === "top" ? "flex-end" : "flex-start"
}

const CORNERS = [
  { x: "right", y: "bottom" },
  { x: "left", y: "bottom" },
  { x: "right", y: "top" },
  { x: "left", y: "top" },
] as const

function freeCorner(menuCorner: LifeCardMenuCorner | undefined, facing: CommanderFacing) {
  const free = CORNERS.filter(
    ({ x, y }) => x !== facing.x && y !== facing.y && cornerName(x, y) !== menuCorner,
  )
  const awayFromMenu = free.find(
    ({ x, y }) => menuCorner && !menuCorner.startsWith(y) && !menuCorner.toLowerCase().endsWith(x),
  )
  return awayFromMenu ?? free[0] ?? CORNERS[0]
}

const $centered: ViewStyle = { justifyContent: "center", alignItems: "center" }

const $badgeLabel: TextStyle = { position: "absolute", left: 0, right: 0, textAlign: "center" }

const EDGE = 56
const COMPACT_EDGE = 44

const $overlay: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  ...StyleSheet.absoluteFill,
  zIndex: 8,
  overflow: "hidden",
  borderRadius: spacing.lg,
})

const $compactOverlay: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  borderRadius: spacing.md,
})

const $edge: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
  borderWidth: 1,
})

const $undo: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
  width: 48,
  height: 48,
  alignItems: "center",
  justifyContent: "center",
  opacity: 0.85,
})

const $attackerCenter: ThemedStyle<ViewStyle> = () => ({
  ...StyleSheet.absoluteFill,
  alignItems: "center",
  justifyContent: "center",
})

const $attackerRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.md,
})

const $markButton: ThemedStyle<ViewStyle> = () => ({
  alignItems: "center",
  justifyContent: "center",
})

const $ring: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
  borderWidth: 3,
})

const $power: ThemedStyle<ViewStyle> = () => ({ alignItems: "center" })

const $step: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: 64,
  height: 40,
  alignItems: "center",
  justifyContent: "center",
  borderRadius: spacing.xs,
})

const $disabledStep: ThemedStyle<ViewStyle> = () => ({ opacity: 0.25 })

const $powerValue: ThemedStyle<TextStyle> = () => ({ fontSize: 72, lineHeight: 80 })

const $compactPowerValue: ThemedStyle<TextStyle> = () => ({ fontSize: 54, lineHeight: 60 })
