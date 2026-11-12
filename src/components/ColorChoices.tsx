import type { ViewStyle } from "react-native"
import { TouchableOpacity, View } from "react-native"

import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import { radius } from "@/theme/radius"
import type { ThemedStyle } from "@/theme/types"

import { PLAYER_COLOR_CHOICES } from "../../convex/lib/appearance"

const colorSlug = (color: string) => color.replace("#", "").toLowerCase()

export function ColorChoices({
  value,
  taken,
  locked = false,
  inline = false,
  testID = "appearance-color",
  onChange,
}: {
  value: string
  taken: ReadonlySet<string>
  locked?: boolean
  inline?: boolean
  testID?: string
  onChange: (color: string) => void
}) {
  const { themed } = useAppTheme()
  return (
    <View
      testID={testID}
      accessibilityRole="radiogroup"
      accessibilityState={{ disabled: locked }}
      style={[themed($row), inline && $inlineRow]}
    >
      {PLAYER_COLOR_CHOICES.map((color) => {
        const selected = color.toUpperCase() === value.toUpperCase()
        const exhausted = !locked && taken.has(color.toUpperCase())
        return (
          <View key={color} style={inline ? $inlineOption : $option}>
            <TouchableOpacity
              testID={`${testID}-${colorSlug(color)}`}
              accessibilityRole="radio"
              accessibilityLabel={translate(
                exhausted
                  ? "connected:appearance.colorOptionTaken"
                  : "connected:appearance.colorOption",
                { color: colorSlug(color) },
              )}
              accessibilityState={{ selected, disabled: locked || exhausted }}
              disabled={locked || exhausted}
              activeOpacity={0.75}
              style={[
                themed($swatch),
                inline && $inlineSwatch,
                selected && themed(locked ? $lockedSelection : $selectedSwatch),
                exhausted && themed($exhausted),
              ]}
              onPress={() => onChange(color)}
            >
              <View
                style={[
                  $colorDot,
                  inline && $inlineDot,
                  locked && $lockedDot,
                  { backgroundColor: color },
                ]}
              />
            </TouchableOpacity>
          </View>
        )
      })}
    </View>
  )
}

const $row: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  rowGap: spacing.xxs,
})
const $inlineRow: ViewStyle = { flexWrap: "nowrap" }
const $option: ViewStyle = { width: "25%", alignItems: "center" }
const $inlineOption: ViewStyle = { flex: 1, alignItems: "center" }
const $swatch: ThemedStyle<ViewStyle> = ({ colors, spacing, radius }) => ({
  alignItems: "center",
  justifyContent: "center",
  width: 44,
  height: 44,
  padding: spacing.xxs,
  borderRadius: radius.xl,
  borderWidth: 2,
  borderColor: colors.transparent,
})
const $inlineSwatch: ViewStyle = { width: "100%", maxWidth: 44, padding: 0 }
const $selectedSwatch: ThemedStyle<ViewStyle> = ({ colors }) => ({ borderColor: colors.tint })
const $lockedSelection: ThemedStyle<ViewStyle> = ({ colors }) => ({
  borderColor: colors.separator,
})
const $exhausted: ThemedStyle<ViewStyle> = ({ colors }) => ({
  opacity: 0.35,
  borderColor: colors.separator,
  borderStyle: "dashed",
})
const $colorDot: ViewStyle = { width: 28, height: 28, borderRadius: radius.full }
const $inlineDot: ViewStyle = { width: 22, height: 22 }
const $lockedDot: ViewStyle = { opacity: 0.28 }
