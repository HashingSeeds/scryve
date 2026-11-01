import { useEffect, useRef } from "react"
import { useWindowDimensions } from "react-native"
import type { ViewStyle } from "react-native"
import { BottomSheet, Group, Host, RNHostView } from "@expo/ui/swift-ui"
import {
  frame,
  interactiveDismissDisabled,
  presentationBackground,
  presentationDetents,
  presentationDragIndicator,
} from "@expo/ui/swift-ui/modifiers"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { useKeyboardState } from "react-native-keyboard-controller"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import type { SheetProps } from "./sheetTypes"

// why: the universal BottomSheet drops SwiftUI's onDismiss, and iOS can't present a Modal before it fires.
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
  const { height } = useWindowDimensions()
  const { top, bottom } = useSafeAreaInsets()
  const keyboard = useKeyboardState((state) => (state.isVisible ? state.height : 0))
  const fit = size === "fit"
  const onScreen = useRef(false)
  const visibleNow = useRef(visible)
  visibleNow.current = visible
  const goneBeforeClose = useRef(false)
  const latestOnDismissed = useRef(onDismissed)
  latestOnDismissed.current = onDismissed
  if (visible) onScreen.current = true
  const reportDismissed = () => {
    onScreen.current = false
    goneBeforeClose.current = false
    latestOnDismissed.current?.()
  }
  // why: a swipe fires SwiftUI's onDismiss before isPresented changes, so report it once the caller has closed.
  useEffect(() => {
    if (!visible && goneBeforeClose.current) reportDismissed()
  }, [visible])
  useEffect(
    () => () => {
      if (onScreen.current) latestOnDismissed.current?.()
    },
    [],
  )
  return (
    <Host style={$host} pointerEvents="none">
      <BottomSheet
        isPresented={visible}
        onIsPresentedChange={(presented) => {
          if (!presented && !goneBeforeClose.current) onClose()
        }}
        onDismiss={() => {
          if (!visibleNow.current) return reportDismissed()
          goneBeforeClose.current = true
          onClose()
        }}
        fitToContents={fit}
      >
        <Group
          modifiers={[
            frame({ maxWidth: Infinity, alignment: "topLeading" }),
            presentationDragIndicator("visible"),
            ...(fit ? [] : [presentationDetents(["large"])]),
            presentationBackground(theme.colors.surface),
            interactiveDismissDisabled(!dismissible),
          ]}
        >
          <RNHostView matchContents={fit ? { vertical: true } : false}>
            <GestureHandlerRootView
              testID={testID}
              style={[
                themed(edgeToEdge ? $edgeToEdge : $padded),
                fit
                  ? { maxHeight: height - top - Math.max(bottom, keyboard) - FIT_TOP_GAP }
                  : $fill,
              ]}
            >
              {children}
            </GestureHandlerRootView>
          </RNHostView>
        </Group>
      </BottomSheet>
    </Host>
  )
}

const FIT_TOP_GAP = 24
const $host: ViewStyle = { position: "absolute" }
const $fill: ViewStyle = { flex: 1 }
const $padded: ThemedStyle<ViewStyle> = ({ spacing }) => ({ padding: spacing.lg, gap: spacing.lg })
const $edgeToEdge: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.sm })
