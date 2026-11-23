import { useEffect, useRef, useState, type ReactNode } from "react"
import type { StyleProp, TextStyle, ViewStyle } from "react-native"
import { Platform, StyleSheet, View } from "react-native"
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  FadeOut,
  LayoutAnimationConfig,
  LinearTransition,
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
import Svg, { Path } from "react-native-svg"

import { LOWEST_POWER } from "@/features/game/commanderAttack"
import { MAX_COMMANDER_DAMAGE } from "@/features/game/domain"
import { formatSigned } from "@/i18n/format"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import { spacing } from "@/theme/spacing"
import type { ThemedStyle } from "@/theme/types"
import { motionDuration, useReducedMotion } from "@/utils/useReducedMotion"

import { BoardPressable } from "./BoardPressable"
import { COMMANDER_BEATS, DRAIN_EASING, FLOOD_EASING } from "./commanderBeats"
import {
  DIGIT_INK_HEIGHT,
  DISC_FILL,
  type CommanderFacing,
  type CommanderTakeover,
} from "./commanderDamageLayout"
import { useCommanderFlights } from "./CommanderFlights"
import { mixColorsInLinearLight } from "./GameMenuButtonShape"
import { overlayTint } from "./LifeControls"
import {
  getLifeLineHeight,
  type LifeCardContentInsets,
  type LifeCardContentRotation,
} from "./playerCardTypes"
import { COMPACT_KEY_HEIGHT, KEY_HEIGHT, PokemonKeypad } from "./pokemon/PokemonKeypad"
import { Sword } from "./Sword"
import { Text } from "./Text"
import type { PlayerMarkShape } from "../../convex/lib/appearance"

export type CommanderAttacker = {
  color: string
  shape?: PlayerMarkShape
  seatNumber: number
  rotation?: LifeCardContentRotation
}

/** why: `landed` is the part of `total` dealt by this attack's hits so far; absent means none. */
export type ArmedCommander = {
  name?: string
  power: number
  total: number
  landed?: number
  /** why: sat out of this attack; it keeps its power for when it returns. */
  sitting?: boolean
}

type AssignmentTarget = {
  kind: "target"
  attackerName: string
  attacker?: CommanderAttacker
  commanders: readonly ArmedCommander[]
  lethal: number
  /** why: the life the defender shows, after this attack's hits, so the strike turns red when the next hit would end it. */
  life: number
  facing: CommanderFacing
  takeover?: CommanderTakeover
  wave: SharedValue<number>
  /** why: what the next hit deals per commander, and in all. */
  steps: readonly number[]
  dealt: number
  /** why: each of this attack's hits here, oldest first. */
  hits: readonly number[]
  takeBack: number
  onHit: () => void
  onUndo: () => void
}

type AssignmentSource = {
  kind: "source"
  playerName: string
  submit: "done" | "send"
  mark?: CommanderAttacker
  commanders: readonly ArmedCommander[]
  /** why: how far the attacker's life reaches down from the seat's head and its name row up from its foot, in upright space, so the boxes sit between them. */
  bands?: AttackerBands
  onSit: (slot: number) => void
  onPower: (power: number, index: number) => void
  // why: the card's own life total sits where the keypad opens, so the card hides it while a power is being typed.
  onEditing: (editing: boolean) => void
  onSubmit: () => void
}

export type CommanderDamageCardMode = AssignmentTarget | AssignmentSource

export interface CommanderDamageCardControlsProps {
  seatNumber: number
  playerName: string
  foreground: string
  contentRotation: LifeCardContentRotation
  contentInsets?: LifeCardContentInsets
  compact?: boolean
  mode: CommanderDamageCardMode
  // why: a defender's last attack, kept up while the shadow drains so its ring fades as the shadow's edge passes it. Takes no touches.
  draining?: boolean
}

// why: spreading by the blur puts its solid core at the card's grown edge, so it fades smoothly over twice this distance.
const FLOOD_BLUR = 24
// why: the shadow starts at the attacker's card, so it swaps its life for power boxes quickly as the shadow leaves; everything else changes when the shadow arrives.
export const SWAP_MS = 240
const SWAP_FROM = 0.85

export function CommanderDamageCardControls({
  seatNumber,
  playerName,
  foreground,
  contentRotation,
  contentInsets,
  compact,
  mode,
  draining,
}: CommanderDamageCardControlsProps) {
  const { themed } = useAppTheme()
  const reducedMotion = useReducedMotion()
  const source = mode.kind === "source"
  const beats = COMMANDER_BEATS
  // why: the attacker's power boxes come in as its life tucks away, and go only once its blades are home.
  const swap = motionDuration(reducedMotion, source ? beats.tuck : SWAP_MS)
  const leaveAfter = source ? beats.flood + beats.fan : 0
  const progress = useSharedValue(swap ? 0 : 1)
  const wave = mode.kind === "target" ? mode.wave : undefined
  const flood = mode.kind === "target" ? mode.takeover?.flood : undefined

  useEffect(() => {
    if (source) progress.value = withTiming(1, { duration: swap, easing: Easing.out(Easing.cubic) })
  }, [progress, source, swap])

  // why: a defender's ring and badges show as the shadow's edge passes its disc, when the disc's gutter ring draws in.
  const entranceStyle = useAnimatedStyle(() => {
    if (!wave)
      return {
        opacity: progress.value,
        transform: [{ scale: SWAP_FROM + (1 - SWAP_FROM) * progress.value }],
      }
    return { opacity: flood ? shadowReached(flood, wave.value, flood.discGap) : wave.value }
  })

  return (
    <Animated.View
      testID={`commander-card-mode-seat-${seatNumber}`}
      pointerEvents={draining ? "none" : undefined}
      accessibilityElementsHidden={draining}
      importantForAccessibility={draining ? "no-hide-descendants" : "auto"}
      exiting={swap ? takeoverExit(source ? swap : swap / 2, source, leaveAfter) : undefined}
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
          compact={compact}
          mode={mode}
        />
      ) : (
        // why: the power boxes leave with the panel after the blades are home, not on their own fades.
        <LayoutAnimationConfig skipExiting>
          <AttackerControls
            seatNumber={seatNumber}
            foreground={foreground}
            contentRotation={contentRotation}
            compact={compact}
            mode={mode}
          />
        </LayoutAnimationConfig>
      )}
    </Animated.View>
  )
}

