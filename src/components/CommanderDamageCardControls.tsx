import { useEffect, useRef, useState } from "react"
import type { LayoutRectangle, TextStyle, ViewStyle } from "react-native"
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
import type { PlayerId } from "@/features/game/types"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { accessibleForeground } from "@/utils/colorContrast"
import { motionDuration, useReducedMotion } from "@/utils/useReducedMotion"

import { BoardPressable } from "./BoardPressable"
import type { CommanderFacing, CommanderTakeover } from "./commanderDamageLayout"
import { mixColorsInLinearLight } from "./GameMenuButtonShape"
import { overlayTint } from "./LifeControls"
import type {
  LifeCardContentInsets,
  LifeCardContentRotation,
  LifeCardEdge,
  LifeCardMenuCorner,
} from "./playerCardTypes"
import { Text } from "./Text"
import type { PlayerMarkShape } from "../../convex/lib/appearance"

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
  // why: while the chips fly out of the strip, the badges they land as stay hidden.
  arriving?: boolean
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
// why: the drain plays the flood backwards, so it mirrors the opening curve rather than rushing off the card at the start.
const DRAIN_EASING = Easing.bezier(0.7, 0, 0.7, 0.4)
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
      exiting={duration ? takeoverExit(source ? duration / 2 : duration / 6, source) : undefined}
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

const HOME_MS = 520
const HOME_FADE_MS = 220
// why: the strip mounts as the attack ends, so its chip spots take a frame or two to measure before a chip knows where home is.
const HOME_WAIT_MS = 120

export type CommanderChipsHomeFrom = {
  attackerId: PlayerId
  color: string
  rotation: LifeCardContentRotation
  chips: { x: number; y: number; size: number; total: number }[]
}

type HomeFlight = { kind: "fly"; target: LayoutRectangle } | { kind: "fade" }

/** why: when an attack starts, a defender's chips fly out of the attacker's spot in the commander strip to their places on the card, and when it ends they fly back home. With no spot in the strip they fade in or out where they stand. */
export function CommanderChipsHome({
  from,
  target,
  away,
  onDone,
}: {
  from: CommanderChipsHomeFrom
  target?: LayoutRectangle
  away?: boolean
  onDone: () => void
}) {
  const reducedMotion = useReducedMotion()
  const progress = useSharedValue(0)
  const [flight, setFlight] = useState<HomeFlight | null>(null)

  useEffect(() => {
    if (flight) return
    if (target) {
      setFlight({ kind: "fly", target })
      return
    }
    const timer = setTimeout(() => setFlight({ kind: "fade" }), HOME_WAIT_MS)
    return () => clearTimeout(timer)
  }, [flight, target])

  useEffect(() => {
    if (!flight) return
    const duration = motionDuration(reducedMotion, flight.kind === "fly" ? HOME_MS : HOME_FADE_MS)
    if (!duration) {
      onDone()
      return
    }
    progress.value = withTiming(1, { duration, easing: Easing.inOut(Easing.cubic) }, (finished) => {
      "worklet"
      if (finished) runOnJS(onDone)()
    })
  }, [flight, onDone, progress, reducedMotion])

  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, $aboveFlood]}>
      {from.chips.map((chip, index) => (
        <HomingChip
          key={index}
          chip={chip}
          color={from.color}
          ring={SHADOW_CHIP_RING}
          rotation={from.rotation}
          flight={flight}
          away={away}
          progress={progress}
        />
      ))}
    </View>
  )
}

