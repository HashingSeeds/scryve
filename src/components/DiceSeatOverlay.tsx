import type { TextStyle, ViewStyle } from "react-native"
import { StyleSheet, View } from "react-native"
import Animated, {
  type EntryExitAnimationFunction,
  withSpring,
  withTiming,
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
const BLOOM_EXIT_MS = 300
const BLOOM_EXIT_SCALE = 0.16
const BLOOM_EXIT_RISE = 56
const COMPACT_BLOOM_EXIT_RISE = 36

const bloomEnter: EntryExitAnimationFunction = () => {
  "worklet"
  return {
    initialValues: { opacity: 0, transform: [{ scale: 0.4 }, { rotate: "-40deg" }] },
    animations: {
      opacity: withTiming(1, { duration: 120 }),
      transform: [
        { scale: withSpring(1, BLOOM_SPRING) },
        { rotate: withSpring("0deg", BLOOM_SPRING) },
      ],
    },
  }
}

/** why: the result shrinks toward the card's inner edge, where its chip lands; the rotation keeps "up" in the seat's reading frame. */
function bloomExit(rotationDeg: number, rise: number): EntryExitAnimationFunction {
  return () => {
    "worklet"
    const rotate = `${rotationDeg}deg`
    return {
      initialValues: { opacity: 1, transform: [{ rotate }, { translateY: 0 }, { scale: 1 }] },
      animations: {
        opacity: withTiming(0, { duration: BLOOM_EXIT_MS }),
        transform: [
          { rotate },
          { translateY: withTiming(-rise, { duration: BLOOM_EXIT_MS }) },
          { scale: withTiming(BLOOM_EXIT_SCALE, { duration: BLOOM_EXIT_MS }) },
        ],
      },
    }
  }
}

/** why: a result belongs to the seat that rolled it, so it sits over that card, turned the way its player reads. */
export function DiceSeatOverlay({
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
  const entering = animate ? bloomEnter : undefined
  const exiting = animate
    ? bloomExit(contentRotation, compact ? COMPACT_BLOOM_EXIT_RISE : BLOOM_EXIT_RISE)
    : undefined
  const interactive = view?.kind !== "waiting" && view?.kind !== "choice"
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
          onChoose={dice.onChoose}
        />
      </View>
    ) : null

  return (
    <Animated.View
      // why: a new result on the same seat must animate in again, so each bloom is its own element.
      key={viewKey(view)}
      entering={entering}
      exiting={exiting}
      pointerEvents="box-none"
      style={$layer}
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

function viewKey(view: DiceSeatView | undefined) {
  if (!view) return "armed"
  if (view.kind === "roll") return `roll:${view.roll.tool}:${view.roll.value}`
  if (view.kind === "rolloff") return `rolloff:${view.value}:${view.status}`
  return view.kind
}

function Result({
  view,
  playerName,
  foreground,
  compact,
  onChoose,
}: {
  view: DiceSeatView
  playerName: string
  foreground: string
  compact?: boolean
  onChoose?: (order: "first" | "second") => void
}) {
  const { themed } = useAppTheme()
  const text = { color: foreground }
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
          text={String(view.value)}
          weight="medium"
          maxFontSizeMultiplier={1.2}
          style={[themed(compact ? $compactValue : $value), text]}
        />
        {view.status === "won"
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
      <Text
        text={String(view.roll.value)}
        weight="medium"
        maxFontSizeMultiplier={1.2}
        style={[themed(compact ? $compactValue : $value), text]}
      />
    </>
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
