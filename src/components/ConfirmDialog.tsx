import type { ReactNode } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"

import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { Button } from "./Button"
import { CHOICE_RADIUS } from "./ChoiceButton"
import { DialogCard, type DialogOrigin } from "./DialogCard"
import { Text } from "./Text"

export interface ConfirmDialogProps {
  visible: boolean
  title: string
  message?: string
  confirmText: string
  cancelText?: string
  destructive?: boolean
  busy?: boolean
  confirmDisabled?: boolean
  origin?: DialogOrigin
  notice?: ReactNode
  dialogTestID?: string
  confirmTestID?: string
  cancelTestID?: string
  backdropTestID?: string
  backdropAccessibilityLabel?: string
  onConfirm: () => void
  onClose: () => void
}

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmText,
  cancelText = "Cancel",
  destructive = false,
  busy = false,
  confirmDisabled = false,
  origin,
  notice,
  dialogTestID,
  confirmTestID,
  cancelTestID,
  backdropTestID,
  backdropAccessibilityLabel,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const { themed } = useAppTheme()
  return (
    <DialogCard
      visible={visible}
      onClose={onClose}
      closeDisabled={busy}
      origin={origin}
      backdropTestID={backdropTestID}
      backdropAccessibilityLabel={backdropAccessibilityLabel ?? `Cancel ${title.toLowerCase()}`}
      dialogTestID={dialogTestID}
      dialogAccessibilityRole="alert"
      accessibilityViewIsModal
      style={themed($confirm)}
    >
      <View style={themed($copy)}>
        <Text preset="subheading" text={title} />
        {message ? <Text size="sm" style={themed($message)} text={message} /> : null}
      </View>
      {notice}
      <View style={themed($actions)}>
        <Button
          testID={cancelTestID}
          text={cancelText}
          style={themed($action)}
          disabled={busy}
          onPress={onClose}
        />
        <Button
          testID={confirmTestID}
          text={confirmText}
          preset="reversed"
          style={[themed($action), destructive && themed($destructiveAction)]}
          disabled={busy || confirmDisabled}
          onPress={onConfirm}
        />
      </View>
    </DialogCard>
  )
}

const $confirm: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.md })
const $copy: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xxs })
const $message: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $actions: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.xs,
})
const $action: ThemedStyle<ViewStyle> = () => ({
  flex: 1,
  minHeight: 48,
  borderRadius: CHOICE_RADIUS,
})
const $destructiveAction: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.error,
  borderColor: colors.error,
})
