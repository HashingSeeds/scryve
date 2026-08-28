import { useEffect, useRef } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { AccessibilityInfo, Platform, View } from "react-native"

import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { Text } from "./Text"

export type ConnectionStatus = "local" | "connected" | "syncing" | "offline"

export function ConnectionBadge({
  status = "local",
  pendingCount = 0,
  failedCount = 0,
}: {
  status?: ConnectionStatus
  pendingCount?: number
  failedCount?: number
}) {
  const { themed } = useAppTheme()
  const visibleLabel =
    failedCount > 0
      ? `Needs attention (${failedCount})`
      : status === "local"
        ? "On this device"
        : status === "syncing"
          ? `Syncing${pendingCount ? ` (${pendingCount})` : ""}`
          : status[0].toUpperCase() + status.slice(1)
  const pendingLabel = pendingCount
    ? `${pendingCount} ${pendingCount === 1 ? "change" : "changes"} pending`
    : undefined
  const failedLabel = failedCount
    ? `${failedCount} failed ${failedCount === 1 ? "change" : "changes"}`
    : undefined
  const accessibilityLabel = [visibleLabel.replace(/ \(\d+\)$/, ""), failedLabel, pendingLabel]
    .filter(Boolean)
    .join(", ")
  const previousStatus = useRef(status)
  const previousFailedCount = useRef(failedCount)
  useEffect(() => {
    const meaningfulChange =
      previousStatus.current !== status || previousFailedCount.current !== failedCount
    previousStatus.current = status
    previousFailedCount.current = failedCount
    if (meaningfulChange && Platform.OS === "ios") {
      AccessibilityInfo.announceForAccessibility(accessibilityLabel)
    }
  }, [accessibilityLabel, failedCount, status])
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel}
      accessibilityLiveRegion="polite"
      style={themed($badge)}
    >
      <View style={themed([$dot, status === "offline" || failedCount ? $offline : $ready])} />
      <Text text={visibleLabel} size="xxs" style={themed($label)} />
    </View>
  )
}

const $badge: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  alignSelf: "center",
  gap: spacing.xxs,
  paddingHorizontal: spacing.sm,
  paddingVertical: spacing.xxs,
  borderRadius: spacing.md,
  borderWidth: 1,
  borderColor: colors.separator,
})
const $dot: ThemedStyle<ViewStyle> = () => ({ width: 8, height: 8, borderRadius: 4 })
const $ready: ThemedStyle<ViewStyle> = ({ colors }) => ({ backgroundColor: colors.success })
const $offline: ThemedStyle<ViewStyle> = ({ colors }) => ({ backgroundColor: colors.error })
const $label: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
