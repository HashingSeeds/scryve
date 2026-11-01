import { View } from "react-native"
import type { ViewStyle } from "react-native"
import { BottomSheet, Group, Host, RNHostView } from "@expo/ui/swift-ui"
import {
  frame,
  presentationBackground,
  presentationDetents,
  presentationDragIndicator,
} from "@expo/ui/swift-ui/modifiers"

import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import type { SheetProps } from "./sheetTypes"

// why: the universal BottomSheet drops SwiftUI's onDismiss, and iOS can't present a Modal before it fires.
export function Sheet({ visible, onClose, onDismissed, testID, children }: SheetProps) {
  const { theme, themed } = useAppTheme()
  return (
    <Host style={$host} pointerEvents="none">
      <BottomSheet
        isPresented={visible}
        onIsPresentedChange={(presented) => {
          if (!presented) onClose()
        }}
        onDismiss={onDismissed}
      >
        <Group
          modifiers={[
            frame({ maxWidth: Infinity, alignment: "topLeading" }),
            presentationDragIndicator("visible"),
            presentationDetents(["large"]),
            presentationBackground(theme.colors.surface),
          ]}
        >
          <RNHostView>
            <View testID={testID} style={themed($body)}>
              {children}
            </View>
          </RNHostView>
        </Group>
      </BottomSheet>
    </Host>
  )
}

const $host: ViewStyle = { position: "absolute" }
const $body: ThemedStyle<ViewStyle> = ({ spacing }) => ({ flex: 1, gap: spacing.sm })
