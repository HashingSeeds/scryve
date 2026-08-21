import type { TextStyle, ViewStyle } from "react-native"
import { ScrollView, View } from "react-native"

import { Button } from "@/components/Button"
import { useCollapsingTitle } from "@/components/CollapsingTitle"
import { Header } from "@/components/Header"
import { ListItem } from "@/components/ListItem"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { useAppTheme } from "@/theme/context"
import { $styles } from "@/theme/styles"
import type { ThemedStyle } from "@/theme/types"

const GETTING_STARTED = [
  {
    title: "Start a game",
    body: "Open Scryve and choose New game from the home screen.",
  },
  {
    title: "Choose how to play",
    body: "Play together on one device, or choose Connected to play on separate devices.",
  },
  {
    title: "Set up the table",
    body: "Select the number of players and starting life, then start the game.",
  },
]

const FAQS = [
  {
    question: "Restore Scryve Pro",
    answer:
      "Open Scryve, go to your account, choose Scryve Pro, and tap Restore Purchases. Use the same Apple or Google account that made the original purchase.",
  },
  {
    question: "Manage or cancel a subscription",
    answer:
      "Subscriptions are managed by the store where you purchased them. On iPhone or iPad, open Settings, tap your name, then Subscriptions. On Android, open Google Play, tap your profile, then Payments & subscriptions.",
  },
  {
    question: "Having trouble with a game?",
    answer:
      "Restart Scryve and try again. If the problem continues, email us with your device model, operating-system version, and a short description of what happened.",
  },
  {
    question: "Account or privacy questions",
    answer:
      "You can manage your account from Scryve’s account screen. Contact us if you need help accessing or deleting your account.",
  },
]

export interface SupportScreenProps {
  onBack: () => void
  onEmailSupport: () => void
  onOpenPrivacy: () => void
  onOpenTerms: () => void
  onOpenLicenseAgreement?: () => void
  onOpenCookiePolicy: () => void
  appVersion?: string
}

export function SupportScreen({
  onBack,
  onEmailSupport,
  onOpenPrivacy,
  onOpenTerms,
  onOpenLicenseAgreement,
  onOpenCookiePolicy,
  appVersion,
}: SupportScreenProps) {
  const { themed } = useAppTheme()
  const { titleVisible, onScroll } = useCollapsingTitle()

  return (
    <Screen preset="fixed" safeAreaEdges={["bottom"]} contentContainerStyle={themed($screen)}>
      <Header title={titleVisible ? "Help" : ""} leftTx="common:back" onLeftPress={onBack} />
      <ScrollView
        testID="support-scroll"
        style={$styles.flex1}
        contentContainerStyle={themed($scrollContent)}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        <View style={themed($content)}>
          <View style={themed($hero)}>
            <Text text="SCRYVE" preset="formLabel" style={themed($eyebrow)} />
            <Text text="Help" preset="heading" accessibilityRole="header" style={themed($title)} />
            <Text
              text="Answers about games, accounts, and Scryve Pro — and a direct line to us when you need one."
              style={themed($subtitle)}
            />
          </View>

          <View style={themed($contactCard)}>
            <Text text="Contact support" preset="subheading" accessibilityRole="header" />
            <Text
              text="Email us and we’ll usually respond within two business days."
              style={themed($muted)}
            />
            <Button
              text="Email support"
              preset="reversed"
              style={themed($emailButton)}
              onPress={onEmailSupport}
            />
            <Text
              text="Telling us your device model and what you were doing helps us answer on the first reply."
              size="xs"
              style={themed($muted)}
            />
          </View>

          <View style={themed($section)}>
            <Text text="Getting started" preset="subheading" accessibilityRole="header" />
            <View style={themed($steps)}>
              {GETTING_STARTED.map((step, index) => (
                <View key={step.title} style={themed($stepCard)}>
                  <Text
                    text={String(index + 1).padStart(2, "0")}
                    size="xxs"
                    weight="bold"
                    style={themed($stepNumber)}
                  />
                  <Text text={step.title} weight="bold" style={themed($cardTitle)} />
                  <Text text={step.body} size="xs" style={themed($muted)} />
                </View>
              ))}
            </View>
          </View>

          <View style={themed($section)}>
            <Text
              text="Frequently asked questions"
              preset="subheading"
              accessibilityRole="header"
            />
            <View style={themed($faqs)}>
              {FAQS.map((faq) => (
                <View key={faq.question} style={themed($faqCard)}>
                  <Text
                    text={faq.question}
                    weight="bold"
                    accessibilityRole="header"
                    style={themed($cardTitle)}
                  />
                  <Text text={faq.answer} size="xs" style={themed($answer)} />
                </View>
              ))}
            </View>
          </View>

          <View style={themed($section)}>
            <Text text="Legal" preset="subheading" accessibilityRole="header" />
            <View>
              <ListItem text="Privacy Policy" rightIcon="caretRight" onPress={onOpenPrivacy} />
              <ListItem
                text="Terms of Use"
                rightIcon="caretRight"
                topSeparator
                onPress={onOpenTerms}
              />
              {onOpenLicenseAgreement ? (
                <ListItem
                  text="License Agreement"
                  accessibilityHint="Opens Apple's standard license agreement in your browser"
                  rightIcon="caretRight"
                  topSeparator
                  onPress={onOpenLicenseAgreement}
                />
              ) : null}
              <ListItem
                text="Cookie Policy"
                rightIcon="caretRight"
                topSeparator
                onPress={onOpenCookiePolicy}
              />
            </View>
          </View>

          <View style={themed($footer)}>
            <Text text="© 2026 Hashing Seeds LLC" size="xxs" style={themed($muted)} />
            {appVersion ? (
              <Text text={`Scryve ${appVersion}`} size="xxs" style={themed($muted)} />
            ) : null}
          </View>
        </View>
      </ScrollView>
    </Screen>
  )
}

