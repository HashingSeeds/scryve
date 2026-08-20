import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"

import { Button } from "@/components/Button"
import { Header } from "@/components/Header"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

export interface SupportScreenProps {
  onBack: () => void
  onEmailSupport: () => void
  onOpenPrivacy: () => void
  onOpenTerms: () => void
  onOpenLicenseAgreement?: () => void
  onOpenCookiePolicy: () => void
}

export function SupportScreen({
  onBack,
  onEmailSupport,
  onOpenPrivacy,
  onOpenTerms,
  onOpenLicenseAgreement,
  onOpenCookiePolicy,
}: SupportScreenProps) {
  const { themed } = useAppTheme()

  return (
    <Screen preset="scroll" safeAreaEdges={["bottom"]} contentContainerStyle={themed($screen)}>
      <Header title="Scryve Help" leftTx="common:back" onLeftPress={onBack} />
      <View style={themed($section)}>
        <Text text="COUNT" preset="formLabel" style={themed($eyebrow)} />
        <Text text="Help when you need it" preset="heading" accessibilityRole="header" />
        <Text
          text="Find answers about games, accounts, and Scryve Pro, or contact us directly."
          style={themed($muted)}
        />
        <Button text="Email support" preset="reversed" onPress={onEmailSupport} />
        <Text
          text="We usually respond within two business days."
          size="xs"
          style={themed($muted)}
        />
      </View>

      <Section title="Getting started">
        <Answer
          title="1. Start a game"
          body="Open Scryve and choose New game from the home screen."
        />
        <Answer
          title="2. Choose how to play"
          body="Play together on one device, or choose Connected to play on separate devices."
        />
        <Answer
          title="3. Set up the table"
          body="Select the number of players and starting life, then start the game."
        />
      </Section>

      <Section title="Frequently asked questions">
        <Answer
          title="Restore Scryve Pro"
          body="Open Scryve, go to your account, choose Scryve Pro, and tap Restore Purchases. Use the same Apple or Google account that made the original purchase."
        />
        <Answer
          title="Manage or cancel a subscription"
          body="Subscriptions are managed by the store where you purchased them. On iPhone or iPad, open Settings, tap your name, then Subscriptions. On Android, open Google Play, tap your profile, then Payments & subscriptions."
        />
        <Answer
          title="Having trouble with a game?"
          body="Restart Scryve and try again. If the problem continues, email us with your device model, operating-system version, and a short description of what happened."
        />
        <Answer
          title="Account or privacy questions"
          body="You can manage your account from Scryve’s account screen. Contact us if you need help accessing or deleting your account."
        />
      </Section>

      <View style={themed($legal)}>
        <Button text="Privacy Policy" onPress={onOpenPrivacy} />
        <Button text="Terms of Use" onPress={onOpenTerms} />
        {onOpenLicenseAgreement ? (
          <Button text="License Agreement" onPress={onOpenLicenseAgreement} />
        ) : null}
        <Button text="Cookie Policy" onPress={onOpenCookiePolicy} />
      </View>
    </Screen>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { themed } = useAppTheme()
  return (
    <View style={themed($section)}>
      <Text text={title} preset="subheading" accessibilityRole="header" />
      {children}
    </View>
  )
}

function Answer({ title, body }: { title: string; body: string }) {
  const { themed } = useAppTheme()
  return (
    <View style={themed($answer)}>
      <Text text={title} style={themed($strong)} />
      <Text text={body} size="xs" style={themed($muted)} />
    </View>
  )
}

const $screen: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: "100%",
  maxWidth: 760,
  alignSelf: "center",
  gap: spacing.xl,
  paddingHorizontal: spacing.lg,
  paddingBottom: spacing.xl,
})
const $section: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.md })
const $answer: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  gap: spacing.xs,
  paddingTop: spacing.md,
  borderTopWidth: 1,
  borderColor: colors.separator,
})
const $legal: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.sm,
})
const $eyebrow: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.tint })
const $muted: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $strong: ThemedStyle<TextStyle> = () => ({ fontWeight: "600" })
