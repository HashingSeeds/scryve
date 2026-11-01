import { useEffect, useRef } from "react"
import { View } from "react-native"
import type { ViewStyle } from "react-native"
import { BottomSheet, RNHostView } from "@expo/ui"

import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import type { SheetProps } from "./sheetTypes"

// why: Sheet.ios.tsx and Sheet.android.tsx cover native; this universal one serves web.
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
  const { theme, themed } = useAppTheme()
  const wasVisible = useRef(visible)
  const latestOnDismissed = useRef(onDismissed)
  latestOnDismissed.current = onDismissed
  useEffect(() => {
    if (wasVisible.current && !visible) latestOnDismissed.current?.()
    wasVisible.current = visible
  }, [visible])
  useEffect(
    () => () => {
      if (wasVisible.current) latestOnDismissed.current?.()
    },
    [],
  )
  return (
    <BottomSheet
      isPresented={visible}
      onDismiss={() => {
        if (dismissible) onClose()
      }}
      snapPoints={size === "full" ? ["full"] : undefined}
      containerColor={theme.colors.surface}
      contentPadding={0}
    >
      <RNHostView>
        <View
          testID={testID}
          style={[themed(edgeToEdge ? $edgeToEdge : $padded), size === "full" ? $fill : undefined]}
        >
          {children}
        </View>
      </RNHostView>
    </BottomSheet>
  )
}

const $fill: ViewStyle = { flex: 1 }
const $padded: ThemedStyle<ViewStyle> = ({ spacing }) => ({ padding: spacing.lg, gap: spacing.lg })
const $edgeToEdge: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.sm })
