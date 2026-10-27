import type { TextStyle, ViewStyle } from "react-native"
import { ScrollView, View } from "react-native"

import { BottomActionBar } from "@/components/BottomActionBar"
import { Button } from "@/components/Button"
import { CHOICE_RADIUS } from "@/components/ChoiceButton"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { Switch } from "@/components/Toggle/Switch"
import type { ConsentDocumentId } from "@/content/legal"
import { useFirstUseSharing } from "@/features/legal/useFirstUseSharing"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import { $styles } from "@/theme/styles"
import type { ThemedStyle } from "@/theme/types"

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
  const { configured, sharing, setSharing, saveFailed, saveSharing } = useFirstUseSharing()
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
    <Screen preset="fixed" safeAreaEdges={["top", "bottom"]} contentContainerStyle={$styles.flex1}>
      <ScrollView style={$styles.flex1} contentContainerStyle={themed($content)}>
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
      </ScrollView>

      <BottomActionBar style={$bar}>
        <View style={themed($actions)}>
          {!isReturningUser && configured ? (
            <Switch
              testID="first-use-analytics-switch"
              labelTx="account:shareUsage"
              value={sharing}
              helperTx="account:legalConsent.shareUsageHelper"
              onValueChange={setSharing}
            />
          ) : null}
          {saveFailed ? (
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
              if (!isReturningUser && !saveSharing()) return
              onAccept()
            }}
          />
          <Text text={acceptanceDescription} size="xxs" style={themed($muted)} />
        </View>
      </BottomActionBar>
    </Screen>
  )
}

const $column: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: "100%",
  maxWidth: 560,
  alignSelf: "center",
  paddingHorizontal: spacing.lg,
})
const $content: ThemedStyle<ViewStyle> = (theme) => ({
  ...$column(theme),
  flexGrow: 1,
  justifyContent: "space-between",
  gap: theme.spacing.xl,
  paddingTop: theme.spacing.xl,
  paddingBottom: theme.spacing.md,
})
const $bar: ViewStyle = { paddingHorizontal: 0 }
const $body: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.sm })
const $links: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.sm })
const $actions: ThemedStyle<ViewStyle> = (theme) => ({ ...$column(theme), gap: theme.spacing.sm })

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
