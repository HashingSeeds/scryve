import type { ReactNode } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"

import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { accessibleForeground } from "@/utils/colorContrast"

import { Button, type ButtonProps } from "./Button"
import { Text } from "./Text"

export interface ChoiceButtonProps extends Omit<
  ButtonProps,
  "preset" | "LeftAccessory" | "RightAccessory"
> {
  selected: boolean
  accentColor?: string
  detail?: string
  Leading?: (props: { color: string }) => ReactNode
  compact?: boolean
  /** why: by default the detail stays whole (a winner's life total must not cut off), so only lists of long names opt in. */
  detailShrinks?: boolean
}

export function ChoiceButton(props: ChoiceButtonProps) {
  const {
    selected,
    accentColor,
    detail,
    Leading,
    compact,
    detailShrinks,
    style: $styleOverride,
    TextProps,
    accessibilityState,
    ...rest
  } = props
  const {
    themed,
    theme: { colors },
  } = useAppTheme()

  const fill = accentColor ?? colors.tint
  const foreground = selected ? accessibleForeground(fill) : colors.text
  const selectedStyle: ViewStyle = { backgroundColor: fill, borderColor: fill }

  return (
    <Button
      {...rest}
      // why: RN's types omit aria-pressed, but react-native-web needs it; it ignores accessibilityState, so web screen readers can't tell which choice is on.
      {...{ "aria-pressed": selected }}
      accessibilityState={{ ...accessibilityState, selected }}
      style={[
        themed($choice),
        compact && themed($compactChoice),
        selected && selectedStyle,
        $styleOverride,
      ]}
      pressedStyle={themed(selected ? $choiceSelectedPressed : $choicePressed)}
      textStyle={[themed(compact ? $compactLabel : $choiceLabel), { color: foreground }]}
      TextProps={{ numberOfLines: 1, ...TextProps }}
      LeftAccessory={
        Leading
          ? () => (
              <View style={themed($leading)}>
                {Leading({ color: selected ? foreground : fill })}
              </View>
            )
          : undefined
      }
      RightAccessory={
        compact
          ? undefined
          : () => (
              <View style={[themed($trailing), detailShrinks && $shrink]}>
                {detail ? (
                  <Text
                    size="xs"
                    text={detail}
                    numberOfLines={detailShrinks ? 1 : undefined}
                    style={[themed($detail), detailShrinks && $shrink, { color: foreground }]}
                  />
                ) : null}
                <CheckBadge selected={selected} color={foreground} />
              </View>
            )
      }
    />
  )
}

const CHECK_MARK = "✓"

function CheckBadge({ selected, color }: { selected: boolean; color: string }) {
  const { themed } = useAppTheme()
  return (
    <View
      testID={selected ? "choice-check-on" : "choice-check-off"}
      style={[themed($badge), selected && { borderColor: color }]}
    >
      {selected ? <Text size="xxs" text={CHECK_MARK} style={[themed($check), { color }]} /> : null}
    </View>
  )
}

const $choice: ThemedStyle<ViewStyle> = ({ colors, spacing, radius }) => ({
  minHeight: 56,
  borderRadius: radius.lg,
  justifyContent: "flex-start",
  paddingHorizontal: spacing.sm,
  borderWidth: 2,
  borderColor: colors.border,
  backgroundColor: colors.palette.neutral100,
})
const $compactChoice: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 48,
  minWidth: 56,
  justifyContent: "center",
  paddingHorizontal: spacing.xs,
})
const $compactLabel: ThemedStyle<TextStyle> = () => ({ textAlign: "center", flexShrink: 1 })
const $choicePressed: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.palette.neutral200,
})
const $choiceSelectedPressed: ThemedStyle<ViewStyle> = () => ({ opacity: 0.85 })
const $choiceLabel: ThemedStyle<TextStyle> = () => ({
  textAlign: "left",
  flexGrow: 1,
  flexShrink: 1,
})
const $leading: ThemedStyle<ViewStyle> = ({ spacing }) => ({ marginEnd: spacing.sm })
const $trailing: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  marginStart: spacing.sm,
})
const $badge: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: 22,
  height: 22,
  borderRadius: 11,
  borderWidth: 2,
  borderColor: colors.border,
  alignItems: "center",
  justifyContent: "center",
})
const $check: ThemedStyle<TextStyle> = () => ({ lineHeight: 18 })
const $detail: ThemedStyle<TextStyle> = () => ({ opacity: 0.75 })
const $shrink = { flexShrink: 1 } as const
