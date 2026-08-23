import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

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
  const {
    themed,
    theme: { spacing },
  } = useAppTheme()
  const insets = useSafeAreaInsets()
  const message = isSyncing
    ? "Syncing your agreement…"
    : retryFailed
      ? "Account sync is still pending. Your agreement is saved on this device."
      : "Agreement saved on this device. Account sync pending."

  return (
    <View
      testID="account-consent-sync-layer"
      pointerEvents="box-none"
      style={[themed($layer), { top: insets.top + spacing.xs }]}
    >
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
    </View>
  )
}

const $layer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  position: "absolute",
  left: spacing.xs,
  right: spacing.xs,
  zIndex: 100,
  elevation: 100,
  alignItems: "center",
})
const $status: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: "100%",
  maxWidth: 560,
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
