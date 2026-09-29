import { useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"

import { Button } from "@/components/Button"
import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { restartToUpdate, useAppUpdate } from "./appUpdate"
import { UpdateDetailsDialog, UpdateInfoButton } from "./UpdateDetails"

export function AppUpdateStatus() {
  const { themed } = useAppTheme()
  const update = useAppUpdate()
  const [detailsOpen, setDetailsOpen] = useState(false)

  if (update.status === "idle") return null
  if (update.status === "downloading") {
    const percent = update.progress ? ` ${Math.round(update.progress * 100)}%` : "…"
    return (
      <Text
        testID="update-status"
        size="sm"
        accessibilityLiveRegion="polite"
        text={`Downloading update${percent}`}
        style={themed($row)}
      />
    )
  }
  return (
    <View testID="update-status" style={themed($row)}>
      <Text size="sm" weight="medium" text="Update ready" />
      <UpdateInfoButton onPress={() => setDetailsOpen(true)} />
      <View style={$spacer} />
      <Button
        testID="settings-update-restart-button"
        text="Restart"
        style={themed($restart)}
        textStyle={themed($restartText)}
        onPress={restartToUpdate}
      />
      <UpdateDetailsDialog
        visible={detailsOpen}
        notes={update.notes}
        onClose={() => setDetailsOpen(false)}
      />
    </View>
  )
}

const $row: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
  marginBottom: spacing.sm,
})
const $spacer: ViewStyle = { flex: 1 }
const $restart: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 36,
  paddingVertical: spacing.xxs,
  paddingHorizontal: spacing.sm,
})
const $restartText: ThemedStyle<TextStyle> = () => ({ fontSize: 14, lineHeight: 18 })
