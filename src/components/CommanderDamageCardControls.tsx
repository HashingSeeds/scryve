import { useEffect, useRef, useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { Keyboard, Platform, StyleSheet, View } from "react-native"
import Animated, {
  cancelAnimation,
  Easing,
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  type EntryExitAnimationFunction,
  type SharedValue,
} from "react-native-reanimated"
import Svg, { Circle, Path } from "react-native-svg"

import { lowestPower } from "@/features/game/commanderAttack"
import { MAX_COMMANDER_DAMAGE } from "@/features/game/domain"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { Spacing, ThemedStyle } from "@/theme/types"
import { motionDuration, useReducedMotion } from "@/utils/useReducedMotion"

import { BoardPressable } from "./BoardPressable"
import { DISC_RING, type CommanderFacing, type CommanderTakeover } from "./commanderDamageLayout"
import { mixColorsInLinearLight } from "./GameMenuButtonShape"
import { overlayTint } from "./LifeControls"
import type {
  LifeCardContentInsets,
  LifeCardContentRotation,
  LifeCardEdge,
  LifeCardMenuCorner,
} from "./playerCardTypes"
import { Text } from "./Text"
import { TextField } from "./TextField"
import type { PlayerMarkShape } from "../../convex/lib/appearance"

export type CommanderAttacker = {
  color: string
  shape?: PlayerMarkShape
  seatNumber: number
  rotation?: LifeCardContentRotation
}

/** why: `landed` is the part of `total` dealt by this attack's hits so far; absent means none. */
export type ArmedCommander = { name?: string; power: number; total: number; landed?: number }

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
  onPower: (power: number, index: number) => void
  // why: the number pad covers the lower half of the screen, so a seat there lifts its card by `amount` screen points while its power field is open.
  onLift: (amount: number) => void
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
  // why: a defender's last attack, kept on screen while the shadow drains so its ring fades out as the shadow's edge passes the disc. It takes no touches.
  draining?: boolean
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
  draining,
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
      pointerEvents={draining ? "none" : undefined}
      accessibilityElementsHidden={draining}
      importantForAccessibility={draining ? "no-hide-descendants" : "auto"}
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

// why: the attacker's power box inks its number in a deep shade of the attacker's own color. 0.87 in linear light keeps about 40% of each sRGB channel.
export function deepShade(color: string) {
  return mixColorsInLinearLight(color, "#000000", 0.87)
}

// why: every defender floods the same dark oxblood, so being targeted reads as danger and never as the grey dimming of a seat that is out, while staying dark enough not to fight the life discs' colors.
export const ATTACK_SHADE = "#26080D"

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
    // why: the number pad has no Done key, so a tap on a target is what puts the attacker's power field away.
    Keyboard.dismiss()
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
  const lead = Math.max(...totals)
  // why: damage from before this attack fills the arc bright; this attack's hits grow a faint stretch past it until the attack ends.
  const before = Math.max(...commanders.map(({ total, landed = 0 }) => total - landed))

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
          <DamageArc
            seatNumber={seatNumber}
            size={ring}
            fraction={Math.min(before, mode.lethal) / mode.lethal}
            ghost={Math.min(lead, mode.lethal) / mode.lethal}
            style={$centeredAt(discX - ring / 2, discY - ring / 2)}
          />
        ) : null}
        {!mode.acted ? (
          <View
            style={[$centeredAt(discX - ring / 2, discY - ring / 2), { width: ring, height: ring }]}
          >
            <PulseRing
              testID={`commander-target-pulse-seat-${seatNumber}`}
              size={ring}
              width={DISC_RING}
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
    // why: the number pad has no Done key, so a tap anywhere else on the card puts the power field away.
    <BoardPressable
      accessible={false}
      onPress={Keyboard.dismiss}
      style={themed($attackerCenter)}
      onLayout={({ nativeEvent: { layout: box } }) =>
        setRoom({ width: box.width, height: box.height })
      }
    >
      <View
        style={[
          themed($attackerColumn),
          contentRotation ? { transform: [{ rotate: `${contentRotation}deg` }] } : null,
        ]}
      >
        <View style={themed($partners)}>
          {mode.commanders.map(({ name, power }, index) => (
            <PowerBox
              key={index}
              suffix={testSeats[index]}
              name={name}
              partner={partners}
              power={power}
              color={paper}
              ink={ink}
              ring={foreground}
              width={layout.width}
              height={layout.height}
              nameHeight={layout.name}
              onPower={(next) => mode.onPower(next, index)}
              onLift={mode.onLift}
            />
          ))}
        </View>
        {/* why: the card's own total moves into this slot (see attackerLifeSlot) rather than a second copy fading in. */}
        <View
          testID={`commander-attacker-life-seat-${seatNumber}`}
          style={{ height: layout.life }}
        />
      </View>
    </BoardPressable>
  )
}

