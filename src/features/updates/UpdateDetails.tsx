import type { TextStyle, ViewStyle } from "react-native"
import { Pressable, View } from "react-native"

import { ConfirmDialog } from "@/components/ConfirmDialog"
import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { restartToUpdate } from "./appUpdate"

export function UpdateInfoButton({ onPress }: { onPress: () => void }) {
  const { themed } = useAppTheme()
  return (
    <Pressable
      testID="update-info-button"
      accessibilityRole="button"
      accessibilityLabel="What's in this update"
      hitSlop={12}
      style={themed($info)}
      onPress={onPress}
    >
      <Text text="i" size="xxs" weight="bold" style={themed($infoText)} />
    </Pressable>
  )
}

export function UpdateDetailsDialog({
  visible,
  notes,
  onClose,
}: {
  visible: boolean
  notes: string[]
  onClose: () => void
}) {
  const { themed } = useAppTheme()
  return (
    <ConfirmDialog
      visible={visible}
      title="Update ready"
      message="Applies the next time you open Scryve. Your game is saved either way."
      confirmText="Restart now"
      cancelText="Later"
      dialogTestID="update-details-dialog"
      confirmTestID="update-restart-button"
      notice={
        notes.length > 0 ? (
          <View testID="update-release-notes" style={themed($notes)}>
            {notes.map((note) => (
              <Text key={note} size="sm" text={`• ${note}`} />
            ))}
          </View>
        ) : null
      }
      onConfirm={restartToUpdate}
      onClose={onClose}
    />
  )
}

const $info: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: 20,
  height: 20,
  borderRadius: 10,
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
