import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"
import Animated, { ZoomIn } from "react-native-reanimated"

import type { DiceSeatChip } from "@/features/game/dice"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { useReducedMotion } from "@/utils/useReducedMotion"

import { BoardPressable } from "./BoardPressable"
import { contentFrame } from "./CounterChips"
import { DiceGlyph } from "./DiceGlyph"
import type { LifeCardContentRotation } from "./playerCardTypes"
import { Text } from "./Text"

export const DICE_CHIP_HEIGHT = 36
export const COMPACT_DICE_CHIP_HEIGHT = 32
const CHIP_POP_MS = 260

export interface DiceChipsProps {
  seatNumber: number
  playerName: string
  foreground: string
  compact?: boolean
  contentRotation: LifeCardContentRotation
  cardSize: { width: number; height: number }
  /** why: distance from the reading frame's top edge, so the chips clear safe areas and the menu the way counter chips do. */
  top: number
  left: number
  chips: readonly DiceSeatChip[]
  onClear: (chip: DiceSeatChip) => void
}

/** why: a settled result sits on the card's inner edge, facing the table, until the seat rolls again, play begins, or someone taps it away. */
export function DiceChips({
  seatNumber,
  playerName,
  foreground,
  compact,
  contentRotation,
  cardSize,
  top,
  left,
  chips,
  onClear,
}: DiceChipsProps) {
  const { themed } = useAppTheme()
  const reducedMotion = useReducedMotion()
  if (cardSize.width === 0 || cardSize.height === 0 || chips.length === 0) return null
  const entering = reducedMotion === false ? ZoomIn.duration(CHIP_POP_MS) : undefined
  return (
    <View pointerEvents="box-none" style={[contentFrame(contentRotation, cardSize), $layer]}>
      <View
        testID={`dice-chips-seat-${seatNumber}`}
        pointerEvents="box-none"
        style={[themed($row), { top, left }]}
      >
        {chips.map((chip) => {
          const key = chip.kind === "first" ? "first" : chip.roll.tool
          const label =
            chip.kind === "first"
              ? `${playerName} goes first`
              : `${playerName}, ${chip.roll.tool === "coin" ? "Coin" : "d20"}, ${chip.roll.value}`
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
    </View>
  )
}

// why: above the counter chips (10) and the Pokémon bar (15), beside where a bloom lands.
const $layer: ViewStyle = { zIndex: 16 }
const $row: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  position: "absolute",
  flexDirection: "row",
  alignItems: "center",
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
