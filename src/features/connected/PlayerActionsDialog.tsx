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
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { convexErrorMessage } from "@/utils/convexError"

import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"

export interface ReportablePlayer {
  playerId: string
  seat: number
  displayName: string
  color: string
  controlledByMe: boolean
}

const REPORT_REASONS = [
  { id: "offensive_username", label: "Offensive username" },
  { id: "harassment", label: "Harassment or abuse" },
  { id: "impersonation", label: "Impersonation" },
  { id: "other", label: "Something else" },
] as const

type ReportReason = (typeof REPORT_REASONS)[number]["id"]

const NOTE_MAX_LENGTH = 500

/**
 * The Guideline 1.2 reporting surface. Blocking takes effect for the reporter immediately and
 * without review; the report itself goes to a queue the operator answers within 24 hours.
 */
export function PlayerActionsDialog({
  publicId,
  players,
  initialPlayer,
  origin,
  onClose,
}: {
  publicId: string
  players: ReportablePlayer[]
  initialPlayer?: ReportablePlayer
  origin?: DialogOrigin
  onClose: () => void
}) {
  const { themed } = useAppTheme()
  const report = useMutation(api.moderation.reportPlayer)
  const block = useMutation(api.moderation.blockPlayer)
  const [selected, setSelected] = useState<ReportablePlayer | undefined>(initialPlayer)
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
      setError(convexErrorMessage(cause, "Could not complete that request"))
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
      backdropAccessibilityLabel="Close player actions"
      dialogTestID="player-actions-dialog"
      style={themed($dialog)}
    >
      {done ? (
        <View style={themed($section)}>
          <Text preset="subheading" text="Thanks — that's been recorded" />
          <Text testID="player-actions-confirmation" accessibilityRole="alert" text={done} />
          <Button text="Close" preset="reversed" onPress={onClose} />
        </View>
      ) : selected ? (
        <View style={themed($section)}>
          <Text preset="subheading" text={`Report ${selected.displayName}`} />
          <Text
            size="xs"
            style={themed($muted)}
            text="Reporting also blocks this player for you immediately. You will stop seeing their username and will not be seated with them again. We review every report within 24 hours."
          />
          <View style={themed($choices)}>
            {REPORT_REASONS.map((option) => (
              <ChoiceButton
                key={option.id}
                text={option.label}
                selected={reason === option.id}
                onPress={() => setReason(option.id)}
              />
            ))}
          </View>
          <TextField
            label="Anything else we should know? (optional)"
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
              text="Back"
              disabled={busy}
              style={themed($action)}
              onPress={() => {
                setSelected(undefined)
                setError(undefined)
              }}
            />
            <Button
              testID="submit-player-report-button"
              text={busy ? "Sending…" : "Send report"}
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
                  `We received your report about ${selected.displayName} and blocked them for you. You will not be seated with them again.`,
                )
              }
            />
          </View>
        </View>
      ) : (
        <View style={themed($section)}>
          <Text preset="subheading" text="Players" />
          <Text
            size="xs"
            style={themed($muted)}
            text="Report a name you find offensive, or block a player to stop being seated with them."
          />
          {error ? (
            <Text testID="player-actions-error" accessibilityRole="alert" text={error} />
          ) : null}
          <ScrollView style={themed($list)}>
            {opponents.length === 0 ? (
              <Text size="xs" style={themed($muted)} text="No other players in this game." />
            ) : null}
            {opponents.map((player) => (
              <View key={player.playerId} style={themed($row)}>
                <View style={themed($identity)}>
                  <PlayerMark seatNumber={player.seat} color={player.color} size={28} />
                  <Text numberOfLines={1} text={player.displayName} style={themed($identityName)} />
                  <Text size="xxs" style={themed($muted)} text={`Seat ${player.seat}`} />
                </View>
                <View style={themed($actions)}>
                  <Button
                    testID={`report-player-seat-${player.seat}`}
                    text="Report"
                    disabled={busy}
                    style={themed($action)}
                    onPress={() => {
                      setSelected(player)
                      setError(undefined)
                    }}
                  />
                  <Button
                    testID={`block-player-seat-${player.seat}`}
                    text="Block"
                    disabled={busy}
                    style={themed($action)}
                    onPress={() =>
                      run(
                        () => block({ publicId, playerId: player.playerId as Id<"gamePlayers"> }),
                        `${player.displayName} is blocked. You will not be seated with them again, and their name is hidden from you.`,
                      )
                    }
                  />
                </View>
              </View>
            ))}
          </ScrollView>
          <Button text="Close" onPress={onClose} />
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