export type CommanderFlood = NonNullable<CommanderTakeover["flood"]>

// why: the shadow is the attacker's card grown on every side, from just inside its edges until it covers the farthest seat; its blur fades over twice FLOOD_BLUR past them, so it arrives soft.
function shadowGrown(flood: CommanderFlood, wave: number) {
  "worklet"
  return -FLOOD_BLUR * 2 + wave * (flood.distance + FLOOD_BLUR * 2)
}

/** why: how far the flood has grown, from 0 to 1, when the shadow's soft edge is halfway over the disc, so the blade lands as the disc takes the shadow. */
export function floodArrival(flood: CommanderFlood) {
  return Math.min(1, (flood.discGap + FLOOD_BLUR) / (flood.distance + FLOOD_BLUR * 2))
}

/** why: 0 until the shadow's soft edge reaches a point `gap` away, 1 once its solid core covers it, or once it grows `span` past that if it still can. */
export function shadowReached(flood: CommanderFlood, wave: number, gap: number, span?: number) {
  "worklet"
  // why: a worklet captures only what its body uses, so the default lives here rather than in the signature.
  const edge = shadowGrown(flood, wave) + FLOOD_BLUR * 2 - gap
  const room = Math.max(
    FLOOD_BLUR * 2,
    Math.min(span ?? FLOOD_BLUR * 2, flood.distance + FLOOD_BLUR * 2 - gap),
  )
  return Math.min(1, Math.max(0, edge / room))
}

function takeoverExit(
  duration: number,
  source: boolean,
  after: number,
): EntryExitAnimationFunction {
  return () => {
    "worklet"
    const timing = { duration, easing: Easing.in(Easing.quad) }
    return {
      initialValues: {},
      animations: {
        opacity: withDelay(after, withTiming(0, timing)),
        transform: [{ scale: withDelay(after, withTiming(source ? SWAP_FROM : 1, timing)) }],
      },
    }
  }
}

/** why: a defender's flood grows over the card's own controls before they go, and drains back off them when the attack ends, so the card keeps the last takeover and its attacker until the flood has drained. `covered` turns true once the flood fills the card. */
export function useCommanderTakeover<Attacker>(
  takeover: CommanderTakeover | undefined,
  attacker: Attacker,
) {
  const reducedMotion = useReducedMotion()
  const active = !!takeover
  const beats = COMMANDER_BEATS
  const duration = motionDuration(reducedMotion, beats.flood)
  // why: the shadow sets off as the attacker's blades leave the fan, and drains at once when the attack ends.
  const lead = active && duration ? beats.tuck + beats.fan : 0
  const last = useRef({ takeover, attacker })
  useEffect(() => {
    if (takeover) last.current = { takeover, attacker }
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
      ? withDelay(
          lead,
          withTiming(
            active ? 1 : 0,
            { duration, easing: active ? FLOOD_EASING : DRAIN_EASING },
            done,
          ),
        )
      : active
        ? 1
        : 0
    if (!duration) {
      setCovered(active)
      setDraining(false)
    }
  }, [active, duration, lead, wave])

  // why: the render that ends an attack runs before the effect starts the drain, so the last takeover stays drawn through it instead of unmounting for a frame. A flood with no reach is a still fill with nothing to drain.
  const shown = takeover
    ? { takeover, attacker }
    : (draining || wasActive.current) && last.current.takeover?.flood
      ? last.current
      : undefined
  return {
    takeover: shown?.takeover,
    attacker: shown?.attacker,
    wave,
    covered: active && covered,
  }
}

// why: deep shade of the attacker's color; 0.87 in linear light keeps about 40% of each sRGB channel.
export function deepShade(color: string) {
  return mixColorsInLinearLight(color, "#000000", 0.87)
}

// why: one dark oxblood for every defender reads as danger, never as the grey dimming of an out seat, and stays dark enough not to fight the life discs.
export const ATTACK_SHADE = "#26080D"

// why: every shadow is dark enough for white ink whatever the attacker's color.
export const SHADOW_INK = "#FFFFFF"

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
  const { flood } = takeover
  const fill = takeover.disc * DISC_FILL
  const discX = cardSize.width / 2 + takeover.cardDiscOffset.x
  const discY = cardSize.height / 2 + takeover.cardDiscOffset.y
  const floodStyle = useAnimatedStyle(() => {
    if (!flood) return {}
    const by = shadowGrown(flood, wave.value)
    return {
      left: flood.x - flood.card.width / 2 - by,
      top: flood.y - flood.card.height / 2 - by,
      width: flood.card.width + by * 2,
      height: flood.card.height + by * 2,
    }
  })

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
      <View
        testID={`commander-disc-seat-${seatNumber}`}
        style={[
          $absolute,
          {
            left: discX - fill,
            top: discY - fill,
            width: fill * 2,
            height: fill * 2,
            borderRadius: fill,
            backgroundColor: defenderColor,
          },
        ]}
      />
    </View>
  )
}

