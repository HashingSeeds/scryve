import { useEffect, useRef, useState } from "react"
import { StyleSheet, useWindowDimensions } from "react-native"
import type { ViewStyle } from "react-native"
import {
  Column,
  Host,
  ModalBottomSheet,
  RNHostView,
  type ModalBottomSheetRef,
} from "@expo/ui/jetpack-compose"
import { fillMaxHeight } from "@expo/ui/jetpack-compose/modifiers"
import { GestureHandlerRootView } from "react-native-gesture-handler"
import { useKeyboardState } from "react-native-keyboard-controller"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import type { SheetProps } from "./sheetTypes"

// why: the universal BottomSheet neither reports when its hide animation ends nor can refuse a swipe.
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
  const sheet = useRef<ModalBottomSheetRef>(null)
  const [mounted, setMounted] = useState(visible)
  const latestOnDismissed = useRef(onDismissed)
  latestOnDismissed.current = onDismissed
  if (visible && !mounted) setMounted(true)
  const onScreen = useRef(mounted)
  onScreen.current = mounted
  useEffect(
    () => () => {
      if (onScreen.current) latestOnDismissed.current?.()
    },
    [],
  )

  useEffect(() => {
    if (visible || !mounted) return
    let cancelled = false
    void (sheet.current?.hide() ?? Promise.resolve()).then(() => {
      if (cancelled) return
      onScreen.current = false
      setMounted(false)
      latestOnDismissed.current?.()
    })
    return () => {
      cancelled = true
    }
  }, [visible, mounted])

  if (!mounted) return null
  const fit = size === "fit"
  return (
    <Host style={StyleSheet.absoluteFill} pointerEvents="none">
      <ModalBottomSheet
        ref={sheet}
        onDismissRequest={onClose}
        skipPartiallyExpanded
        sheetGesturesEnabled={dismissible}
        properties={{
          shouldDismissOnBackPress: dismissible,
          shouldDismissOnClickOutside: dismissible,
        }}
        containerColor={theme.colors.surface}
      >
        <Column modifiers={fit ? [] : [fillMaxHeight()]}>
          <RNHostView matchContents={fit ? { vertical: true } : false}>
            <GestureHandlerRootView
              testID={testID}
              style={[
                themed(edgeToEdge ? $edgeToEdge : $padded),
                fit
                  ? {
                      maxHeight:
                        height - top - Math.max(bottom, keyboard) - (FIT_TOP_GAP + DRAG_HANDLE),
                    }
                  : $fill,
              ]}
            >
              {children}
            </GestureHandlerRootView>
          </RNHostView>
        </Column>
      </ModalBottomSheet>
    </Host>
  )
}

const FIT_TOP_GAP = 24
// why: Material 3's drag handle takes 48dp above the content.
const DRAG_HANDLE = 48
const $fill: ViewStyle = { flex: 1 }
const $padded: ThemedStyle<ViewStyle> = ({ spacing }) => ({ padding: spacing.lg, gap: spacing.lg })
const $edgeToEdge: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.sm })
