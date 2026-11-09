import type { ViewStyle } from "react-native"

import type { ThemedStyle } from "@/theme/types"

// why: a ScrollView grows to fill by default, which stretches a "fit" Sheet to its maximum height.
// why: in a padded Sheet or DialogCard, bleeding into the padding puts the iOS scroll indicator in the gutter, off right-aligned content.
export const $sheetScroll: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexGrow: 0,
  flexShrink: 1,
  marginHorizontal: -spacing.lg,
})
export const $sheetScrollContent: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.lg,
})
