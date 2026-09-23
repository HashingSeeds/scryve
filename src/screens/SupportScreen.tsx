import { useState } from "react"
import type { ImageStyle, TextStyle, ViewStyle } from "react-native"
import { Image, View } from "react-native"

import { Button } from "@/components/Button"
import { ListItem } from "@/components/ListItem"
import { Screen } from "@/components/Screen"
import { SegmentedControl } from "@/components/SegmentedControl"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

const GETTING_STARTED = [
  {
    title: "Start a game",
    body: "Open Play. Your fresh board uses the defaults saved in Settings.",
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
      "Restart Scryve and try again. If the problem continues, report it here with a short description of what happened.",
  },
  {
    question: "Account or privacy questions",
    answer:
      "You can manage your account from Scryve’s account screen. Contact us if you need help accessing or deleting your account.",
  },
]

export type SupportFeedback = {
  kind: "bug" | "help"
  message: string
  email?: string
  screenshot?: SupportScreenshot
}

export type SupportScreenshot = {
  uri: string
  filename: string
  contentType: string
  data: Uint8Array
}

export interface SupportScreenProps {
  onBack: () => void
  onEmailSupport: () => void
  onSubmitFeedback: (feedback: SupportFeedback) => void
  onPickScreenshot: () => Promise<SupportScreenshot | null>
  onOpenPrivacy: () => void
  onOpenTerms: () => void
  onOpenLicenseAgreement?: () => void
  onOpenCookiePolicy: () => void
  appVersion?: string
}

export function SupportScreen({
  onBack,
  onEmailSupport,
  onSubmitFeedback,
  onPickScreenshot,
  onOpenPrivacy,
  onOpenTerms,
  onOpenLicenseAgreement,
  onOpenCookiePolicy,
  appVersion,
}: SupportScreenProps) {
  const { themed } = useAppTheme()
  const [kind, setKind] = useState<SupportFeedback["kind"]>("bug")
  const [message, setMessage] = useState("")
  const [email, setEmail] = useState("")
  const [screenshot, setScreenshot] = useState<SupportScreenshot | null>(null)
  const [pickingScreenshot, setPickingScreenshot] = useState(false)
  const [status, setStatus] = useState("")
  const messageLabel = kind === "bug" ? "What happened?" : "How can we help?"
  const emailLabel = kind === "bug" ? "Email for a reply (optional)" : "Email for a reply"
  const emailValid = /^[^\s@]+@(?:[^\s@.]+\.)+[^\s@.]+$/.test(email.trim())
  const canSubmit = !!message.trim() && (kind === "bug" ? !email.trim() || emailValid : emailValid)

  function submitFeedback() {
    if (!canSubmit || pickingScreenshot) return
    try {
      onSubmitFeedback({
        kind,
        message: message.trim(),
        ...(email.trim() ? { email: email.trim() } : {}),
        ...(screenshot ? { screenshot } : {}),
      })
      setMessage("")
      setScreenshot(null)
      setStatus("Feedback queued. If you are offline, it will send when you reconnect.")
    } catch {
      setStatus("Could not save your message. Try again or email us.")
    }
  }

  async function pickScreenshot() {
    setPickingScreenshot(true)
    try {
      const picked = await onPickScreenshot()
      if (picked) {
        setScreenshot(picked)
        setStatus("")
      }
    } catch {
      setStatus("Could not add that screenshot. Try another image.")
    } finally {
      setPickingScreenshot(false)
    }
  }

  return (
    <Screen
      preset="scroll"
      safeAreaEdges={["bottom"]}
      header={{ title: "Help", leftTx: "common:back", onLeftPress: onBack }}
      contentContainerStyle={themed($scrollContent)}
      ScrollViewProps={{ testID: "support-scroll" }}
    >
      <View style={themed($content)}>
        <View style={themed($hero)}>
          <Text text="SCRYVE" preset="formLabel" style={themed($eyebrow)} />
          <Text text="Help" preset="heading" accessibilityRole="header" style={themed($title)} />
          <Text
            text="Answers about games, accounts, and Scryve Pro. Send us a message when you need help."
            style={themed($subtitle)}
          />
        </View>

        <View style={themed($contact)}>
          <Text text="Contact us" preset="subheading" accessibilityRole="header" />
          <SegmentedControl
            segments={[
              { id: "bug", label: "Report a problem" },
              { id: "help", label: "Ask for help" },
            ]}
            selectedId={kind}
            accessibilityLabel="Contact reason"
            onSelect={(id) => {
              setKind(id === "help" ? "help" : "bug")
              setStatus("")
            }}
          />
          <TextField
            label={messageLabel}
            placeholder={
              kind === "bug"
                ? "What happened? What did you expect?"
                : "Tell us what you need help with"
            }
            multiline
            value={message}
            onChangeText={(value) => {
              setMessage(value)
              setStatus("")
            }}
          />
          <TextField
            label={emailLabel}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            value={email}
            onChangeText={(value) => {
              setEmail(value)
              setStatus("")
            }}
            status={email.trim() && !emailValid ? "error" : undefined}
            helper={email.trim() && !emailValid ? "Enter a valid email address." : undefined}
          />
          {kind === "help" ? (
            <Text
              text="We usually reply within two business days."
              size="xs"
              style={themed($muted)}
            />
          ) : null}
          {screenshot ? (
            <View style={themed($screenshot)}>
              <Image
                source={{ uri: screenshot.uri }}
                style={$screenshotPreview}
                accessibilityLabel="Selected screenshot"
              />
              <Button text="Remove screenshot" onPress={() => setScreenshot(null)} />
            </View>
          ) : (
            <Button
              text="Add screenshot"
              disabled={pickingScreenshot}
              onPress={() => void pickScreenshot()}
            />
          )}
          <Text
            text="Sends your message, email if provided, app version, build, platform, and any screenshot you add to Sentry."
            size="xs"
            style={themed($muted)}
          />
          <Button
            text="Send"
            preset="reversed"
            disabled={!canSubmit || pickingScreenshot}
            onPress={submitFeedback}
          />
          {status ? <Text text={status} accessibilityRole="alert" size="xs" /> : null}
          <Text text="Prefer email?" size="xs" style={themed($muted)} />
          <Button text="Email support" onPress={onEmailSupport} />
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
          <Text text="Frequently asked questions" preset="subheading" accessibilityRole="header" />
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
    </Screen>
  )
}

const $scrollContent: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: "100%",
  paddingHorizontal: spacing.lg,
  paddingBottom: spacing.md,
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

const $contact: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.md })
const $screenshot: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $screenshotPreview: ImageStyle = { width: 160, height: 280, resizeMode: "contain" }

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
