import { useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { Pressable, View } from "react-native"

import { Button } from "@/components/Button"
import { ListItem } from "@/components/ListItem"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

const GETTING_STARTED = ["startGame", "choosePlay", "setUpTable"] as const

const FAQS = ["restorePro", "manageSubscription", "gameTrouble", "accountPrivacy"] as const

const COPYRIGHT = "© 2026 Hashing Seeds LLC"
const CHEVRON = "›"

export interface SupportScreenProps {
  unread: number
  onBack: () => void
  onSearch: (search: string) => void
  onAllRequests: () => void
  onYourRequests: () => void
  onEmailSupport: () => void
  onSuggest: () => void
  onOpenPrivacy: () => void
  onOpenTerms: () => void
  onOpenLicenseAgreement?: () => void
  onOpenCookiePolicy: () => void
  appVersion?: string
}

export function SupportScreen({
  unread,
  onBack,
  onSearch,
  onAllRequests,
  onYourRequests,
  onEmailSupport,
  onSuggest,
  onOpenPrivacy,
  onOpenTerms,
  onOpenLicenseAgreement,
  onOpenCookiePolicy,
  appVersion,
}: SupportScreenProps) {
  const { themed } = useAppTheme()
  const [search, setSearch] = useState("")
  const copy = { licenseAgreementHint: translate("account:legal.licenseAgreementHint") }

  return (
    <Screen
      preset="scroll"
      safeAreaEdges={["bottom"]}
      header={{ titleTx: "account:support.title", leftTx: "common:back", onLeftPress: onBack }}
      contentContainerStyle={themed($scrollContent)}
      ScrollViewProps={{ testID: "support-scroll", keyboardShouldPersistTaps: "handled" }}
    >
      <View style={themed($content)}>
        <View style={themed($requests)}>
          <Text tx="account:support.title" preset="heading" accessibilityRole="header" />
          <TextField
            placeholderTx="feedback:support.search"
            accessibilityLabel={translate("feedback:support.search")}
            value={search}
            autoCorrect={false}
            onChangeText={(text) => {
              // why: typing hands off to the board's own search, so coming back finds this field empty.
              if (text.trim()) {
                onSearch(text)
                setSearch("")
              } else setSearch(text)
            }}
          />
          <View>
            <SupportRow tx="feedback:support.allRequests" onPress={onAllRequests} />
            <SupportRow
              tx="feedback:support.yourRequests"
              badge={unread ? translate("feedback:support.newCount", { count: unread }) : undefined}
              onPress={onYourRequests}
            />
            <SupportRow
              tx="feedback:support.email"
              detailTx="feedback:support.emailDetail"
              onPress={onEmailSupport}
            />
          </View>
          <Button tx="feedback:support.suggest" preset="reversed" onPress={onSuggest} />
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

function SupportRow({
  tx,
  detailTx,
  badge,
  onPress,
}: {
  tx: "feedback:support.allRequests" | "feedback:support.yourRequests" | "feedback:support.email"
  detailTx?: "feedback:support.emailDetail"
  badge?: string
  onPress: () => void
}) {
  const { themed } = useAppTheme()
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [themed($row), pressed && $pressed]}
    >
      <View style={themed($rowText)}>
        <Text tx={tx} weight="medium" />
        {detailTx ? <Text tx={detailTx} size="xs" style={themed($muted)} /> : null}
      </View>
      {badge ? <Text text={badge} size="xs" weight="bold" style={themed($badge)} /> : null}
      <Text text={CHEVRON} style={themed($muted)} />
    </Pressable>
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

const $requests: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.md })
const $row: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  minHeight: 52,
  paddingVertical: spacing.sm,
  borderBottomWidth: 1,
  borderColor: colors.separator,
})
const $rowText: ThemedStyle<ViewStyle> = () => ({ flex: 1 })
const $pressed: ViewStyle = { opacity: 0.6 }
const $badge: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.tint })

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