function HomingChip({
  chip,
  color,
  ring,
  rotation,
  flight,
  away,
  progress,
}: {
  chip: CommanderChipsHomeFrom["chips"][number]
  color: string
  ring: string
  rotation: LifeCardContentRotation
  flight: HomeFlight | null
  away?: boolean
  progress: SharedValue<number>
}) {
  const target = flight?.kind === "fly" ? flight.target : undefined
  const fades = flight?.kind === "fade"
  const style = useAnimatedStyle(() => {
    // why: flying out plays the trip home backward.
    const p = away ? 1 - progress.value : progress.value
    if (!flight && away) return { opacity: 0 }
    if (target) {
      const shrink = target.width / chip.size
      return {
        transform: [
          { translateX: (target.x + target.width / 2 - chip.x) * p },
          { translateY: (target.y + target.height / 2 - chip.y) * p },
          { scale: 1 + (shrink - 1) * p },
        ],
      }
    }
    return fades ? { opacity: 1 - p, transform: [{ scale: 1 - 0.2 * p }] } : {}
  })
  return (
    <Animated.View
      style={[$absolute, { left: chip.x - chip.size / 2, top: chip.y - chip.size / 2 }, style]}
    >
      <View style={{ transform: [{ rotate: `${rotation}deg` }] }}>
        <CommanderChip
          testID="commander-homing-chip"
          total={chip.total}
          color={color}
          ring={ring}
          size={chip.size}
        />
      </View>
    </Animated.View>
  )
}

function takeoverExit(duration: number, source: boolean): EntryExitAnimationFunction {
  return () => {
    "worklet"
    const timing = { duration, easing: Easing.in(Easing.quad) }
    return {
      initialValues: {},
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
  useEffect(() => {
    if (takeover) last.current = { takeover, attackerColor }
  })
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
      ? withTiming(
          active ? 1 : 0,
          { duration, easing: active ? TAKEOVER_EASING : DRAIN_EASING },
          done,
        )
      : active
        ? 1
        : 0
    if (!duration) {
      setCovered(active)
      setDraining(false)
    }
  }, [active, duration, wave])

  // why: the render that ends an attack runs before the effect starts the drain, so the last takeover stays drawn through it instead of unmounting for a frame. A flood with no reach is a still fill with nothing to drain.
  const shown = takeover
    ? { takeover, attackerColor }
    : (draining || wasActive.current) && last.current.takeover?.flood
      ? last.current
      : undefined
  return {
    takeover: shown?.takeover,
    attackerColor: shown?.attackerColor,
    wave,
    covered: active && covered,
  }
}

// why: a defender floods a deep shade of its own color, so the attacker is the only bright card and no flood can be mistaken for another player's color. The attacker's power box inks its number in the same shade. 0.87 in linear light keeps about 40% of each sRGB channel.
export function deepShade(color: string) {
  return mixColorsInLinearLight(color, "#000000", 0.87)
}

// why: every shadow is dark enough for white ink, so chips on a flooded card share one ring.
const SHADOW_CHIP_RING = overlayTint("#FFFFFF", 0.5)

