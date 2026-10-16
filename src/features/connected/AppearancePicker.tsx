import type { TextStyle, ViewStyle } from "react-native"
import { TouchableOpacity, View } from "react-native"

import { PlayerMark } from "@/components/PlayerMark"
import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import {
  PLAYER_COLOR_CHOICES,
  PLAYER_MARK_SHAPES,
  type PlayerAppearance,
  type PlayerMarkShape,
  type ProMarkShape,
} from "../../../convex/lib/appearance"

function colorSlug(color: string) {
  return color.replace("#", "").toLowerCase()
}

export function AppearancePicker({
  value,
  taken = [],
  shapes = PLAYER_MARK_SHAPES,
  proShapes = [],
  proLocked = false,
  foil = false,
  onLockedPress,
  onChange,
}: {
  value: PlayerAppearance
  taken?: PlayerAppearance[]
  shapes?: readonly PlayerMarkShape[]
  proShapes?: readonly ProMarkShape[]
  proLocked?: boolean
  foil?: boolean
  onLockedPress?: () => void
  onChange: (next: PlayerAppearance) => void
}) {
  const { themed } = useAppTheme()
  const takenColors = new Set(taken.map((entry) => entry.color.toUpperCase()))
  const takenShapes = new Set<PlayerMarkShape>(taken.map((entry) => entry.shape))

  function shapeOption(shape: PlayerMarkShape, index: number, pro: boolean) {
    const selected = shape === value.shape
    const unavailable = takenShapes.has(shape)
    const locked = pro && proLocked
    return (
      <View key={shape} style={$option}>
        <TouchableOpacity
          testID={`appearance-shape-${shape}`}
          accessibilityRole="radio"
          accessibilityLabel={
            unavailable ? `${shape}, already taken` : locked ? `${shape}, Scryve Pro` : shape
          }
          accessibilityHint={locked && !unavailable ? "Opens Scryve Pro" : undefined}
          accessibilityState={{ selected, disabled: unavailable }}
          disabled={unavailable}
          activeOpacity={0.75}
          style={[
            themed($swatch),
            selected && themed($selectedSwatch),
            unavailable && themed($exhausted),
            locked && !unavailable && $locked,
          ]}
          onPress={() => (locked ? onLockedPress?.() : onChange({ color: value.color, shape }))}
        >
          <PlayerMark
            seatNumber={index + 1}
            shape={shape}
            color={value.color}
            foil={pro && foil}
            size={32}
            spinning={false}
          />
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={themed($picker)}>
      <View style={themed($group)}>
        <Text size="xs" style={themed($label)} text="Color" />
        <View accessibilityRole="radiogroup" style={themed($row)}>
          {PLAYER_COLOR_CHOICES.map((color) => {
            const selected = color.toUpperCase() === value.color.toUpperCase()
            const exhausted = takenColors.has(color.toUpperCase())
            return (
              <View key={color} style={$option}>
                <TouchableOpacity
                  testID={`appearance-color-${colorSlug(color)}`}
                  accessibilityRole="radio"
                  accessibilityLabel={`Color ${colorSlug(color)}${exhausted ? ", already taken" : ""}`}
                  accessibilityState={{ selected, disabled: exhausted }}
                  disabled={exhausted}
                  activeOpacity={0.75}
                  style={[
                    themed($swatch),
                    selected && themed($selectedSwatch),
                    exhausted && themed($exhausted),
                  ]}
                  onPress={() => onChange({ ...value, color })}
                >
                  <View style={[themed($colorDot), { backgroundColor: color }]} />
                </TouchableOpacity>
              </View>
            )
          })}
        </View>
      </View>
      <View style={themed($group)}>
        <Text size="xs" style={themed($label)} text="Mark" />
        <View accessibilityRole="radiogroup" style={themed($row)}>
          {shapes.map((shape, index) => shapeOption(shape, index, false))}
        </View>
      </View>
      {proShapes.length ? (
        <View style={themed($group)}>
          <Text size="xs" style={themed($label)} text="Pro" />
          <View accessibilityRole="radiogroup" style={themed($row)}>
            {proShapes.map((shape, index) => shapeOption(shape, index, true))}
          </View>
        </View>
      ) : null}
    </View>
  )
}

const $picker: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.sm })
const $group: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xxs })
const $row: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  rowGap: spacing.xxs,
})
const $option: ViewStyle = { width: "25%", alignItems: "center" }
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
const $locked: ViewStyle = { opacity: 0.45 }
const $colorDot: ThemedStyle<ViewStyle> = () => ({ width: 28, height: 28, borderRadius: 14 })
