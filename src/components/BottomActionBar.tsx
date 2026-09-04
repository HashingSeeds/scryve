import type { ReactNode } from "react"
import type { StyleProp, ViewStyle } from "react-native"
import { View } from "react-native"

import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

export function BottomActionBar({
  children,
  style,
}: {
  children: ReactNode
  style?: StyleProp<ViewStyle>
}) {
  const { themed } = useAppTheme()
  return <View style={[themed($bar), style]}>{children}</View>
}

const $bar: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  gap: spacing.xs,
  padding: spacing.md,
  borderTopWidth: 1,
  borderTopColor: colors.separator,
  backgroundColor: colors.background,
})
