import type { TextStyle, ViewStyle } from "react-native"
import { Pressable, ScrollView } from "react-native"

import { ConfirmDialog } from "@/components/ConfirmDialog"
import { Text } from "@/components/Text"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

const INFO_GLYPH = "i"
const NOTE_BULLET = "• "

export function UpdateInfoButton({ onPress }: { onPress: () => void }) {
  const { themed } = useAppTheme()
  const label = translate("account:updates.whatsNew")
  return (
    <Pressable
      testID="update-info-button"
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={12}
      style={themed($info)}
      onPress={onPress}
    >
      <Text text={INFO_GLYPH} size="xxs" weight="bold" style={themed($infoText)} />
    </Pressable>
  )
}

export function UpdateDetailsDialog({
  visible,
  notes,
  onRestart,
  onClose,
}: {
  visible: boolean
  notes: string[]
  onRestart: () => void
  onClose: () => void
}) {
  const { themed } = useAppTheme()
  const copy = {
    title: translate("account:updates.ready"),
    message: translate("account:updates.dialogMessage"),
    confirm: translate("account:updates.restartNow"),
    cancel: translate("account:updates.later"),
  }
  return (
    <ConfirmDialog
      visible={visible}
      title={copy.title}
      backdropAccessibilityLabel={translate("account:updates.cancelReady")}
      message={copy.message}
      confirmText={copy.confirm}
      cancelText={copy.cancel}
      dialogTestID="update-details-dialog"
      confirmTestID="update-restart-button"
      notice={
        notes.length > 0 ? (
          <ScrollView testID="update-release-notes" contentContainerStyle={themed($notes)}>
            {notes.map((note) => (
              <Text key={note} size="sm" text={NOTE_BULLET + note} />
            ))}
          </ScrollView>
        ) : null
      }
      onConfirm={() => {
        onClose()
        onRestart()
      }}
      onClose={onClose}
    />
  )
}

const $info: ThemedStyle<ViewStyle> = ({ colors, radius }) => ({
  width: 20,
  height: 20,
  borderRadius: radius.full,
  borderWidth: 1.5,
  borderColor: colors.textDim,
  alignItems: "center",
  justifyContent: "center",
})
const $infoText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  lineHeight: 14,
})
const $notes: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xxs })
