import type { TextStyle, ViewStyle } from "react-native"
import { ScrollView, TouchableOpacity, View } from "react-native"

import { PlayerMark } from "@/components/PlayerMark"
import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import {
  appearanceKey,
  PLAYER_COLOR_CHOICES,
  PLAYER_MARK_SHAPES,
  type PlayerAppearance,
  type PlayerMarkShape,
} from "../../../convex/lib/appearance"

function colorSlug(color: string) {
  return color.replace("#", "").toLowerCase()
}

export function AppearancePicker({
  value,
  taken = [],
  onChange,
}: {
  value: PlayerAppearance
  taken?: PlayerAppearance[]
  onChange: (next: PlayerAppearance) => void
}) {
  const { themed } = useAppTheme()
  const takenKeys = new Set(taken.map((entry) => appearanceKey(entry)))
  const shapeIsTaken = (color: string, shape: PlayerMarkShape) =>
    takenKeys.has(appearanceKey({ color, shape }))
  const colorIsExhausted = (color: string) =>
    PLAYER_MARK_SHAPES.every((shape) => shapeIsTaken(color, shape))

  function selectColor(color: string) {
    const keepsShape = !shapeIsTaken(color, value.shape)
    const nextShape = keepsShape
      ? value.shape
      : (PLAYER_MARK_SHAPES.find((shape) => !shapeIsTaken(color, shape)) ?? value.shape)
    onChange({ color, shape: nextShape })
  }

  return (
    <View style={themed($picker)}>
      <View style={themed($group)}>
        <Text size="xs" style={themed($label)} text="Color" />
        <ScrollView
          horizontal
          accessibilityRole="radiogroup"
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={themed($row)}
        >
          {PLAYER_COLOR_CHOICES.map((color) => {
            const selected = color.toUpperCase() === value.color.toUpperCase()
            const exhausted = colorIsExhausted(color)
            return (
              <TouchableOpacity
                key={color}
                testID={`appearance-color-${colorSlug(color)}`}
                accessibilityRole="radio"
                accessibilityLabel={`Color ${colorSlug(color)}`}
                accessibilityState={{ selected, disabled: exhausted }}
                disabled={exhausted}
                activeOpacity={0.75}
                style={[
                  themed($swatch),
                  selected && themed($selectedSwatch),
                  exhausted && themed($exhausted),
                ]}
                onPress={() => selectColor(color)}
              >
                <View style={[themed($colorDot), { backgroundColor: color }]} />
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      </View>
      <View style={themed($group)}>
        <Text size="xs" style={themed($label)} text="Mark" />
        <ScrollView
          horizontal
          accessibilityRole="radiogroup"
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={themed($row)}
        >
          {PLAYER_MARK_SHAPES.map((shape, index) => {
            const selected = shape === value.shape
            const unavailable = shapeIsTaken(value.color, shape)
            return (
              <TouchableOpacity
                key={shape}
                testID={`appearance-shape-${shape}`}
                accessibilityRole="radio"
                accessibilityLabel={unavailable ? `${shape}, already taken` : shape}
                accessibilityState={{ selected, disabled: unavailable }}
                disabled={unavailable}
                activeOpacity={0.75}
                style={[
                  themed($swatch),
                  selected && themed($selectedSwatch),
                  unavailable && themed($exhausted),
                ]}
                onPress={() => onChange({ color: value.color, shape })}
              >
                <PlayerMark
                  seatNumber={index + 1}
                  shape={shape}
                  color={value.color}
                  size={32}
                  spinning={false}
                />
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      </View>
    </View>
  )
}

const $picker: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.sm })
const $group: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xxs })
const $row: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xxs,
})
const $label: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $swatch: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  alignItems: "center",
  justifyContent: "center",
  width: 44,
  height: 44,
  padding: spacing.xxs,
  borderRadius: spacing.sm,
  borderWidth: 2,
  borderColor: colors.transparent,
})
const $selectedSwatch: ThemedStyle<ViewStyle> = ({ colors }) => ({ borderColor: colors.tint })
const $exhausted: ThemedStyle<ViewStyle> = ({ colors }) => ({
  opacity: 0.35,
  borderColor: colors.separator,
  borderStyle: "dashed",
})
const $colorDot: ThemedStyle<ViewStyle> = () => ({ width: 28, height: 28, borderRadius: 14 })
