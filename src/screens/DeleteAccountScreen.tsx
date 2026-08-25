import { useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"

import { Button } from "@/components/Button"
import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

export type AccountDeletionStatus = "processing" | "identity_pending" | "failed"

export interface DeleteAccountScreenProps {
  email?: string
  deletionStatus: AccountDeletionStatus | null | undefined
  isSubmitting: boolean
  error?: string
  onBack: () => void
  onRequestDeletion: () => void
}

export function DeleteAccountScreen({
  email,
  deletionStatus,
  isSubmitting,
  error,
  onBack,
  onRequestDeletion,
}: DeleteAccountScreenProps) {
  const { themed } = useAppTheme()
  const [confirmation, setConfirmation] = useState("")
  const isChecking = deletionStatus === undefined
  const hasRequest = deletionStatus !== null && !isChecking
  const needsRetry = deletionStatus === "failed"
  const canRequestDeletion = deletionStatus === null || needsRetry
  return (
    <Screen preset="scroll" safeAreaEdges={["bottom"]} contentContainerStyle={themed($screen)}>
      <Header title="Delete account" leftTx="common:back" onLeftPress={onBack} />
      <View style={themed($content)}>
        <Text text="ACCOUNT & DATA" preset="formLabel" style={themed($eyebrow)} />
        <Text
          text={
            isChecking
              ? "Delete account"
              : needsRetry
                ? "Your deletion needs attention"
                : hasRequest
                  ? "Your deletion is in progress"
                  : "Before you delete your account"
          }
          preset="heading"
          accessibilityRole="header"
        />
        <Text
          text={
            isChecking
              ? "Checking deletion status…"
              : hasRequest
                ? statusDescription(deletionStatus)
                : "This permanently deletes your Scryve account and anonymizes your connected-play history. Review what happens first."
          }
          accessibilityLiveRegion={isChecking ? "polite" : undefined}
          style={themed($lede)}
        />
        {hasRequest ? <DeletionStatusPanel status={deletionStatus} /> : null}
        {deletionStatus === null ? (
          <View style={themed($stepList)}>
            <Step
              number="1"
              title="Your cloud account is removed"
              body="Your profile, avatar, sign-in, invitations, and account-linked connected data are deleted."
            />
            <Step
              number="2"
              title="Shared match history is anonymized"
              body="Other players keep the match result, but your seats become unlinked “Deleted player” entries with a neutral avatar."
            />
            <Step
              number="3"
              title="Local games stay on this device"
              body="Offline game history is stored only on this device. It is not linked to your account and is not remotely erased."
            />
          </View>
        ) : null}
        {canRequestDeletion ? (
          <>
            {email ? (
              <Text text={`Signed in as ${email}`} size="xs" style={themed($muted)} />
            ) : null}
            <TextField
              testID="delete-confirmation-input"
              label="Type DELETE to continue"
              value={confirmation}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!isSubmitting}
              onChangeText={setConfirmation}
            />
            {error ? <Text accessibilityRole="alert" text={error} style={themed($error)} /> : null}
            <Button
              testID="confirm-account-deletion-button"
              text={
                isSubmitting
                  ? "Submitting request…"
                  : needsRetry
                    ? "Retry account deletion"
                    : "Permanently delete account"
              }
              disabled={confirmation.trim().toUpperCase() !== "DELETE" || isSubmitting}
              style={themed($dangerButton)}
              textStyle={themed($dangerButtonText)}
              onPress={onRequestDeletion}
            />
            <Text
              text={
                needsRetry
                  ? "Retrying continues from the last incomplete step; anonymized data is not restored."
                  : "Deletion begins immediately and cannot be undone after processing starts."
              }
              size="xxs"
              style={themed($centerMuted)}
            />
          </>
        ) : null}
      </View>
    </Screen>
  )
}

function statusDescription(status: AccountDeletionStatus | null | undefined) {
  if (status === "failed")
    return "Scryve could not finish automatically. Return to this page and submit the request again to retry."
  if (status === "identity_pending")
    return "Your connected data is anonymized. Scryve is now removing your sign-in identity."
  return "Scryve is anonymizing connected history and removing account-linked data. You can close this page safely."
}

function DeletionStatusPanel({ status }: { status: AccountDeletionStatus | null | undefined }) {
  const { themed } = useAppTheme()
  const failed = status === "failed"
  return (
    <View accessibilityRole="alert" style={themed(failed ? $failurePanel : $statusPanel)}>
      <View style={themed(failed ? $failureMark : $statusMark)}>
        <Text text={failed ? "!" : "…"} style={themed($statusMarkText)} />
      </View>
      <View style={$flex}>
        <Text
          text={failed ? "Deletion needs attention" : "Deletion request received"}
          preset="subheading"
        />
        <Text
          text={
            failed
              ? "No account data will be restored. Type DELETE and submit again to retry the remaining work."
              : "New connected activity is blocked while the request is processed."
          }
          size="xs"
          style={themed($muted)}
        />
      </View>
    </View>
  )
}

function Step({ number, title, body }: { number: string; title: string; body: string }) {
  const { themed } = useAppTheme()
  return (
    <View style={themed($step)}>
      <View style={themed($stepNumber)}>
        <Text text={number} size="xs" />
      </View>
      <View style={$flex}>
        <Text text={title} style={themed($strong)} />
        <Text text={body} size="xs" style={themed($muted)} />
      </View>
    </View>
  )
}

const $flex: ViewStyle = { flex: 1 }
const $screen: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: "100%",
  maxWidth: 760,
  alignSelf: "center",
  gap: spacing.md,
  paddingHorizontal: spacing.lg,
  paddingBottom: spacing.xl,
})
const $content: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: "100%",
  maxWidth: 590,
  alignSelf: "center",
  gap: spacing.lg,
})
const $eyebrow: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.brandText,
  letterSpacing: 1.8,
})
const $lede: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  fontSize: 17,
  lineHeight: 25,
})
const $muted: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $centerMuted: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  textAlign: "center",
})
const $strong: ThemedStyle<TextStyle> = () => ({ fontWeight: "600" })
const $stepList: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  gap: spacing.xs,
  paddingVertical: spacing.xs,
  borderTopWidth: 1,
  borderBottomWidth: 1,
  borderColor: colors.separator,
})
const $step: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.sm,
  paddingVertical: spacing.sm,
})
const $stepNumber: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: 30,
  height: 30,
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 15,
  backgroundColor: colors.separator,
})
const $dangerButton: ThemedStyle<ViewStyle> = ({ colors }) => ({
  minHeight: 52,
  borderColor: colors.error,
  backgroundColor: colors.transparent,
})
const $dangerButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.error })
const $error: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.error })
const $statusPanel: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  gap: spacing.md,
  alignItems: "center",
  padding: spacing.lg,
  borderRadius: spacing.md,
  borderWidth: 1,
  borderColor: colors.tint,
  backgroundColor: colors.separator,
})
const $failurePanel: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  gap: spacing.md,
  alignItems: "center",
  padding: spacing.lg,
  borderRadius: spacing.md,
  borderWidth: 1,
  borderColor: colors.error,
  backgroundColor: colors.errorBackground,
})
const $statusMark: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: 38,
  height: 38,
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 19,
  backgroundColor: colors.tint,
})
const $failureMark: ThemedStyle<ViewStyle> = ({ colors }) => ({
  width: 38,
  height: 38,
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 19,
  backgroundColor: colors.error,
})
const $statusMarkText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
  fontSize: 20,
  fontWeight: "700",
})