/** why: a defender's card is one big hit target. Its disc carries a ring per attacking commander, segmented to lethal; to the reader's left a sword points at the disc with what a tap deals, and to its right each hit of this attack waits on an arc beside the undo that takes the newest back. */
function DefenderControls({
  seatNumber,
  playerName,
  contentRotation,
  contentInsets,
  compact,
  mode,
}: {
  seatNumber: number
  playerName: string
  contentRotation: LifeCardContentRotation
  contentInsets?: LifeCardContentInsets
  compact?: boolean
  mode: AssignmentTarget
}) {
  const { theme } = useAppTheme()
  const reducedMotion = useReducedMotion()
  const motion = reducedMotion === false
  const flash = useSharedValue(0)
  const lunge = useSharedValue(0)
  const { attacker, takeover, commanders, steps, dealt, hits, takeBack } = mode
  const { arrive } = useCommanderFlights()
  const floodShare = takeover?.flood ? floodArrival(takeover.flood) : undefined
  useEffect(() => {
    if (floodShare !== undefined) arrive(seatNumber, floodShare)
  }, [arrive, floodShare, seatNumber])
  const attackerColor = attacker?.color ?? theme.colors.board.surfaceRaised
  const tint = mixColorsInLinearLight(attackerColor, "#FFFFFF", TINT_SHARE)
  const struck = hits.length
  const previousStruck = useRef(struck)

  useEffect(() => {
    const previous = previousStruck.current
    previousStruck.current = struck
    if (struck <= previous || !motion) return
    flash.value = withSequence(withTiming(0.35, { duration: 60 }), withTiming(0, { duration: 260 }))
    lunge.value = withSequence(
      withTiming(1, { duration: 90, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 170, easing: Easing.out(Easing.quad) }),
    )
  }, [flash, lunge, motion, struck])

  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }))

  function hit() {
    if (dealt <= 0) return
    mode.onHit()
  }

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
  // why: one ring per commander that is attacking or has already hit this seat; a lone ring takes the whole band.
  const live = commanders.flatMap((commander, slot) =>
    steps[slot] > 0 || commander.total > 0 ? [{ ...commander, step: steps[slot] ?? 0 }] : [],
  )
  const reachesLethal = (total: number, step: number) => step > 0 && total + step >= mode.lethal
  const lethal =
    live.some(({ total, step }) => reachesLethal(total, step)) || mode.life - dealt <= 0
  const strikeColor = lethal ? DAMAGE_INK : strikeTint(attackerColor)
  const strikeScale = takeover?.strike ?? 1
  const strikeFont = (compact ? 24 : 30) * strikeScale
  const strikeSword = (compact ? 28 : 34) * strikeScale
  const coin = compact ? 20 : 24
  const undoGlyph = compact ? 20 : 22
  // why: undo is fixed to the card, not the disc, so it stays put as the life changes: beside the hits at the edge's middle on a seat wide enough for the disc, the hits, and undo, else in the corner below the hits.
  const wide = content.width >= content.height + sideRoom(compact) * 2
  const undo = wide ? UNDO_SIZE : MIN_TARGET
  const undoAt = {
    x:
      content.width -
      UNDO_INSET -
      (contentInsets?.[contentEdge(contentRotation, "right")] ?? 0) -
      undo / 2,
    y: wide
      ? content.height / 2
      : content.height -
        UNDO_INSET -
        (contentInsets?.[contentEdge(contentRotation, "bottom")] ?? 0) -
        undo / 2,
  }
  const coinRadius = Math.min(
    disc + coin / 2 + COIN_GAP,
    wide ? undoAt.x - undo / 2 - COIN_GAP - coin / 2 - discX : Infinity,
  )

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
        disabled={dealt <= 0}
        onPress={hit}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View
        testID={`commander-hit-flash-seat-${seatNumber}`}
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: attackerColor }, flashStyle]}
      />
      <View pointerEvents="none" style={contentBox}>
        {takeover ? (
          <DamageRings
            seatNumber={seatNumber}
            disc={disc}
            lethal={mode.lethal}
            rings={live}
            color={tint}
            reachesLethal={reachesLethal}
            style={{ left: discX - disc, top: discY - disc }}
          />
        ) : null}
        {takeover && dealt > 0 ? (
          <Strike
            seatNumber={seatNumber}
            dealt={dealt}
            color={strikeColor}
            font={strikeFont}
            sword={strikeSword}
            lunge={lunge}
            style={{
              right: content.width - (discX - disc - STRIKE_GAP),
              top: discY - strikeSword / 2,
              height: strikeSword,
            }}
          />
        ) : null}
        {takeover
          ? hits.map((amount, index) => {
              const angle = (hitAngle(index, hits.length) * Math.PI) / 180
              return (
                <Animated.View
                  key={index}
                  testID={`commander-hit-coin-seat-${seatNumber}`}
                  entering={motion ? FadeIn.duration(160) : undefined}
                  style={[
                    $coin,
                    {
                      left: discX + coinRadius * Math.cos(angle) - coin / 2,
                      top: discY + coinRadius * Math.sin(angle) - coin / 2,
                      width: coin,
                      height: coin,
                      borderRadius: coin / 2,
                      backgroundColor: tint,
                      borderColor: deepShade(attackerColor),
                    },
                  ]}
                >
                  <Text
                    text={amount}
                    weight="bold"
                    maxFontSizeMultiplier={1}
                    style={[$coinText, { fontSize: coin * 0.46, lineHeight: coin * 0.6 }]}
                  />
                </Animated.View>
              )
            })
          : null}
      </View>
      {takeBack > 0 && takeover ? (
        <View pointerEvents="box-none" style={contentBox}>
          <BoardPressable
            testID={`commander-undo-seat-${seatNumber}`}
            accessibilityRole="button"
            accessibilityLabel={translate("board:commander.undoHit", { damage: takeBack })}
            onPress={mode.onUndo}
            style={[
              $undo,
              {
                left: undoAt.x - undo / 2,
                top: undoAt.y - undo / 2,
                width: undo,
                height: undo,
              },
            ]}
          >
            <UndoGlyph size={undoGlyph} color={SHADOW_INK} />
          </BoardPressable>
        </View>
      ) : null}
    </>
  )
}

