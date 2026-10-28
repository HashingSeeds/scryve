import { useEffect, useRef, useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { StyleSheet, View } from "react-native"
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
  type EntryExitAnimationFunction,
  type SharedValue,
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
  LifeCardEdge,
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

export type ArmedCommander = { name?: string; power: number; benched?: boolean; total: number }

type AssignmentTarget = {
  kind: "target"
  attackerName: string
  attacker?: CommanderAttacker
  commanders: readonly ArmedCommander[]
  lethal: number
  facing: CommanderFacing
  takeover?: CommanderTakeover
  acted: boolean
  onChange: (step: number, index: number) => void
}

type AssignmentSource = {
  kind: "source"
  playerName: string
  submit: "done" | "send"
  mark?: CommanderAttacker
  commanders: readonly ArmedCommander[]
  acted: boolean
  onPowerStep: (step: 1 | -1, index: number) => void
  onToggle: (index: number) => void
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

export const RAM_MS = 90
const RAM_RETURN_MS = 300
// why: the defenders' flood, the attacker's bloom, and both leaving share one timing, so an attack opens and closes as one motion across the board.
export const TAKEOVER_MS = 620
const TAKEOVER_EASING = Easing.bezier(0.3, 0.6, 0.3, 1)
const SOURCE_BLOOM_FROM = 0.6

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
  const duration = motionDuration(reducedMotion, TAKEOVER_MS)
  const source = mode.kind === "source"
  const progress = useSharedValue(duration ? 0 : 1)

  useEffect(() => {
    // why: a defender's ring and badges wait for the flood to reach them; the attacker's controls bloom out over the same span.
    progress.value = source
      ? withTiming(1, { duration, easing: TAKEOVER_EASING })
      : withDelay(duration * 0.4, withTiming(1, { duration: duration * 0.6 }))
  }, [duration, progress, source])

  const entranceStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: source
      ? [{ scale: SOURCE_BLOOM_FROM + (1 - SOURCE_BLOOM_FROM) * progress.value }]
      : [],
  }))

  return (
    <Animated.View
      testID={`commander-card-mode-seat-${seatNumber}`}
      exiting={duration ? takeoverExit(duration / 2, source) : undefined}
      style={[
        themed($overlay),
        !source && $aboveFlood,
        compact && themed($compactOverlay),
        entranceStyle,
      ]}
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

function takeoverExit(duration: number, source: boolean): EntryExitAnimationFunction {
  return () => {
    "worklet"
    const timing = { duration, easing: Easing.in(Easing.quad) }
    return {
      initialValues: { opacity: 1, transform: [{ scale: 1 }] },
      animations: {
        opacity: withTiming(0, timing),
        transform: [{ scale: withTiming(source ? SOURCE_BLOOM_FROM : 1, timing) }],
      },
    }
  }
}

/** why: a defender's flood grows over the card's own controls before they go, and drains back off them when the attack ends, so the card keeps the last takeover until the flood has drained. `covered` turns true once the flood fills the card. */
export function useCommanderTakeover(
  takeover: CommanderTakeover | undefined,
  attackerColor: string | undefined,
) {
  const reducedMotion = useReducedMotion()
  const duration = motionDuration(reducedMotion, TAKEOVER_MS)
  const active = !!takeover
  const last = useRef({ takeover, attackerColor })
  if (takeover) last.current = { takeover, attackerColor }
  const [draining, setDraining] = useState(false)
  const [covered, setCovered] = useState(active && !duration)
  const wave = useSharedValue(active && !duration ? 1 : 0)
  const wasActive = useRef(false)

  useEffect(() => {
    if (wasActive.current === active) return
    wasActive.current = active
    setDraining(!active)
    setCovered(false)
    const done = (finished?: boolean) => {
      "worklet"
      if (!finished) return
      if (active) runOnJS(setCovered)(true)
      else runOnJS(setDraining)(false)
    }
    wave.value = duration
      ? withTiming(active ? 1 : 0, { duration, easing: TAKEOVER_EASING }, done)
      : active
        ? 1
        : 0
    if (!duration) {
      setCovered(active)
      setDraining(false)
    }
  }, [active, duration, wave])

  const shown = takeover || draining ? last.current : undefined
  return {
    takeover: shown?.takeover,
    attackerColor: shown?.attackerColor,
    wave,
    covered: active && covered,
  }
}

export function CommanderTakeoverBackdrop({
  seatNumber,
  takeover,
  wave,
  cardSize,
  attackerColor,
  defenderColor,
}: {
  seatNumber: number
  takeover: CommanderTakeover
  wave: SharedValue<number>
  cardSize: { width: number; height: number }
  attackerColor: string
  defenderColor: string
}) {
  const waveStyle = useAnimatedStyle(() => ({ transform: [{ scale: wave.value }] }))
  const { flood, disc } = takeover

  return (
    <View
      testID={`commander-takeover-seat-${seatNumber}`}
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, $flood]}
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
            left: cardSize.width / 2 + takeover.cardDiscOffset.x - disc,
            top: cardSize.height / 2 + takeover.cardDiscOffset.y - disc,
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
  const [hits, setHits] = useState<number[][]>([])
  const [editing, setEditing] = useState<number | null>(null)
  const ram = useSharedValue(0)
  const flash = useSharedValue(0)
  const { attacker, facing, takeover, commanders } = mode
  const totals = commanders.map(({ total }) => total)
  const struck = totals.reduce((sum, total) => sum + total, 0)
  const previousStruck = useRef(struck)
  const steps = commanders.map(({ power, total, benched }) =>
    benched ? 0 : Math.max(0, Math.min(power, MAX_COMMANDER_DAMAGE - total)),
  )
  const dealt = steps.reduce((sum, step) => sum + step, 0)
  const attackerColor = attacker?.color ?? theme.colors.board.surfaceRaised
  const attackerForeground = accessibleForeground(attackerColor)
  const badges = takeover?.badges ?? []
  const badgeShape = attacker?.shape ?? shapeForSeat(attacker?.seatNumber ?? 1)
  const partners = commanders.length > 1

  useEffect(() => {
    const previous = previousStruck.current
    previousStruck.current = struck
    if (struck <= previous || reducedMotion !== false) return
    flash.value = withDelay(
      takeover ? RAM_MS : 0,
      withSequence(withTiming(0.35, { duration: 60 }), withTiming(0, { duration: 260 })),
    )
  }, [flash, reducedMotion, struck, takeover])

  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }))

  function hit() {
    if (editing !== null) return setEditing(null)
    if (dealt <= 0) return
    setHits((current) => [...current, steps])
    steps.forEach((step, index) => {
      if (step > 0) mode.onChange(step, index)
    })
    if (reducedMotion !== false || !takeover) return
    ram.value = withSequence(
      withTiming(1, { duration: RAM_MS, easing: Easing.in(Easing.quad) }),
      withTiming(0, { duration: RAM_RETURN_MS, easing: Easing.out(Easing.cubic) }),
    )
  }

  const lastHit = hits.at(-1) ?? commanders.map(({ power, benched }) => (benched ? 0 : power))
  const takeBacks = totals.map((total, index) => Math.min(lastHit[index] ?? 0, total))
  const takeBack = takeBacks.reduce((sum, amount) => sum + amount, 0)

  function undo() {
    if (takeBack <= 0) return
    setHits((current) => current.slice(0, -1))
    takeBacks.forEach((amount, index) => {
      if (amount > 0) mode.onChange(-amount, index)
    })
  }

  const undoCorner = freeCorner(menuCorner, facing)
  const inset = (edge: LifeCardEdge) => (contentInsets?.[edge] ?? 0) + theme.spacing.xxs
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
  const discX = content.width / 2 + (takeover?.discOffset.x ?? 0)
  const discY = content.height / 2 + (takeover?.discOffset.y ?? 0)
  const ring = disc * 2 + 8
  const circumference = 2 * Math.PI * disc
  const ringAngle = badges.length ? (badges[0].angle + badges[badges.length - 1].angle) / 2 : 0
  const lead = Math.max(...totals)
  const badgeSize = badges[0]?.size ?? (compact ? COMPACT_BADGE : BADGE)
  const editWidth = badgeSize + EDIT_STEP * 2 + 8
  const editHeight = Math.max(badgeSize, EDIT_STEP) + 8
  const clamp = (value: number, room: number) => Math.max(-room, Math.min(room, value))
  // why: a badge driven all the way to the disc would cover the life total, so the ram stops once it overlaps the ring.
  const ramReachOf = (badge: (typeof badges)[number]) =>
    takeover ? takeover.disc + badge.size * 0.15 - badge.distance : 0
  const testSeats = partnerTestSeats(seatNumber)

  return (
    <>
      <BoardPressable
        testID={`commander-hit-seat-${seatNumber}`}
        accessibilityRole="button"
        accessibilityLabel={translate("board:commander.dealTo", {
          damage: dealt,
          name: playerName,
        })}
        accessibilityState={{ disabled: dealt <= 0 }}
        disabled={dealt <= 0 && editing === null}
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
              $centeredAt(discX - ring / 2, discY - ring / 2),
              { transform: [{ rotate: `${(ringAngle * 180) / Math.PI}deg` }] },
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
              strokeDashoffset={circumference * (1 - Math.min(lead, mode.lethal) / mode.lethal)}
              fill="none"
            />
          </Svg>
        ) : null}
        {!mode.acted ? (
          <View
            pointerEvents="none"
            style={[
              $centered,
              $centeredAt(discX - disc, discY - disc),
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
        {commanders.map((commander, index) => {
          const badge = badges[index]
          const suffix = testSeats[index]
          const total = commander.total
          return editing === index ? (
            <View
              key={index}
              testID={`commander-edit-seat-${suffix}`}
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
                testID={`commander-edit-down-seat-${suffix}`}
                label={translate("board:commander.undoHit", { damage: 1 })}
                glyph="−"
                color={attackerForeground}
                disabled={total <= 0}
                onPress={() => mode.onChange(-1, index)}
              />
              <CommanderBadge
                testID={`commander-total-seat-${suffix}`}
                shape={badgeShape}
                total={total}
                fill={attackerForeground}
                labelColor={attackerColor}
                size={badgeSize}
              />
              <EditStep
                testID={`commander-edit-up-seat-${suffix}`}
                label={translate("board:commander.dealTo", { damage: 1, name: playerName })}
                glyph="+"
                color={attackerForeground}
                disabled={total >= MAX_COMMANDER_DAMAGE}
                onPress={() => mode.onChange(1, index)}
              />
            </View>
          ) : (
            <DefenderBadge
              key={index}
              testID={`commander-badge-seat-${suffix}`}
              totalTestID={`commander-total-seat-${suffix}`}
              label={translate("board:commander.totalFrom", {
                damage: total,
                name: (partners && commander.name) || mode.attackerName,
              })}
              left={content.width / 2 + (badge?.x ?? 0) - badgeSize / 2}
              top={content.height / 2 + (badge?.y ?? 0) - badgeSize / 2}
              angle={badge?.angle ?? 0}
              ramReach={badge && !commander.benched ? ramReachOf(badge) : 0}
              ram={ram}
              total={total}
              pips={partners ? index + 1 : 0}
              benched={!!commander.benched}
              shape={badgeShape}
              fill={attackerForeground}
              labelColor={attackerColor}
              size={badgeSize}
              impact={takeover ? RAM_MS : 0}
              onPress={() => setEditing(index)}
            />
          )
        })}
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

function DefenderBadge({
  testID,
  totalTestID,
  label,
  left,
  top,
  angle,
  ramReach,
  ram,
  total,
  pips,
  benched,
  shape,
  fill,
  labelColor,
  size,
  impact,
  onPress,
}: {
  testID: string
  totalTestID: string
  label: string
  left: number
  top: number
  angle: number
  ramReach: number
  ram: SharedValue<number>
  total: number
  pips: number
  benched: boolean
  shape: PlayerMarkShape
  fill: string
  labelColor: string
  size: number
  impact: number
  onPress: () => void
}) {
  const reducedMotion = useReducedMotion()
  const pop = useSharedValue(1)
  const previousTotal = useRef(total)

  useEffect(() => {
    const previous = previousTotal.current
    previousTotal.current = total
    if (total <= previous || reducedMotion !== false) return
    pop.value = withDelay(
      impact,
      withSequence(withTiming(1.35, { duration: 90 }), withTiming(1, { duration: 200 })),
    )
  }, [impact, pop, reducedMotion, total])

  const badgeStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: Math.cos(angle) * ramReach * ram.value },
      { translateY: Math.sin(angle) * ramReach * ram.value },
      { scale: pop.value },
    ],
  }))

  return (
    <BoardPressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityLiveRegion="polite"
      hitSlop={8}
      onPress={onPress}
      style={[
        $centered,
        $centeredAt(left, top),
        { width: size, height: size },
        benched && $benched,
      ]}
    >
      <Animated.View style={badgeStyle}>
        <CommanderBadge
          testID={totalTestID}
          shape={shape}
          total={total}
          fill={fill}
          labelColor={labelColor}
          size={size}
        />
        {pips ? (
          <View pointerEvents="none" style={[$pips, { top: size + 2 }]}>
            {Array.from({ length: pips }, (_, pip) => (
              <View key={pip} style={[$pip, { backgroundColor: fill }]} />
            ))}
          </View>
        ) : null}
      </Animated.View>
    </BoardPressable>
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
  const partners = mode.commanders.length > 1
  const markSize = partners ? (compact ? 56 : 72) : compact ? 72 : 96
  const shape = mode.mark?.shape ?? shapeForSeat(mode.mark?.seatNumber ?? seatNumber)
  const testSeats = partnerTestSeats(seatNumber)

  return (
    <View style={themed($attackerCenter)}>
      <View
        style={[
          themed($partners),
          contentRotation ? { transform: [{ rotate: `${contentRotation}deg` }] } : null,
        ]}
      >
        {mode.commanders.map(({ name, power, benched }, index) => {
          const suffix = testSeats[index]
          // why: partners need their names to tell the two marks apart, so a compact card keeps them, smaller; a lone commander's name is left off there for room.
          const nameText =
            name && (partners || !compact) ? (
              <Text
                testID={`commander-name-seat-${suffix}`}
                text={name}
                weight="bold"
                numberOfLines={1}
                maxFontSizeMultiplier={1.2}
                style={[
                  themed($commanderName),
                  partners && $partnerName,
                  compact && $compactName,
                  { color: foreground },
                ]}
              />
            ) : null
          const mark = (
            <CommanderBadge
              testID={`commander-power-seat-${suffix}`}
              shape={shape}
              total={power}
              fill={foreground}
              labelColor={mode.mark?.color ?? foreground}
              size={markSize}
            />
          )
          return (
            <View key={index} style={[themed($power), benched && $benched]}>
              {partners && nameText ? (
                <BoardPressable accessible={false} onPress={() => mode.onToggle(index)}>
                  {nameText}
                </BoardPressable>
              ) : (
                nameText
              )}
              <PowerStep
                testID={`commander-power-up-seat-${suffix}`}
                label={
                  partners
                    ? translate("board:commander.raisePowerOf", { name })
                    : translate("board:commander.raisePower")
                }
                direction="up"
                color={foreground}
                disabled={power >= MAX_COMMANDER_DAMAGE}
                onPress={() => mode.onPowerStep(1, index)}
              />
              {partners ? (
                <BoardPressable
                  testID={`commander-toggle-seat-${suffix}`}
                  accessibilityRole="checkbox"
                  accessibilityLabel={translate("board:commander.partnerAttacks", { name })}
                  accessibilityValue={{ text: translate("board:commander.power", { power }) }}
                  accessibilityState={{ checked: !benched }}
                  accessibilityLiveRegion="polite"
                  onPress={() => mode.onToggle(index)}
                >
                  {mark}
                </BoardPressable>
              ) : (
                <View
                  accessible
                  accessibilityLabel={translate("board:commander.power", { power })}
                  accessibilityLiveRegion="polite"
                >
                  {mark}
                </View>
              )}
              <PowerStep
                testID={`commander-power-down-seat-${suffix}`}
                label={
                  partners
                    ? translate("board:commander.lowerPowerOf", { name })
                    : translate("board:commander.lowerPower")
                }
                direction="down"
                color={foreground}
                disabled={power <= 1}
                onPress={() => mode.onPowerStep(-1, index)}
              />
            </View>
          )
        })}
      </View>
    </View>
  )
}

