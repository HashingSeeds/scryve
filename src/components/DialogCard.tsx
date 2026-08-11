import { useRef, type ReactNode } from "react"
import type {
  AccessibilityRole,
  LayoutChangeEvent,
  StyleProp,
  TextStyle,
  ViewStyle,
} from "react-native"
import { Modal, Pressable, StyleSheet, View } from "react-native"
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated"

import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { useReducedMotion } from "@/utils/useReducedMotion"
import { useSafeAreaInsetsStyle } from "@/utils/useSafeAreaInsetsStyle"

export interface DialogOrigin {
  x: number
  y: number
}

export interface DialogCardProps {
  visible: boolean
  onClose: () => void
  closeDisabled?: boolean
  backdropTestID?: string
  backdropAccessibilityLabel?: string
  dialogTestID?: string
  dialogAccessibilityRole?: AccessibilityRole
  accessibilityViewIsModal?: boolean
  wide?: boolean
  origin?: DialogOrigin
  style?: StyleProp<ViewStyle>
  children: ReactNode
}

const ENTRANCE_START_SCALE = 0.5
const ENTRANCE_SPRING = { damping: 16, stiffness: 200, mass: 0.7 } as const

const claimTouchesSoTheBackdropNeverSeesThem = () => true

export function DialogCard({
  visible,
  onClose,
  closeDisabled = false,
  backdropTestID,
  backdropAccessibilityLabel,
  dialogTestID,
  dialogAccessibilityRole,
  accessibilityViewIsModal,
  wide,
  origin,
  style,
  children,
}: DialogCardProps) {
  const { themed } = useAppTheme()
  const safeAreaInsets = useSafeAreaInsetsStyle(["top", "bottom"], "margin")
  const reducedMotion = useReducedMotion()
  const animateFromOrigin = Boolean(origin) && reducedMotion === false
  const entrance = useSharedValue(animateFromOrigin ? 0 : 1)
  const cardCenterX = useSharedValue(0)
  const cardCenterY = useSharedValue(0)
  const launched = useRef(false)

  function launchFromOrigin(event: LayoutChangeEvent) {
    const { x, y, width, height } = event.nativeEvent.layout
    cardCenterX.value = x + width / 2
    cardCenterY.value = y + height / 2
    if (launched.current || !animateFromOrigin) return
    launched.current = true
    entrance.value = withSpring(1, ENTRANCE_SPRING)
  }
  const entranceStyle = useAnimatedStyle(() => {
    const remaining = 1 - entrance.value
    return {
      opacity: entrance.value,
      transform: [
        { translateX: origin ? (origin.x - cardCenterX.value) * remaining : 0 },
        { translateY: origin ? (origin.y - cardCenterY.value) * remaining : 0 },
        { scale: ENTRANCE_START_SCALE + (1 - ENTRANCE_START_SCALE) * entrance.value },
      ],
    }
  })

  if (!visible) return null

  const requestClose = () => {
    if (!closeDisabled) onClose()
  }

  return (
    <Modal
      transparent
      animationType={animateFromOrigin ? "none" : "fade"}
      onRequestClose={requestClose}
    >
      <View style={$dialogFill}>
        <Pressable
          testID={backdropTestID}
          accessibilityRole="button"
          accessibilityLabel={backdropAccessibilityLabel}
          style={[StyleSheet.absoluteFill, themed($dialogBackdrop)]}
          onPress={requestClose}
        />
        <View pointerEvents="box-none" style={[themed($dialogLayout), safeAreaInsets]}>
          <Animated.View
            testID={dialogTestID}
            accessibilityRole={dialogAccessibilityRole}
            accessibilityViewIsModal={accessibilityViewIsModal}
            style={[themed($dialog), wide ? themed($wideDialog) : undefined, style, entranceStyle]}
            onLayout={launchFromOrigin}
            onStartShouldSetResponder={claimTouchesSoTheBackdropNeverSeesThem}
          >
            {children}
          </Animated.View>
        </View>
      </View>
    </Modal>
  )
}

const $dialogFill: ViewStyle = { flex: 1 }
const $dialogBackdrop: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.palette.overlay50,
})
const $dialogLayout: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  alignItems: "center",
  justifyContent: "center",
  padding: spacing.lg,
})
const $dialog: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  width: "100%",
  maxWidth: 420,
  maxHeight: "100%",
  gap: spacing.lg,
  padding: spacing.lg,
  borderRadius: spacing.lg,
  borderWidth: 1,
  borderColor: colors.separator,
  backgroundColor: colors.background,
  shadowColor: colors.palette.neutral900,
  shadowOffset: { width: 0, height: spacing.xxs },
  shadowOpacity: 0.35,
  shadowRadius: spacing.md,
  elevation: 16,
})
const $wideDialog: ThemedStyle<ViewStyle> = () => ({ maxWidth: 520 })

export const $dialogText: ThemedStyle<TextStyle> = () => ({ textAlign: "center" })
export const $dialogActions: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.xs,
})
export const $dialogButton: ThemedStyle<ViewStyle> = () => ({ flex: 1, minHeight: 48 })