/** why: the disc keeps room on each side for the strike to its left (a sword and a two-digit hit) and the hits and undo to its right. */
export function sideRoom(compact?: boolean) {
  const coin = compact ? 20 : 24
  return Math.max(compact ? 72 : 90, COIN_GAP * 2 + coin + UNDO_SIZE + UNDO_INSET)
}

/** why: the strike and the blades that fly to it wear the attacker's color, light enough to read on the shadow. */
export function strikeTint(color: string) {
  return mixColorsInLinearLight(color, "#FFFFFF", STRIKE_SHARE)
}

/** why: hits keep their spot on the arc as more land until it is full; past that they close up so the arc never grows, and the newest sits on top. Angles are degrees clockwise from the reader's right. */
export function hitAngle(index: number, count: number) {
  const step = count > HIT_ARC / HIT_STEP + 1 ? HIT_ARC / (count - 1) : HIT_STEP
  return -HIT_ARC / 2 + index * step
}

/** why: the card edge on the content's own side, for the content insets that keep a control off a notch. */
function contentEdge(rotation: LifeCardContentRotation, side: "right" | "bottom") {
  return CONTENT_SIDES[side][rotation]
}

const CONTENT_SIDES = {
  right: { 0: "right", 180: "left", 90: "bottom", [-90]: "top" },
  bottom: { 0: "bottom", 180: "top", 90: "left", [-90]: "right" },
} as const

function DamageRings({
  seatNumber,
  disc,
  lethal,
  rings,
  color,
  reachesLethal,
  style,
}: {
  seatNumber: number
  disc: number
  lethal: number
  rings: readonly { total: number; step: number }[]
  color: string
  reachesLethal: (total: number, step: number) => boolean
  style: ViewStyle
}) {
  const two = rings.length > 1
  const band = disc * (1 - DISC_FILL)
  const width = two ? band * 0.32 : band * 0.5
  return (
    <View testID={`commander-rings-seat-${seatNumber}`} style={[$absolute, style]}>
      {rings.map(({ total, step }, index) => {
        const radius = two
          ? disc - band * 0.06 - width / 2 - index * (width + band * 0.12)
          : disc - band * 0.12 - width / 2
        const filled = Math.min(total, lethal)
        const preview = Math.max(0, Math.min(step, lethal - filled))
        const red = reachesLethal(total, step) || total >= lethal
        return (
          <SegmentRing
            key={index}
            testID={`commander-ring-seat-${seatNumber}${index ? "-partner" : ""}`}
            size={disc * 2}
            radius={radius}
            width={width}
            segments={lethal}
            filled={filled}
            preview={preview}
            color={red ? DAMAGE_INK : color}
          />
        )
      })}
    </View>
  )
}

/** why: one ring of `segments` arcs, clockwise from the top of the seat's upright view. The first `filled` are solid, the next `preview` breathe with the strike, and the rest are a faint track. */
function SegmentRing({
  testID,
  size,
  radius,
  width,
  segments,
  filled,
  preview,
  color,
}: {
  testID: string
  size: number
  radius: number
  width: number
  segments: number
  filled: number
  preview: number
  color: string
}) {
  const center = size / 2
  const arc = (index: number) => {
    const each = 360 / segments
    const from = ((-90 + index * each + SEGMENT_GAP / 2) * Math.PI) / 180
    const to = ((-90 + (index + 1) * each - SEGMENT_GAP / 2) * Math.PI) / 180
    const point = (angle: number) =>
      `${(center + radius * Math.cos(angle)).toFixed(2)} ${(center + radius * Math.sin(angle)).toFixed(2)}`
    return `M${point(from)}A${radius} ${radius} 0 0 1 ${point(to)}`
  }
  const join = (from: number, to: number) =>
    Array.from({ length: Math.max(0, to - from) }, (_, offset) => arc(from + offset)).join("")
  return (
    <View testID={testID} style={[$absolute, { width: size, height: size }]}>
      <Svg width={size} height={size} style={$absolute}>
        <Path
          d={join(filled + preview, segments)}
          stroke={SHADOW_INK}
          strokeOpacity={TRACK_OPACITY}
          strokeWidth={width}
          fill="none"
        />
        <Path d={join(0, filled)} stroke={color} strokeWidth={width} fill="none" />
      </Svg>
      {preview > 0 ? (
        <Breathing style={[$absolute, { width: size, height: size }]}>
          <Svg width={size} height={size}>
            <Path
              testID={`${testID}-preview`}
              d={join(filled, filled + preview)}
              stroke={color}
              strokeWidth={width}
              fill="none"
            />
          </Svg>
        </Breathing>
      ) : null}
    </View>
  )
}

const BREATH_MS = 800

