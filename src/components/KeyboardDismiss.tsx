import type { KeyboardDismissProps } from "./needsKeyboardDismiss"

// why: Android's back gesture and web's click-away already put the keyboard away.
export function KeyboardDismiss(_props: KeyboardDismissProps) {
  return null
}
