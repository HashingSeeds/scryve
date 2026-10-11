import type { TextStyle, ViewStyle } from "react-native"
import { StyleSheet, View } from "react-native"

import { toolLabel, type DiceRoll, type DiceSeatView, type DiceTool } from "@/features/game/dice"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { BoardPressable } from "./BoardPressable"
import type { LifeCardContentRotation } from "./playerCardTypes"
import { Text } from "./Text"

export interface LifeCardDice {
  view?: DiceSeatView
  armed?: DiceTool
  onPress: () => void
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
  const { view, armed } = dice
  const status = view?.kind === "rolls" ? undefined : view?.status
  const covers = !!view && status !== "sweep"
  const scrim = view?.kind === "first" && status === "lost"
  const dim = status === "lost" || status === "out"
  const rotationStyle: ViewStyle | undefined = contentRotation
    ? { transform: [{ rotate: `${contentRotation}deg` }] }
    : undefined

  return (
    <BoardPressable
      testID={`dice-seat-${seatNumber}`}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel(playerName, view, armed)}
      accessibilityHint={view ? "Clears this result" : undefined}
      onPress={dice.onPress}
      style={[
        themed($overlay),
        compact && themed($compactOverlay),
        covers && { backgroundColor: color },
        scrim && themed($scrim),
        (armed || status === "sweep") && [themed($ring), { borderColor: foreground }],
      ]}
    >
      {view && covers && !scrim ? (
        <View style={[themed($content), rotationStyle, dim && $dim]}>
          <Result view={view} foreground={foreground} compact={compact} />
        </View>
      ) : null}
    </BoardPressable>
  )
}

function Result({
  view,
  foreground,
  compact,
}: {
  view: DiceSeatView
  foreground: string
  compact?: boolean
}) {
  const { themed } = useAppTheme()
  const text = { color: foreground }
  const label = (value: string) => (
    <Text text={value} weight="bold" size="xs" maxFontSizeMultiplier={1.2} style={text} />
  )
  if (view.kind === "first")
    return (
      <Text
        text="Goes first"
        weight="bold"
        maxFontSizeMultiplier={1.2}
        style={[themed(compact ? $compactHeadline : $headline), text]}
      />
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
            ? label("Tie")
            : view.status === "out"
              ? label("Out")
              : null}
      </>
    )
  const [latest, ...earlier] = view.rolls
  return (
    <>
      {label(toolLabel(latest.tool))}
      <Text
        text={String(latest.value)}
        weight="medium"
        maxFontSizeMultiplier={1.2}
        style={[themed(compact ? $compactValue : $value), text]}
      />
      {earlier.length ? (
        <Text
          text={earlier.map(shortResult).join(" · ")}
          size="xs"
          maxFontSizeMultiplier={1.2}
          style={[text, $earlier]}
        />
      ) : null}
    </>
  )
}

function shortResult(roll: DiceRoll) {
  return roll.tool === "coin" ? roll.value[0] : String(roll.value)
}

function accessibilityLabel(playerName: string, view?: DiceSeatView, armed?: DiceTool) {
  if (view?.kind === "rolls") {
    const [latest] = view.rolls
    return `${playerName}, ${toolLabel(latest.tool)}, ${latest.value}`
  }
  if (view?.kind === "rolloff") {
    const status =
      view.status === "won"
        ? ", goes first"
        : view.status === "tied"
          ? ", tied"
          : view.status === "out"
            ? ", out"
            : ""
    return `${playerName} rolled ${view.value}${status}`
  }
  if (view?.kind === "first")
    return view.status === "sweep"
      ? "Picking who goes first"
      : view.status === "won"
        ? `${playerName} goes first`
        : `${playerName} does not go first`
  return armed === "coin" ? `Flip a coin for ${playerName}` : `Roll a d20 for ${playerName}`
}

const $overlay: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  ...StyleSheet.absoluteFill,
  zIndex: 8,
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
const $earlier: TextStyle = { opacity: 0.75 }