/** why: what the next hit would fill breathes, in step with the strike's nudge, so it reads as a preview rather than damage dealt. */
function Breathing({ style, children }: { style: StyleProp<ViewStyle>; children: ReactNode }) {
  const reducedMotion = useReducedMotion()
  const breath = useSharedValue(0)
  useEffect(() => {
    if (reducedMotion !== false) return
    breath.value = withRepeat(
      withTiming(1, { duration: BREATH_MS, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    )
    return () => cancelAnimation(breath)
  }, [breath, reducedMotion])
  const breathStyle = useAnimatedStyle(() => ({
    opacity: reducedMotion !== false ? 0.5 : 0.95 - breath.value * 0.6,
  }))
  return <Animated.View style={[style, breathStyle]}>{children}</Animated.View>
}

/** why: the sword points at the disc with what a tap deals; it nudges toward the disc while it waits and lunges in when a hit lands. */
function Strike({
  seatNumber,
  dealt,
  color,
  font,
  sword,
  lunge,
  style,
}: {
  seatNumber: number
  dealt: number
  color: string
  font: number
  sword: number
  lunge: SharedValue<number>
  style: ViewStyle
}) {
  const reducedMotion = useReducedMotion()
  const { anchor, inbound } = useCommanderFlights()
  const waiting = inbound.has(seatNumber)
  const nudge = useSharedValue(0)
  // why: the sword holds still under its blade, so the blade hands over to it where it landed.
  useEffect(() => {
    if (reducedMotion !== false || waiting) return
    nudge.value = withRepeat(
      withTiming(1, { duration: BREATH_MS, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    )
    return () => {
      cancelAnimation(nudge)
      nudge.value = 0
    }
  }, [nudge, reducedMotion, waiting])
  const swordStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: nudge.value * NUDGE + lunge.value * LUNGE }, { rotate: "90deg" }],
  }))
  return (
    <Animated.View testID={`commander-strike-seat-${seatNumber}`} style={[$strike, style]}>
      <Text
        testID={`commander-strike-amount-seat-${seatNumber}`}
        text={formatSigned(-dealt)}
        weight="bold"
        maxFontSizeMultiplier={1}
        numberOfLines={1}
        style={[$strikeText, { color, fontSize: font, lineHeight: font * 1.15 }]}
      />
      <View ref={anchor("landing", seatNumber)} collapsable={false}>
        {/* why: while its blade is in the air the blade stands in for the strike's sword, swapping in the same commit; the amount comes and goes with the shadow, which the blade rides. */}
        <Animated.View style={[swordStyle, waiting && $hidden]}>
          <Sword size={sword} color={color} />
        </Animated.View>
      </View>
    </Animated.View>
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
  const [room, setRoom] = useState<{ width: number; height: number } | null>(null)
  const [open, setOpen] = useState<{ slot: number; draft: string }>()
  const partners = mode.commanders.length > 1
  const sideways = Math.abs(contentRotation) === 90
  const space = room && (sideways ? { width: room.height, height: room.width } : room)
  const layout = attackerLayout({
    space,
    count: mode.commanders.length,
    compact,
    bands: mode.bands,
  })
  const testSeats = partnerTestSeats(seatNumber)
  const cardColor = mode.mark?.color
  const paper = cardColor
    ? mixColorsInLinearLight(cardColor, "#FFFFFF", 0.7)
    : overlayTint(foreground, 0.2)
  const ink = cardColor ? deepShade(cardColor) : foreground
  const motion = reducedMotion === false
  const moved = motion ? LinearTransition.duration(EDIT_MS) : undefined
  const shown = motion ? FadeIn.duration(EDIT_MS) : undefined
  const hidden = motion ? FadeOut.duration(EDIT_MS / 2) : undefined
  const inAttack = mode.commanders.filter(({ sitting }) => !sitting).length

  function edit(slot: number) {
    const closing = open?.slot === slot
    setOpen(closing ? undefined : { slot, draft: "" })
    mode.onEditing(!closing)
  }
  function close() {
    if (!open) return
    setOpen(undefined)
    mode.onEditing(false)
  }
  // why: a − or + on the box being typed into replaces what was typed, so the box shows the power the next hit deals. A partner's − at 1 takes it out of the attack instead.
  function step(slot: number, power: number) {
    if (open?.slot === slot) setOpen({ slot, draft: "" })
    if (power < LOWEST_POWER) {
      if (open?.slot === slot) close()
      mode.onSit(slot)
      return
    }
    mode.onPower(power, slot)
  }
  // why: each key sets the power at once, so a hit tapped while the keypad is open deals what was typed. It opens empty, so the first key replaces the power rather than adding to it.
  function type(char: string) {
    if (!open || !/^\d$/.test(char)) return
    if (open.draft.length >= String(MAX_COMMANDER_DAMAGE).length) return
    const draft = open.draft + char
    setOpen({ ...open, draft })
    mode.onPower(Number(draft), open.slot)
  }
  function erase() {
    if (!open) return
    const draft = open.draft.slice(0, -1)
    setOpen({ ...open, draft })
    if (draft) mode.onPower(Number(draft), open.slot)
  }

  const box = {
    color: paper,
    ink,
    ring: foreground,
    bar: cardColor ?? overlayTint(foreground, 0.35),
    width: layout.width,
    height: layout.height,
    nameHeight: layout.name,
  }
  const commanderBox = ({ name, power, sitting }: ArmedCommander, index: number) => (
    <Animated.View key={index} layout={moved} entering={shown} exiting={hidden}>
      <PowerBox
        {...box}
        suffix={testSeats[index]}
        name={
          name ?? translate(index ? "board:commander.unnamedPartner" : "board:commander.unnamed")
        }
        partner={partners}
        power={power}
        sitting={!!sitting}
        // why: the last commander in the attack stays in at 1.
        leaves={partners && inAttack > 1}
        draft={open?.slot === index ? open.draft : undefined}
        onPower={(next) => step(index, next)}
        onEdit={() => edit(index)}
        onSit={() => mode.onSit(index)}
      />
    </Animated.View>
  )
  const editedCommander = open && mode.commanders[open.slot]
  const edited = editedCommander && open && commanderBox(editedCommander, open.slot)
  const keypad = space ? keypadPlacement(space, layout, compact) : undefined

  return (
    <BoardPressable
      testID={`commander-attacker-seat-${seatNumber}`}
      accessible={false}
      onPress={close}
      style={themed($attackerCenter)}
      onLayout={({ nativeEvent: { layout: area } }) =>
        setRoom({ width: area.width, height: area.height })
      }
    >
      <View
        style={[
          themed($attackerColumn),
          contentRotation ? { transform: [{ rotate: `${contentRotation}deg` }] } : null,
        ]}
      >
        {edited && keypad ? (
          <View style={[keypad.stacked ? $editStacked : $editBeside, { gap: UNIT_GAP }]}>
            {edited}
            <Animated.View
              entering={shown}
              exiting={hidden}
              style={{ width: keypad.width, height: keypad.height }}
            >
              <PokemonKeypad
                seatNumber={seatNumber}
                ink={foreground}
                digitsOnly
                capitalize={false}
                compact={keypad.compact}
                onType={type}
                onDelete={erase}
                onDone={close}
              />
            </Animated.View>
          </View>
        ) : (
          <View
            testID={`commander-boxes-seat-${seatNumber}`}
            style={[themed($commanderRow), { transform: [{ translateY: layout.boxesY }] }]}
          >
            {mode.commanders.map(commanderBox)}
          </View>
        )}
      </View>
    </BoardPressable>
  )
}

