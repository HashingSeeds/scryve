import type { ReactNode } from "react"
import { TouchableOpacity, View } from "react-native"
import type { ViewStyle, TextStyle } from "react-native"
import Svg, { Circle, Path } from "react-native-svg"

import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { accessibleForeground } from "@/utils/colorContrast"

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

export function FilterButton({
  count = 0,
  onPress,
  testID,
}: {
  count?: number
  onPress: () => void
  testID?: string
}) {
  const { themed, theme } = useAppTheme()
  const label = count ? `Filters (${count})` : "Filters"
  return (
    <View style={$filterOverlay}>
      <TouchableOpacity
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        activeOpacity={1}
        style={themed($filterButton)}
        hitSlop={{ top: 6, bottom: 6 }}
        onPress={onPress}
      >
        <Svg
          width={16}
          height={16}
          viewBox="0 0 24 24"
          fill="none"
          stroke={accessibleForeground(theme.colors.tint)}
          strokeWidth={1.5}
          strokeLinecap="round"
          accessible={false}
        >
          <Path d="M4 7h5m4 0h7M4 17h11m4 0h1" />
          <Circle cx={11} cy={7} r={2} />
          <Circle cx={17} cy={17} r={2} />
        </Svg>
        <Text size="xxs" style={themed($filterText)} text={label} />
      </TouchableOpacity>
    </View>
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

const $filterOverlay: ViewStyle = {
  position: "absolute",
  right: 0,
  minHeight: 44,
  justifyContent: "center",
}
const $filterButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  minHeight: 32,
  minWidth: 44,
  borderRadius: spacing.lg,
  backgroundColor: colors.tint,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "center",
  paddingHorizontal: spacing.sm,
  gap: spacing.xxs,
})
const $filterText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: accessibleForeground(colors.tint),
})
