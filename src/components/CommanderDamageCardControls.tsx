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
import Svg, { Circle, Path } from "react-native-svg"

import { MAX_COMMANDER_DAMAGE } from "@/features/game/domain"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { accessibleForeground } from "@/utils/colorContrast"
import { motionDuration, useReducedMotion } from "@/utils/useReducedMotion"

import { BoardPressable } from "./BoardPressable"
import type { CommanderFacing, CommanderTakeover } from "./commanderDamageLayout"
import { overlayTint } from "./LifeControls"
import type {
  LifeCardContentInsets,
  LifeCardContentRotation,
  LifeCardMenuCorner,
} from "./playerCardTypes"
import { MarkArt } from "./PlayerMark"
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
  takeover?: CommanderTakeover
  acted: boolean
  onChange: (step: number) => void
}

type AssignmentSource = {
  kind: "source"
  playerName: string
  submit: "done" | "send"
  mark?: CommanderAttacker
  commanderName?: string
  power: number
  acted: boolean
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
  compact?: boolean
  mode: CommanderDamageCardMode
}

const RAM_MS = 90
const RAM_RETURN_MS = 300

export function CommanderDamageCardControls({
  seatNumber,
  playerName,
  foreground,
  contentRotation,
  contentInsets,
  menuCorner,
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
          contentRotation={contentRotation}
          contentInsets={contentInsets}
          menuCorner={menuCorner}
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

export function CommanderTakeoverBackdrop({
  seatNumber,
  takeover,
  cardSize,
  attackerColor,
  defenderColor,
}: {
  seatNumber: number
  takeover: CommanderTakeover
  cardSize: { width: number; height: number }
  attackerColor: string
  defenderColor: string
}) {
  const reducedMotion = useReducedMotion()
  const wave = useSharedValue(reducedMotion === false ? 0 : 1)
  useEffect(() => {
    wave.value = withTiming(1, {
      duration: motionDuration(reducedMotion, 620),
      easing: Easing.bezier(0.3, 0.6, 0.3, 1),
    })
  }, [reducedMotion, wave])
  const waveStyle = useAnimatedStyle(() => ({ transform: [{ scale: wave.value }] }))
  const { flood, disc } = takeover

  return (
    <View
      testID={`commander-takeover-seat-${seatNumber}`}
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
    >
      {flood ? (
        <Animated.View
          testID={`commander-flood-seat-${seatNumber}`}
          style={[
            $absolute,
            {
              left: flood.x - flood.radius,
              top: flood.y - flood.radius,
              width: flood.radius * 2,
              height: flood.radius * 2,
              borderRadius: flood.radius,
              backgroundColor: attackerColor,
            },
            waveStyle,
          ]}
        />
      ) : (
        <View
          testID={`commander-flood-seat-${seatNumber}`}
          style={[StyleSheet.absoluteFill, { backgroundColor: attackerColor }]}
        />
      )}
      <View
        testID={`commander-disc-seat-${seatNumber}`}
        style={[
          $absolute,
          {
            left: cardSize.width / 2 - disc,
            top: cardSize.height / 2 - disc,
            width: disc * 2,
            height: disc * 2,
            borderRadius: disc,
            backgroundColor: defenderColor,
          },
        ]}
      />
    </View>
  )
}

function DefenderControls({
  seatNumber,
  playerName,
  contentRotation,
  contentInsets,
  menuCorner,
  compact,
  mode,
}: {
  seatNumber: number
  playerName: string
  contentRotation: LifeCardContentRotation
  contentInsets?: LifeCardContentInsets
  menuCorner?: LifeCardMenuCorner
  compact?: boolean
  mode: AssignmentTarget
}) {
  const { themed, theme } = useAppTheme()
  const reducedMotion = useReducedMotion()
  const [hits, setHits] = useState<number[]>([])
  const [editing, setEditing] = useState(false)
  const pending = useRef(0)
  const landings = useRef<ReturnType<typeof setTimeout>[]>([])
  const pop = useSharedValue(1)
  const ram = useSharedValue(0)
  const flash = useSharedValue(0)
  const previousTotal = useRef(mode.total)
  const { attacker, facing, takeover, total } = mode
  const step = Math.min(mode.power, MAX_COMMANDER_DAMAGE - total)
  const attackerColor = attacker?.color ?? theme.colors.board.surfaceRaised
  const attackerForeground = accessibleForeground(attackerColor)
  const badge = takeover?.badge
  const badgeShape = attacker?.shape ?? shapeForSeat(attacker?.seatNumber ?? 1)
  // why: a badge driven all the way to the disc would cover the life total, so the ram stops once it overlaps the ring.
  const ramReach = takeover && badge ? takeover.disc + badge.size * 0.15 - badge.distance : 0

  useEffect(() => {
    const previous = previousTotal.current
    previousTotal.current = total
    if (total <= previous || reducedMotion !== false) return
    pop.value = withSequence(withTiming(1.35, { duration: 90 }), withTiming(1, { duration: 200 }))
    flash.value = withSequence(withTiming(0.35, { duration: 60 }), withTiming(0, { duration: 260 }))
  }, [flash, pop, reducedMotion, total])

  useEffect(() => () => landings.current.forEach(clearTimeout), [])

  const badgeStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: Math.cos(badge?.angle ?? 0) * ramReach * ram.value },
      { translateY: Math.sin(badge?.angle ?? 0) * ramReach * ram.value },
      { scale: pop.value },
    ],
  }))
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }))

  function land(amount: number) {
    setHits((current) => [...current, amount])
    mode.onChange(amount)
  }

  function hit() {
    if (editing) return setEditing(false)
    const amount = Math.min(step, MAX_COMMANDER_DAMAGE - total - pending.current)
    if (amount <= 0) return
    if (reducedMotion !== false || !badge) return land(amount)
    pending.current += amount
    ram.value = withSequence(
      withTiming(1, { duration: RAM_MS, easing: Easing.in(Easing.quad) }),
      withTiming(0, { duration: RAM_RETURN_MS, easing: Easing.out(Easing.cubic) }),
    )
    landings.current.push(
      setTimeout(() => {
        pending.current -= amount
        land(amount)
      }, RAM_MS),
    )
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
  const sideways = Math.abs(contentRotation) === 90
  const content = takeover?.content ?? { width: 0, height: 0 }
  const contentBox: ViewStyle = {
    position: "absolute",
    left: ((sideways ? content.height : content.width) - content.width) / 2,
    top: ((sideways ? content.width : content.height) - content.height) / 2,
    width: content.width,
    height: content.height,
    transform: [{ rotate: `${contentRotation}deg` }],
  }
  const disc = takeover?.disc ?? 0
  const ring = disc * 2 + 8
  const circumference = 2 * Math.PI * disc
  const badgeSize = badge?.size ?? (compact ? COMPACT_BADGE : BADGE)
  const editWidth = badgeSize + EDIT_STEP * 2 + 8
  const editHeight = Math.max(badgeSize, EDIT_STEP) + 8
  const clamp = (value: number, room: number) => Math.max(-room, Math.min(room, value))
  const totalLabel = translate("board:commander.totalFrom", {
    damage: total,
    name: mode.attackerName,
  })

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
        disabled={step <= 0 && !editing}
        onPress={hit}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View
        testID={`commander-hit-flash-seat-${seatNumber}`}
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: attackerColor }, flashStyle]}
      />
      <View pointerEvents="box-none" style={contentBox}>
        {takeover ? (
          <Svg
            pointerEvents="none"
            width={ring}
            height={ring}
            style={[
              $centeredAt(content.width / 2 - ring / 2, content.height / 2 - ring / 2),
              { transform: [{ rotate: `${(takeover.badge.angle * 180) / Math.PI}deg` }] },
            ]}
          >
            <Circle
              cx={ring / 2}
              cy={ring / 2}
              r={takeover.disc}
              stroke={overlayTint(attackerForeground, 0.25)}
              strokeWidth={3}
              fill="none"
            />
            <Circle
              testID={`commander-progress-seat-${seatNumber}`}
              cx={ring / 2}
              cy={ring / 2}
              r={takeover.disc}
              stroke={attackerForeground}
              strokeWidth={3}
              strokeLinecap="round"
              strokeDasharray={`${circumference} ${circumference}`}
              strokeDashoffset={
                circumference * (1 - Math.min(total, MAX_COMMANDER_DAMAGE) / MAX_COMMANDER_DAMAGE)
              }
              fill="none"
            />
          </Svg>
        ) : null}
        {!mode.acted ? (
          <View
            pointerEvents="none"
            style={[
              $centered,
              $centeredAt(content.width / 2 - disc, content.height / 2 - disc),
              { width: disc * 2, height: disc * 2 },
            ]}
          >
            <PulseRing
              testID={`commander-target-pulse-seat-${seatNumber}`}
              size={disc * 2 + 12}
              color={attackerForeground}
            />
          </View>
        ) : null}
        {editing ? (
          <View
            testID={`commander-edit-seat-${seatNumber}`}
            style={[
              themed($edit),
              $centeredAt(
                content.width / 2 +
                  clamp(badge?.x ?? 0, content.width / 2 - editWidth / 2 - 4) -
                  editWidth / 2,
                content.height / 2 +
                  clamp(badge?.y ?? 0, content.height / 2 - editHeight / 2 - 4) -
                  editHeight / 2,
              ),
              {
                width: editWidth,
                height: editHeight,
                borderColor: overlayTint(attackerForeground, 0.6),
              },
            ]}
          >
            <EditStep
              testID={`commander-edit-down-seat-${seatNumber}`}
              label={translate("board:commander.undoHit", { damage: 1 })}
              glyph="−"
              color={attackerForeground}
              disabled={total <= 0}
              onPress={() => mode.onChange(-1)}
            />
            <CommanderBadge
              testID={`commander-total-seat-${seatNumber}`}
              shape={badgeShape}
              total={total}
              fill={attackerForeground}
              labelColor={attackerColor}
              size={badgeSize}
            />
            <EditStep
              testID={`commander-edit-up-seat-${seatNumber}`}
              label={translate("board:commander.dealTo", { damage: 1, name: playerName })}
              glyph="+"
              color={attackerForeground}
              disabled={total >= MAX_COMMANDER_DAMAGE}
              onPress={() => mode.onChange(1)}
            />
          </View>
        ) : (
          <BoardPressable
            testID={`commander-badge-seat-${seatNumber}`}
            accessibilityRole="button"
            accessibilityLabel={totalLabel}
            accessibilityLiveRegion="polite"
            hitSlop={8}
            onPress={() => setEditing(true)}
            style={[
              $centered,
              $centeredAt(
                content.width / 2 + (badge?.x ?? 0) - badgeSize / 2,
                content.height / 2 + (badge?.y ?? 0) - badgeSize / 2,
              ),
              { width: badgeSize, height: badgeSize },
            ]}
          >
            <Animated.View style={badgeStyle}>
              <CommanderBadge
                testID={`commander-total-seat-${seatNumber}`}
                shape={badgeShape}
                total={total}
                fill={attackerForeground}
                labelColor={attackerColor}
                size={badgeSize}
              />
            </Animated.View>
          </BoardPressable>
        )}
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
              transform: [{ rotate: `${contentRotation}deg` }],
            },
          ]}
        >
          <UndoGlyph size={compact ? 22 : 28} color={attackerForeground} />
        </BoardPressable>
      ) : null}
    </>
  )
}