const EDIT_MS = 220
const KEY_ROWS = 4
const KEYPAD_ROW_GAP = 5
const KEYPAD_MAX_WIDTH = 280
// why: beside the box, the keypad keeps to about three thumb-wide keys so the pair stays centered and clear of the card's corner marks.
const KEYPAD_BESIDE_WIDTH = 150
// why: three keys of about 30pt and their gaps, below which the beside keypad is no longer tappable.
const MIN_KEYPAD_WIDTH = 100

/** why: the in-card keypad for a power. It sits under the box when the card has room for four rows of full keys there, and beside it otherwise, with compact keys that give up height to fit a short seat. */
export function keypadPlacement(
  space: { width: number; height: number },
  layout: ReturnType<typeof attackerLayout>,
  compact?: boolean,
) {
  const boxHeight = layout.height + layout.name
  const rowsHeight = (key: number) => KEY_ROWS * key + (KEY_ROWS - 1) * KEYPAD_ROW_GAP
  const stacked = !compact && space.height >= boxHeight + rowsHeight(KEY_HEIGHT) + UNIT_GAP * 3
  if (stacked)
    return {
      stacked,
      compact: false,
      width: Math.min(KEYPAD_MAX_WIDTH, space.width - UNIT_GAP * 2),
      height: rowsHeight(KEY_HEIGHT),
    }
  const beside = Math.min(KEYPAD_BESIDE_WIDTH, space.width - layout.width - UNIT_GAP * 3)
  if (beside >= MIN_KEYPAD_WIDTH)
    return {
      stacked,
      compact: true,
      width: beside,
      height: Math.max(0, Math.min(rowsHeight(COMPACT_KEY_HEIGHT), space.height - UNIT_GAP * 2)),
    }
  return {
    stacked: true,
    compact: true,
    width: Math.max(0, Math.min(KEYPAD_MAX_WIDTH, space.width - UNIT_GAP * 2)),
    height: Math.max(
      0,
      Math.min(rowsHeight(COMPACT_KEY_HEIGHT), space.height - boxHeight - UNIT_GAP * 3),
    ),
  }
}

const UNIT_GAP = 16
// why: a power box's number row is wide enough for its sword, number, − and + to sit apart.
const BOX_RATIO = 2.75
// why: the commander's name runs along the box's foot, under the number.
const NAME_SHARE = 0.4
const MIN_NAME = 24
// why: a box narrower than this leaves its − and + no room beside the number.
const MIN_BOX_RATIO = 1.4
const SMALLEST_BOX = 28
// why: the name bar drops below MIN_NAME, and the number row below SMALLEST_BOX, only when a seat is too small for the boxes otherwise.
const TIGHT_NAME = 18
const TIGHT_BOX = 20
const BOX_GAP = "md"
// why: the boxes keep a little air from the life above them and the name row below.
const BAND_GAP = 4
const ATTACKER_COLUMN_GAP = "xxs"

export type AttackerBands = { head: number; foot: number }

/** why: an attacker's power boxes take the band between its life in the head corner and its name row at the foot, as large as fits with UNIT_GAP at the sides; partners share one row. Seats only get smaller from here (8 and 10 players), so the size comes from the room rather than a fixed minimum. `height` is the number row and `name` the row under it; `boxesY` places the boxes' middle below the card's center, in the seat's upright space. */
export function attackerLayout({
  space,
  count,
  compact,
  bands,
}: {
  space: { width: number; height: number } | null
  count: number
  compact?: boolean
  bands?: AttackerBands
}) {
  const largest = compact ? 52 : 64
  const head = bands?.head ?? 0
  const foot = bands?.foot ?? 0
  const size = (height: number, nameFloor: number) => {
    const lane = space
      ? (space.width - UNIT_GAP * 2 - spacing[BOX_GAP] * (count - 1)) / count
      : Infinity
    return {
      height,
      width: Math.max(0, Math.floor(Math.min(lane, height * BOX_RATIO))),
      name: Math.max(nameFloor, Math.round(height * NAME_SHARE)),
      boxesY: (head - foot) / 2,
    }
  }
  if (!space) return size(largest, MIN_NAME)
  const room = space.height - head - foot - BAND_GAP * 2
  for (const [nameFloor, smallest] of [
    [MIN_NAME, SMALLEST_BOX],
    [TIGHT_NAME, TIGHT_BOX],
  ]) {
    for (let height = largest; height >= smallest; height--) {
      const layout = size(height, nameFloor)
      if (layout.width >= layout.height * MIN_BOX_RATIO && layout.height + layout.name <= room)
        return layout
    }
  }
  return size(TIGHT_BOX, TIGHT_NAME)
}

// why: Rubik Bold digits ink about 0.64em wide.
const DIGIT_INK_WIDTH = 0.64

/** why: a team zone's names hold both head corners and the pentagon its head's middle, so its life sits at the foot beside the check instead: `y` is the foot row's middle and `beside` how far the life's end stays left of the zone's middle. */
export type AttackerLifeFoot = { y: number; beside: number }