const UNIT_GAP = 16
// why: iOS reports the keyboard as it starts to rise, so the card lifts with it; Android only once it is up.
const KEYBOARD_SHOWN = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow"
const KEYBOARD_HIDDEN = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide"
const KEYBOARD_GAP = 12
// why: a power box's number row is wide enough for its small − and + to sit at its ends, clear of the number.
const BOX_RATIO = 2
const MIN_BOX = 44
// why: the commander's name runs along the box's foot, under the number, at about a quarter of the number row's height.
const NAME_SHARE = 0.26
const MIN_NAME = 16
// why: the attacker's life sits under its power boxes at about half a number row, small enough to read as secondary.
const LIFE_SHARE = 0.5
const MIN_LIFE = 18

/** why: an attacker's name sits inside its power box under the number, its life under the boxes, and partners share the card's width side by side, since a card runs out of height before width. Each box shrinks to its lane, down to a tappable minimum. `height` is the number row, `name` the row under it, `life` the line under the boxes. */
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
  const room = space ? (space.height - UNIT_GAP * 2) / (1 + NAME_SHARE + LIFE_SHARE) : Infinity
  const height = Math.floor(Math.max(MIN_BOX, Math.min(largest, lane / BOX_RATIO, room)))
  // why: below the tappable minimum height a box narrows instead, so partners never run past a short seat's edges.
  return {
    height,
    width: Math.max(0, Math.floor(Math.min(lane, height * BOX_RATIO))),
    name: Math.max(MIN_NAME, Math.round(height * NAME_SHARE)),
    life: Math.max(MIN_LIFE, Math.round(height * LIFE_SHARE)),
  }
}

const ATTACKER_COLUMN_GAP = "xxs"

/** why: the attacker's own life stays in view under its power, small and regular weight, so it never reads as the attack's target. It is the last line of a column centered on the card, under boxes `height + name` tall, so its middle sits half of everything above it below the card's center. */
export function attackerLifeSlot(layout: ReturnType<typeof attackerLayout>, spacing: Spacing) {
  return {
    belowCardCenter: (layout.height + layout.name + spacing[ATTACKER_COLUMN_GAP]) / 2,
    fontSize: layout.life * 0.8,
  }
}

const partnerTestSeats = (seatNumber: number) => [`${seatNumber}`, `${seatNumber}-partner`]

const $centeredAt = (left: number, top: number): ViewStyle => ({ ...$absolute, left, top })

const AnimatedPath = Animated.createAnimatedComponent(Path)
// why: the ink of a hit, bright enough to read on the gutter ring over any shade.
const DAMAGE_INK = "#FF4D5A"
const TRACK_OPACITY = 0.18
const GHOST_OPACITY = 0.4
// why: a hit eases the arc forward rather than snapping, so the defender sees how much it just took.
const FILL_MS = 520
// why: the arc's stroke runs a pixel past the ring's outer edge, so its canvas bleeds past the ring's box to keep that edge unclipped.
const ARC_BLEED = 1
// why: a strip of the dark ring stays between the disc and the arc, so the arc reads on a red seat's disc as well as on the shadow.
const ARC_SEAM = 1.5
const ARC_WIDTH = DISC_RING - ARC_SEAM + ARC_BLEED
// why: a single SVG arc cannot close on itself; stopping a hair short leaves a gap the round caps cover.
const FULL_SWEEP = 0.9999

/** why: an open arc clockwise from twelve o'clock, so both ends are real path ends and every renderer draws their round caps. A dashed circle leaves the cap at its seam to the renderer, and iOS draws it square. */
function arcPath(center: number, radius: number, fraction: number) {
  "worklet"
  const angle = 2 * Math.PI * Math.min(fraction, FULL_SWEEP)
  const x = center + radius * Math.sin(angle)
  const y = center - radius * Math.cos(angle)
  const large = angle > Math.PI ? 1 : 0
  return `M ${center} ${center - radius} A ${radius} ${radius} 0 ${large} 1 ${x} ${y}`
}

