import { useEffect, useRef } from "react"
import type { ViewStyle } from "react-native"

import { DialogCard } from "./DialogCard"
import type { SheetProps } from "./sheetTypes"

// why: web has no swipe to close, and @expo/ui's web sheet sits in the top layer above RN Modal pickers.
export function Sheet({
  visible,
  onClose,
  onDismissed,
  size = "fit",
  dismissible = true,
  edgeToEdge = false,
  testID,
  children,
}: SheetProps) {
  const onScreen = useRef(visible)
  const latestOnDismissed = useRef(onDismissed)
  latestOnDismissed.current = onDismissed
  if (visible) onScreen.current = true
  useEffect(
    () => () => {
      if (onScreen.current) latestOnDismissed.current?.()
    },
    [],
  )
  return (
    <DialogCard
      visible={visible}
      onClose={onClose}
      onDismissed={() => {
        onScreen.current = false
        latestOnDismissed.current?.()
      }}
      closeDisabled={!dismissible}
      placement="bottom"
      wide
      dialogTestID={testID}
      accessibilityViewIsModal
      style={[size === "full" ? $full : undefined, edgeToEdge ? $edgeToEdge : undefined]}
    >
      {children}
    </DialogCard>
  )
}

const $full: ViewStyle = { height: "88%" }
const $edgeToEdge: ViewStyle = { paddingHorizontal: 0 }