/** why: the attacker's life moves into its head corner, small and in regular weight, so it stays in view without reading as the attack's target. `x` and `y` place its middle from the card's center in the seat's upright space, `menu` steps it past a pentagon on that corner, and `band` is how far down from the head it reaches. */
export function attackerLifeSlot({
  space,
  digits,
  compact,
  gap,
  menu,
  foot,
}: {
  space: { width: number; height: number }
  digits: number
  compact?: boolean
  gap: number
  menu: number
  foot?: AttackerLifeFoot
}) {
  const fontSize = compact ? ATTACKER_LIFE_COMPACT : ATTACKER_LIFE
  const width = digits * DIGIT_INK_WIDTH * fontSize
  const height = DIGIT_INK_HEIGHT * fontSize
  if (foot) return { fontSize, x: -foot.beside - width / 2, y: foot.y, band: 0 }
  return {
    fontSize,
    x: -space.width / 2 + gap + menu + width / 2,
    y: -space.height / 2 + gap + height / 2,
    band: gap + getLifeLineHeight(fontSize) / 2 + height / 2,
  }
}

const ATTACKER_LIFE = 26
const ATTACKER_LIFE_COMPACT = 20

const partnerTestSeats = (seatNumber: number) => [`${seatNumber}`, `${seatNumber}-partner`]

// why: bright enough to read on the shadow and on any seat's disc.
export const DAMAGE_INK = "#FF4D5A"
const TRACK_OPACITY = 0.1
// why: each lethal step reads as its own segment.
const SEGMENT_GAP = 2.6
// why: the attacker's light tint inks its rings and hits on the defender's shadow.
const TINT_SHARE = 0.42
const STRIKE_GAP = 6
const STRIKE_SHARE = 0.78
const NUDGE = 4
const $hidden: ViewStyle = { opacity: 0 }
const LUNGE = 20
const COIN_GAP = 6
// why: degrees of arc the hits on one seat may use, and how far apart they sit until it fills.
const HIT_ARC = 70
const HIT_STEP = 14
const UNDO_SIZE = 56
// why: the smallest comfortable touch target, for undo in a narrow seat's corner.
const MIN_TARGET = 44
const UNDO_INSET = 4

/** why: a creature-style power box; its left and right ends lower and raise power, and tapping the number types one in. A partner's − at 1 takes it out of the attack; out, the whole box dims at the power it keeps and a tap brings it back. */
function PowerBox({
  suffix,
  name,
  partner,
  power,
  sitting,
  leaves,
  draft,
  color,
  ink,
  ring,
  bar,
  width,
  height,
  nameHeight,
  onPower,
  onEdit,
  onSit,
}: {
  suffix: string
  name: string
  partner: boolean
  power: number
  sitting: boolean
  leaves: boolean
  draft?: string
  color: string
  ink: string
  ring: string
  bar: string
  width: number
  height: number
  nameHeight: number
  onPower: (power: number) => void
  onEdit: () => void
  onSit: () => void
}) {
  const editing = draft !== undefined
  const pressedTint = { backgroundColor: overlayTint(ink, 0.14) }
  const shownName = name
  // why: shrink the number to its row's middle so two digits fit a narrowed box instead of wrapping out of sight; the platform shrinks it further if the font runs wider than this estimate.
  const valueWidth = (width * VALUE_FLEX) / (VALUE_FLEX + HALF_FLEX * 2)
  const digits = Math.max(1, String(power).length)
  const swordSize = Math.round(height * SWORD_SHARE)
  const fontSize = Math.min(height * 0.62, (valueWidth - swordSize) / (digits * DIGIT_ADVANCE))
  const numberStyle = { color: ink, fontSize, lineHeight: height * 0.8 }
  const nameFont = Math.round(Math.min(nameHeight * 0.55, height * 0.34))
  const frame: ViewStyle = {
    width,
    height: height + nameHeight,
    borderRadius: height * 0.22,
    borderWidth: Math.max(2, height * 0.04),
    borderColor: ring,
    backgroundColor: color,
  }
  const nameText = (shownInk: string) => (
    <Text
      testID={`commander-name-seat-${suffix}`}
      text={shownName}
      weight="bold"
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.6}
      maxFontSizeMultiplier={1}
      style={[
        $boxName,
        // why: a line box close to the font's own height, since iOS sets a taller one's extra room above the text and the name sinks low in its bar.
        {
          color: shownInk,
          fontSize: nameFont,
          lineHeight: Math.round(nameFont * 1.2),
          transform: [{ translateY: -nameFont * NAME_RISE }],
        },
      ]}
    />
  )

  if (sitting)
    return (
      <BoardPressable
        testID={`commander-sit-seat-${suffix}`}
        accessibilityRole="switch"
        accessibilityLabel={shownName}
        accessibilityState={{ checked: false }}
        onPress={onSit}
        style={({ pressed }) => [$box, frame, $sittingOut, pressed && pressedTint]}
      >
        <View style={[$boxRow, $boxValue, { height }]}>
          <Text
            text={power}
            weight="bold"
            numberOfLines={1}
            maxFontSizeMultiplier={1}
            style={numberStyle}
          />
        </View>
        <View style={[$boxNameRow, { height: nameHeight, paddingHorizontal: height * 0.12 }]}>
          {nameText(ink)}
        </View>
      </BoardPressable>
    )

  const half = (step: 1 | -1) => {
    const disabled = step < 0 ? power <= LOWEST_POWER && !leaves : power >= MAX_COMMANDER_DAMAGE
    const label =
      step < 0
        ? partner
          ? translate("board:commander.lowerPowerOf", { name })
          : translate("board:commander.lowerPower")
        : partner
          ? translate("board:commander.raisePowerOf", { name })
          : translate("board:commander.raisePower")
    return (
      <BoardPressable
        testID={`commander-power-${step < 0 ? "down" : "up"}-seat-${suffix}`}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled }}
        disabled={disabled}
        onPress={() => onPower(power + step)}
        style={({ pressed }) => [
          $boxHalf,
          { alignItems: step < 0 ? "flex-start" : "flex-end", paddingHorizontal: height * 0.16 },
          pressed && pressedTint,
        ]}
      >
        <Text
          // eslint-disable-next-line no-restricted-syntax -- why: a lone plus or minus on a step button is an icon, not a number.
          text={step < 0 ? "−" : "+"}
          maxFontSizeMultiplier={1}
          style={[
            { color: ink, fontSize: height * 0.4, lineHeight: height * 0.5 },
            disabled ? $boxGlyphDisabled : $boxGlyph,
          ]}
        />
      </BoardPressable>
    )
  }

  return (
    <View style={[$box, frame]}>
      <View style={[$boxRow, { height }]}>
        {half(-1)}
        <BoardPressable
          testID={`commander-power-seat-${suffix}`}
          accessibilityRole="button"
          accessibilityLabel={translate("board:commander.power", { power })}
          accessibilityState={{ expanded: editing }}
          accessibilityLiveRegion="polite"
          onPress={onEdit}
          style={({ pressed }) => [
            $boxValue,
            $boxRow,
            editing && { backgroundColor: overlayTint(ink, 0.1) },
            pressed && pressedTint,
          ]}
        >
          <Sword size={swordSize} color={ink} />
          {/* why: the keypad opens empty with the current power dimmed in its place, so typing replaces it; closing empty keeps it. */}
          <Text
            testID={editing ? `commander-power-input-seat-${suffix}` : undefined}
            text={power}
            weight="bold"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.5}
            maxFontSizeMultiplier={1}
            style={[numberStyle, editing && !draft && $draftHint]}
          />
        </BoardPressable>
        {half(1)}
      </View>
      <View
        style={[
          $boxNameRow,
          {
            height: nameHeight,
            paddingHorizontal: height * 0.12,
            borderTopColor: overlayTint(ink, 0.35),
            backgroundColor: bar,
          },
        ]}
      >
        {nameText(ring)}
      </View>
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

