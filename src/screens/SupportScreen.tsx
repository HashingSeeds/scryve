import { useState } from "react"
import type { ImageStyle, TextStyle, ViewStyle } from "react-native"
import { Image, View } from "react-native"
import { Trans } from "react-i18next"

import { Button } from "@/components/Button"
import { ListItem } from "@/components/ListItem"
import { Screen } from "@/components/Screen"
import { SegmentedControl } from "@/components/SegmentedControl"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

const GETTING_STARTED = ["startGame", "choosePlay", "setUpTable"] as const

const FAQS = ["restorePro", "manageSubscription", "gameTrouble", "accountPrivacy"] as const

const SUPPORT_KINDS = ["bug", "help", "feedback"] as const

const BRAND_EYEBROW = "SCRYVE"
const COPYRIGHT = "© 2026 Hashing Seeds LLC"
const EMAIL_PLACEHOLDER = "you@example.com"

export type SupportFeedback = {
  kind: (typeof SUPPORT_KINDS)[number]
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
  const emailValid = /^[^\s@]+@(?:[^\s@.]+\.)+[^\s@.]+$/.test(email.trim())
  // why: only help promises a reply, so it is the one kind that needs an email.
  const canSubmit = !!message.trim() && (kind === "help" ? emailValid : !email.trim() || emailValid)
  const copy = {
    contactReason: translate("account:support.contactReason"),
    selectedScreenshot: translate("account:support.selectedScreenshot"),
    licenseAgreementHint: translate("account:legal.licenseAgreementHint"),
  }

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
      setStatus(translate("account:support.status.queued"))
    } catch {
      setStatus(translate("account:support.status.saveFailed"))
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
      setStatus(translate("account:support.status.screenshotFailed"))
    } finally {
      setPickingScreenshot(false)
    }
  }

  return (
    <Screen
      preset="scroll"
      safeAreaEdges={["bottom"]}
      header={{ titleTx: "account:support.title", leftTx: "common:back", onLeftPress: onBack }}
      contentContainerStyle={themed($scrollContent)}
      ScrollViewProps={{ testID: "support-scroll" }}
    >
      <View style={themed($content)}>
        <View style={themed($hero)}>
          <Text text={BRAND_EYEBROW} preset="formLabel" style={themed($eyebrow)} />
          <Text
            tx="account:support.title"
            preset="heading"
            accessibilityRole="header"
            style={themed($title)}
          />
          <Text tx="account:support.subtitle" style={themed($subtitle)} />
        </View>

        <View style={themed($contact)}>
          <Text tx="account:support.contactUs" preset="subheading" accessibilityRole="header" />
          <SegmentedControl
            segments={SUPPORT_KINDS.map((id) => ({
              id,
              label: translate(`account:support.kind.${id}`),
            }))}
            selectedId={kind}
            accessibilityLabel={copy.contactReason}
            onSelect={(id) => {
              const next = SUPPORT_KINDS.find((supportKind) => supportKind === id)
              if (next) setKind(next)
              setStatus("")
            }}
          />
          <TextField
            labelTx={`account:support.messageLabel.${kind}`}
            placeholderTx={`account:support.messagePlaceholder.${kind}`}
            multiline
            value={message}
            onChangeText={(value) => {
              setMessage(value)
              setStatus("")
            }}
          />
          <Text size="xs" style={themed($muted)}>
            <Trans
              i18nKey="account:support.translationNotice"
              components={{
                privacy: (
                  <Text
                    size="xs"
                    accessibilityRole="link"
                    style={themed($link)}
                    onPress={onOpenPrivacy}
                  />
                ),
              }}
            />
          </Text>
          <TextField
            labelTx={`account:support.emailLabel.${kind}`}
            placeholder={EMAIL_PLACEHOLDER}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            value={email}
            onChangeText={(value) => {
              setEmail(value)
              setStatus("")
            }}
            status={email.trim() && !emailValid ? "error" : undefined}
            helperTx={email.trim() && !emailValid ? "account:support.emailInvalid" : undefined}
          />
          {kind === "help" ? (
            <Text tx="account:support.replyTime" size="xs" style={themed($muted)} />
          ) : null}
          {screenshot ? (
            <View style={themed($screenshot)}>
              <Image
                source={{ uri: screenshot.uri }}
                style={$screenshotPreview}
                accessibilityLabel={copy.selectedScreenshot}
              />
              <Button tx="account:support.removeScreenshot" onPress={() => setScreenshot(null)} />
            </View>
          ) : (
            <Button
              tx="account:support.addScreenshot"
              disabled={pickingScreenshot}
              onPress={() => void pickScreenshot()}
            />
          )}
          <Text tx="account:support.disclosure" size="xs" style={themed($muted)} />
          <Button
            tx="account:support.send"
            preset="reversed"
            disabled={!canSubmit || pickingScreenshot}
            onPress={submitFeedback}
          />
          {status ? <Text text={status} accessibilityRole="alert" size="xs" /> : null}
          <Text tx="account:support.preferEmail" size="xs" style={themed($muted)} />
          <Button tx="account:support.emailSupport" onPress={onEmailSupport} />
        </View>

        <View style={themed($section)}>
          <Text
            tx="account:support.gettingStarted.heading"
            preset="subheading"
            accessibilityRole="header"
          />
          <View style={themed($steps)}>
            {GETTING_STARTED.map((step, index) => (
              <View key={step} style={themed($stepCard)}>
                <Text
                  text={String(index + 1).padStart(2, "0")}
                  size="xxs"
                  weight="bold"
                  style={themed($stepNumber)}
                />
                <Text
                  tx={`account:support.gettingStarted.${step}.title`}
                  weight="bold"
                  style={themed($cardTitle)}
                />
                <Text
                  tx={`account:support.gettingStarted.${step}.body`}
                  size="xs"
                  style={themed($muted)}
                />
              </View>
            ))}
          </View>
        </View>

        <View style={themed($section)}>
          <Text tx="account:support.faq.heading" preset="subheading" accessibilityRole="header" />
          <View style={themed($faqs)}>
            {FAQS.map((faq) => (
              <View key={faq} style={themed($faqCard)}>
                <Text
                  tx={`account:support.faq.${faq}.question`}
                  weight="bold"
                  accessibilityRole="header"
                  style={themed($cardTitle)}
                />
                <Text tx={`account:support.faq.${faq}.answer`} size="xs" style={themed($answer)} />
              </View>
            ))}
          </View>
        </View>

        <View style={themed($section)}>
          <Text tx="account:legal.heading" preset="subheading" accessibilityRole="header" />
          <View>
            <ListItem
              tx="account:legal.privacyPolicy"
              rightIcon="caretRight"
              onPress={onOpenPrivacy}
            />
            <ListItem
              tx="account:legal.termsOfUse"
              rightIcon="caretRight"
              topSeparator
              onPress={onOpenTerms}
            />
            {onOpenLicenseAgreement ? (
              <ListItem
                tx="account:legal.licenseAgreement"
                accessibilityHint={copy.licenseAgreementHint}
                rightIcon="caretRight"
                topSeparator
                onPress={onOpenLicenseAgreement}
              />
            ) : null}
            <ListItem
              tx="account:legal.cookiePolicy"
              rightIcon="caretRight"
              topSeparator
              onPress={onOpenCookiePolicy}
            />
          </View>
        </View>

        <View style={themed($footer)}>
          <Text text={COPYRIGHT} size="xxs" style={themed($muted)} />
          {appVersion ? (
            <Text
              tx="account:support.appVersion"
              txOptions={{ version: appVersion }}
              size="xxs"
              style={themed($muted)}
            />
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
const $link: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.tint,
  textDecorationLine: "underline",
})