export function CommanderTakeoverBackdrop({
  seatNumber,
  takeover,
  wave,
  cardSize,
  floodColor,
  defenderColor,
}: {
  seatNumber: number
  takeover: CommanderTakeover
  wave: SharedValue<number>
  cardSize: { width: number; height: number }
  floodColor: string
  defenderColor: string
}) {
  const {
    theme: { colors },
  } = useAppTheme()
  const { flood, disc } = takeover
  const discX = cardSize.width / 2 + takeover.cardDiscOffset.x
  const discY = cardSize.height / 2 + takeover.cardDiscOffset.y
  const ringSize = (disc + DISC_RING) * 2
  // why: the ring is the board's own gutter around the life disc, so a red-leaning player color still stands off the flood as a cut-out of its card.
  const ring: ViewStyle = {
    position: "absolute",
    width: ringSize,
    height: ringSize,
    borderRadius: ringSize / 2,
    borderWidth: DISC_RING,
    borderColor: colors.board.background,
  }
  // why: how far the attacker's grown card must reach to cover the disc's center.
  const discGap = flood
    ? Math.max(
        Math.abs(discX - flood.x) - flood.card.width / 2,
        Math.abs(discY - flood.y) - flood.card.height / 2,
      )
    : 0
  // why: the shadow is the attacker's card grown by `grown` on every side, from just inside its own edges until it covers the farthest seat. Its blur fades over twice FLOOD_BLUR past those edges, so it arrives with a soft edge.
  const grown = (wave: number) => {
    "worklet"
    if (!flood) return 0
    return -FLOOD_BLUR * 2 + wave * (flood.distance + FLOOD_BLUR * 2)
  }
  const floodStyle = useAnimatedStyle(() => {
    if (!flood) return {}
    const by = grown(wave.value)
    return {
      left: flood.x - flood.card.width / 2 - by,
      top: flood.y - flood.card.height / 2 - by,
      width: flood.card.width + by * 2,
      height: flood.card.height + by * 2,
    }
  })
  // why: the ring darkens with the shadow under the disc, so it draws in as the soft edge passes over it.
  const ringStyle = useAnimatedStyle(() => ({
    opacity: flood
      ? Math.min(1, Math.max(0, (grown(wave.value) + FLOOD_BLUR * 2 - discGap) / (FLOOD_BLUR * 2)))
      : 1,
  }))

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
              backgroundColor: floodColor,
              borderRadius: FLOOD_BLUR,
              boxShadow: `0 0 ${FLOOD_BLUR}px ${FLOOD_BLUR}px ${floodColor}`,
            },
            floodStyle,
          ]}
        />
      ) : (
        <View
          testID={`commander-flood-seat-${seatNumber}`}
          style={[StyleSheet.absoluteFill, { backgroundColor: floodColor }]}
        />
      )}
      <Animated.View
        testID={`commander-ring-seat-${seatNumber}`}
        style={[ring, { left: discX - ringSize / 2, top: discY - ringSize / 2 }, ringStyle]}
      />
      <View
        testID={`commander-disc-seat-${seatNumber}`}
        style={[
          $absolute,
          {
            left: discX - disc,
            top: discY - disc,
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
  const ring = (disc + DISC_RING) * 2
  const progressRadius = disc + DISC_RING / 2
  const circumference = 2 * Math.PI * progressRadius
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
              testID={`commander-progress-seat-${seatNumber}`}
              cx={ring / 2}
              cy={ring / 2}
              r={progressRadius}
              stroke={attackerForeground}
              strokeWidth={DISC_RING}
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
              <CommanderChip
                testID={`commander-total-seat-${suffix}`}
                total={total}
                color={attackerColor}
                ring={SHADOW_CHIP_RING}
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
              hidden={!!mode.arriving}
              color={attackerColor}
              ring={SHADOW_CHIP_RING}
              pipColor={attackerForeground}
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
  hidden,
  color,
  ring,
  pipColor,
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
  hidden: boolean
  color: string
  ring: string
  pipColor: string
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
      <Animated.View style={[badgeStyle, hidden && $invisible]}>
        <CommanderChip testID={totalTestID} total={total} color={color} ring={ring} size={size} />
        {pips ? (
          <View pointerEvents="none" style={[$pips, { top: size + 2 }]}>
            {Array.from({ length: pips }, (_, pip) => (
              <View key={pip} style={[$pip, { backgroundColor: pipColor }]} />
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
  const [room, setRoom] = useState<{ width: number; height: number } | null>(null)
  const partners = mode.commanders.length > 1
  const sideways = Math.abs(contentRotation) === 90
  const space = room && (sideways ? { width: room.height, height: room.width } : room)
  const layout = attackerLayout({ space, count: mode.commanders.length, compact })
  const testSeats = partnerTestSeats(seatNumber)
  // why: the box is a pale card of the attacker's own color with its number inked in a deep shade, like the power box printed on a creature card.
  const cardColor = mode.mark?.color
  const paper = cardColor
    ? mixColorsInLinearLight(cardColor, "#FFFFFF", 0.7)
    : overlayTint(foreground, 0.2)
  const ink = cardColor ? deepShade(cardColor) : foreground

  return (
    <View
      style={themed($attackerCenter)}
      onLayout={({ nativeEvent: { layout: box } }) =>
        setRoom({ width: box.width, height: box.height })
      }
    >
      <View
        style={[
          themed($partners),
          contentRotation ? { transform: [{ rotate: `${contentRotation}deg` }] } : null,
        ]}
      >
        {mode.commanders.map(({ name, power, benched }, index) => {
          const suffix = testSeats[index]
          // why: a seat with no deck still names its attacker, dimmed, so the box never sits unlabeled.
          const nameText = (
            <Text
              testID={`commander-name-seat-${suffix}`}
              text={name ?? translate("board:commander.unnamed")}
              weight="bold"
              numberOfLines={1}
              maxFontSizeMultiplier={1.2}
              style={[
                themed($commanderName),
                compact && $compactName,
                { color: foreground, maxWidth: layout.width },
                !name && $unnamed,
              ]}
            />
          )
          return (
            <View key={index} style={[themed($power), benched && $benched]}>
              {partners ? (
                <BoardPressable
                  testID={`commander-toggle-seat-${suffix}`}
                  accessibilityRole="checkbox"
                  accessibilityLabel={translate("board:commander.partnerAttacks", { name })}
                  accessibilityState={{ checked: !benched }}
                  onPress={() => mode.onToggle(index)}
                >
                  {nameText}
                </BoardPressable>
              ) : (
                nameText
              )}
              <PowerBox
                suffix={suffix}
                name={partners ? name : undefined}
                power={power}
                color={paper}
                ink={ink}
                ring={foreground}
                width={layout.width}
                height={layout.height}
                onStep={(step) => mode.onPowerStep(step, index)}
              />
            </View>
          )
        })}
      </View>
    </View>
  )
}

const NAME_HEIGHT = 24
const UNIT_GAP = 16
// why: a power box is wide enough for its small − and + to sit at its ends, clear of the number.
const BOX_RATIO = 2
const MIN_BOX = 44

/** why: an attacker's name sits over its power box, and partners share the card's width side by side, since a card runs out of height before width. Each box shrinks to its lane, down to a tappable minimum. */
function attackerLayout({
  space,
  count,
  compact,
}: {
  space: { width: number; height: number } | null
  count: number
  compact?: boolean
}) {
  const largest = count > 1 ? (compact ? 52 : 64) : compact ? 72 : 88
  const lane = space ? (space.width - UNIT_GAP * (count + 1)) / count : Infinity
  const room = space ? space.height - NAME_HEIGHT - UNIT_GAP * 2 : Infinity
  const height = Math.floor(Math.max(MIN_BOX, Math.min(largest, lane / BOX_RATIO, room)))
  return { height, width: Math.round(height * BOX_RATIO) }
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

/** why: the attacker's power reads as a creature's power box, and its left and right halves lower and raise it, as a card's halves do for life. */
function PowerBox({
  suffix,
  name,
  power,
  color,
  ink,
  ring,
  width,
  height,
  onStep,
}: {
  suffix: string
  name?: string
  power: number
  color: string
  ink: string
  ring: string
  width: number
  height: number
  onStep: (step: 1 | -1) => void
}) {
  const { themed } = useAppTheme()
  const half = (step: 1 | -1) => {
    const disabled = step < 0 ? power <= 1 : power >= MAX_COMMANDER_DAMAGE
    const label =
      step < 0
        ? name
          ? translate("board:commander.lowerPowerOf", { name })
          : translate("board:commander.lowerPower")
        : name
          ? translate("board:commander.raisePowerOf", { name })
          : translate("board:commander.raisePower")
    return (
      <BoardPressable
        testID={`commander-power-${step < 0 ? "down" : "up"}-seat-${suffix}`}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => onStep(step)}
        style={({ pressed }) => [
          $boxHalf,
          { alignItems: step < 0 ? "flex-start" : "flex-end", paddingHorizontal: height * 0.16 },
          pressed && { backgroundColor: overlayTint(ink, 0.14) },
        ]}
      >
        <Text
          text={step < 0 ? "−" : "+"}
          maxFontSizeMultiplier={1}
          style={[
            { color: ink, fontSize: height * 0.3, lineHeight: height * 0.4 },
            disabled ? $boxGlyphDisabled : $boxGlyph,
          ]}
        />
      </BoardPressable>
    )
  }
  return (
    <View
      style={[
        $box,
        {
          width,
          height,
          borderRadius: height * 0.22,
          borderWidth: Math.max(2, height * 0.04),
          borderColor: ring,
          backgroundColor: color,
        },
      ]}
    >
      {half(-1)}
      {half(1)}
      <View
        testID={`commander-power-seat-${suffix}`}
        accessible
        accessibilityLabel={translate("board:commander.power", { power })}
        accessibilityLiveRegion="polite"
        pointerEvents="none"
        style={themed($boxValue)}
      >
        <Text
          text={`${power}`}
          weight="bold"
          maxFontSizeMultiplier={1}
          style={{ color: ink, fontSize: height * 0.62, lineHeight: height * 0.8 }}
        />
      </View>
    </View>
  )
}

// why: the takeover's markers match the commander strip's chips, so a hit reads as the same chip that lands in the strip after.
function CommanderChip({
  testID,
  total,
  color,
  ring,
  size,
}: {
  testID: string
  total: number
  color: string
  ring: string
  size: number
}) {
  const fontSize = size * (total >= 10 ? 0.42 : 0.5)
  return (
    <View
      style={[
        $chip,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: Math.max(1.5, size * 0.04),
          backgroundColor: color,
          borderColor: ring,
        },
      ]}
    >
      <Text
        testID={testID}
        text={String(total)}
        weight="bold"
        maxFontSizeMultiplier={1}
        style={[
          $chipLabel,
          { fontSize, lineHeight: fontSize * 1.2, color: accessibleForeground(color) },
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

// why: the disc's ring matches the board's gutter between cards, and the damage arc runs along it.
const DISC_RING = 4
// why: the shadow's blur and spread. Spreading by the blur puts the blur's solid core at the card's grown edge, so the shadow fades smoothly from there over twice this distance.
const FLOOD_BLUR = 24
/** why: while an attack holds a defending card, the flood covers its own controls (z 10), the life total rides above the flood, and the ring, badges, and hit target above that. */
export const TAKEOVER_LAYERS = { flood: 11, life: 12, controls: 13 } as const
const $flood: ViewStyle = { zIndex: TAKEOVER_LAYERS.flood }
const $aboveFlood: ViewStyle = { zIndex: TAKEOVER_LAYERS.controls }

const $benched: ViewStyle = { opacity: 0.4 }
const $invisible: ViewStyle = { opacity: 0 }

const $pips: ViewStyle = {
  position: "absolute",
  left: 0,
  right: 0,
  flexDirection: "row",
  justifyContent: "center",
  gap: 3,
}

const $pip: ViewStyle = { width: 5, height: 5, borderRadius: 2.5 }

const $chip: ViewStyle = { alignItems: "center", justifyContent: "center" }
const $chipLabel: TextStyle = { textAlign: "center", fontVariant: ["tabular-nums"] }
const $box: ViewStyle = { flexDirection: "row", overflow: "hidden" }
const $boxHalf: ViewStyle = { flex: 1, justifyContent: "center" }
const $boxGlyph: TextStyle = { opacity: 0.6 }
const $boxGlyphDisabled: TextStyle = { opacity: 0.2 }

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

const $boxValue: ThemedStyle<ViewStyle> = () => ({
  ...StyleSheet.absoluteFill,
  alignItems: "center",
  justifyContent: "center",
})

const $commanderName: ThemedStyle<TextStyle> = () => ({
  fontSize: 16,
  lineHeight: 20,
  maxWidth: 140,
})

const $unnamed: TextStyle = { opacity: 0.6 }
