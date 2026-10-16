import { useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"

import { Button } from "@/components/Button"
import { CHOICE_RADIUS } from "@/components/ChoiceButton"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { Switch } from "@/components/Toggle/Switch"
import type { ConsentDocumentId } from "@/content/legal"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { analyticsConfigured, analyticsEnabled, setAnalyticsEnabled } from "@/utils/analytics"

const BRAND_EYEBROW = "SCRYVE"

export interface LegalConsentScreenProps {
  documents: readonly ConsentDocumentId[]
  effectiveDate?: string
  isReturningUser: boolean
  isSubmitting?: boolean
  error?: string
  onAccept: () => void
  onOpenTerms: () => void
  onOpenPrivacy: () => void
}

export function LegalConsentScreen({
  documents,
  effectiveDate,
  isReturningUser,
  isSubmitting,
  error,
  onAccept,
  onOpenTerms,
  onOpenPrivacy,
}: LegalConsentScreenProps) {
  const { themed } = useAppTheme()
  const [sharing, setSharing] = useState(analyticsEnabled)
  const [sharingError, setSharingError] = useState(false)
  const includesTerms = documents.includes("terms")
  const includesPrivacy = documents.includes("privacy")
  const changed = includesTerms && includesPrivacy ? "both" : includesTerms ? "terms" : "privacy"
  const dating = effectiveDate ? "dated" : "undated"
  const returningDescription = translate(`account:legalConsent.returning.${dating}.${changed}`, {
    date: effectiveDate,
  })
  const intro = translate("account:legalConsent.intro")
  const acceptanceDescription = translate(`account:legalConsent.acceptance.${dating}.${changed}`, {
    date: effectiveDate,
  })

  return (
    <Screen preset="auto" safeAreaEdges={["top", "bottom"]} contentContainerStyle={themed($screen)}>
      <View style={themed($body)}>
        <Text text={BRAND_EYEBROW} preset="formLabel" style={themed($eyebrow)} />
        <Text
          tx={
            isReturningUser
              ? includesPrivacy && !includesTerms
                ? "account:legalConsent.heading.updatedPrivacy"
                : "account:legalConsent.heading.updatedTerms"
              : "account:legalConsent.heading.beforeStart"
          }
          preset="heading"
          accessibilityRole="header"
        />
        <Text text={isReturningUser ? returningDescription : intro} style={themed($muted)} />
      </View>

      <View style={themed($links)}>
        {includesTerms ? (
          <Button
            tx="account:legalConsent.readTerms"
            style={themed($secondaryAction)}
            onPress={onOpenTerms}
          />
        ) : null}
        {includesPrivacy ? (
          <Button
            tx="account:legalConsent.readPrivacy"
            style={themed($secondaryAction)}
            onPress={onOpenPrivacy}
          />
        ) : null}
      </View>

      <View style={themed($actions)}>
        {!isReturningUser && analyticsConfigured() ? (
          <Switch
            testID="first-use-analytics-switch"
            labelTx="account:shareUsage"
            value={sharing}
            helperTx="account:legalConsent.shareUsageHelper"
            onValueChange={setSharing}
          />
        ) : null}
        {sharingError ? (
          <Text accessibilityRole="alert" size="xs" tx="account:legalConsent.sharingSaveFailed" />
        ) : null}
        {error ? (
          <Text accessibilityRole="alert" text={error} size="xs" style={themed($error)} />
        ) : null}
        <Button
          testID="accept-legal-button"
          tx={isSubmitting ? "account:legalConsent.saving" : "account:legalConsent.agree"}
          preset="reversed"
          style={themed($primaryAction)}
          disabled={isSubmitting}
          onPress={() => {
            if (!isReturningUser && sharing !== analyticsEnabled()) {
              if (!setAnalyticsEnabled(sharing, "first_use")) {
                setSharingError(true)
                return
              }
            }
            onAccept()
          }}
        />
        <Text text={acceptanceDescription} size="xxs" style={themed($muted)} />
      </View>
    </Screen>
  )
}

const $screen: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: "100%",
  maxWidth: 560,
  alignSelf: "center",
  flexGrow: 1,
  justifyContent: "space-between",
  gap: spacing.xl,
  paddingHorizontal: spacing.lg,
  paddingTop: spacing.xl,
  paddingBottom: spacing.md,
})
const $body: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.sm })
const $links: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.sm })
const $actions: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.sm })

const $primaryAction: ThemedStyle<ViewStyle> = () => ({
  borderRadius: CHOICE_RADIUS,
})
const $secondaryAction: ThemedStyle<ViewStyle> = () => ({
  borderRadius: CHOICE_RADIUS,
  borderWidth: 2,
})
const $eyebrow: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.tint })
const $muted: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $error: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.error })
