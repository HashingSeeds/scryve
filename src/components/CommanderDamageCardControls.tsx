import { useEffect, useRef, useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { StyleSheet, View } from "react-native"
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
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
  // why: the commander strip's corner, which undo keeps clear of.
  stripCorner?: CommanderCorner
  takeover?: CommanderTakeover
  wave: SharedValue<number>
  acted: boolean
  dealt: number
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

// why: the shadow eases off the attacker's card and travels at a pace the eye can follow, so neighbours darken first and the far seats after.
export const TAKEOVER_MS = 950
const TAKEOVER_EASING = Easing.bezier(0.45, 0.05, 0.25, 1)
// why: closing is quicker than opening. The drain pulls the shadow back slowly at first and then fast into the attacker's card.
const DRAIN_MS = 620
const DRAIN_EASING = Easing.bezier(0.7, 0, 0.7, 0.4)
// why: the shadow's blur and spread. Spreading by the blur puts the blur's solid core at the card's grown edge, so the shadow fades smoothly from there over twice this distance.
const FLOOD_BLUR = 24
// why: the attacker's card is where the shadow starts, so it swaps its life total for power boxes quickly as the shadow leaves it; everything else changes when the shadow reaches it.
export const SWAP_MS = 240
const SWAP_FROM = 0.85

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
  const swap = motionDuration(reducedMotion, SWAP_MS)
  const source = mode.kind === "source"
  const progress = useSharedValue(swap ? 0 : 1)
  const wave = mode.kind === "target" ? mode.wave : undefined
  const flood = mode.kind === "target" ? mode.takeover?.flood : undefined

  useEffect(() => {
    if (source) progress.value = withTiming(1, { duration: swap, easing: Easing.out(Easing.cubic) })
  }, [progress, source, swap])

  // why: a defender's ring and badges show as the shadow's edge passes its disc, the same moment the disc's gutter ring draws in.
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
      exiting={swap ? takeoverExit(source ? swap : swap / 2, source) : undefined}
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

export type CommanderFlood = NonNullable<CommanderTakeover["flood"]>

// why: the shadow is the attacker's card grown on every side, from just inside its own edges until it covers the farthest seat. Its blur fades over twice FLOOD_BLUR past those edges, so it arrives with a soft edge.
function shadowGrown(flood: CommanderFlood, wave: number) {
  "worklet"
  return -FLOOD_BLUR * 2 + wave * (flood.distance + FLOOD_BLUR * 2)
}

/** why: 0 until the shadow's soft edge reaches a point `gap` away, 1 once its solid core covers it, or once the shadow has grown `span` past that, if it still has that far to go. */
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

function takeoverExit(duration: number, source: boolean): EntryExitAnimationFunction {
  return () => {
    "worklet"
    const timing = { duration, easing: Easing.in(Easing.quad) }
    return {
      initialValues: {},
      animations: {
        opacity: withTiming(0, timing),
        transform: [{ scale: withTiming(source ? SWAP_FROM : 1, timing) }],
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
  const duration = motionDuration(reducedMotion, active ? TAKEOVER_MS : DRAIN_MS)
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

// why: a defender floods a deep shade of its own color, so the attacker is the only bright card and no flood can be mistaken for another player's color. The attacker's power box inks its number in the same shade. 0.87 in linear light keeps about 40% of each sRGB channel.
export function deepShade(color: string) {
  return mixColorsInLinearLight(color, "#000000", 0.87)
}

// why: every shadow is dark enough for white ink, so a defender's controls and commander strip read in white over it whatever the attacker's color.
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
  // why: the ring darkens with the shadow under the disc, so it draws in as the soft edge passes over it.
  const ringStyle = useAnimatedStyle(() => ({
    opacity: flood ? shadowReached(flood, wave.value, flood.discGap) : 1,
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
  const flash = useSharedValue(0)
  const { attacker, facing, takeover, commanders } = mode
  const totals = commanders.map(({ total }) => total)
  const struck = totals.reduce((sum, total) => sum + total, 0)
  const previousStruck = useRef(struck)
  const { dealt, takeBack } = mode
  const attackerColor = attacker?.color ?? theme.colors.board.surfaceRaised

  useEffect(() => {
    const previous = previousStruck.current
    previousStruck.current = struck
    if (struck <= previous || reducedMotion !== false) return
    flash.value = withSequence(withTiming(0.35, { duration: 60 }), withTiming(0, { duration: 260 }))
  }, [flash, reducedMotion, struck])

  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }))

  function hit() {
    if (dealt <= 0) return
    mode.onHit()
  }

  const undoCorner = freeCorner(menuCorner, facing, mode.stripCorner)
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
  const lead = Math.max(...totals)

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
          // why: the damage arc starts on the attacker's side of the ring.
          <Svg
            width={ring}
            height={ring}
            style={[
              $centeredAt(discX - ring / 2, discY - ring / 2),
              { transform: [{ rotate: `${(takeover.angle * 180) / Math.PI}deg` }] },
            ]}
          >
            <Circle
              testID={`commander-progress-seat-${seatNumber}`}
              cx={ring / 2}
              cy={ring / 2}
              r={progressRadius}
              stroke={SHADOW_INK}
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
            style={[
              $centered,
              $centeredAt(discX - disc, discY - disc),
              { width: disc * 2, height: disc * 2 },
            ]}
          >
            <PulseRing
              testID={`commander-target-pulse-seat-${seatNumber}`}
              size={disc * 2 + 12}
              color={SHADOW_INK}
            />
          </View>
        ) : null}
      </View>
      {takeBack > 0 ? (
        <BoardPressable
          testID={`commander-undo-seat-${seatNumber}`}
          accessibilityRole="button"
          accessibilityLabel={translate("board:commander.undoHit", { damage: takeBack })}
          onPress={mode.onUndo}
          style={[
            themed($undo),
            {
              [undoCorner.x]: inset(undoCorner.x),
              [undoCorner.y]: inset(undoCorner.y),
              transform: [{ rotate: `${contentRotation}deg` }],
            },
          ]}
        >
          <UndoGlyph size={compact ? 22 : 28} color={SHADOW_INK} />
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
        {mode.commanders.map(({ name, power, benched }, index) => (
          <PowerBox
            key={index}
            suffix={testSeats[index]}
            name={name}
            partner={partners}
            benched={!!benched}
            power={power}
            color={paper}
            ink={ink}
            ring={foreground}
            width={layout.width}
            height={layout.height}
            nameHeight={layout.name}
            onStep={(step) => mode.onPowerStep(step, index)}
            onToggle={() => mode.onToggle(index)}
          />
        ))}
      </View>
    </View>
  )
}

const UNIT_GAP = 16
// why: a power box's number row is wide enough for its small − and + to sit at its ends, clear of the number.
const BOX_RATIO = 2
const MIN_BOX = 44
// why: the commander's name runs along the box's foot, under the number, at about a quarter of the number row's height.
const NAME_SHARE = 0.26
const MIN_NAME = 16

/** why: an attacker's name sits inside its power box under the number, and partners share the card's width side by side, since a card runs out of height before width. Each box shrinks to its lane, down to a tappable minimum. `height` is the number row, `name` the row under it. */
export function attackerLayout({
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
  const room = space ? (space.height - UNIT_GAP * 2) / (1 + NAME_SHARE) : Infinity
  const height = Math.floor(Math.max(MIN_BOX, Math.min(largest, lane / BOX_RATIO, room)))
  // why: below the tappable minimum height a box narrows instead, so partners never run past a short seat's edges.
  return {
    height,
    width: Math.max(0, Math.floor(Math.min(lane, height * BOX_RATIO))),
    name: Math.max(MIN_NAME, Math.round(height * NAME_SHARE)),
  }
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

/** why: the attacker's power reads as a creature's power box, and its left and right ends lower and raise it, as a card's halves do for life. The commander's name sits under the number; for partners the number and name are one big target that benches or returns that partner. */
function PowerBox({
  suffix,
  name,
  partner,
  benched,
  power,
  color,
  ink,
  ring,
  width,
  height,
  nameHeight,
  onStep,
  onToggle,
}: {
  suffix: string
  name?: string
  partner: boolean
  benched: boolean
  power: number
  color: string
  ink: string
  ring: string
  width: number
  height: number
  nameHeight: number
  onStep: (step: 1 | -1) => void
  onToggle: () => void
}) {
  const { themed } = useAppTheme()
  const pressedTint = { backgroundColor: overlayTint(ink, 0.14) }
  const half = (step: 1 | -1) => {
    const disabled = step < 0 ? power <= 1 : power >= MAX_COMMANDER_DAMAGE
    const label =
      step < 0
        ? partner && name
          ? translate("board:commander.lowerPowerOf", { name })
          : translate("board:commander.lowerPower")
        : partner && name
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
          pressed && pressedTint,
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
  const nameFont = Math.round(nameHeight * 0.62)
  return (
    <View
      style={[
        $box,
        {
          width,
          height: height + nameHeight,
          borderRadius: height * 0.22,
          borderWidth: Math.max(2, height * 0.04),
          borderColor: ring,
          backgroundColor: color,
        },
        benched && $benched,
      ]}
    >
      {partner ? (
        <BoardPressable
          testID={`commander-toggle-seat-${suffix}`}
          accessibilityRole="checkbox"
          accessibilityLabel={translate("board:commander.partnerAttacks", { name })}
          accessibilityState={{ checked: !benched }}
          onPress={onToggle}
          style={({ pressed }) => [StyleSheet.absoluteFill, pressed && pressedTint]}
        />
      ) : null}
      <View pointerEvents="box-none" style={[$boxRow, { height }]}>
        {half(-1)}
        {partner ? <View pointerEvents="none" style={$boxToggleGap} /> : null}
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
      {/* why: a seat with no deck still names its attacker, dimmed, so the box never sits unlabeled. */}
      <View pointerEvents="none" style={{ height: nameHeight, paddingHorizontal: height * 0.16 }}>
        <Text
          testID={`commander-name-seat-${suffix}`}
          text={name ?? translate("board:commander.unnamed")}
          weight="bold"
          numberOfLines={1}
          maxFontSizeMultiplier={1}
          style={[
            $boxName,
            { color: ink, fontSize: nameFont, lineHeight: nameHeight },
            !name && $unnamed,
          ]}
        />
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

function cornerName(x: "left" | "right", y: "top" | "bottom"): LifeCardMenuCorner {
  return `${y}${x === "left" ? "Left" : "Right"}`
}

const CORNERS = [
  { x: "right", y: "bottom" },
  { x: "left", y: "bottom" },
  { x: "right", y: "top" },
  { x: "left", y: "top" },
] as const

type CommanderCorner = { x: "left" | "right"; y: "top" | "bottom" }

/** why: undo takes a corner clear of the menu and the strip, preferring the side away from the attacker; when the attacker's sides leave none, clearing the strip wins. */
function freeCorner(
  menuCorner: LifeCardMenuCorner | undefined,
  facing: CommanderFacing,
  strip?: CommanderCorner,
) {
  const open = CORNERS.filter(
    ({ x, y }) => cornerName(x, y) !== menuCorner && !(strip?.x === x && strip.y === y),
  )
  const free = open.filter(({ x, y }) => x !== facing.x && y !== facing.y)
  const awayFromMenu = free.find(
    ({ x, y }) => menuCorner && !menuCorner.startsWith(y) && !menuCorner.toLowerCase().endsWith(x),
  )
  return awayFromMenu ?? free[0] ?? open[0] ?? CORNERS[0]
}

const $centered: ViewStyle = { justifyContent: "center", alignItems: "center" }

const $absolute: ViewStyle = { position: "absolute" }

// why: the disc's ring matches the board's gutter between cards, and the damage arc runs along it.
const DISC_RING = 4
/** why: while an attack holds a defending card, the flood covers its own controls (z 10), the life total rides above the flood, and the ring, badges, and hit target above that. */
export const TAKEOVER_LAYERS = { flood: 11, life: 12, controls: 13 } as const
const $flood: ViewStyle = { zIndex: TAKEOVER_LAYERS.flood }
const $aboveFlood: ViewStyle = { zIndex: TAKEOVER_LAYERS.controls }

const $benched: ViewStyle = { opacity: 0.4 }

const $box: ViewStyle = { overflow: "hidden" }
const $boxRow: ViewStyle = { flexDirection: "row" }
const $boxHalf: ViewStyle = { flex: 1, justifyContent: "center" }
const $boxToggleGap: ViewStyle = { flex: 1 }
const $boxName: TextStyle = { textAlign: "center", marginTop: -4, opacity: 0.75 }
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

const $partners: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.md,
})

const $boxValue: ThemedStyle<ViewStyle> = () => ({
  ...StyleSheet.absoluteFill,
  alignItems: "center",
  justifyContent: "center",
})

const $unnamed: TextStyle = { opacity: 0.45 }
