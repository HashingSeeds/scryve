import type { ImageStyle, TextStyle, ViewStyle } from "react-native"
import { Image, View } from "react-native"
import { Trans } from "react-i18next"

import { Button } from "@/components/Button"
import { SegmentedControl } from "@/components/SegmentedControl"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { Switch } from "@/components/Toggle/Switch"
import type { BugScreenshot } from "@/features/feedback/bugReport"
import { FeedbackLayout } from "@/features/feedback/FeedbackLayout"
import { RequestMeta, VoteButton } from "@/features/feedback/RequestParts"
import type { FeedbackBoardItem } from "@/features/feedback/status"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

export const SUGGEST_KINDS = ["feature", "bug"] as const
export type SuggestKind = (typeof SUGGEST_KINDS)[number]
export const MATCH_MIN_LENGTH = 3

export interface FeedbackSuggestScreenProps {
  step: 1 | 2
  kind: SuggestKind
  title: string
  body: string
  includeAccount: boolean
  screenshot: BugScreenshot | null
  signedIn: boolean
  matches: readonly FeedbackBoardItem[] | undefined
  offline: boolean
  sending: boolean
  error?: string
  voteFailed: boolean
  onKind: (kind: SuggestKind) => void
  onTitle: (title: string) => void
  onBody: (body: string) => void
  onIncludeAccount: (included: boolean) => void
  onContinue: () => void
  onEditTitle: () => void
  onPickScreenshot: () => void
  onRemoveScreenshot: () => void
  onSignIn: () => void
  onOpenPrivacy: () => void
  onSend: () => void
  onVote: (item: FeedbackBoardItem, voted: boolean) => void
  onBack: () => void
}

export function FeedbackSuggestScreen(props: FeedbackSuggestScreenProps) {
  return props.step === 1 ? <TitleStep {...props} /> : <DetailsStep {...props} />
}

function TitleStep({
  kind,
  title,
  matches,
  offline,
  voteFailed,
  onKind,
  onTitle,
  onContinue,
  onVote,
  onBack,
}: FeedbackSuggestScreenProps) {
  const { themed } = useAppTheme()
  const typed = title.trim().length >= MATCH_MIN_LENGTH
  return (
    <FeedbackLayout
      title={translate("feedback:suggest.title")}
      offline={offline}
      onBack={onBack}
      footer={
        <Button
          tx="feedback:suggest.continue"
          preset="reversed"
          disabled={!title.trim()}
          onPress={onContinue}
        />
      }
    >
      <SegmentedControl
        segments={SUGGEST_KINDS.map((id) => ({ id, label: translate(`feedback:suggest.${id}`) }))}
        selectedId={kind}
        accessibilityLabel={translate("feedback:suggest.kind")}
        onSelect={(id) => {
          const next = SUGGEST_KINDS.find((candidate) => candidate === id)
          if (next) onKind(next)
        }}
      />
      <TextField
        labelTx="feedback:suggest.titleLabel"
        placeholderTx="feedback:suggest.titlePlaceholder"
        maxLength={120}
        value={title}
        onChangeText={onTitle}
        returnKeyType="next"
        onSubmitEditing={() => title.trim() && onContinue()}
      />
      {!typed ? (
        <Text tx="feedback:suggest.matchesHint" size="xs" style={themed($muted)} />
      ) : matches?.length === 0 ? (
        <Text tx="feedback:suggest.noMatches" size="xs" style={themed($muted)} />
      ) : matches ? (
        <>
          <Text tx="feedback:suggest.matchesIntro" size="xs" style={themed($muted)} />
          {matches.map((item) => (
            <View key={item._id} style={themed($match)}>
              <VoteButton item={item} onVote={(voted) => onVote(item, voted)} />
              <View style={themed($matchText)}>
                <Text text={item.title} size="xs" weight="bold" />
                <RequestMeta item={item} yours={item.mine} />
              </View>
            </View>
          ))}
          {offline ? (
            <Text tx="feedback:board.offlineVotes" size="xxs" style={themed($muted)} />
          ) : null}
        </>
      ) : null}
      {voteFailed ? (
        <Text tx="feedback:board.voteFailed" size="xs" accessibilityRole="alert" />
      ) : null}
    </FeedbackLayout>
  )
}

function DetailsStep({
  kind,
  title,
  body,
  includeAccount,
  screenshot,
  signedIn,
  offline,
  sending,
  error,
  onBody,
  onIncludeAccount,
  onEditTitle,
  onPickScreenshot,
  onRemoveScreenshot,
  onSignIn,
  onOpenPrivacy,
  onSend,
  onBack,
}: FeedbackSuggestScreenProps) {
  const { themed } = useAppTheme()
  return (
    <FeedbackLayout
      title={translate("feedback:suggest.title")}
      offline={offline}
      onBack={onBack}
      footer={
        <Button
          tx={offline ? "feedback:suggest.sendOffline" : "feedback:suggest.send"}
          preset="reversed"
          disabled={!body.trim() || sending}
          onPress={onSend}
        />
      }
    >
      <View style={themed($titleBlock)}>
        <Text tx={`feedback:suggest.${kind}`} size="xxs" weight="bold" style={themed($muted)} />
        <Text text={title.trim()} weight="bold" />
        <Button tx="feedback:suggest.editTitle" style={themed($editTitle)} onPress={onEditTitle} />
      </View>
      <TextField
        labelTx="feedback:suggest.bodyLabel"
        placeholderTx={`feedback:suggest.bodyPlaceholder.${kind}`}
        multiline
        maxLength={2000}
        value={body}
        onChangeText={onBody}
      />
      <Text size="xs" style={themed($muted)}>
        <Trans
          i18nKey="feedback:suggest.translationNotice"
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
      {kind === "bug" ? (
        <View style={themed($screenshot)}>
          {screenshot ? (
            <>
              <Image
                source={{ uri: screenshot.uri }}
                style={$screenshotPreview}
                accessibilityLabel={translate("feedback:suggest.selectedScreenshot")}
              />
              <Button tx="feedback:suggest.removeScreenshot" onPress={onRemoveScreenshot} />
            </>
          ) : (
            <Button tx="feedback:suggest.addScreenshot" onPress={onPickScreenshot} />
          )}
          <Text tx="feedback:suggest.bugDisclosure" size="xs" style={themed($muted)} />
        </View>
      ) : null}
      {signedIn ? (
        <Switch
          testID="feedback-include-account"
          labelTx="feedback:suggest.includeAccount"
          helperTx="feedback:suggest.includeAccountHelper"
          value={includeAccount}
          onValueChange={onIncludeAccount}
        />
      ) : (
        <View style={themed($anonymous)}>
          <Text tx="feedback:suggest.anonymous" size="xs" style={themed($muted)} />
          <Button tx="feedback:suggest.signInToKeep" onPress={onSignIn} />
        </View>
      )}
      {error ? <Text text={error} accessibilityRole="alert" size="xs" /> : null}
    </FeedbackLayout>
  )
}

const $match: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  gap: spacing.md,
  paddingTop: spacing.sm,
  borderTopWidth: 1,
  borderColor: colors.separator,
})
const $matchText: ThemedStyle<ViewStyle> = ({ spacing }) => ({ flex: 1, gap: spacing.xxs })
const $titleBlock: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xxs })
const $editTitle: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignSelf: "flex-start",
  marginTop: spacing.xxs,
})
const $screenshot: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $screenshotPreview: ImageStyle = { width: 160, height: 280, resizeMode: "contain" }
const $anonymous: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $muted: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $link: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.tint,
  textDecorationLine: "underline",
})
