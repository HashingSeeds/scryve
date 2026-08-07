import type { ReactNode } from "react"
import type { AccessibilityRole, StyleProp, TextStyle, ViewStyle } from "react-native"
import { Modal, Pressable } from "react-native"

import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

export interface AppDialogProps {
  visible: boolean
  onClose: () => void
  closeDisabled?: boolean
  backdropTestID?: string
  backdropAccessibilityLabel?: string
  dialogTestID?: string
  dialogAccessibilityRole?: AccessibilityRole
  accessibilityViewIsModal?: boolean
  wide?: boolean
  style?: StyleProp<ViewStyle>
  children: ReactNode
}

export function AppDialog({
  visible,
  onClose,
  closeDisabled = false,
  backdropTestID,
  backdropAccessibilityLabel,
  dialogTestID,
  dialogAccessibilityRole,
  accessibilityViewIsModal,
  wide,
  style,
  children,
}: AppDialogProps) {
  const { themed } = useAppTheme()

  if (!visible) return null

  const requestClose = () => {
    if (!closeDisabled) onClose()
  }

  return (
    <Modal transparent animationType="fade" onRequestClose={requestClose}>
      <Pressable
        testID={backdropTestID}
        accessibilityRole="button"
        accessibilityLabel={backdropAccessibilityLabel}
        style={themed($dialogBackdrop)}
        onPress={requestClose}
      >
        <Pressable
          testID={dialogTestID}
          accessibilityRole={dialogAccessibilityRole}
          accessibilityViewIsModal={accessibilityViewIsModal}
          style={[themed($dialog), wide ? themed($wideDialog) : undefined, style]}
          onPress={() => {}}
        >
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  )
}

const $dialogBackdrop: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flex: 1,
  alignItems: "center",
  justifyContent: "center",
  padding: spacing.lg,
  backgroundColor: colors.palette.overlay50,
})
const $dialog: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  width: "100%",
  maxWidth: 420,
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
