import type { ReactNode } from "react"
import type { StyleProp, TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"

import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { Text, type TextProps } from "./Text"

/** why: rows and section headers share one right lane, so their numbers line up down the screen. */
export const NUMBER_LANE_WIDTH = 56

export function TrailingNumber({
  value,
  style,
  ...textProps
}: { value: number | string; style?: StyleProp<TextStyle> } & Omit<
  TextProps,
  "text" | "tx" | "children" | "style"
>) {
  return <Text {...textProps} text={String(value)} numberOfLines={1} style={[$number, style]} />
}

export function SectionHeader({
  label,
  count,
  action,
  style,
  testID,
}: {
  label: string
  count?: number | string
  action?: ReactNode
  style?: StyleProp<ViewStyle>
  testID?: string
}) {
  const { themed } = useAppTheme()
  return (
    <View testID={testID} style={[themed($header), style]}>
      <Text preset="sectionLabel" text={label} accessibilityRole="header" style={$label} />
      {action ??
        (count === undefined ? null : <TrailingNumber preset="sectionLabel" value={count} />)}
    </View>
  )
}

const $number: TextStyle = {
  width: NUMBER_LANE_WIDTH,
  textAlign: "right",
  fontVariant: ["tabular-nums"],
}
const $header: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  minHeight: 32,
  gap: spacing.sm,
})
const $label: TextStyle = { flex: 1 }
