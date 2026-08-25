import type { ViewStyle } from "react-native"
import { View } from "react-native"

import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

export function DeckListSkeleton({
  sections,
  density = "compact",
}: {
  sections: readonly { id: string; label: string }[]
  density?: "compact" | "comfortable"
}) {
  const { themed } = useAppTheme()
  const visibleSections =
    sections.length > 0 ? sections.slice(0, 2) : [{ id: "cards", label: "Cards" }]
  const rowStyle = density === "comfortable" ? $comfortableRow : $compactRow
  const thumbnailStyle = density === "comfortable" ? $comfortableThumbnail : $compactThumbnail

  return visibleSections.map((section, sectionIndex) => (
    <View key={section.id}>
      <View style={themed($sectionHeader)}>
        <Text weight="bold" text={section.label} />
      </View>
      {Array.from({ length: sectionIndex === 0 ? 1 : 3 }).map((_, index) => (
        <View key={index} style={[themed($row), rowStyle]}>
          <View style={[themed($thumbnail), thumbnailStyle]} />
          <View style={themed($line)} />
        </View>
      ))}
    </View>
  ))
}

const $sectionHeader: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  paddingTop: spacing.md,
  paddingBottom: spacing.xxs,
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
})
const $row: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
})
const $compactRow = { minHeight: 68 } as const
const $comfortableRow = { minHeight: 84 } as const
const $thumbnail: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  borderRadius: spacing.xxxs,
  backgroundColor: colors.separator,
})
const $compactThumbnail = { width: 36, height: 50 } as const
const $comfortableThumbnail = { width: 48, height: 68 } as const
const $line: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: "64%",
  height: 14,
  backgroundColor: colors.separator,
})