const $absolute: ViewStyle = { position: "absolute" }

/** why: while an attack holds a defending card, the flood covers its own controls (z 10), the life total rides above the flood, and the ring, badges, and hit target above that. */
export const TAKEOVER_LAYERS = { flood: 11, life: 12, controls: 13 } as const
const $flood: ViewStyle = { zIndex: TAKEOVER_LAYERS.flood }
const $aboveFlood: ViewStyle = { zIndex: TAKEOVER_LAYERS.controls }

const $sittingOut: ViewStyle = { opacity: 0.4 }
const $draftHint: TextStyle = { opacity: 0.35 }
const $editStacked: ViewStyle = { alignItems: "center" }
const $editBeside: ViewStyle = { flexDirection: "row", alignItems: "center" }

const $box: ViewStyle = { overflow: "hidden" }
const $boxRow: ViewStyle = { flexDirection: "row" }
// why: the number takes the middle of its row, wide enough for two digits, and the − and + split the rest.
// why: iOS sets Rubik's lowercase-heavy names about a fifth of an em below the middle of their line box; Android centers them.
const NAME_RISE = Platform.OS === "ios" ? 0.2 : 0
const HALF_FLEX = 0.8
const VALUE_FLEX = 1.4
// why: Rubik Bold digits advance a little over 0.6em, so this keeps two of them clear of the − and +.
const DIGIT_ADVANCE = 0.66
const $boxHalf: ViewStyle = { flex: HALF_FLEX, justifyContent: "center" }
const $boxNameRow: ViewStyle = {
  alignItems: "center",
  justifyContent: "center",
  borderTopWidth: StyleSheet.hairlineWidth,
}
const $boxName: TextStyle = {
  flexShrink: 1,
  textAlign: "center",
  includeFontPadding: false,
  textAlignVertical: "center",
}
const $boxGlyph: TextStyle = { opacity: 0.6 }
const $boxGlyphDisabled: TextStyle = { opacity: 0.2 }

const $overlay: ThemedStyle<ViewStyle> = ({ radius }) => ({
  ...StyleSheet.absoluteFill,
  zIndex: 8,
  overflow: "hidden",
  borderRadius: radius.xxxl,
})

const $compactOverlay: ThemedStyle<ViewStyle> = ({ radius }) => ({
  borderRadius: radius.xxl,
})

const $undo: ViewStyle = {
  position: "absolute",
  width: UNDO_SIZE,
  height: UNDO_SIZE,
  alignItems: "center",
  justifyContent: "center",
  opacity: 0.85,
}

const $attackerCenter: ThemedStyle<ViewStyle> = () => ({
  ...StyleSheet.absoluteFill,
  alignItems: "center",
  justifyContent: "center",
})

const $attackerColumn: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  gap: spacing[ATTACKER_COLUMN_GAP],
})

const $commanderRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing[BOX_GAP],
})

const $boxValue: ViewStyle = {
  flex: VALUE_FLEX,
  alignItems: "center",
  justifyContent: "center",
  gap: 2,
}

// why: the sword before a power reads as "hits for", sized to sit beside two digits.
const SWORD_SHARE = 0.36
const $coin: ViewStyle = {
  position: "absolute",
  alignItems: "center",
  justifyContent: "center",
  borderWidth: 2,
}
const $coinText: TextStyle = { color: "#000000", fontVariant: ["tabular-nums"] }
const $strike: ViewStyle = {
  position: "absolute",
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "flex-end",
}
const $strikeText: TextStyle = { fontVariant: ["tabular-nums"] }
