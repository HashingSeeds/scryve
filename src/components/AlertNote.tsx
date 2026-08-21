import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"

import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { Text } from "./Text"

export type AlertNoteTone = "error" | "info"

export interface AlertNoteProps {
  text: string
  tone?: AlertNoteTone
  testID?: string
}

export function AlertNote({ text, tone = "error", testID }: AlertNoteProps) {
  const { themed } = useAppTheme()
  return (
    <View style={themed(tone === "error" ? $alert : $info)}>
      <Text
        testID={testID}
        accessibilityRole="alert"
        size="xs"
        style={themed(tone === "error" ? $alertText : $infoText)}
        text={text}
      />
    </View>
  )
}

export const $alert: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  gap: spacing.xs,
  padding: spacing.sm,
  borderRadius: spacing.xs,
  backgroundColor: colors.errorBackground,
})
export const $alertText: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.error })
const $info: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  gap: spacing.xs,
  padding: spacing.sm,
  borderRadius: spacing.xs,
  borderWidth: 1,
  borderColor: colors.separator,
})
const $infoText: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