/** why: damage toward lethal reads as a red arc filling a faint full ring, clockwise from the top of the seat's own upright view. `fraction` is the damage from before this attack; `ghost` reaches as far as this attack has dealt. */
function DamageArc({
  seatNumber,
  size,
  fraction,
  ghost,
  style,
}: {
  seatNumber: number
  size: number
  fraction: number
  ghost: number
  style: ViewStyle
}) {
  const reducedMotion = useReducedMotion()
  const fill = useSharedValue(fraction)
  const ahead = useSharedValue(ghost)
  const radius = size / 2 - DISC_RING / 2
  const arcRadius = size / 2 + ARC_BLEED - ARC_WIDTH / 2
  const canvas = size + ARC_BLEED * 2
  const center = canvas / 2

  useEffect(() => {
    const timing = {
      duration: motionDuration(reducedMotion, FILL_MS),
      easing: Easing.bezier(0.2, 0.8, 0.2, 1),
    }
    fill.value = withTiming(fraction, timing)
    ahead.value = withTiming(ghost, timing)
  }, [ahead, fill, fraction, ghost, reducedMotion])

  // why: a round cap draws a dot even at zero length, so an empty arc hides.
  const animatedProps = useAnimatedProps(() => ({
    d: arcPath(center, arcRadius, fill.value),
    strokeOpacity: fill.value > 0 ? 1 : 0,
  }))
  const ghostProps = useAnimatedProps(() => ({
    d: arcPath(center, arcRadius, ahead.value),
    strokeOpacity: ahead.value > fill.value ? GHOST_OPACITY : 0,
  }))

  return (
    <Svg width={canvas} height={canvas} style={[style, $bleed]}>
      <Circle
        cx={center}
        cy={center}
        r={radius}
        stroke={SHADOW_INK}
        strokeOpacity={TRACK_OPACITY}
        strokeWidth={DISC_RING}
        fill="none"
      />
      {ghost > fraction ? (
        <AnimatedPath
          testID={`commander-hit-preview-seat-${seatNumber}`}
          stroke={DAMAGE_INK}
          strokeWidth={ARC_WIDTH}
          strokeLinecap="round"
          fill="none"
          animatedProps={ghostProps}
        />
      ) : null}
      <AnimatedPath
        testID={`commander-progress-seat-${seatNumber}`}
        stroke={DAMAGE_INK}
        strokeWidth={ARC_WIDTH}
        strokeLinecap="round"
        fill="none"
        animatedProps={animatedProps}
      />
    </Svg>
  )
}

const $bleed: ViewStyle = { margin: -ARC_BLEED }

const PULSE_MS = 1600
const PULSES = 3
const PEAK_OPACITY = 0.65

/** why: one beat of a pulse at `t` from 0 to 1. The ring grows from `from` of its size to its full size and is invisible at both ends, so between and after pulses nothing rests on screen. */
export function pulseFrame(t: number, from: number) {
  "worklet"
  return { opacity: PEAK_OPACITY * Math.sin(Math.PI * t), scale: from + (1 - from) * t }
}

/** why: the board's one moving ring marks the next step: the targets' damage rings until the first hit, then the attacker's mark to finish. It centers on its parent, pulses a few times, and then fades out, so the cue never turns into noise. `size` is its full diameter; with reduced motion it holds still at that size. */
export function PulseRing({
  testID,
  size,
  from = 1,
  width = 3,
  color,
}: {
  testID: string
  size: number
  from?: number
  width?: number
  color: string
}) {
  const reducedMotion = useReducedMotion()
  const beat = useSharedValue(0)

  useEffect(() => {
    if (reducedMotion !== false) return
    beat.value = withRepeat(
      withTiming(1, { duration: PULSE_MS, easing: Easing.out(Easing.quad) }),
      PULSES,
    )
    return () => cancelAnimation(beat)
  }, [reducedMotion, beat])

  const ringStyle = useAnimatedStyle(() => {
    if (reducedMotion !== false) return { opacity: PEAK_OPACITY }
    const { opacity, scale } = pulseFrame(beat.value, from)
    return { opacity, transform: [{ scale }] }
  })

  return (
    <View pointerEvents="none" style={$pulseCenter}>
      <Animated.View
        testID={testID}
        style={[
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: width,
            borderColor: color,
          },
          ringStyle,
        ]}
      />
    </View>
  )
}

// why: the ring may be larger than its parent, so it centers on it and overflows evenly.
const $pulseCenter: ViewStyle = {
  ...StyleSheet.absoluteFill,
  alignItems: "center",
  justifyContent: "center",
}