function EditStep({
  testID,
  label,
  glyph,
  color,
  disabled,
  onPress,
}: {
  testID: string
  label: string
  glyph: string
  color: string
  disabled: boolean
  onPress: () => void
}) {
  return (
    <BoardPressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        $centered,
        { width: EDIT_STEP, height: EDIT_STEP, borderRadius: EDIT_STEP / 2 },
        pressed && { backgroundColor: overlayTint(color, 0.18) },
        disabled && { opacity: 0.3 },
      ]}
    >
      <Text text={glyph} weight="bold" maxFontSizeMultiplier={1} style={[$editGlyph, { color }]} />
    </BoardPressable>
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
  const markSize = compact ? 72 : 96
  const power = mode.power

  return (
    <View style={themed($attackerCenter)}>
      <View
        style={[
          themed($power),
          contentRotation ? { transform: [{ rotate: `${contentRotation}deg` }] } : null,
        ]}
      >
        {mode.commanderName && !compact ? (
          <Text
            testID={`commander-name-seat-${seatNumber}`}
            text={mode.commanderName}
            weight="bold"
            numberOfLines={1}
            maxFontSizeMultiplier={1.2}
            style={[themed($commanderName), { color: foreground }]}
          />
        ) : null}
        <PowerStep
          testID={`commander-power-up-seat-${seatNumber}`}
          label={translate("board:commander.raisePower")}
          direction="up"
          color={foreground}
          disabled={power >= MAX_COMMANDER_DAMAGE}
          onPress={() => mode.onPowerStep(1)}
        />
        <View
          accessible
          accessibilityLabel={translate("board:commander.power", { power })}
          accessibilityLiveRegion="polite"
        >
          <CommanderBadge
            testID={`commander-power-seat-${seatNumber}`}
            shape={mode.mark?.shape ?? shapeForSeat(mode.mark?.seatNumber ?? seatNumber)}
            total={power}
            fill={foreground}
            labelColor={mode.mark?.color ?? foreground}
            size={markSize}
          />
        </View>
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
  )
}

