import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"

import { Button } from "@/components/Button"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

export interface LegalConsentScreenProps {
  effectiveDate: string
  isReturningUser: boolean
  isSubmitting?: boolean
  error?: string
  onAccept: () => void
  onOpenTerms: () => void
  onOpenPrivacy: () => void
}

export function LegalConsentScreen({
  effectiveDate,
  isReturningUser,
  isSubmitting,
  error,
  onAccept,
  onOpenTerms,
  onOpenPrivacy,
}: LegalConsentScreenProps) {
  const { themed } = useAppTheme()

  return (
    <Screen preset="auto" safeAreaEdges={["top", "bottom"]} contentContainerStyle={themed($screen)}>
      <View style={themed($body)}>
        <Text text="COUNT" preset="formLabel" style={themed($eyebrow)} />
        <Text
          text={isReturningUser ? "We have updated our terms" : "Before you start"}
          preset="heading"
          accessibilityRole="header"
        />
        <Text
          text={
            isReturningUser
              ? `Our Terms of Use and Privacy Policy changed on ${effectiveDate}. Please review them to keep using Count.`
              : "Please review our Terms of Use and Privacy Policy. You need to accept them to use Count."
          }
          style={themed($muted)}
        />
      </View>

      <View style={themed($links)}>
        <Button text="Read the Terms of Use" onPress={onOpenTerms} />
        <Button text="Read the Privacy Policy" onPress={onOpenPrivacy} />
      </View>

      <View style={themed($actions)}>
        {error ? (
          <Text accessibilityRole="alert" text={error} size="xs" style={themed($error)} />
        ) : null}
        <Button
          testID="accept-legal-button"
          text={isSubmitting ? "Saving…" : "I agree"}
          preset="reversed"
          disabled={isSubmitting}
          onPress={onAccept}
        />
        <Text
          text={`By tapping "I agree" you accept the Terms of Use and Privacy Policy dated ${effectiveDate}.`}
          size="xxs"
          style={themed($muted)}
        />
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
  paddingVertical: spacing.xl,
})
const $body: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.sm })
const $links: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.sm })
const $actions: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.sm })
const $eyebrow: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.tint })
const $muted: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $error: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.error })
