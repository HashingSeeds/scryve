import { type ReactNode, useEffect, useState } from "react"
import type { LayoutChangeEvent, LayoutRectangle, TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"
import Animated, {
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  ZoomIn,
} from "react-native-reanimated"

import { rollLabel, rollValueLabel, type DiceSeatChip } from "@/features/game/dice"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { useReducedMotion } from "@/utils/useReducedMotion"

import { BoardPressable } from "./BoardPressable"
import { DieFace } from "./DiceGlyph"
import { Text } from "./Text"

export const DICE_CHIP_HEIGHT = 36
export const COMPACT_DICE_CHIP_HEIGHT = 32
const CHIP_POP_MS = 260
const FLIGHT_SPRING = { damping: 20, stiffness: 110, mass: 1 } as const
// why: the chip starts about as large as the result it replaces, so it reads as that result shrinking into place.
const FLIGHT_START_SCALE = 2.6

type Point = { x: number; y: number }

export interface DiceChipsProps {
  seatNumber: number
  playerName: string
  foreground: string
  compact?: boolean
  chips: readonly DiceSeatChip[]
  onClear: (chip: DiceSeatChip) => void
  bloomCenterInRow?: Point
}

export function DiceChips({
  seatNumber,
  playerName,
  foreground,
  compact,
  chips,
  onClear,
  bloomCenterInRow,
}: DiceChipsProps) {
  const { themed } = useAppTheme()
  const reducedMotion = useReducedMotion()
  const [rowOffset, setRowOffset] = useState<Point>()
  if (chips.length === 0) return null
  const flight =
    reducedMotion === false && bloomCenterInRow && rowOffset
      ? { x: bloomCenterInRow.x - rowOffset.x, y: bloomCenterInRow.y - rowOffset.y }
      : undefined
  // why: Reanimated reads the system setting only at startup, so an animation already gated on the live preference must not consult it again.
  const entering =
    reducedMotion === false && !bloomCenterInRow
      ? ZoomIn.duration(CHIP_POP_MS).reduceMotion(ReduceMotion.Never)
      : undefined
  return (
    <View
      testID={`dice-chips-seat-${seatNumber}`}
      pointerEvents="box-none"
      onLayout={({ nativeEvent: { layout } }) =>
        setRowOffset((current) =>
          current?.x === layout.x && current.y === layout.y
            ? current
            : { x: layout.x, y: layout.y },
        )
      }
      style={themed($row)}
    >
      {chips.map((chip) => {
        const key = chipKey(chip)
        const label =
          chip.kind === "first"
            ? translate("board:dice.goesFirst", { name: playerName })
            : rollLabel(playerName, chip.roll)
        return (
          <ChipFlight
            key={key}
            entering={entering}
            from={flight}
            awaiting={!!bloomCenterInRow && reducedMotion === false}
          >
            <BoardPressable
              testID={`dice-chip-${seatNumber}-${key}`}
              accessibilityRole="button"
              accessibilityLabel={label}
              accessibilityHint={translate("board:dice.clearsResult")}
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
                  tx="board:dice.firstShort"
                  weight="bold"
                  maxFontSizeMultiplier={1.2}
                  style={[themed(compact ? $compactValue : $value), { color: foreground }]}
                />
              ) : (
                <>
                  <DieFace tool={chip.roll.tool} size={compact ? 15 : 18} color={foreground} />
                  <Text
                    text={rollValueLabel(chip.roll)}
                    weight="bold"
                    maxFontSizeMultiplier={1.2}
                    style={[themed(compact ? $compactValue : $value), { color: foreground }]}
                  />
                </>
              )}
            </BoardPressable>
          </ChipFlight>
        )
      })}
    </View>
  )
}

// why: the chip lands where it lives; it waits unseen for its first layout so it never flashes at rest before flying.
function ChipFlight({
  from,
  awaiting,
  entering,
  children,
}: {
  from?: Point
  awaiting: boolean
  entering?: ReturnType<typeof ZoomIn.duration>
  children: ReactNode
}) {
  const [layout, setLayout] = useState<LayoutRectangle>()
  const progress = useSharedValue(awaiting ? 0 : 1)
  const start = useSharedValue<Point>({ x: 0, y: 0 })
  const [flown, setFlown] = useState(!awaiting)

  useEffect(() => {
    if (flown || !layout || (awaiting && !from)) return
    if (from) {
      start.value = {
        x: from.x - (layout.x + layout.width / 2),
        y: from.y - (layout.y + layout.height / 2),
      }
      progress.value = withSpring(1, FLIGHT_SPRING)
    } else progress.value = 1
    setFlown(true)
  }, [awaiting, from, flown, layout, progress, start])

  const style = useAnimatedStyle(() => {
    const rest = 1 - progress.value
    return {
      opacity: progress.value > 0 ? 1 : 0,
      transform: [
        { translateX: start.value.x * rest },
        { translateY: start.value.y * rest },
        { scale: 1 + (FLIGHT_START_SCALE - 1) * rest },
      ],
    }
  })

  return (
    <Animated.View
      entering={entering}
      onLayout={(event: LayoutChangeEvent) => setLayout(event.nativeEvent.layout)}
      style={style}
    >
      {children}
    </Animated.View>
  )
}

function chipKey(chip: DiceSeatChip) {
  return chip.kind === "first" ? "first" : chip.roll.tool
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