const $screen: ThemedStyle<ViewStyle> = () => ({ flex: 1, width: "100%" })
const $scrollContent: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: "100%",
  paddingHorizontal: spacing.lg,
  paddingBottom: spacing.xxxl,
})
const $content: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: "100%",
  maxWidth: 680,
  alignSelf: "center",
  gap: spacing.xl,
})

const $hero: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  gap: spacing.sm,
  paddingBottom: spacing.xl,
  borderBottomWidth: 1,
  borderColor: colors.separator,
})
const $eyebrow: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.brandText,
  letterSpacing: 3,
})
const $title: ThemedStyle<TextStyle> = () => ({ fontSize: 42, lineHeight: 46 })
const $subtitle: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  fontSize: 18,
  lineHeight: 25,
})

const $contactCard: ThemedStyle<ViewStyle> = ({ colors, isDark, spacing }) => ({
  gap: spacing.sm,
  padding: spacing.lg,
  borderWidth: 1,
  borderRadius: spacing.md,
  borderColor: colors.tint,
  backgroundColor: isDark ? colors.palette.neutral300 : colors.palette.neutral100,
})
const $emailButton: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 52,
  borderRadius: spacing.sm,
  marginTop: spacing.xxs,
})

const $section: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.md })
const $steps: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.sm })
const $stepCard: ThemedStyle<ViewStyle> = ({ colors, isDark, spacing }) => ({
  gap: spacing.xxs,
  padding: spacing.md,
  borderWidth: 1,
  borderRadius: spacing.md,
  borderColor: colors.separator,
  backgroundColor: isDark ? colors.palette.neutral300 : colors.palette.neutral100,
})
const $stepNumber: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.brandText,
  letterSpacing: 2,
})

const $faqs: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.sm })
const $faqCard: ThemedStyle<ViewStyle> = ({ colors, isDark, spacing }) => ({
  gap: spacing.xs,
  padding: spacing.md,
  borderWidth: 1,
  borderRadius: spacing.md,
  borderColor: colors.separator,
  backgroundColor: isDark ? colors.palette.neutral300 : colors.palette.neutral100,
})
const $cardTitle: ThemedStyle<TextStyle> = () => ({ fontSize: 16, lineHeight: 22 })
const $answer: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  lineHeight: 22,
})

const $footer: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  gap: spacing.xxs,
  paddingTop: spacing.lg,
  borderTopWidth: 1,
  borderColor: colors.separator,
})
const $muted: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
