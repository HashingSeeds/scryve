import { TouchableOpacity } from "react-native"
import type { TextStyle, TouchableOpacityProps, ViewStyle } from "react-native"

import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { Text, type TextProps } from "./Text"

export function TextAction({
  tx,
  text,
  txOptions,
  size = "sm",
  disabled,
  style,
  ...rest
}: Omit<TouchableOpacityProps, "children"> &
  Pick<TextProps, "tx" | "text" | "txOptions" | "size">) {
  const { themed } = useAppTheme()
  return (
    <TouchableOpacity
      accessibilityRole="button"
      {...rest}
      disabled={disabled}
      accessibilityState={{ ...rest.accessibilityState, disabled: Boolean(disabled) }}
      style={[$touch, style]}
    >
      <Text
        tx={tx}
        text={text}
        txOptions={txOptions}
        size={size}
        weight="medium"
        style={[themed($label), disabled && $disabled]}
      />
    </TouchableOpacity>
  )
}

const $touch: ViewStyle = { minWidth: 44, minHeight: 44, justifyContent: "center" }
const $label: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.brandText })
const $disabled: TextStyle = { opacity: 0.4 }
