import type { ReactNode } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { ScrollView, useWindowDimensions, View } from "react-native"

import { translate } from "@/i18n/translate"
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
  backdropAccessibilityLabel: string
  onConfirm: () => void
  onClose: () => void
}

export function ConfirmDialog({
  visible,
  title,
  message,
  confirmText,
  cancelText = translate("common:cancel"),
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
  // why: at the largest text sizes the copy outgrows the screen and pushed the buttons off it, and side-by-side buttons broke mid-word.
  const large = useWindowDimensions().fontScale > LARGE_FONT_SCALE
  return (
    <DialogCard
      visible={visible}
      onClose={onClose}
      closeDisabled={busy}
      origin={origin}
      backdropTestID={backdropTestID}
      backdropAccessibilityLabel={backdropAccessibilityLabel}
      dialogTestID={dialogTestID}
      dialogAccessibilityRole="alert"
      accessibilityViewIsModal
      style={themed($confirm)}
    >
      <ScrollView style={$copyScroll} contentContainerStyle={themed($copy)}>
        <Text preset="subheading" text={title} />
        {message ? <Text size="sm" style={themed($message)} text={message} /> : null}
        {notice}
      </ScrollView>
      <View style={[themed($actions), large && $stackedActions]}>
        <Button
          testID={cancelTestID}
          text={cancelText}
          style={[themed($action), large && $stackedAction]}
          disabled={busy}
          onPress={onClose}
        />
        <Button
          testID={confirmTestID}
          text={confirmText}
          preset={destructive ? "destructive" : "primary"}
          style={[themed($action), large && $stackedAction]}
          disabled={busy || confirmDisabled}
          onPress={onConfirm}
        />
      </View>
    </DialogCard>
  )
}

const LARGE_FONT_SCALE = 1.35

const $copyScroll: ViewStyle = { flexGrow: 0, flexShrink: 1 }
const $stackedActions: ViewStyle = { flexDirection: "column-reverse" }
const $stackedAction: ViewStyle = { flex: 0 }
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
