import type { ReactNode } from "react"
import { TouchableOpacity, View } from "react-native"
import type { ViewStyle, TextStyle } from "react-native"

import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { Text } from "./Text"

export function FilterPill({
  label,
  selected,
  onPress,
  removable,
  testID,
}: {
  label: string
  selected?: boolean
  onPress: () => void
  removable?: boolean
  testID?: string
}) {
  const { themed } = useAppTheme()
  return (
    <TouchableOpacity
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={removable ? `Remove filter ${label}` : label}
      accessibilityState={{ selected: Boolean(selected) }}
      activeOpacity={0.8}
      style={[themed($chip), selected ? themed($chipSelected) : undefined]}
      onPress={onPress}
    >
      <Text
        size="xxs"
        weight={selected ? "medium" : "normal"}
        style={selected ? themed($chipSelectedText) : themed($dimmedText)}
        text={removable ? `${label}  ✕` : label}
      />
    </TouchableOpacity>
  )
}

export function FilterGroup({ heading, children }: { heading: string; children: ReactNode }) {
  const { themed } = useAppTheme()
  return (
    <View style={themed($chipGroup)}>
      <Text weight="bold" size="xxs" style={themed($groupHeading)} text={heading} />
      <View style={themed($chipWrap)}>{children}</View>
    </View>
  )
}

const $chipWrap: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.xs,
})
const $chipGroup: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $groupHeading: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  textTransform: "uppercase",
  letterSpacing: 1,
})
const $chip: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  paddingVertical: spacing.xxs,
  paddingHorizontal: spacing.sm,
  borderRadius: spacing.lg,
  borderWidth: 1,
  borderColor: colors.separator,
})
const $chipSelected: ThemedStyle<ViewStyle> = ({ colors }) => ({
  borderColor: colors.tint,
  backgroundColor: colors.tint,
})
const $chipSelectedText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
})
const $dimmedText: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
