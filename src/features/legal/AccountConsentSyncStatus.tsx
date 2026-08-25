import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"

import { Button } from "@/components/Button"
import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

export function AccountConsentSyncStatus({
  isSyncing,
  retryFailed,
  onRetry,
}: {
  isSyncing: boolean
  retryFailed: boolean
  onRetry: () => void
}) {
  const { themed } = useAppTheme()
  const message = isSyncing
    ? "Syncing your agreement…"
    : retryFailed
      ? "Account sync is still pending. Your agreement is saved on this device."
      : "Agreement saved on this device. Account sync pending."

  return (
    <View
      testID="account-consent-sync-status"
      accessibilityLiveRegion="polite"
      style={themed($status)}
    >
      <Text size="xs" weight="medium" text={message} style={$message} />
      <Button
        testID="retry-account-consent-sync"
        text={isSyncing ? "Retrying…" : "Retry"}
        accessibilityLabel="Retry account consent sync"
        disabled={isSyncing}
        style={themed($retry)}
        textStyle={$retryText}
        onPress={onRetry}
      />
    </View>
  )
}

const $status: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 48,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  gap: spacing.sm,
  paddingVertical: spacing.xs,
  paddingHorizontal: spacing.md,
  borderBottomWidth: 1,
  borderBottomColor: "#FFFFFF",
  backgroundColor: "#000000",
})
const $message: TextStyle = { flexShrink: 1, color: "#FFFFFF" }
const $retry: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 32,
  paddingVertical: spacing.xxs,
  paddingHorizontal: spacing.sm,
  borderColor: "#FFFFFF",
  backgroundColor: "#000000",
})
const $retryText: TextStyle = { color: "#FFFFFF", fontSize: 13, lineHeight: 16 }
