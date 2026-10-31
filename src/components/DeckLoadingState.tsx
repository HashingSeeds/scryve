import type { ViewStyle } from "react-native"
import { View } from "react-native"

import { Text } from "@/components/Text"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

export function DeckListSkeleton({
  sections,
}: {
  sections: readonly { id: string; label: string }[]
}) {
  const { themed } = useAppTheme()
  const visibleSections =
    sections.length > 0
      ? sections.slice(0, 2)
      : [{ id: "cards", label: translate("decks:loading.cards") }]

  return visibleSections.map((section, sectionIndex) => (
    <View key={section.id}>
      <View style={themed($sectionHeader)}>
        <Text weight="bold" text={section.label} />
      </View>
      {Array.from({ length: sectionIndex === 0 ? 1 : 3 }).map((_, index) => (
        <View key={index} style={themed($row)}>
          <View style={themed($thumbnail)} />
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
  minHeight: 84,
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
})
const $thumbnail: ThemedStyle<ViewStyle> = ({ colors, radius }) => ({
  width: 48,
  height: 68,
  borderRadius: radius.xxs,
  backgroundColor: colors.separator,
})
const $line: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: "64%",
  height: 14,
  backgroundColor: colors.separator,
})
