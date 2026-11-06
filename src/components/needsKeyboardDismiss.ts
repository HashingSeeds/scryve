import { Platform, type TextInputProps } from "react-native"

export type KeyboardDismissProps = { nativeID: string }

const NUMBER_PADS = new Set<TextInputProps["keyboardType"]>([
  "number-pad",
  "decimal-pad",
  "numeric",
  "phone-pad",
])

export function needsKeyboardDismiss({
  multiline,
  keyboardType,
  submitBehavior,
}: Pick<TextInputProps, "multiline" | "keyboardType" | "submitBehavior">) {
  if (Platform.OS !== "ios") return false
  if (NUMBER_PADS.has(keyboardType)) return true
  return (submitBehavior ?? (multiline ? "newline" : "blurAndSubmit")) !== "blurAndSubmit"
}
