import { useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"

import { Button, type ButtonProps } from "@/components/Button"
import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import type { ProSubscriptionManagement } from "@/features/billing/RevenueCatContext"
import { appLocale } from "@/i18n"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { openUrl } from "@/utils/openUrl"

export type AccountDeletionStatus = "processing" | "identity_pending" | "failed"
export type AccountDeletionReceiptStatus = AccountDeletionStatus | "completed"

const DELETE_CONFIRMATION = "DELETE"
const STATUS_MARK = { failed: "!", completed: "✓", received: "…" } as const
const DELETION_STEPS = ["cloud", "history", "local", "feedback", "signOut"] as const
const APPLE_SUBSCRIPTIONS = "https://apps.apple.com/account/subscriptions"
const GOOGLE_PLAY_SUBSCRIPTIONS = "https://play.google.com/store/account/subscriptions"

export interface DeleteAccountScreenProps {
  email?: string
  deletionStatus: AccountDeletionStatus | null | undefined
  subscription: ProSubscriptionManagement
  isSubmitting: boolean
  error?: string
  onBack: () => void
  onRequestDeletion: () => void
}

export interface AccountDeletionReceiptScreenProps {
  status: AccountDeletionReceiptStatus
  updatedAt: number
  onBack: () => void
  onSignIn?: () => void
  onReturnHome: () => void
}

export function DeleteAccountScreen({
  email,
  deletionStatus,
  subscription,
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
  const lede = isChecking
    ? translate("account:deleteAccount.checkingStatus")
    : hasRequest
      ? statusDescription(deletionStatus)
      : translate("account:deleteAccount.intro")
  return (
    <Screen preset="scroll" safeAreaEdges={["bottom"]} contentContainerStyle={themed($screen)}>
      <Header titleTx="account:deleteAccount.title" leftTx="common:back" onLeftPress={onBack} />
      <View style={themed($content)}>
        <Text tx="account:deleteAccount.eyebrow" preset="formLabel" style={themed($eyebrow)} />
        <Text
          tx={
            isChecking
              ? "account:deleteAccount.title"
              : needsRetry
                ? "account:deleteAccount.heading.needsAttention"
                : hasRequest
                  ? "account:deleteAccount.heading.inProgress"
                  : "account:deleteAccount.heading.before"
          }
          preset="heading"
          accessibilityRole="header"
        />
        <Text
          text={lede}
          accessibilityLiveRegion={isChecking ? "polite" : undefined}
          style={themed($lede)}
        />
        {hasRequest ? <DeletionStatusPanel status={deletionStatus} /> : null}
        {deletionStatus === null ? (
          <View style={themed($stepList)}>
            {DELETION_STEPS.map((step, index) => (
              <Step key={step} number={String(index + 1)} step={step} />
            ))}
          </View>
        ) : null}
        {canRequestDeletion ? (
          <>
            <SubscriptionNotice subscription={subscription} />
            {email ? (
              <Text
                tx="account:deleteAccount.signedInAs"
                txOptions={{ email }}
                size="xs"
                tone="dim"
              />
            ) : null}
            <TextField
              testID="delete-confirmation-input"
              labelTx="account:deleteAccount.confirmLabel"
              labelTxOptions={{ word: DELETE_CONFIRMATION }}
              value={confirmation}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={!isSubmitting}
              onChangeText={setConfirmation}
            />
            {error ? <Text accessibilityRole="alert" text={error} style={themed($error)} /> : null}
            <Button
              testID="confirm-account-deletion-button"
              tx={
                isSubmitting
                  ? "account:deleteAccount.submit.submitting"
                  : needsRetry
                    ? "account:deleteAccount.submit.retry"
                    : "account:deleteAccount.submit.delete"
              }
              disabled={confirmation.trim().toUpperCase() !== DELETE_CONFIRMATION || isSubmitting}
              preset="destructive"
              onPress={onRequestDeletion}
            />
            <Text
              tx={
                needsRetry
                  ? "account:deleteAccount.footnote.retry"
                  : "account:deleteAccount.footnote.first"
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

export function AccountDeletionReceiptScreen({
  status,
  updatedAt,
  onBack,
  onSignIn,
  onReturnHome,
}: AccountDeletionReceiptScreenProps) {
  const { themed } = useAppTheme()
  const completed = status === "completed"
  const failed = status === "failed"
  const lede = completed
    ? translate("account:deleteAccount.receipt.completedBody")
    : failed
      ? translate("account:deleteAccount.receipt.failedBody")
      : statusDescription(status)
  return (
    <Screen preset="scroll" safeAreaEdges={["bottom"]} contentContainerStyle={themed($screen)}>
      <Header titleTx="account:deleteAccount.title" leftTx="common:back" onLeftPress={onBack} />
      <View style={themed($content)}>
        <Text tx="account:deleteAccount.eyebrow" preset="formLabel" style={themed($eyebrow)} />
        <Text
          tx={
            completed
              ? "account:deleteAccount.heading.completed"
              : failed
                ? "account:deleteAccount.heading.needsAttention"
                : "account:deleteAccount.heading.inProgress"
          }
          preset="heading"
          accessibilityRole="header"
        />
        <Text text={lede} style={themed($lede)} />
        <DeletionStatusPanel status={status} />
        <Text
          testID="account-deletion-last-update"
          text={formatDeletionUpdate(updatedAt)}
          size="xs"
          tone="dim"
        />
        <Text
          tx={
            completed
              ? "account:deleteAccount.receipt.next.completed"
              : failed
                ? "account:deleteAccount.receipt.next.failed"
                : "account:deleteAccount.receipt.next.pending"
          }
          size="xs"
          tone="dim"
        />
        {failed && onSignIn ? (
          <Button
            tx="account:deleteAccount.receipt.signInToRetry"
            preset="primary"
            onPress={onSignIn}
          />
        ) : null}
        <Button tx="account:deleteAccount.receipt.returnHome" onPress={onReturnHome} />
      </View>
    </Screen>
  )
}

function SubscriptionNotice({ subscription }: { subscription: ProSubscriptionManagement }) {
  const { themed } = useAppTheme()
  const { store } = subscription
  return (
    <View style={themed($subscriptionNotice)}>
      <Text tx="account:deleteAccount.subscription.heading" style={themed($strong)} />
      <Text tx="account:deleteAccount.subscription.body" size="xs" tone="dim" />
      {store === "app_store" || store === "unknown" ? (
        <ManageLink tx="account:deleteAccount.subscription.manageApple" url={APPLE_SUBSCRIPTIONS} />
      ) : null}
      {store === "play_store" || store === "unknown" ? (
        <ManageLink
          tx="account:deleteAccount.subscription.manageGoogle"
          url={GOOGLE_PLAY_SUBSCRIPTIONS}
        />
      ) : null}
      {store === "web" || store === "unknown" ? (
        <Text tx="account:deleteAccount.subscription.web" size="xs" tone="dim" />
      ) : null}
      {subscription.store === "web" && subscription.url ? (
        <ManageLink tx="account:deleteAccount.subscription.manageWeb" url={subscription.url} />
      ) : null}
    </View>
  )
}

function ManageLink({ tx, url }: { tx: ButtonProps["tx"]; url: string }) {
  const { themed } = useAppTheme()
  return (
    <Button
      tx={tx}
      accessibilityRole="link"
      style={themed($subscriptionLink)}
      textStyle={themed($subscriptionLinkText)}
      onPress={() => void openUrl(url)}
    />
  )
}

function statusDescription(status: AccountDeletionStatus | null | undefined) {
  if (status === "failed") return translate("account:deleteAccount.status.failed")
  if (status === "identity_pending")
    return translate("account:deleteAccount.status.identityPending")
  return translate("account:deleteAccount.status.processing")
}

function DeletionStatusPanel({
  status,
}: {
  status: AccountDeletionReceiptStatus | null | undefined
}) {
  const { themed } = useAppTheme()
  const panel = status === "failed" ? "failed" : status === "completed" ? "completed" : "received"
  const failed = panel === "failed"
  return (
    <View accessibilityRole="alert" style={themed(failed ? $failurePanel : $statusPanel)}>
      <View style={themed(failed ? $failureMark : $statusMark)}>
        <Text text={STATUS_MARK[panel]} style={themed($statusMarkText)} />
      </View>
      <View style={$flex}>
        <Text tx={`account:deleteAccount.panel.${panel}.title`} preset="subheading" />
        <Text
          tx={`account:deleteAccount.panel.${panel}.body`}
          txOptions={{ word: DELETE_CONFIRMATION }}
          size="xs"
          tone="dim"
        />
      </View>
    </View>
  )
}

function formatDeletionUpdate(timestamp: number) {
  const date = new Date(timestamp)
  const day = date.toLocaleDateString(appLocale, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
  const time = date.toLocaleTimeString(appLocale, { hour: "numeric", minute: "2-digit" })
  return translate("account:deleteAccount.receipt.lastUpdated", { day, time })
}

function Step({ number, step }: { number: string; step: (typeof DELETION_STEPS)[number] }) {
  const { themed } = useAppTheme()
  return (
    <View style={themed($step)}>
      <View style={themed($stepNumber)}>
        <Text text={number} size="xs" />
      </View>
      <View style={$flex}>
        <Text tx={`account:deleteAccount.steps.${step}.title`} style={themed($strong)} />
        <Text tx={`account:deleteAccount.steps.${step}.body`} size="xs" tone="dim" />
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
  paddingHorizontal: spacing.md,
  paddingBottom: spacing.md,
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
const $centerMuted: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  textAlign: "center",
})
const $strong: ThemedStyle<TextStyle> = () => ({ fontWeight: "600" })
const $subscriptionNotice: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $subscriptionLink: ThemedStyle<ViewStyle> = ({ colors }) => ({
  alignSelf: "flex-start",
  minHeight: 44,
  paddingHorizontal: 0,
  borderWidth: 0,
  backgroundColor: colors.transparent,
})
const $subscriptionLinkText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.tint,
})
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
const $stepNumber: ThemedStyle<ViewStyle> = ({ colors, radius }) => ({
  width: 30,
  height: 30,
  alignItems: "center",
  justifyContent: "center",
  borderRadius: radius.full,
  backgroundColor: colors.separator,
})
const $error: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.error })
const $statusPanel: ThemedStyle<ViewStyle> = ({ colors, spacing, radius }) => ({
  flexDirection: "row",
  gap: spacing.md,
  alignItems: "center",
  padding: spacing.lg,
  borderRadius: radius.xxl,
  borderWidth: 1,
  borderColor: colors.tint,
  backgroundColor: colors.separator,
})
const $failurePanel: ThemedStyle<ViewStyle> = ({ colors, spacing, radius }) => ({
  flexDirection: "row",
  gap: spacing.md,
  alignItems: "center",
  padding: spacing.lg,
  borderRadius: radius.xxl,
  borderWidth: 1,
  borderColor: colors.error,
  backgroundColor: colors.errorBackground,
})
const $statusMark: ThemedStyle<ViewStyle> = ({ colors, radius }) => ({
  width: 38,
  height: 38,
  alignItems: "center",
  justifyContent: "center",
  borderRadius: radius.full,
  backgroundColor: colors.tint,
})
const $failureMark: ThemedStyle<ViewStyle> = ({ colors, radius }) => ({
  width: 38,
  height: 38,
  alignItems: "center",
  justifyContent: "center",
  borderRadius: radius.full,
  backgroundColor: colors.error,
})
const $statusMarkText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.palette.neutral100,
  fontSize: 20,
  fontWeight: "700",
})