const $centeredAt = (left: number, top: number): ViewStyle => ({ ...$absolute, left, top })

/** why: the board's one moving ring marks the next step: the targets until the first hit, then the attacker's mark to finish. */
export function PulseRing({
  testID,
  size,
  color,
}: {
  testID: string
  size: number
  color: string
}) {
  const { themed } = useAppTheme()
  const reducedMotion = useReducedMotion()
  const ring = useSharedValue(0)

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
    <Animated.View
      testID={testID}
      pointerEvents="none"
      style={[
        themed($ring),
        { width: size, height: size, borderRadius: size, borderColor: color },
        ringStyle,
      ]}
    />
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

function cornerName(x: "left" | "right", y: "top" | "bottom"): LifeCardMenuCorner {
  return `${y}${x === "left" ? "Left" : "Right"}`
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

const $absolute: ViewStyle = { position: "absolute" }

const $badgeLabel: TextStyle = { position: "absolute", left: 0, right: 0, textAlign: "center" }

export const BADGE = 46
export const COMPACT_BADGE = 36
const EDIT_STEP = 44

const $editGlyph: TextStyle = { fontSize: 28, lineHeight: 32 }

const $overlay: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  ...StyleSheet.absoluteFill,
  zIndex: 8,
  overflow: "hidden",
  borderRadius: spacing.lg,
})

const $compactOverlay: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  borderRadius: spacing.md,
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

const $ring: ThemedStyle<ViewStyle> = () => ({
  position: "absolute",
  borderWidth: 3,
})

const $power: ThemedStyle<ViewStyle> = () => ({ alignItems: "center" })

const $edit: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  paddingHorizontal: spacing.xxs,
  borderRadius: 999,
  borderWidth: 2,
  backgroundColor: "rgba(0,0,0,0.45)",
})

const $step: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: 64,
  height: 40,
  alignItems: "center",
  justifyContent: "center",
  borderRadius: spacing.xs,
})

const $commanderName: ThemedStyle<TextStyle> = () => ({
  fontSize: 16,
  lineHeight: 20,
  maxWidth: 140,
})

const $disabledStep: ThemedStyle<ViewStyle> = () => ({ opacity: 0.25 })
