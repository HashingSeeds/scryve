import type { ReactNode } from "react"
import { View } from "react-native"
import type { ViewStyle } from "react-native"
import { BottomSheet, RNHostView } from "@expo/ui"

import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

// why: unmounting a presented native sheet skips its exit animation; keep it mounted, toggle `visible`.
export function Sheet({
  visible,
  onClose,
  testID,
  children,
}: {
  visible: boolean
  onClose: () => void
  testID?: string
  children: ReactNode
}) {
  const { theme, themed } = useAppTheme()
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
