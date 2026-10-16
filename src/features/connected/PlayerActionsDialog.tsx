import { useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { ScrollView, View } from "react-native"
import { useMutation } from "convex/react"

import { Button } from "@/components/Button"
import { ChoiceButton } from "@/components/ChoiceButton"
import { DialogCard, type DialogOrigin } from "@/components/DialogCard"
import { PlayerMark } from "@/components/PlayerMark"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import type { TxKeyPath } from "@/i18n"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { convexErrorMessage } from "@/utils/convexError"

import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import type { PlayerMarkShape } from "../../../convex/lib/appearance"

export interface ReportablePlayer {
  playerId: string
  seat: number
  displayName: string
  color: string
  shape?: PlayerMarkShape
  controlledByMe: boolean
}

const REPORT_REASONS = [
  { id: "offensive_username", labelTx: "connected:playerActions.reasons.offensiveUsername" },
  { id: "harassment", labelTx: "connected:playerActions.reasons.harassment" },
  { id: "impersonation", labelTx: "connected:playerActions.reasons.impersonation" },
  { id: "other", labelTx: "connected:playerActions.reasons.other" },
] as const satisfies readonly { id: string; labelTx: TxKeyPath }[]

type ReportReason = (typeof REPORT_REASONS)[number]["id"]

const NOTE_MAX_LENGTH = 500

/**
 * The Guideline 1.2 reporting surface. Blocking takes effect for the reporter immediately and
 * without review; the report itself goes to a queue the operator answers within 24 hours.
 */
export function PlayerActionsDialog({
  publicId,
  players,
  origin,
  onClose,
  onRole,
  onInvite,
}: {
  publicId: string
  players: ReportablePlayer[]
  origin?: DialogOrigin
  onClose: () => void
  onRole?: () => void
  onInvite?: () => void
}) {
  const { themed } = useAppTheme()
  const report = useMutation(api.moderation.reportPlayer)
  const block = useMutation(api.moderation.blockPlayer)
  const [selected, setSelected] = useState<ReportablePlayer>()
  const [reason, setReason] = useState<ReportReason>("offensive_username")
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [done, setDone] = useState<string>()

  const opponents = players.filter((player) => !player.controlledByMe)

  async function run(action: () => Promise<unknown>, confirmation: string) {
    try {
      setBusy(true)
      setError(undefined)
      await action()
      setDone(confirmation)
    } catch (cause) {
      setError(convexErrorMessage(cause, translate("connected:playerActions.requestFailed")))
    } finally {
      setBusy(false)
    }
  }

  return (
    <DialogCard
      visible
      onClose={onClose}
      closeDisabled={busy}
      origin={origin}
      backdropTestID="player-actions-backdrop"
      backdropAccessibilityLabel={translate("connected:playerActions.close")}
      dialogTestID="player-actions-dialog"
      style={themed($dialog)}
    >
      {done ? (
        <View style={themed($section)}>
          <Text preset="subheading" tx="connected:playerActions.thanks" />
          <Text testID="player-actions-confirmation" accessibilityRole="alert" text={done} />
          <Button tx="common:close" preset="reversed" onPress={onClose} />
        </View>
      ) : selected ? (
        <ScrollView
          style={themed($list)}
          contentContainerStyle={themed($section)}
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
        >
          <Text
            preset="subheading"
            tx="connected:playerActions.reportPlayer"
            txOptions={{ name: selected.displayName }}
          />
          <Text size="xs" style={themed($muted)} tx="connected:playerActions.reportExplanation" />
          <View style={themed($choices)}>
            {REPORT_REASONS.map((option) => (
              <ChoiceButton
                key={option.id}
                text={translate(option.labelTx)}
                selected={reason === option.id}
                onPress={() => setReason(option.id)}
              />
            ))}
          </View>
          <TextField
            labelTx="connected:playerActions.noteLabel"
            multiline
            maxLength={NOTE_MAX_LENGTH}
            value={note}
            onChangeText={setNote}
          />
          {error ? (
            <Text testID="player-actions-error" accessibilityRole="alert" text={error} />
          ) : null}
          <View style={themed($actions)}>
            <Button
              tx="common:back"
              disabled={busy}
              style={themed($action)}
              onPress={() => {
                setSelected(undefined)
                setError(undefined)
              }}
            />
            <Button
              testID="submit-player-report-button"
              tx={busy ? "connected:playerActions.sending" : "connected:playerActions.sendReport"}
              preset="reversed"
              disabled={busy}
              style={themed($action)}
              onPress={() =>
                run(
                  () =>
                    report({
                      publicId,
                      playerId: selected.playerId as Id<"gamePlayers">,
                      reason,
                      ...(note.trim() ? { note: note.trim() } : {}),
                    }),
                  translate("connected:playerActions.reportConfirmation", {
                    name: selected.displayName,
                  }),
                )
              }
            />
          </View>
        </ScrollView>
      ) : (
        <View style={themed($section)}>
          <Text preset="subheading" tx="connected:playerActions.title" />
          <Text size="xs" style={themed($muted)} tx="connected:playerActions.description" />
          {onRole ? (
            <Button
              testID="role-from-players-button"
              tx="connected:playerActions.yourRole"
              onPress={onRole}
            />
          ) : null}
          {onInvite ? (
            <Button
              testID="invite-from-players-button"
              tx="connected:invite.label"
              onPress={onInvite}
            />
          ) : null}
          {error ? (
            <Text testID="player-actions-error" accessibilityRole="alert" text={error} />
          ) : null}
          <ScrollView style={themed($list)}>
            {opponents.length === 0 ? (
              <Text size="xs" style={themed($muted)} tx="connected:playerActions.noOtherPlayers" />
            ) : null}
            {opponents.map((player) => (
              <View key={player.playerId} style={themed($row)}>
                <View style={themed($identity)}>
                  <PlayerMark
                    seatNumber={player.seat}
                    shape={player.shape}
                    color={player.color}
                    size={28}
                  />
                  <Text numberOfLines={1} text={player.displayName} style={themed($identityName)} />
                  <Text
                    size="xxs"
                    style={themed($muted)}
                    tx="connected:seatNumber"
                    txOptions={{ seat: player.seat }}
                  />
                </View>
                <View style={themed($actions)}>
                  <Button
                    testID={`report-player-seat-${player.seat}`}
                    tx="connected:playerActions.report"
                    disabled={busy}
                    style={themed($action)}
                    onPress={() => {
                      setSelected(player)
                      setError(undefined)
                    }}
                  />
                  <Button
                    testID={`block-player-seat-${player.seat}`}
                    tx="connected:playerActions.block"
                    disabled={busy}
                    style={themed($action)}
                    onPress={() =>
                      run(
                        () => block({ publicId, playerId: player.playerId as Id<"gamePlayers"> }),
                        translate("connected:playerActions.blockConfirmation", {
                          name: player.displayName,
                        }),
                      )
                    }
                  />
                </View>
              </View>
            ))}
          </ScrollView>
          <Button tx="common:close" onPress={onClose} />
        </View>
      )}
    </DialogCard>
  )
}

const $dialog: ThemedStyle<ViewStyle> = ({ spacing }) => ({ maxHeight: "82%", gap: spacing.md })
const $section: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.sm })
const $choices: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $list: ThemedStyle<ViewStyle> = () => ({ flexGrow: 0 })
const $row: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xxs,
  marginBottom: spacing.sm,
})
const $identity: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.xs,
})
const $identityName: ThemedStyle<TextStyle> = () => ({ flex: 1 })
const $actions: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.xs,
})
const $action: ThemedStyle<ViewStyle> = () => ({ flex: 1, minHeight: 48 })
const $muted: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
