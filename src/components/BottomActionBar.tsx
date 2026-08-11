import type { ReactNode } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"

import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

export function BottomActionBar({ children }: { children: ReactNode }) {
  const { themed } = useAppTheme()
  return <View style={themed($bar)}>{children}</View>
}

const $bar: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  gap: spacing.xs,
  padding: spacing.md,
  borderTopWidth: 1,
  borderTopColor: colors.separator,
  backgroundColor: colors.background,
})

export const $alert: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  gap: spacing.xs,
  padding: spacing.sm,
  borderRadius: spacing.xs,
  backgroundColor: colors.errorBackground,
})
export const $alertText: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.error })
