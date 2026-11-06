import { useEffect } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { AccessibilityInfo, Platform, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { Button } from "@/components/Button"
import { Text } from "@/components/Text"
import type { TxKeyPath } from "@/i18n"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

const VISIBLE_MS = 6_000

/** why: `inline` drops the toast's own top-of-screen placement, for a parent that places it, as the game board does. A `persistent` toast stays until its owner removes it. */
export function GameToast({
  message,
  actionTx,
  testID,
  actionTestID,
  inline = false,
  visibleMs = VISIBLE_MS,
  onAction,
  onDismiss,
}: {
  message: string
  actionTx: TxKeyPath
  testID: string
  actionTestID: string
  inline?: boolean
  visibleMs?: number
  onAction: () => void
} & ({ persistent?: false; onDismiss: () => void } | { persistent: true; onDismiss?: never })) {
  const { themed, theme } = useAppTheme()
  const insets = useSafeAreaInsets()
  useEffect(() => {
    if (Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(message)
    if (!onDismiss) return
    let active = true
    let timeout: ReturnType<typeof setTimeout> | undefined
    const schedule = (ms: number) => {
      if (active) timeout = setTimeout(onDismiss, ms)
    }
    // why: Android users can ask for more time to act on notifications; react-native-web lacks this API.
    if (Platform.OS === "android")
      AccessibilityInfo.getRecommendedTimeoutMillis(visibleMs).then(schedule, () =>
        schedule(visibleMs),
      )
    else schedule(visibleMs)
    return () => {
      active = false
      clearTimeout(timeout)
    }
  }, [message, onDismiss, visibleMs])

  const toast = (
    <View testID={testID} accessibilityLiveRegion="polite" style={themed($toast)}>
      <Text size="xs" weight="medium" text={message} style={themed($message)} />
      <Button
        testID={actionTestID}
        tx={actionTx}
        style={themed($action)}
        textStyle={themed($actionText)}
        onPress={() => {
          onDismiss?.()
          onAction()
        }}
      />
    </View>
  )
  if (inline) return toast
  return (
    <View pointerEvents="box-none" style={[themed($layer), { top: insets.top + theme.spacing.md }]}>
      {toast}
    </View>
  )
}

const $layer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  position: "absolute",
  left: spacing.md,
  right: spacing.md,
  zIndex: 80,
  elevation: 80,
  alignItems: "center",
})
const $toast: ThemedStyle<ViewStyle> = ({ colors, spacing, radius }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  maxWidth: 420,
  minHeight: 44,
  paddingVertical: spacing.xs,
  paddingLeft: spacing.sm,
  paddingRight: spacing.xs,
  borderWidth: 1,
  borderColor: colors.separator,
  borderRadius: radius.sm,
  backgroundColor: colors.surface,
})
const $message: ThemedStyle<TextStyle> = () => ({ flexShrink: 1 })
const $action: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 32,
  paddingVertical: spacing.xxs,
  paddingHorizontal: spacing.xs,
})
const $actionText: ThemedStyle<TextStyle> = () => ({ fontSize: 13, lineHeight: 16 })
