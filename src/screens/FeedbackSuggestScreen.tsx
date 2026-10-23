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
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

export const SUGGEST_KINDS = ["feature", "bug"] as const
export type SuggestKind = (typeof SUGGEST_KINDS)[number]

export interface FeedbackSuggestScreenProps {
  kind: SuggestKind
  body: string
  includeAccount: boolean
  screenshot: BugScreenshot | null
  signedIn: boolean
  offline: boolean
  sending: boolean
  error?: string
  onKind: (kind: SuggestKind) => void
  onBody: (body: string) => void
  onIncludeAccount: (included: boolean) => void
  onPickScreenshot: () => void
  onRemoveScreenshot: () => void
  onSignIn: () => void
  onOpenPrivacy: () => void
  onSend: () => void
  onBack: () => void
}

export function FeedbackSuggestScreen({
  kind,
  body,
  includeAccount,
  screenshot,
  signedIn,
  offline,
  sending,
  error,
  onKind,
  onBody,
  onIncludeAccount,
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
      heading={false}
      offline={offline}
      onBack={onBack}
      footer={
        <Button
          tx="feedback:suggest.send"
          preset="reversed"
          disabled={!body.trim() || sending || offline}
          onPress={onSend}
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

const $screenshot: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $screenshotPreview: ImageStyle = { width: 160, height: 280, resizeMode: "contain" }
const $anonymous: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $muted: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $link: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.tint,
  textDecorationLine: "underline",
})
