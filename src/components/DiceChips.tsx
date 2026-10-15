import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"
import Animated, { ReduceMotion, ZoomIn } from "react-native-reanimated"

import { toolLabel, type DiceSeatChip } from "@/features/game/dice"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { useReducedMotion } from "@/utils/useReducedMotion"

import { BoardPressable } from "./BoardPressable"
import { DiceGlyph } from "./DiceGlyph"
import { Text } from "./Text"

export const DICE_CHIP_HEIGHT = 36
export const COMPACT_DICE_CHIP_HEIGHT = 32
const CHIP_POP_MS = 260

export interface DiceChipsProps {
  seatNumber: number
  playerName: string
  foreground: string
  compact?: boolean
  chips: readonly DiceSeatChip[]
  onClear: (chip: DiceSeatChip) => void
}

export function DiceChips({
  seatNumber,
  playerName,
  foreground,
  compact,
  chips,
  onClear,
}: DiceChipsProps) {
  const { themed } = useAppTheme()
  const reducedMotion = useReducedMotion()
  if (chips.length === 0) return null
  // why: Reanimated reads the system setting only at startup, so an animation already gated on the live preference must not consult it again.
  const entering =
    reducedMotion === false
      ? ZoomIn.duration(CHIP_POP_MS).reduceMotion(ReduceMotion.Never)
      : undefined
  return (
    <View testID={`dice-chips-seat-${seatNumber}`} pointerEvents="box-none" style={themed($row)}>
      {chips.map((chip) => {
        const key = chip.kind === "first" ? "first" : chip.roll.tool
        const label =
          chip.kind === "first"
            ? `${playerName} goes first`
            : `${playerName}, ${toolLabel(chip.roll.tool)}, ${chip.roll.value}`
        return (
          <Animated.View key={key} entering={entering}>
            <BoardPressable
              testID={`dice-chip-${seatNumber}-${key}`}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityHint="Clears this result"
              hitSlop={{ top: 6, bottom: 6 }}
              onPress={() => onClear(chip)}
              style={({ pressed }) => [
                themed(compact ? $compactChip : $chip),
                { borderColor: foreground },
                pressed && $pressed,
              ]}
            >
              {chip.kind === "first" ? (
                <Text
                  text="1st"
                  weight="bold"
                  maxFontSizeMultiplier={1.2}
                  style={[themed(compact ? $compactValue : $value), { color: foreground }]}
                />
              ) : (
                <>
                  <DiceGlyph tool={chip.roll.tool} size={compact ? 13 : 15} color={foreground} />
                  <Text
                    text={String(chip.roll.value)}
                    weight="bold"
                    maxFontSizeMultiplier={1.2}
                    style={[themed(compact ? $compactValue : $value), { color: foreground }]}
                  />
                </>
              )}
            </BoardPressable>
          </Animated.View>
        )
      })}
    </View>
  )
}

const $row: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  flexShrink: 0,
  gap: spacing.xxxs,
})
const $chip: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  gap: spacing.xxs,
  minHeight: DICE_CHIP_HEIGHT,
  minWidth: DICE_CHIP_HEIGHT,
  paddingHorizontal: spacing.xs,
  borderRadius: spacing.xs,
  borderWidth: 1.5,
})
const $compactChip: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  gap: spacing.xxxs,
  minHeight: COMPACT_DICE_CHIP_HEIGHT,
  minWidth: 28,
  paddingHorizontal: spacing.xxs,
  borderRadius: spacing.xs,
  borderWidth: 1.5,
})
const $value: ThemedStyle<TextStyle> = () => ({ fontSize: 15, lineHeight: 18 })
const $compactValue: ThemedStyle<TextStyle> = () => ({ fontSize: 13, lineHeight: 16 })
const $pressed: ViewStyle = { opacity: 0.72 }