/** why: the attacker's power reads as a creature's power box, and its left and right ends lower and raise it, as a card's halves do for life. Tapping the number types a power in, for a pump or a seat with no deck. The commander's name sits under the number; a partner at 0 sits the hit out and dims. */
function PowerBox({
  suffix,
  name,
  partner,
  power,
  color,
  ink,
  ring,
  width,
  height,
  nameHeight,
  onPower,
  onLift,
}: {
  suffix: string
  name?: string
  partner: boolean
  power: number
  color: string
  ink: string
  ring: string
  width: number
  height: number
  nameHeight: number
  onPower: (power: number) => void
  onLift: (amount: number) => void
}) {
  const { themed } = useAppTheme()
  const [draft, setDraft] = useState<string>()
  const box = useRef<View>(null)
  const editing = draft !== undefined
  useEffect(() => {
    if (!editing) return
    const shown = Keyboard.addListener(KEYBOARD_SHOWN, ({ endCoordinates }) =>
      box.current?.measureInWindow((_x, y, _width, height) =>
        onLift(Math.max(0, y + height + KEYBOARD_GAP - endCoordinates.screenY)),
      ),
    )
    const hidden = Keyboard.addListener(KEYBOARD_HIDDEN, () => setDraft(undefined))
    return () => {
      shown.remove()
      hidden.remove()
      onLift(0)
    }
  }, [editing, onLift])
  const pressedTint = { backgroundColor: overlayTint(ink, 0.14) }
  const lowest = lowestPower(partner)
  const numberStyle = { color: ink, fontSize: height * 0.62, lineHeight: height * 0.8 }
  const half = (step: 1 | -1) => {
    const disabled = step < 0 ? power <= lowest : power >= MAX_COMMANDER_DAMAGE
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
        onPress={() => onPower(power + step)}
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

  // why: each keystroke sets the power at once, so a hit tapped while the field is open deals what was typed.
  function type(text: string) {
    const digits = text.replace(/\D/g, "").slice(0, String(MAX_COMMANDER_DAMAGE).length)
    setDraft(digits)
    if (digits) onPower(Number(digits))
  }

  const nameFont = Math.round(nameHeight * 0.62)
  return (
    <View
      ref={box}
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
        power === 0 && !editing && $sittingOut,
      ]}
    >
      <View style={[$boxRow, { height }]}>
        {half(-1)}
        {editing ? (
          <TextField
            testID={`commander-power-input-seat-${suffix}`}
            accessibilityLabel={translate("board:commander.power", { power })}
            autoFocus
            keyboardType="number-pad"
            maxFontSizeMultiplier={1}
            // why: the field opens empty with the current power as its placeholder, so typing replaces it; a field closed empty keeps it.
            placeholder={String(power)}
            placeholderTextColor={overlayTint(ink, 0.35)}
            value={draft}
            onChangeText={type}
            onBlur={() => setDraft(undefined)}
            containerStyle={$boxValue}
            inputWrapperStyle={[$powerInput, { borderColor: ink }]}
            style={[themed($powerInputText), numberStyle]}
          />
        ) : (
          <BoardPressable
            testID={`commander-power-seat-${suffix}`}
            accessibilityRole="button"
            accessibilityLabel={translate("board:commander.power", { power })}
            accessibilityLiveRegion="polite"
            onPress={() => setDraft("")}
            style={({ pressed }) => [$boxValue, pressed && pressedTint]}
          >
            <Text text={`${power}`} weight="bold" maxFontSizeMultiplier={1} style={numberStyle} />
          </BoardPressable>
        )}
        {half(1)}
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

const $absolute: ViewStyle = { position: "absolute" }

/** why: while an attack holds a defending card, the flood covers its own controls (z 10), the life total rides above the flood, and the ring, badges, and hit target above that. */
export const TAKEOVER_LAYERS = { flood: 11, life: 12, controls: 13 } as const
const $flood: ViewStyle = { zIndex: TAKEOVER_LAYERS.flood }
const $aboveFlood: ViewStyle = { zIndex: TAKEOVER_LAYERS.controls }

const $sittingOut: ViewStyle = { opacity: 0.4 }

const $box: ViewStyle = { overflow: "hidden" }
const $boxRow: ViewStyle = { flexDirection: "row" }
// why: the number takes the middle of its row, wide enough for two digits, and the − and + split the rest.
const $boxHalf: ViewStyle = { flex: 0.8, justifyContent: "center" }
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

const $attackerColumn: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  gap: spacing[ATTACKER_COLUMN_GAP],
})

const $partners: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.md,
})

const $boxValue: ViewStyle = { flex: 1.4, alignItems: "center", justifyContent: "center" }

const $powerInput: ViewStyle = {
  minHeight: 0,
  alignSelf: "stretch",
  flex: 1,
  borderWidth: 2,
  backgroundColor: "transparent",
}

const $powerInputText: ThemedStyle<TextStyle> = ({ typography }) => ({
  fontFamily: typography.primary.bold,
  textAlign: "center",
  marginVertical: 0,
  marginHorizontal: 0,
})

const $unnamed: TextStyle = { opacity: 0.45 }
