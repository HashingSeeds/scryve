import { useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"
import { useMutation } from "convex/react"

import { Button } from "@/components/Button"
import { DialogCard, type DialogOrigin } from "@/components/DialogCard"
import { Text } from "@/components/Text"
import { useConvexOnline } from "@/features/connected/useConvexOnline"
import { localGameRepository } from "@/features/game/localPersistence"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { convexErrorMessage } from "@/utils/convexError"

import { api } from "../../../convex/_generated/api"
import type { TreacheryRole } from "../../../convex/lib/treachery"

export const TREACHERY_ROLE_LABELS: Record<TreacheryRole, string> = {
  leader: "Leader",
  guardian: "Guardian",
  assassin: "Assassin",
  traitor: "Traitor",
}

const ROLE_GOALS: Record<TreacheryRole, string> = {
  leader: "Win once every Assassin and Traitor is out.",
  guardian: "Keep the Leader alive. You win with them.",
  assassin: "Win when the Leader is out.",
  traitor: "Be the last player standing.",
}

export function TreacheryRoleDialog({
  publicId,
  role,
  revealed,
  canReveal,
  origin,
  onClose,
}: {
  publicId: string
  role: TreacheryRole
  revealed: boolean
  canReveal: boolean
  origin?: DialogOrigin
  onClose: () => void
}) {
  const { themed } = useAppTheme()
  const reveal = useMutation(api.games.revealMyRole)
  const online = useConvexOnline()
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
      await reveal({ publicId, deviceId: localGameRepository.getDeviceId() })
      setConfirming(false)
    } catch (cause) {
      setError(convexErrorMessage(cause, "Could not reveal your role"))
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
      backdropAccessibilityLabel="Hide your role"
      dialogTestID="treachery-role-dialog"
      style={themed($dialog)}
    >
      <Text testID="treachery-role" preset="heading" text={TREACHERY_ROLE_LABELS[role]} />
      <Text text={ROLE_GOALS[role]} />
      <Text
        size="xs"
        style={themed($muted)}
        text={
          revealed
            ? "Face up for the table."
            : canReveal && !online
              ? "Hidden from the table. Reconnect to reveal it."
              : "Hidden from the table."
        }
      />
      {error ? <Text testID="treachery-role-error" accessibilityRole="alert" text={error} /> : null}
      <View style={themed($actions)}>
        <Button text="Hide" style={themed($action)} onPress={onClose} />
        {canReveal && !revealed ? (
          <Button
            testID="reveal-role-button"
            text={busy ? "Revealing…" : confirming ? "Reveal to all?" : "Reveal"}
            preset={confirming ? "reversed" : "default"}
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
