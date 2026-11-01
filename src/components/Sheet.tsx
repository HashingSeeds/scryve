import { useEffect, useRef, type ReactNode } from "react"
import { View } from "react-native"
import type { ViewStyle } from "react-native"
import { BottomSheet, RNHostView } from "@expo/ui"

import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

export interface SheetProps {
  visible: boolean
  onClose: () => void
  onDismissed?: () => void
  testID?: string
  children: ReactNode
}

// why: unmounting a presented native sheet skips its exit animation; keep it mounted, toggle `visible`.
export function Sheet({ visible, onClose, onDismissed, testID, children }: SheetProps) {
  const { theme, themed } = useAppTheme()
  const wasVisible = useRef(visible)
  useEffect(() => {
    if (wasVisible.current && !visible) onDismissed?.()
    wasVisible.current = visible
  }, [visible, onDismissed])
  return (
    <BottomSheet
      isPresented={visible}
      onDismiss={onClose}
      snapPoints={["full"]}
      containerColor={theme.colors.surface}
      contentPadding={0}
    >
      <RNHostView>
        <View testID={testID} style={themed($body)}>
          {children}
        </View>
      </RNHostView>
    </BottomSheet>
  )
}

const $body: ThemedStyle<ViewStyle> = ({ spacing }) => ({ flex: 1, gap: spacing.sm })
