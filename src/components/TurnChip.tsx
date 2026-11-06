import { useEffect, useReducer } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"
import Svg, { Path } from "react-native-svg"

import type { TurnChipState } from "@/features/game/dice"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { formatElapsed } from "@/utils/useElapsedSince"

import { BoardPressable } from "./BoardPressable"
import { Text } from "./Text"
import { useTurnSpotlight } from "./TurnSpotlight"
import { bankLeft, turnElapsed } from "../../convex/lib/turns"

// why: prototype switch for the round 4 screenshots; one design ships.
export const TURN_CHIP_DESIGN: "word" | "chevron" | "filled" = "word"

const TICK_MS = 1_000

/** why: only the chip's text ticks, so the card around it never re-renders with the clock. */
function useNow(ticking: boolean) {
  const [, tick] = useReducer((count: number) => count + 1, 0)
  useEffect(() => {
    if (!ticking) return
    const timer = setInterval(tick, TICK_MS)
    return () => clearInterval(timer)
  }, [ticking])
  return Date.now()
}

/**
 * why: the chip passes to the seat the board frames as next, so the frame and the pass can never
 * disagree about who comes after.
 */
export function TurnChip({
  state,
  seatNumber,
  foreground,
  compact,
}: {
  state: TurnChipState
  seatNumber: number
  foreground: string
  compact?: boolean
}) {
  const {
    themed,
    theme: { colors },
  } = useAppTheme()
  const { turn, canPress } = state
  const next = useTurnSpotlight()?.next
  const now = useNow(!turn.waiting)
  const bank = bankLeft(turn, turn.playerId, now)
  const outOfTime = bank !== undefined && bank <= 0
  const time = formatElapsed(bank === undefined ? turnElapsed(turn, now) : Math.max(0, bank))
  const tick = Math.floor(now / TICK_MS) % 2 === 0
  const filled = TURN_CHIP_DESIGN === "filled" && canPress
  const ink = outOfTime ? colors.board.text : filled ? inverse(foreground) : foreground
  const name = state.nameOf(turn.playerId) ?? ""
  const nextName = next ? state.nameOf(next) : undefined
  const label = [
    translate("board:turn.label", { number: turn.number, name }),
    turn.waiting ? undefined : outOfTime ? translate("board:turn.outOfTime") : time,
    canPress
      ? turn.waiting
        ? translate("board:turn.startHint")
        : nextName
          ? translate("board:turn.passHintTo", { name: nextName })
          : undefined
      : undefined,
  ]
    .filter(Boolean)
    .join(". ")

  const content = turn.waiting ? (
    <>
      <PlayGlyph color={ink} />
      <Text tx="board:turn.start" weight="bold" style={[themed($value), { color: ink }]} />
    </>
  ) : (
    <>
      {outOfTime ? null : (
        <View
          testID="turn-chip-tick"
          style={[$dot, tick ? $tickOn : $tickOff, { backgroundColor: ink }]}
        />
      )}
      <Text
        text={time}
        testID={outOfTime ? "turn-chip-out-of-time" : "turn-chip-time"}
        weight="bold"
        style={[themed(compact ? $compactValue : $value), $digits, { color: ink }]}
      />
      {canPress && !outOfTime && TURN_CHIP_DESIGN === "word" ? (
        <>
          <View style={[$rule, { backgroundColor: ink }]} />
          <Text tx="board:turn.pass" weight="medium" style={[$word, { color: ink }]} />
        </>
      ) : null}
      {canPress && !outOfTime && TURN_CHIP_DESIGN === "chevron" ? <Chevron color={ink} /> : null}
    </>
  )

  const shape: ViewStyle[] = [
    themed(compact ? $compactChip : $chip),
    { borderColor: foreground },
    ...(filled ? [{ backgroundColor: foreground }] : []),
    ...(outOfTime ? [{ backgroundColor: colors.error, borderColor: colors.error }] : []),
    ...(canPress ? [] : [$passive]),
  ]

  if (!canPress)
    return (
      <View testID={`turn-chip-${seatNumber}`} accessible accessibilityLabel={label} style={shape}>
        {content}
      </View>
    )
  return (
    <BoardPressable
      testID={`turn-chip-${seatNumber}`}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={translate("board:turn.longPressHint")}
      hitSlop={{ top: 6, bottom: 6 }}
      delayLongPress={450}
      onPress={() => {
        if (turn.waiting) state.onStart()
        else if (next) state.onPass(next)
      }}
      onLongPress={state.onLongPress}
      style={({ pressed }) => [...shape, pressed && $pressed]}
    >
      {content}
    </BoardPressable>
  )
}

const inverse = (color: string) => (color.toUpperCase() === "#FFFFFF" ? "#000000" : "#FFFFFF")

function PlayGlyph({ color }: { color: string }) {
  return (
    <Svg width={10} height={10} viewBox="0 0 24 24">
      <Path d="M7 4.5v15l12-7.5z" fill={color} />
    </Svg>
  )
}

function Chevron({ color }: { color: string }) {
  return (
    <Svg width={8} height={12} viewBox="0 0 8 12">
      <Path
        d="M2 1.5 6.5 6 2 10.5"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  )
}

const $chip: ThemedStyle<ViewStyle> = ({ spacing, radius }) => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  gap: spacing.xxs,
  minHeight: 36,
  paddingHorizontal: spacing.xs,
  borderRadius: radius.md,
  borderWidth: 1.5,
})
const $compactChip: ThemedStyle<ViewStyle> = ({ spacing, radius }) => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  gap: spacing.xxxs,
  minHeight: 32,
  paddingHorizontal: spacing.xxs,
  borderRadius: radius.md,
  borderWidth: 1.5,
})
const $value: ThemedStyle<TextStyle> = () => ({ fontSize: 15, lineHeight: 18 })
const $compactValue: ThemedStyle<TextStyle> = () => ({ fontSize: 13, lineHeight: 16 })
const $digits: TextStyle = { fontVariant: ["tabular-nums"] }
const $word: TextStyle = { fontSize: 11, lineHeight: 14, opacity: 0.85 }
const $rule: ViewStyle = { width: 1, alignSelf: "stretch", marginVertical: 8, opacity: 0.4 }
const $dot: ViewStyle = { width: 5, height: 5, borderRadius: 3 }
const $tickOn: ViewStyle = { opacity: 0.9 }
const $tickOff: ViewStyle = { opacity: 0.3 }
const $passive: ViewStyle = { opacity: 0.7, borderStyle: "dashed" }
const $pressed: ViewStyle = { opacity: 0.6, transform: [{ scale: 0.94 }] }