const partnerTestSeats = (seatNumber: number) => [`${seatNumber}`, `${seatNumber}-partner`]

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

/** why: a number centred in a mark's box sits off lopsided shapes, so the label follows each shape's visual middle: halfway between its area centroid and the centre of its largest inscribed circle, measured from the MarkArt paths and rounded to 0.5. Shapes left out sit at 22. */
const LABEL_CENTER_Y: Partial<Record<PlayerMarkShape, number>> = {
  triangle: 25,
  heart: 20.5,
  star: 23,
  crown: 23,
  flame: 26,
  bolt: 21.5,
  skull: 21,
  spade: 21,
  gem: 20,
  tower: 22.5,
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

/** why: while an attack holds a defending card, the flood covers its own controls (z 10), the life total rides above the flood, and the ring, badges, and hit target above that. */
export const TAKEOVER_LAYERS = { flood: 11, life: 12, controls: 13 } as const
const $flood: ViewStyle = { zIndex: TAKEOVER_LAYERS.flood }
const $aboveFlood: ViewStyle = { zIndex: TAKEOVER_LAYERS.controls }

const $benched: ViewStyle = { opacity: 0.4 }

const $pips: ViewStyle = {
  position: "absolute",
  left: 0,
  right: 0,
  flexDirection: "row",
  justifyContent: "center",
  gap: 3,
}

const $pip: ViewStyle = { width: 5, height: 5, borderRadius: 2.5 }

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

const $partners: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.md,
})

const $partnerName: TextStyle = { maxWidth: 100 }

const $compactName: TextStyle = { fontSize: 13, lineHeight: 16, maxWidth: 88 }

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
