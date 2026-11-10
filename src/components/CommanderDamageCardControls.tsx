import { useEffect, useRef, useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { Platform, StyleSheet, View } from "react-native"
import Animated, {
  cancelAnimation,
  Easing,
  FadeIn,
  FadeOut,
  LinearTransition,
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

import { lowestPower, type AttackBox } from "@/features/game/commanderAttack"
import { MAX_COMMANDER_DAMAGE } from "@/features/game/domain"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import { spacing } from "@/theme/spacing"
import type { ThemedStyle } from "@/theme/types"
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
import { COMPACT_KEY_HEIGHT, KEY_HEIGHT, PokemonKeypad } from "./pokemon/PokemonKeypad"
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
  facing: CommanderFacing
  // why: the commander strip's corner, which undo keeps clear of.
  stripCorner?: CommanderCorner
  takeover?: CommanderTakeover
  wave: SharedValue<number>
  acted: boolean
  dealt: number
  takeBack: number
  /** why: the part of `dealt` and `takeBack` that is Others damage, which the labels name apart from commander damage. */
  othersStep: number
  othersTakeBack: number
  onHit: () => void
  onUndo: () => void
}

type AssignmentSource = {
  kind: "source"
  playerName: string
  submit: "done" | "send"
  mark?: CommanderAttacker
  commanders: readonly ArmedCommander[]
  /** why: what each tap deals from the attacker's other creatures, which takes life but never counts toward commander lethal. */
  others: number
  onOthers: (power: number) => void
  othersShown: boolean
  othersSitting: boolean
  /** why: how far the commander grid reaches in from the seat's side and up from its foot, in upright space. */
  grid?: { width: number; height: number }
  onSit: (box: AttackBox) => void
  acted: boolean
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
  menuCorner?: LifeCardMenuCorner
  compact?: boolean
  mode: CommanderDamageCardMode
  // why: a defender's last attack, kept up while the shadow drains so its ring fades as the edge passes. Takes no touches.
  draining?: boolean
}

// why: paced for the eye to follow, so neighbours darken first and far seats after.
export const TAKEOVER_MS = 950
const TAKEOVER_EASING = Easing.bezier(0.45, 0.05, 0.25, 1)
// why: closing is quicker than opening; the shadow pulls back slowly, then fast into the card.
const DRAIN_MS = 620
const DRAIN_EASING = Easing.bezier(0.7, 0, 0.7, 0.4)
// why: spreading by the blur puts its solid core at the card's grown edge, so it fades smoothly over twice this distance.
const FLOOD_BLUR = 24
// why: the attacker's card swaps quickly as the shadow leaves it; everything else changes when the shadow arrives.
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

  // why: a defender's ring and badges show as the shadow's edge passes, when the gutter ring draws in.
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

// why: the shadow is the card grown on every side, from just inside its edges, with a blur fading over twice FLOOD_BLUR past them.
function shadowGrown(flood: CommanderFlood, wave: number) {
  "worklet"
  return -FLOOD_BLUR * 2 + wave * (flood.distance + FLOOD_BLUR * 2)
}

/** why: 0 until the shadow's soft edge reaches `gap` away, 1 once its solid core covers it, or `span` later if there is room. */
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

  // why: the render ending an attack runs before the effect starts the drain, so keep the last takeover drawn rather than unmounting for a frame.
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

// why: one dark oxblood for every defender reads as danger, never as the grey dimming of an out seat.
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
  const {
    theme: { colors },
  } = useAppTheme()
  const { flood, disc } = takeover
  const discX = cardSize.width / 2 + takeover.cardDiscOffset.x
  const discY = cardSize.height / 2 + takeover.cardDiscOffset.y
  const ringSize = (disc + DISC_RING) * 2
  // why: the ring is the board's gutter around the disc, so a red-leaning color still stands off the flood.
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
  // why: the ring darkens with the shadow, so it draws in as the soft edge passes.
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
  const lead = Math.max(...totals)
  // why: earlier damage fills the arc bright; this attack's hits grow a faint stretch past it.
  const before = Math.max(...commanders.map(({ total, landed = 0 }) => total - landed))

  return (
    <>
      <BoardPressable
        testID={`commander-hit-seat-${seatNumber}`}
        accessibilityRole="button"
        accessibilityLabel={
          mode.othersStep > 0
            ? translate("board:commander.dealWithOthersTo", {
                damage: dealt - mode.othersStep,
                others: mode.othersStep,
                name: playerName,
              })
            : translate("board:commander.dealTo", { damage: dealt, name: playerName })
        }
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
          accessibilityLabel={
            mode.othersTakeBack > 0
              ? translate("board:commander.undoHitWithOthers", {
                  damage: takeBack - mode.othersTakeBack,
                  others: mode.othersTakeBack,
                })
              : translate("board:commander.undoHit", { damage: takeBack })
          }
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
  const reducedMotion = useReducedMotion()
  const [room, setRoom] = useState<{ width: number; height: number } | null>(null)
  const [open, setOpen] = useState<{ box: AttackBox; draft: string }>()
  const partners = mode.commanders.length > 1
  const sideways = Math.abs(contentRotation) === 90
  const space = room && (sideways ? { width: room.height, height: room.width } : room)
  const layout = attackerLayout({
    space,
    count: mode.commanders.length,
    others: mode.othersShown,
    compact,
    grid: mode.grid,
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

  function edit(box: AttackBox) {
    const closing = open?.box === box
    setOpen(closing ? undefined : { box, draft: "" })
    mode.onEditing(!closing)
  }
  function close() {
    if (!open) return
    setOpen(undefined)
    mode.onEditing(false)
  }
  const setPower = (box: AttackBox, power: number) =>
    box === "others" ? mode.onOthers(power) : mode.onPower(power, box)
  // why: a − or + on the box being typed into replaces what was typed, so the box shows the power the next hit deals.
  function step(box: AttackBox, power: number) {
    if (open?.box === box) setOpen({ box, draft: "" })
    setPower(box, power)
  }
  // why: each key sets the power at once, so a hit tapped while the keypad is open deals what was typed. It opens empty, so the first key replaces the power rather than adding to it.
  function type(char: string) {
    if (!open || !/^\d$/.test(char)) return
    if (open.draft.length >= String(MAX_COMMANDER_DAMAGE).length) return
    const draft = open.draft + char
    setOpen({ ...open, draft })
    setPower(open.box, Number(draft))
  }
  function erase() {
    if (!open) return
    const draft = open.draft.slice(0, -1)
    setOpen({ ...open, draft })
    if (draft) setPower(open.box, Number(draft))
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
        name={name}
        partner={partners}
        power={power}
        sitting={!!sitting}
        draft={open?.box === index ? open.draft : undefined}
        onPower={(next) => step(index, next)}
        onEdit={() => edit(index)}
        onSit={() => mode.onSit(index)}
      />
    </Animated.View>
  )
  const othersBox = (
    <Animated.View key="others" layout={moved} entering={shown} exiting={hidden}>
      <PowerBox
        {...box}
        suffix={`${seatNumber}-others`}
        name={translate("board:commander.others")}
        others
        partner
        power={mode.others}
        sitting={mode.othersSitting}
        draft={open?.box === "others" ? open.draft : undefined}
        onPower={(next) => step("others", next)}
        onEdit={() => edit("others")}
        onSit={() => mode.onSit("others")}
      />
    </Animated.View>
  )
  const editedCommander = typeof open?.box === "number" ? mode.commanders[open.box] : undefined
  const edited =
    open?.box === "others"
      ? othersBox
      : editedCommander && typeof open?.box === "number"
        ? commanderBox(editedCommander, open.box)
        : undefined
  const keypad = space ? keypadPlacement(space, layout, compact) : undefined

  return (
    <BoardPressable
      testID={`commander-attacker-seat-${seatNumber}`}
      accessible={false}
      onPress={close}
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
          <>
            {/* why: Others leads on the left of a single row; with two rows, partners take the top and Others sits under them. The card's own total moves into its slot (see attackerLifeSlot) rather than a second copy fading in. */}
            <View
              testID={`commander-boxes-seat-${seatNumber}`}
              style={[themed($boxRows), { transform: [{ translateY: layout.boxesY }] }]}
            >
              {(layout.rows > 1
                ? [mode.commanders.map(commanderBox), [othersBox]]
                : [[...(mode.othersShown ? [othersBox] : []), ...mode.commanders.map(commanderBox)]]
              ).map((row, rowIndex) => (
                <View key={rowIndex} style={themed($partners)}>
                  {row}
                </View>
              ))}
            </View>
          </>
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
// why: a number row wide enough for its small − and + to sit at its ends.
const BOX_RATIO = 2
// why: the commander's name runs along the box's foot, under the number. It toggles the box in and out of the attack, so with its slop below it reaches about a 40pt touch target.
const NAME_SHARE = 0.5
const MIN_NAME = 32
// why: about half a number row, small enough to read as secondary.
const LIFE_SHARE = 0.5
const MIN_LIFE = 18

/** why: an attacker's power boxes take whichever arrangement and placement gives them the most face while keeping at least UNIT_GAP from every edge of the seat and clear of the commander grid in its lower corner. Beside: the boxes and the attacker's life sit in one column centered on the card, narrowed on both sides to clear the grid. Above: the boxes use the full width over the grid, and the life sits larger in the band beside the grid. Arrangements are one commander beside Others, or partners either above Others or in one row with it. Seats only get smaller from here (8 and 10 players), so the size comes from the room rather than a fixed minimum; the name bar stays a 32pt touch target until nothing else fits. `height` is the number row and `name` the row under it; `boxesY` and `lifeY` place the boxes' and the life's middles below the card's center, in the seat's upright space. */
export function attackerLayout({
  space,
  count,
  others = true,
  compact,
  grid,
}: {
  space: { width: number; height: number } | null
  count: number
  others?: boolean
  compact?: boolean
  /** why: how far the commander grid reaches in from the seat's side and up from its foot. */
  grid?: { width: number; height: number }
}) {
  const largest = compact ? 52 : 64
  const boxes = count + (others ? 1 : 0)
  const arrangements: readonly Arrangement[] =
    count > 1 && others
      ? [
          { rows: 2, perRow: 2 },
          { rows: 1, perRow: boxes },
        ]
      : [{ rows: 1, perRow: boxes }]
  const placements: readonly Placement[] = grid?.height ? ["beside", "above"] : ["beside"]
  const size = (
    height: number,
    nameFloor: number,
    { rows, perRow }: Arrangement,
    placement: Placement,
  ) => {
    const beside = placement === "beside"
    const band = grid?.height ?? 0
    const clear = beside ? (grid?.width ?? 0) : 0
    const lane = space
      ? (space.width - clear * 2 - UNIT_GAP * 2 - spacing[BOX_GAP] * (perRow - 1)) / perRow
      : Infinity
    const name = Math.max(nameFloor, Math.round(height * NAME_SHARE))
    const life = Math.max(MIN_LIFE, Math.round(height * LIFE_SHARE))
    const boxesHeight = rows * (height + name) + (rows - 1) * spacing[BOX_ROW_GAP]
    return {
      height,
      width: Math.max(
        0,
        Math.floor(Math.min(lane, height * (beside ? BOX_RATIO : WIDE_BOX_RATIO))),
      ),
      name,
      rows,
      perRow,
      placement,
      boxesHeight,
      boxesY: beside ? -(spacing[ATTACKER_COLUMN_GAP] + life) / 2 : -band / 2,
      lifeY: beside
        ? (boxesHeight + spacing[ATTACKER_COLUMN_GAP]) / 2
        : (space?.height ?? 0) / 2 - band / 2,
      // why: above the grid, the life shrinks to the room the grid leaves on both sides.
      lifeFont: beside
        ? life * 0.8
        : Math.min(
            band * BAND_LIFE_SHARE,
            MAX_BAND_LIFE,
            ((space?.width ?? 0) - ((grid?.width ?? 0) + UNIT_GAP / 2) * 2) /
              (LIFE_DIGITS * DIGIT_ADVANCE),
          ),
      columnHeight: beside ? boxesHeight + spacing[ATTACKER_COLUMN_GAP] + life : boxesHeight,
    }
  }
  if (!space) return size(largest, MIN_NAME, arrangements[0], "beside")
  const fits = (layout: ReturnType<typeof size>) => {
    if (layout.width < layout.height * MIN_BOX_RATIO) return false
    if (layout.placement === "beside") return layout.columnHeight <= space.height - UNIT_GAP * 2
    return (
      layout.boxesHeight <= space.height - (grid?.height ?? 0) - UNIT_GAP * 2 &&
      layout.lifeFont >= MIN_LIFE
    )
  }
  for (const [nameFloor, smallest] of [
    [MIN_NAME, SMALLEST_BOX],
    [TIGHT_NAME, TIGHT_BOX],
  ]) {
    const best = arrangements
      .flatMap((arrangement) => placements.map((placement) => ({ arrangement, placement })))
      .map(({ arrangement, placement }) => {
        for (let height = largest; height >= smallest; height--) {
          const layout = size(height, nameFloor, arrangement, placement)
          if (fits(layout)) return layout
        }
        return undefined
      })
      .filter((layout) => layout !== undefined)
      .sort((a, b) => b.height * b.width - a.height * a.width)[0]
    if (best) return best
  }
  return arrangements
    .flatMap((arrangement) =>
      placements.map((placement) => size(TIGHT_BOX, TIGHT_NAME, arrangement, placement)),
    )
    .sort((a, b) => b.height * b.width - a.height * a.width)[0]
}

type Arrangement = { rows: number; perRow: number }
type Placement = "beside" | "above"
// why: a box narrower than this leaves its − and + no room beside the number.
const MIN_BOX_RATIO = 1.4
// why: above the grid, a short row has the seat's full width, so boxes stretch past BOX_RATIO.
const WIDE_BOX_RATIO = 2.8
const SMALLEST_BOX = 28
// why: the name bar and number row shrink this far only when a seat is too small otherwise.
const TIGHT_NAME = 24
const TIGHT_BOX = 20
const BOX_GAP = "md"
// why: in the band beside the grid the life reads larger, capped to stay secondary to the boxes.
const BAND_LIFE_SHARE = 0.5
const MAX_BAND_LIFE = 34
const LIFE_DIGITS = 3

const ATTACKER_COLUMN_GAP = "xxs"
const BOX_ROW_GAP = "sm"

/** why: the attacker's life stays in view in regular weight so it never reads as the attack's target. */
export function attackerLifeSlot(layout: ReturnType<typeof attackerLayout>) {
  return { belowCardCenter: layout.lifeY, fontSize: layout.lifeFont }
}

const partnerTestSeats = (seatNumber: number) => [`${seatNumber}`, `${seatNumber}-partner`]

const $centeredAt = (left: number, top: number): ViewStyle => ({ ...$absolute, left, top })

const AnimatedPath = Animated.createAnimatedComponent(Path)
// why: bright enough to read on the gutter ring over any shade.
export const DAMAGE_INK = "#FF4D5A"
// why: Others damage hurts too, so it reads warm like a hit, but orange so it never passes for commander damage.
export const OTHERS_INK = "#FF8A1F"
const TRACK_OPACITY = 0.18
const GHOST_OPACITY = 0.4
const FILL_MS = 520
// why: the arc's stroke runs a pixel past the ring's outer edge, so its canvas bleeds past the ring's box to keep that edge unclipped.
const ARC_BLEED = 1
// why: a strip of the dark ring stays between the disc and the arc, so the arc reads on a red seat's disc as well as on the shadow.
const ARC_SEAM = 1.5
const ARC_WIDTH = DISC_RING - ARC_SEAM + ARC_BLEED
// why: a single SVG arc cannot close on itself; stopping a hair short leaves a gap the round caps cover.
const FULL_SWEEP = 0.9999

/** why: an open arc, not a dashed circle: the renderer owns the cap at a dash seam, and iOS draws it square. */
function arcPath(center: number, radius: number, fraction: number) {
  "worklet"
  const angle = 2 * Math.PI * Math.min(fraction, FULL_SWEEP)
  const x = center + radius * Math.sin(angle)
  const y = center - radius * Math.cos(angle)
  const large = angle > Math.PI ? 1 : 0
  return `M ${center} ${center - radius} A ${radius} ${radius} 0 ${large} 1 ${x} ${y}`
}

/** why: a red arc filling a faint ring, clockwise from the top. `fraction` is damage from before this attack; `ghost` reaches as far as this attack dealt. */
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

const $pulseCenter: ViewStyle = {
  ...StyleSheet.absoluteFill,
  alignItems: "center",
  justifyContent: "center",
}

/** why: a creature-style power box; its ends lower and raise power, tapping the number types one in. A partner at 0 sits out and dims. */
function PowerBox({
  suffix,
  name,
  others,
  partner,
  power,
  sitting,
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
  name?: string
  others?: boolean
  partner: boolean
  power: number
  sitting: boolean
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
  const lowest = lowestPower(partner)
  // why: shrink the number to its row's middle so two digits fit a narrowed box instead of wrapping out of sight.
  const valueWidth = (width * VALUE_FLEX) / (VALUE_FLEX + HALF_FLEX * 2)
  const digits = Math.max(1, String(power).length)
  const fontSize = Math.min(height * 0.62, valueWidth / (digits * DIGIT_ADVANCE))
  const numberStyle = { color: ink, fontSize, lineHeight: height * 0.8 }
  const half = (step: 1 | -1) => {
    const disabled = step < 0 ? power <= lowest : power >= MAX_COMMANDER_DAMAGE
    const label = others
      ? translate(step < 0 ? "board:commander.lowerOthers" : "board:commander.raiseOthers")
      : step < 0
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

  const nameFont = Math.round(Math.min(nameHeight * 0.45, height * 0.34))
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
        (sitting || power === 0) && !editing && $sittingOut,
      ]}
    >
      <View style={[$boxRow, { height }]}>
        {half(-1)}
        <BoardPressable
          testID={`commander-power-seat-${suffix}`}
          accessibilityRole="button"
          accessibilityLabel={
            others
              ? translate("board:commander.othersPower", { power })
              : translate("board:commander.power", { power })
          }
          accessibilityState={{ expanded: editing }}
          accessibilityLiveRegion="polite"
          onPress={onEdit}
          style={({ pressed }) => [
            $boxValue,
            editing && { backgroundColor: overlayTint(ink, 0.1) },
            pressed && pressedTint,
          ]}
        >
          {/* why: the keypad opens empty with the current power dimmed in its place, so typing replaces it; closing empty keeps it. The box shows the power as the attack holds it, so a typed 0 on a lone commander reads as the 1 it deals. */}
          <Text
            testID={editing ? `commander-power-input-seat-${suffix}` : undefined}
            text={`${power}`}
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
      <BoardPressable
        testID={`commander-sit-seat-${suffix}`}
        accessibilityRole="switch"
        accessibilityLabel={name ?? translate("board:commander.unnamed")}
        accessibilityState={{ checked: !sitting }}
        // why: the box's border trims a few points off the strip, so its touch area reaches a little past the box's foot.
        hitSlop={{ bottom: 8 }}
        onPress={onSit}
        style={({ pressed }) => [
          $boxNameRow,
          {
            height: nameHeight,
            paddingHorizontal: height * 0.12,
            borderTopColor: overlayTint(ink, 0.35),
          },
          sitting
            ? pressed && { backgroundColor: overlayTint(ink, 0.14) }
            : { backgroundColor: bar, opacity: pressed ? 0.8 : 1 },
        ]}
      >
        <Text
          testID={`commander-name-seat-${suffix}`}
          text={name ?? translate("board:commander.unnamed")}
          weight="bold"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
          maxFontSizeMultiplier={1}
          style={[
            $boxName,
            // why: a line box close to the font's own height, since iOS sets a taller one's extra room above the text and the name sinks low in its bar.
            {
              color: sitting ? ink : ring,
              fontSize: nameFont,
              lineHeight: Math.round(nameFont * 1.2),
              transform: [{ translateY: -nameFont * NAME_RISE }],
            },
            sitting && $sittingName,
          ]}
        />
      </BoardPressable>
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
const $sittingName: TextStyle = { textDecorationLine: "line-through" }
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

const $boxRows: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  gap: spacing[BOX_ROW_GAP],
})

const $partners: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing[BOX_GAP],
})

const $boxValue: ViewStyle = { flex: VALUE_FLEX, alignItems: "center", justifyContent: "center" }
