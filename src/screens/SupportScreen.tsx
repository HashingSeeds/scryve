import { useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { Pressable, View } from "react-native"

import { Button } from "@/components/Button"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { FeedbackLayout } from "@/features/feedback/FeedbackLayout"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import type { SuggestKind } from "./FeedbackConversationScreen"

const FAQS = ["restorePro", "manageSubscription", "gameTrouble", "accountPrivacy"] as const

const CHEVRON = "›"
const WORD_BREAK = /[^\p{L}\p{N}]+/u
const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u

export interface SupportScreenProps {
  unread: number
  hasFeedback: boolean
  offline: boolean
  onBack: () => void
  onYourFeedback: () => void
  onEmailSupport: () => void
  onSuggest: (draft: { kind: SuggestKind; message?: string }) => void
}

export function SupportScreen({
  unread,
  hasFeedback,
  offline,
  onBack,
  onYourFeedback,
  onEmailSupport,
  onSuggest,
}: SupportScreenProps) {
  const { themed } = useAppTheme()
  const [search, setSearch] = useState("")
  const query = search.trim()
  const faqs = query
    ? FAQS.filter((faq) =>
        matchesWords(
          `${translate(`account:support.faq.${faq}.question`)} ${translate(`account:support.faq.${faq}.answer`)}`,
          query,
        ),
      )
    : FAQS

  return (
    <FeedbackLayout title={translate("account:support.title")} offline={offline} onBack={onBack}>
      <View style={themed($sections)}>
        <View>
          <SupportRow
            tx="feedback:support.suggestFeature"
            onPress={() => onSuggest({ kind: "feature" })}
          />
          <SupportRow tx="feedback:support.reportBug" onPress={() => onSuggest({ kind: "bug" })} />
          {hasFeedback ? (
            <SupportRow
              tx="feedback:support.yourFeedback"
              badge={unread ? translate("feedback:support.newCount", { count: unread }) : undefined}
              onPress={onYourFeedback}
            />
          ) : null}
        </View>

        <View style={themed($section)}>
          <Text tx="account:support.faq.heading" preset="subheading" accessibilityRole="header" />
          <TextField
            placeholderTx="feedback:support.search"
            accessibilityLabel={translate("feedback:support.search")}
            value={search}
            autoCorrect={false}
            returnKeyType="search"
            clearable
            onChangeText={setSearch}
          />
          {faqs.length ? (
            <View>
              {faqs.map((faq) => (
                <View key={faq} style={themed($faq)}>
                  <Text
                    tx={`account:support.faq.${faq}.question`}
                    weight="bold"
                    accessibilityRole="header"
                  />
                  <Text
                    tx={`account:support.faq.${faq}.answer`}
                    size="xs"
                    style={themed($answer)}
                  />
                </View>
              ))}
            </View>
          ) : (
            <>
              <Text text={translate("feedback:support.noMatch", { query })} size="xs" tone="dim" />
              <Button
                text={translate("feedback:support.ask", { query })}
                preset="primary"
                onPress={() => onSuggest({ kind: "feature", message: query })}
              />
            </>
          )}
        </View>

        <SupportRow
          tx="feedback:support.email"
          detailTx="feedback:support.emailDetail"
          onPress={onEmailSupport}
        />
      </View>
    </FeedbackLayout>
  )
}

export function matchesWords(text: string, search: string) {
  const lower = text.toLocaleLowerCase()
  const words = lower.split(WORD_BREAK)
  return search
    .toLocaleLowerCase()
    .split(WORD_BREAK)
    .filter(Boolean)
    .every((part) =>
      UNSPACED.test(part) ? lower.includes(part) : words.some((word) => word.startsWith(part)),
    )
}

function SupportRow({
  tx,
  detailTx,
  badge,
  onPress,
}: {
  tx:
    | "feedback:support.suggestFeature"
    | "feedback:support.reportBug"
    | "feedback:support.yourFeedback"
    | "feedback:support.email"
  detailTx?: "feedback:support.emailDetail"
  badge?: string
  onPress: () => void
}) {
  const { themed } = useAppTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={[translate(tx), badge, detailTx ? translate(detailTx) : undefined]
        .filter(Boolean)
        .join(", ")}
      onPress={onPress}
      style={({ pressed }) => [themed($row), pressed && $pressed]}
    >
      <View style={themed($rowText)}>
        <Text tx={tx} weight="medium" />
        {detailTx ? <Text tx={detailTx} size="xs" tone="dim" /> : null}
      </View>
      {badge ? <Text text={badge} size="xs" weight="bold" style={themed($badge)} /> : null}
      <Text text={CHEVRON} tone="dim" />
    </Pressable>
  )
}

const $sections: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xl })
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
const $faq: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  gap: spacing.xxs,
  paddingVertical: spacing.md,
  borderBottomWidth: 1,
  borderColor: colors.separator,
})
const $answer: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.textDim,
  lineHeight: 22,
})
