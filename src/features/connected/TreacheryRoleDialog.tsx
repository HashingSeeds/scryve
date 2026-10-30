import { useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"

import { Button } from "@/components/Button"
import { DialogCard, type DialogOrigin } from "@/components/DialogCard"
import { Text } from "@/components/Text"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { convexErrorMessage } from "@/utils/convexError"

import type { TreacheryRole } from "../../../convex/lib/treachery"

export const treacheryRoleLabel = (role: TreacheryRole) =>
  translate(`connected:treachery.roles.${role}`)

export function TreacheryRoleDialog({
  role,
  revealed,
  canReveal,
  online,
  origin,
  onReveal,
  onClose,
}: {
  role: TreacheryRole
  revealed: boolean
  canReveal: boolean
  online: boolean
  origin?: DialogOrigin
  onReveal: () => Promise<unknown>
  onClose: () => void
}) {
  const { themed } = useAppTheme()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  async function revealRole() {
    if (!confirming) {
      setConfirming(true)
      return
    }
    try {
      setBusy(true)
      setError(undefined)
      await onReveal()
      setConfirming(false)
    } catch (cause) {
      setError(convexErrorMessage(cause, translate("connected:treachery.revealFailed")))
    } finally {
      setBusy(false)
    }
  }

  return (
    <DialogCard
      visible
      onClose={onClose}
      origin={origin}
      backdropTestID="treachery-role-backdrop"
      backdropAccessibilityLabel={translate("connected:treachery.hideRole")}
      dialogTestID="treachery-role-dialog"
      style={themed($dialog)}
    >
      <Text testID="treachery-role" preset="heading" text={treacheryRoleLabel(role)} />
      <Text tx={`connected:treachery.goals.${role}`} />
      <Text
        size="xs"
        style={themed($muted)}
        tx={
          revealed
            ? "connected:treachery.faceUp"
            : canReveal && !online
              ? "connected:treachery.hiddenOffline"
              : "connected:treachery.hidden"
        }
      />
      {error ? <Text testID="treachery-role-error" accessibilityRole="alert" text={error} /> : null}
      <View style={themed($actions)}>
        <Button tx="connected:treachery.hide" style={themed($action)} onPress={onClose} />
        {canReveal && !revealed ? (
          <Button
            testID="reveal-role-button"
            tx={
              busy
                ? "connected:treachery.revealing"
                : confirming
                  ? "connected:treachery.revealConfirm"
                  : "connected:treachery.reveal"
            }
            preset={confirming ? "primary" : "secondary"}
            disabled={busy || !online}
            style={themed($action)}
            onPress={() => void revealRole()}
          />
        ) : null}
      </View>
    </DialogCard>
  )
}

const $dialog: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.sm })
const $actions: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.sm,
  marginTop: spacing.xs,
})
const $action: ThemedStyle<ViewStyle> = () => ({ flex: 1, minHeight: 48 })
const $muted: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
