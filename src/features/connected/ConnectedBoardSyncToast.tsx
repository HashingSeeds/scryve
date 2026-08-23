import { useEffect, useRef, useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { AccessibilityInfo, Platform, View } from "react-native"

import { Button } from "@/components/Button"
import type { ConnectionStatus } from "@/components/ConnectionBadge"
import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

const SUCCESS_DURATION_MS = 2_500

type SyncToast = {
  kind: "failure" | "queued" | "syncing" | "success"
  message: string
}

function changeCount(count: number) {
  return `${count} ${count === 1 ? "change" : "changes"}`
}

export function ConnectedBoardSyncToast({
  connectionStatus,
  pendingCount,
  failedCount,
  changeError,
  onReview,
}: {
  connectionStatus: ConnectionStatus
  pendingCount: number
  failedCount: number
  changeError?: string
  onReview: () => void
}) {
  const { themed } = useAppTheme()
  const previousPendingCount = useRef(pendingCount)
  const [showSuccess, setShowSuccess] = useState(false)

  useEffect(() => {
    const completedSync =
      previousPendingCount.current > 0 &&
      pendingCount === 0 &&
      failedCount === 0 &&
      !changeError &&
      connectionStatus === "connected"
    previousPendingCount.current = pendingCount

    if (pendingCount > 0 || failedCount > 0 || changeError) {
      setShowSuccess(false)
      return
    }
    if (!completedSync) return

    setShowSuccess(true)
    const timeout = setTimeout(() => setShowSuccess(false), SUCCESS_DURATION_MS)
    return () => clearTimeout(timeout)
  }, [changeError, connectionStatus, failedCount, pendingCount])

  const toast: SyncToast | undefined =
    failedCount > 0 || changeError
      ? {
          kind: "failure",
          message:
            failedCount > 0
              ? `${changeCount(failedCount)} ${failedCount === 1 ? "needs" : "need"} attention`
              : "Changes need attention",
        }
      : pendingCount > 0 && connectionStatus === "offline"
        ? { kind: "queued", message: `${changeCount(pendingCount)} queued` }
        : pendingCount > 0
          ? { kind: "syncing", message: `Syncing ${changeCount(pendingCount)}\u2026` }
          : showSuccess
            ? { kind: "success", message: "Changes synced" }
            : undefined

  const toastKind = toast?.kind
  const toastMessage = toast?.message
  useEffect(() => {
    if (toastMessage && Platform.OS === "ios") {
      AccessibilityInfo.announceForAccessibility(toastMessage)
    }
  }, [toastKind, toastMessage])

  if (!toast) return null

  return (
    <View testID="connected-sync-toast-layer" pointerEvents="box-none" style={themed($layer)}>
      <View
        testID="connected-sync-toast"
        accessibilityRole={toast.kind === "failure" ? "alert" : "text"}
        accessibilityLabel={toast.message}
        accessibilityLiveRegion={toast.kind === "failure" ? "assertive" : "polite"}
        style={themed([$toast, toast.kind === "failure" && $failure])}
      >
        <Text size="xs" weight="medium" text={toast.message} style={themed($message)} />
        {toast.kind === "failure" ? (
          <Button
            testID="review-connected-sync-button"
            accessibilityLabel="Review sync issues"
            text="Review"
            preset="reversed"
            style={themed($review)}
            textStyle={themed($reviewText)}
            onPress={onReview}
          />
        ) : null}
      </View>
    </View>
  )
}

const $layer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  position: "absolute",
  top: spacing.md,
  left: spacing.md,
  right: spacing.md,
  zIndex: 20,
  elevation: 20,
  alignItems: "center",
})
const $toast: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  maxWidth: 420,
  minHeight: 40,
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  paddingVertical: spacing.xs,
  paddingHorizontal: spacing.sm,
  borderWidth: 1,
  borderColor: colors.palette.neutral700,
  borderRadius: 4,
  backgroundColor: colors.palette.neutral900,
})
const $failure: ThemedStyle<ViewStyle> = ({ colors }) => ({ borderColor: colors.error })
const $message: ThemedStyle<TextStyle> = ({ colors }) => ({
  flexShrink: 1,
  color: colors.palette.neutral100,
})
const $review: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  minHeight: 32,
  paddingVertical: spacing.xxs,
  paddingHorizontal: spacing.xs,
  borderColor: colors.palette.neutral100,
  backgroundColor: colors.transparent,
})
const $reviewText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
  fontSize: 13,
  lineHeight: 16,
})
