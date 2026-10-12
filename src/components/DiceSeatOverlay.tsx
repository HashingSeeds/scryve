import { useEffect, useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { StyleSheet, View } from "react-native"
import Animated, {
  ReduceMotion,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  ZoomOut,
} from "react-native-reanimated"

import {
  toolLabel,
  type DiceSeatChip,
  type DiceSeatView,
  type DiceTool,
} from "@/features/game/dice"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { useReducedMotion } from "@/utils/useReducedMotion"

import { BoardPressable } from "./BoardPressable"
import type { LifeCardContentRotation } from "./playerCardTypes"
import { Text } from "./Text"

export interface LifeCardDice {
  view?: DiceSeatView
  armed?: DiceTool
  chips?: readonly DiceSeatChip[]
  onPress: () => void
  onChoose?: (order: "first" | "second") => void
  onClearChip?: (chip: DiceSeatChip) => void
}

/** why: a bloom or an armed ring takes the seat; chips alone leave it playable. */
export function diceCoversSeat(dice: LifeCardDice | undefined): boolean {
  return !!dice && (dice.view !== undefined || dice.armed !== undefined)
}

export interface DiceSeatOverlayProps {
  seatNumber: number
  playerName: string
  color: string
  foreground: string
  contentRotation: LifeCardContentRotation
  compact?: boolean
  dice: LifeCardDice
}

const BLOOM_SPRING = { damping: 14, stiffness: 180, mass: 0.8 } as const
const BLOOM_START_SCALE = 0.4
const BLOOM_START_TURN_DEG = -40
const BLOOM_EXIT_MS = 300
// why: Reanimated reads the system setting only at startup, so animations we already gate on the live preference must not consult it again.
const GATED_MOTION = ReduceMotion.Never
// why: web runs only predefined layout animations, so the shrink is one of those and everything else is driven by shared values.
const BLOOM_EXITING = ZoomOut.duration(BLOOM_EXIT_MS).reduceMotion(GATED_MOTION)
// why: a die tumbles through a few faces and slows as it lands; the result it lands on was decided before the tumble began.
const TUMBLE_TICKS = 9
const tumbleStepMs = (step: number) => 30 + step * step * 1.2
const D20_SIDES = 20
const COIN_FLIP_MS = 640
const COIN_HALF_TURNS = 6

/** why: a result belongs to the seat that rolled it, so it sits over that card, turned the way its player reads. Each new result is its own bloom. */
export function DiceSeatOverlay(props: DiceSeatOverlayProps) {
  return <Bloom key={viewKey(props.dice.view)} {...props} />
}

function Bloom({
  seatNumber,
  playerName,
  color,
  foreground,
  contentRotation,
  compact,
  dice,
}: DiceSeatOverlayProps) {
  const { themed } = useAppTheme()
  const reducedMotion = useReducedMotion()
  const { view, armed } = dice
  const covers = !!view && view.kind !== "waiting"
  const scrim = view?.kind === "waiting" || (view?.kind === "first" && view.status === "lost")
  const dim = view?.kind === "rolloff" && (view.status === "lost" || view.status === "out")
  const rotationStyle: ViewStyle | undefined = contentRotation
    ? { transform: [{ rotate: `${contentRotation}deg` }] }
    : undefined
  const animate = reducedMotion === false && !!view && !scrim
  const interactive = view?.kind !== "waiting" && view?.kind !== "choice"
  const tumble = useTumble(animate ? view : undefined)

  const arrive = useSharedValue(animate ? 0 : 1)
  useEffect(() => {
    arrive.value = animate ? withSpring(1, BLOOM_SPRING) : 1
  }, [animate, arrive])
  const arriveStyle = useAnimatedStyle(() => ({
    opacity: arrive.value,
    transform: [
      { scale: BLOOM_START_SCALE + (1 - BLOOM_START_SCALE) * arrive.value },
      { rotate: `${BLOOM_START_TURN_DEG * (1 - arrive.value)}deg` },
    ],
  }))

  const overlayStyle = [
    themed($overlay),
    compact && themed($compactOverlay),
    covers && !scrim && { backgroundColor: color },
    scrim && themed($scrim),
    armed && !view && [themed($ring), { borderColor: foreground }],
  ]
  const content =
    view && covers && !scrim ? (
      <View style={[themed($content), rotationStyle, dim && $dim]}>
        <Result
          view={view}
          playerName={playerName}
          foreground={foreground}
          compact={compact}
          tumble={tumble}
          onChoose={dice.onChoose}
        />
      </View>
    ) : null

  return (
    <Animated.View
      exiting={animate ? BLOOM_EXITING : undefined}
      pointerEvents="box-none"
      style={[$layer, animate && arriveStyle]}
    >
      {view?.kind === "choice" ? (
        // why: the two choices must reach a screen reader one at a time, so nothing accessible wraps them.
        <View testID={`dice-seat-${seatNumber}`} accessible={false} style={overlayStyle}>
          {content}
        </View>
      ) : (
        <BoardPressable
          testID={`dice-seat-${seatNumber}`}
          accessibilityRole={interactive ? "button" : undefined}
          accessibilityLabel={accessibilityLabel(playerName, view, armed)}
          accessibilityHint={interactive && view ? "Settles this result" : undefined}
          disabled={!interactive}
          onPress={dice.onPress}
          style={overlayStyle}
        >
          {content}
        </BoardPressable>
      )}
    </Animated.View>
  )
}

type Tumble = { face?: number; flipping: boolean; flip: SharedValue<number> }

/** why: the tumble is presentation only: a d20 shows a few passing faces from its own small sequence (never the game's random source) and a coin spins on its axis, then both land on the decided result. */
function useTumble(view: DiceSeatView | undefined): Tumble {
  const rolling = view ? rollingTool(view) : undefined
  const [state, setState] = useState<{ face?: number; flipping: boolean }>(() =>
    rolling === "d20"
      ? { face: passingFace(0), flipping: false }
      : { flipping: rolling === "coin" },
  )
  const flip = useSharedValue(0)
  useEffect(() => {
    // why: motion turned off mid-tumble lands the die at once on the decided result.
    if (!rolling) {
      flip.value = 1
      setState((current) =>
        current.face === undefined && !current.flipping ? current : { flipping: false },
      )
      return
    }
    if (rolling === "coin") {
      flip.value = withTiming(1, { duration: COIN_FLIP_MS })
      const landing = setTimeout(() => setState({ flipping: false }), COIN_FLIP_MS)
      return () => clearTimeout(landing)
    }
    const timers: ReturnType<typeof setTimeout>[] = []
    let delay = 0
    for (let step = 1; step < TUMBLE_TICKS; step += 1) {
      delay += tumbleStepMs(step)
      timers.push(setTimeout(() => setState({ face: passingFace(step), flipping: false }), delay))
    }
    timers.push(setTimeout(() => setState({ flipping: false }), delay + tumbleStepMs(TUMBLE_TICKS)))
    return () => timers.forEach(clearTimeout)
  }, [flip, rolling])
  return { ...state, flip }
}

function passingFace(step: number) {
  let seed = 7
  for (let i = 0; i <= step; i += 1) seed = (seed * 1103515245 + 12345) % 2147483648
  return (seed % D20_SIDES) + 1
}

function rollingTool(view: DiceSeatView): DiceTool | undefined {
  if (view.kind === "roll") return view.roll.tool
  if (view.kind === "rolloff") return "d20"
  return undefined
}

// why: keyed on the roll attempt, not the value, so rolling the same result again still blooms and tumbles.
function viewKey(view: DiceSeatView | undefined) {
  if (!view) return "armed"
  if (view.kind === "roll") return `roll:${view.roll.tool}:${view.attempt}`
  if (view.kind === "rolloff") return `rolloff:${view.attempt}`
  return view.kind
}

function Result({
  view,
  playerName,
  foreground,
  compact,
  tumble,
  onChoose,
}: {
  view: DiceSeatView
  playerName: string
  foreground: string
  compact?: boolean
  tumble: Tumble
  onChoose?: (order: "first" | "second") => void
}) {
  const { themed } = useAppTheme()
  const text = { color: foreground }
  const tumbling = tumble.face !== undefined
  const label = (value: string) => (
    <Text text={value} weight="bold" size="xs" maxFontSizeMultiplier={1.2} style={text} />
  )
  const headline = (value: string) => (
    <Text
      text={value}
      weight="bold"
      maxFontSizeMultiplier={1.2}
      style={[themed(compact ? $compactHeadline : $headline), text]}
    />
  )
  if (view.kind === "choice")
    return (
      <>
        {label(view.reason === "flip" ? "Won the flip" : "Lost the last game")}
        {headline("Goes first?")}
        <View style={themed($options)}>
          {(["first", "second"] as const).map((order) => (
            <BoardPressable
              key={order}
              testID={`dice-go-${order}`}
              accessibilityRole="button"
              accessibilityLabel={`${playerName} goes ${order}`}
              onPress={() => onChoose?.(order)}
              style={({ pressed }) => [
                themed(compact ? $compactOption : $option),
                { borderColor: foreground },
                pressed && $pressed,
              ]}
            >
              <Text
                text={order === "first" ? "Go first" : "Go second"}
                weight="bold"
                size={compact ? "xxs" : "xs"}
                maxFontSizeMultiplier={1.2}
                style={text}
              />
            </BoardPressable>
          ))}
        </View>
      </>
    )
  if (view.kind === "first")
    return (
      <>
        {view.note ? label(view.note) : null}
        {headline("Goes first")}
      </>
    )
  if (view.kind === "rolloff")
    return (
      <>
        {label("d20")}
        <Text
          text={String(tumble.face ?? view.value)}
          weight="medium"
          maxFontSizeMultiplier={1.2}
          style={[themed(compact ? $compactValue : $value), text]}
        />
        {tumbling
          ? null
          : view.status === "won"
            ? label("Goes first")
            : view.status === "tied"
              ? label("Tie. Tap to roll again")
              : view.status === "out"
                ? label("Out")
                : null}
      </>
    )
  if (view.kind === "waiting") return null
  return (
    <>
      {label(toolLabel(view.roll.tool))}
      {tumble.flipping ? (
        <FlippingCoin flip={tumble.flip} foreground={foreground} compact={compact} />
      ) : (
        <Text
          text={String(tumble.face ?? view.roll.value)}
          weight="medium"
          maxFontSizeMultiplier={1.2}
          style={[themed(compact ? $compactValue : $value), text]}
        />
      )}
    </>
  )
}

/** why: a coin in the air shows its edge and faces by turns, so the disc squeezes on its axis until it lands. */
function FlippingCoin({
  flip,
  foreground,
  compact,
}: {
  flip: SharedValue<number>
  foreground: string
  compact?: boolean
}) {
  const size = compact ? 46 : 64
  const spin = useAnimatedStyle(() => ({
    transform: [{ scaleX: Math.abs(Math.cos(flip.value * Math.PI * COIN_HALF_TURNS)) }],
  }))
  return (
    <Animated.View
      testID="dice-coin-flipping"
      style={[
        $coin,
        { width: size, height: size, borderRadius: size / 2, borderColor: foreground },
        spin,
      ]}
    />
  )
}

function accessibilityLabel(playerName: string, view?: DiceSeatView, armed?: DiceTool) {
  if (view?.kind === "roll")
    return `${playerName}, ${toolLabel(view.roll.tool)}, ${view.roll.value}`
  if (view?.kind === "rolloff") {
    const status =
      view.status === "won"
        ? ", goes first"
        : view.status === "tied"
          ? ", tied, tap to roll again"
          : view.status === "out"
            ? ", out"
            : ""
    return `${playerName} rolled ${view.value}${status}`
  }
  if (view?.kind === "choice")
    return `${playerName} ${view.reason === "flip" ? "won the flip" : "lost the last game"} and chooses who goes first`
  if (view?.kind === "waiting") return "Waiting for the choice"
  if (view?.kind === "first")
    return view.status === "won" ? `${playerName} goes first` : `${playerName} does not go first`
  return armed === "coin" ? `Flip a coin for ${playerName}` : `Roll a d20 for ${playerName}`
}

// why: a seat with dice on it is the dice's; the layer sits above counter chips (10) and the Pokémon bar (15) so no control underneath takes the tap. The z-index lives on the animated wrapper because its entering transform opens a stacking context of its own.
const $layer: ViewStyle = { ...StyleSheet.absoluteFill, zIndex: 16 }
const $overlay: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  ...StyleSheet.absoluteFill,
  overflow: "hidden",
  borderRadius: spacing.lg,
  alignItems: "center",
  justifyContent: "center",
})
const $compactOverlay: ThemedStyle<ViewStyle> = ({ spacing }) => ({ borderRadius: spacing.md })
const $ring: ThemedStyle<ViewStyle> = () => ({ borderWidth: 3 })
const $scrim: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.board.background,
  opacity: 0.6,
})
const $content: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignItems: "center",
  gap: spacing.xxxs,
})
const $dim: ViewStyle = { opacity: 0.45 }
const $value: ThemedStyle<TextStyle> = () => ({ fontSize: 64, lineHeight: 70 })
const $compactValue: ThemedStyle<TextStyle> = () => ({ fontSize: 40, lineHeight: 46 })
const $headline: ThemedStyle<TextStyle> = () => ({ fontSize: 40, lineHeight: 46 })
const $compactHeadline: ThemedStyle<TextStyle> = () => ({ fontSize: 26, lineHeight: 32 })
const $options: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.xs,
  marginTop: spacing.xs,
})
const $option: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 44,
  paddingHorizontal: spacing.md,
  borderRadius: spacing.xs,
  borderWidth: 1.5,
  justifyContent: "center",
})
const $compactOption: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 38,
  paddingHorizontal: spacing.sm,
  borderRadius: spacing.xs,
  borderWidth: 1.5,
  justifyContent: "center",
})
const $pressed: ViewStyle = { opacity: 0.72 }
const $coin: ViewStyle = { borderWidth: 3 }
