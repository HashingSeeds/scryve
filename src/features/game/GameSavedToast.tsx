import { useEffect } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { AccessibilityInfo, Platform, View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { Button } from "@/components/Button"
import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

const VISIBLE_MS = 6_000

export function GameSavedToast({
  onViewSummary,
  onDismiss,
}: {
  onViewSummary: () => void
  onDismiss: () => void
}) {
  const { themed, theme } = useAppTheme()
  const insets = useSafeAreaInsets()
  useEffect(() => {
    if (Platform.OS === "ios") AccessibilityInfo.announceForAccessibility("Game saved")
    const timeout = setTimeout(onDismiss, VISIBLE_MS)
    return () => clearTimeout(timeout)
  }, [onDismiss])

  return (
    <View pointerEvents="box-none" style={[themed($layer), { top: insets.top + theme.spacing.md }]}>
      <View testID="game-saved-toast" accessibilityLiveRegion="polite" style={themed($toast)}>
        <Text size="xs" weight="medium" text="Game saved" style={themed($message)} />
        <Button
          testID="game-saved-summary-button"
          text="Summary"
          style={themed($action)}
          textStyle={themed($actionText)}
          onPress={() => {
            onDismiss()
            onViewSummary()
          }}
        />
      </View>
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
const $toast: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
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
  borderRadius: 4,
  backgroundColor: colors.surface,
})
const $message: ThemedStyle<TextStyle> = () => ({ flexShrink: 1 })
const $action: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 32,
  paddingVertical: spacing.xxs,
  paddingHorizontal: spacing.xs,
})
const $actionText: ThemedStyle<TextStyle> = () => ({ fontSize: 13, lineHeight: 16 })
