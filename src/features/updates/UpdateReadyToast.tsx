import { useEffect, useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"
import { usePathname } from "expo-router"
import { useSafeAreaInsets } from "react-native-safe-area-context"

import { Button } from "@/components/Button"
import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import {
  markUpdateNoticed,
  restartToUpdate,
  useAppUpdate,
  useForegroundUpdateChecks,
  wasUpdateNoticed,
} from "./appUpdate"
import { UpdateDetailsDialog, UpdateInfoButton } from "./UpdateDetails"

const VISIBLE_MS = 8_000

function isNoticeHeldOn(pathname: string) {
  return (
    pathname === "/" ||
    pathname === "/game/current" ||
    pathname.startsWith("/connected/game/") ||
    pathname === "/settings"
  )
}

export function UpdateReadyToastWithForegroundChecks() {
  useForegroundUpdateChecks()
  const { themed, theme } = useAppTheme()
  const insets = useSafeAreaInsets()
  const pathname = usePathname()
  const update = useAppUpdate()
  const [visible, setVisible] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)

  const readyId = update.status === "ready" ? update.updateId : undefined
  const held = isNoticeHeldOn(pathname)
  useEffect(() => {
    if (!readyId || held || wasUpdateNoticed(readyId)) return
    markUpdateNoticed(readyId)
    setVisible(true)
  }, [held, readyId])

  useEffect(() => {
    if (!visible) return
    const timeout = setTimeout(() => setVisible(false), VISIBLE_MS)
    return () => clearTimeout(timeout)
  }, [visible])

  if (update.status !== "ready") return null

  return (
    <>
      {visible && !held ? (
        <View
          pointerEvents="box-none"
          style={[themed($layer), { top: insets.top + theme.spacing.md }]}
        >
          <View testID="update-ready-toast" accessibilityLiveRegion="polite" style={themed($toast)}>
            <Text size="xs" weight="medium" text="Update ready" style={themed($message)} />
            <UpdateInfoButton
              onPress={() => {
                setVisible(false)
                setDetailsOpen(true)
              }}
            />
            <Button
              testID="update-toast-restart-button"
              text="Restart"
              style={themed($restart)}
              textStyle={themed($restartText)}
              onPress={restartToUpdate}
            />
          </View>
        </View>
      ) : null}
      <UpdateDetailsDialog
        visible={detailsOpen}
        notes={update.notes}
        onClose={() => setDetailsOpen(false)}
      />
    </>
  )
}

const $layer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  position: "absolute",
  left: spacing.md,
  right: spacing.md,
  zIndex: 90,
  elevation: 90,
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
const $restart: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 32,
  paddingVertical: spacing.xxs,
  paddingHorizontal: spacing.xs,
})
const $restartText: ThemedStyle<TextStyle> = () => ({ fontSize: 13, lineHeight: 16 })
