import { useState, type ReactNode } from "react"
import type { ImageStyle, TextStyle, ViewStyle } from "react-native"
import { Image, Pressable, View } from "react-native"
import { Trans } from "react-i18next"
import Svg, { Circle, Path, Rect } from "react-native-svg"

import { PressableIcon } from "@/components/Icon"
import { SegmentedControl } from "@/components/SegmentedControl"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { Switch } from "@/components/Toggle/Switch"
import { FeedbackLayout } from "@/features/feedback/FeedbackLayout"
import type { FeedbackThread } from "@/features/feedback/status"
import { formatDate, formatTime, joinParts } from "@/i18n/format"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { decorativeSvgProps } from "@/utils/decorativeSvgProps"

export const SUGGEST_KINDS = ["feature", "bug"] as const
export type SuggestKind = (typeof SUGGEST_KINDS)[number]

export interface FeedbackConversationScreenProps {
  started: boolean
  thread: FeedbackThread | null | undefined
  kind: SuggestKind
  draft: string
  outgoing?: string
  screenshotUris: string[]
  canAttach: boolean
  picking: boolean
  sentScreenshotUris: string[]
  signedIn: boolean
  includeAccount: boolean
  online: boolean
  showOffline: boolean
  error?: string
  onKind: (kind: SuggestKind) => void
  onDraft: (draft: string) => void
  onSend: () => void
  onPickScreenshot: () => void
  onRemoveScreenshot: (index: number) => void
  onIncludeAccount: (included: boolean) => void
  onLinkAccount: () => void
  onSignIn: () => void
  onOpenPrivacy: () => void
  onBack: () => void
}

export function FeedbackConversationScreen({
  started,
  thread,
  kind,
  draft,
  outgoing,
  screenshotUris,
  canAttach,
  picking,
  sentScreenshotUris,
  signedIn,
  includeAccount,
  online,
  showOffline,
  error,
  onKind,
  onDraft,
  onSend,
  onPickScreenshot,
  onRemoveScreenshot,
  onIncludeAccount,
  onLinkAccount,
  onSignIn,
  onOpenPrivacy,
  onBack,
}: FeedbackConversationScreenProps) {
  const { themed } = useAppTheme()
  const request = thread?.request
  const messages = thread?.messages ?? []
  const lastFromPlayer = messages.filter((message) => message.from === "player").at(-1)
  const firstIsLatest = !outgoing && !lastFromPlayer
  const canSend =
    Boolean(draft.trim()) &&
    online &&
    !picking &&
    outgoing === undefined &&
    (!started || Boolean(request))
  const opened = started || outgoing !== undefined
  // why: iOS keeps a multiline field's height when its text changes from outside, so the field is rebuilt when a send clears it or a failed send restores it.
  const [field, setField] = useState({ build: 0, typed: draft })
  if (draft !== field.typed) setField({ build: field.build + 1, typed: draft })

  return (
    <FeedbackLayout
      title={translate(opened ? "feedback:mine.title" : "feedback:suggest.title")}
      heading={false}
      chat
      onBack={onBack}
      footer={
        thread === null ? undefined : (
          <>
            {error ? <Text text={error} accessibilityRole="alert" size="xs" /> : null}
            {screenshotUris.length > 0 ? (
              <View style={themed($attachments)}>
                {screenshotUris.map((uri, index) => (
                  <View key={uri}>
                    <Image
                      source={{ uri }}
                      style={themed($thumbnail)}
                      accessibilityLabel={translate("feedback:suggest.selectedScreenshot")}
                    />
                    <PressableIcon
                      icon="x"
                      size={12}
                      accessibilityRole="button"
                      accessibilityLabel={translate("feedback:suggest.removeScreenshot")}
                      hitSlop={10}
                      disabled={picking}
                      containerStyle={themed($remove)}
                      onPress={() => onRemoveScreenshot(index)}
                    />
                  </View>
                ))}
              </View>
            ) : null}
            <View style={themed($composer)}>
              {opened ? null : (
                <ComposerButton
                  label={translate("feedback:suggest.addScreenshot")}
                  disabled={!canAttach || picking}
                  onPress={onPickScreenshot}
                >
                  <AttachGlyph />
                </ComposerButton>
              )}
              <TextField
                key={field.build}
                autoFocus={field.build > 0}
                dismissButton={false}
                testID="feedback-composer"
                placeholderTx={
                  opened
                    ? "feedback:thread.replyPlaceholder"
                    : `feedback:suggest.bodyPlaceholder.${kind}`
                }
                multiline
                maxLength={2000}
                value={draft}
                onChangeText={(typed) => {
                  setField(({ build }) => ({ build, typed }))
                  onDraft(typed)
                }}
                containerStyle={$grow}
                inputWrapperStyle={$inputWrapper}
                style={$input}
              />
              <ComposerButton
                label={translate("feedback:thread.send")}
                disabled={!canSend}
                filled
                onPress={onSend}
              >
                <SendGlyph />
              </ComposerButton>
            </View>
          </>
        )
      }
    >
      {thread === null ? <Text tx="feedback:thread.missing" tone="dim" /> : null}
      {opened ? null : (
        <>
          <SegmentedControl
            segments={SUGGEST_KINDS.map((id) => ({
              id,
              label: translate(`feedback:suggest.${id}`),
            }))}
            selectedId={kind}
            accessibilityLabel={translate("feedback:suggest.kind")}
            onSelect={(id) => {
              const next = SUGGEST_KINDS.find((candidate) => candidate === id)
              if (next) onKind(next)
            }}
          />
          {signedIn ? (
            <Switch
              testID="feedback-include-account"
              labelTx="feedback:suggest.includeAccount"
              helperTx="feedback:suggest.includeAccountHelper"
              value={includeAccount}
              onValueChange={onIncludeAccount}
            />
          ) : null}
          <View style={themed($prompt)}>
            <Text tx={`feedback:suggest.prompt.${kind}`} preset="subheading" style={$centered} />
            <Text size="xs" tone="dim" style={$centered}>
              <Trans
                i18nKey="feedback:suggest.notice"
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
            {showOffline ? <OfflineNote /> : null}
          </View>
        </>
      )}
      {request || outgoing !== undefined ? (
        <Text
          tx={`feedback:suggest.${request?.kind ?? kind}`}
          size="xxs"
          weight="bold"
          tone="dim"
        />
      ) : null}
      {request ? (
        <>
          <Message
            from="player"
            body={request.body}
            at={request.createdAt}
            status={firstIsLatest ? "sent" : undefined}
            screenshotUris={sentScreenshotUris}
          />
          {messages.map((message) => (
            <Message
              key={message._id}
              from={message.from}
              body={message.body}
              at={message.createdAt}
              status={!outgoing && message === lastFromPlayer ? "sent" : undefined}
            />
          ))}
        </>
      ) : null}
      {outgoing !== undefined ? (
        <Message
          from="player"
          body={outgoing}
          status="sending"
          screenshotUris={request ? [] : sentScreenshotUris}
        />
      ) : null}
      {request && !outgoing ? (
        <AccountStatus request={request} onLinkAccount={onLinkAccount} onSignIn={onSignIn} />
      ) : null}
      {opened && showOffline ? <OfflineNote /> : null}
    </FeedbackLayout>
  )
}

function OfflineNote() {
  return (
    <Text tx="feedback:offline" size="xs" tone="dim" accessibilityRole="alert" style={$centered} />
  )
}

function Message({
  from,
  body,
  at,
  status,
  screenshotUris = [],
}: {
  from: "player" | "team"
  body: string
  at?: number
  status?: "sending" | "sent"
  screenshotUris?: string[]
}) {
  const { themed } = useAppTheme()
  const mine = from === "player"
  const meta = joinParts([
    translate(mine ? "feedback:thread.you" : "feedback:thread.team"),
    at === undefined ? undefined : messageTime(at),
    status ? translate(`feedback:thread.${status}`) : undefined,
  ])
  return (
    <View style={[themed($message), mine ? themed($mine) : themed($theirs)]}>
      {screenshotUris.length > 0 ? (
        <View style={themed($attachments)}>
          {screenshotUris.map((uri) => (
            <Image
              key={uri}
              source={{ uri }}
              style={themed($sentScreenshot)}
              accessibilityLabel={translate("feedback:suggest.selectedScreenshot")}
            />
          ))}
        </View>
      ) : null}
      <Text text={body} />
      <Text text={meta} size="xxs" style={themed(mine ? $muted : $team)} />
    </View>
  )
}

function AccountStatus({
  request,
  onLinkAccount,
  onSignIn,
}: {
  request: FeedbackThread["request"]
  onLinkAccount: () => void
  onSignIn: () => void
}) {
  const { themed } = useAppTheme()
  if (request.linkedElsewhere)
    return <Text tx="feedback:thread.linkedElsewhere" size="xs" tone="dim" />
  if (request.linked) return <Text tx="feedback:thread.linked" size="xs" tone="dim" />
  return (
    <Text size="xs" tone="dim">
      {translate("feedback:thread.notLinked")}{" "}
      <Text
        size="xs"
        accessibilityRole="link"
        style={themed($link)}
        tx={request.canLink ? "feedback:thread.includeAccount" : "feedback:thread.signInToSync"}
        onPress={request.canLink ? onLinkAccount : onSignIn}
      />
    </Text>
  )
}

function messageTime(at: number) {
  if (new Date(at).toDateString() === new Date().toDateString()) return formatTime(at)
  return formatDate(at, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
}

function ComposerButton({
  label,
  disabled = false,
  filled = false,
  onPress,
  children,
}: {
  label: string
  disabled?: boolean
  filled?: boolean
  onPress: () => void
  children: ReactNode
}) {
  const { themed } = useAppTheme()
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={6}
      onPress={onPress}
      style={({ pressed }) => [
        themed($composerButton),
        filled && themed($filled),
        disabled && $disabled,
        pressed && $pressed,
      ]}
    >
      {children}
    </Pressable>
  )
}

function SendGlyph() {
  const { theme } = useAppTheme()
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" {...decorativeSvgProps({ accessible: false })}>
      <Path
        d="M12 19V5M5 12l7-7 7 7"
        stroke={theme.colors.background}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  )
}

function AttachGlyph() {
  const { theme } = useAppTheme()
  const stroke = theme.colors.text
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" {...decorativeSvgProps({ accessible: false })}>
      <Rect x={3} y={4} width={18} height={16} rx={2} stroke={stroke} strokeWidth={2} fill="none" />
      <Circle cx={9} cy={10} r={1.75} fill={stroke} />
      <Path
        d="M21 16l-5-5-9 9"
        stroke={stroke}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  )
}

const COMPOSER_BUTTON_SIZE = 40

const $grow: ViewStyle = { flex: 1 }
const $pressed: ViewStyle = { opacity: 0.7 }
const $disabled: ViewStyle = { opacity: 0.4 }
const $composer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "flex-end",
  gap: spacing.xs,
})
const $inputWrapper: ViewStyle = { minHeight: COMPOSER_BUTTON_SIZE }
/** why: a stretched multiline input pins its first line to the top, above the buttons' center. */
const $input: TextStyle = { alignSelf: "center", maxHeight: 120 }
const $composerButton: ThemedStyle<ViewStyle> = () => ({
  width: COMPOSER_BUTTON_SIZE,
  height: COMPOSER_BUTTON_SIZE,
  borderRadius: COMPOSER_BUTTON_SIZE / 2,
  alignItems: "center",
  justifyContent: "center",
})
const $filled: ThemedStyle<ViewStyle> = ({ colors }) => ({ backgroundColor: colors.text })
const $attachments: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.xs,
})
const $thumbnail: ThemedStyle<ImageStyle> = ({ colors, radius }) => ({
  width: 56,
  height: 56,
  borderRadius: radius.sm,
  borderWidth: 1,
  borderColor: colors.border,
  backgroundColor: colors.surfaceRaised,
})
const $remove: ThemedStyle<ViewStyle> = ({ colors }) => ({
  position: "absolute",
  top: -6,
  end: -6,
  width: 20,
  height: 20,
  borderRadius: 10,
  alignItems: "center",
  justifyContent: "center",
  backgroundColor: colors.surfaceRaised,
  borderWidth: 1,
  borderColor: colors.background,
})
const $sentScreenshot: ThemedStyle<ImageStyle> = ({ colors, radius }) => ({
  width: 72,
  height: 128,
  borderRadius: radius.sm,
  resizeMode: "cover",
  backgroundColor: colors.surface,
})
const $message: ThemedStyle<ViewStyle> = ({ spacing, radius }) => ({
  maxWidth: "85%",
  gap: spacing.xxs,
  paddingHorizontal: spacing.sm,
  paddingVertical: spacing.xs,
  borderRadius: radius.xl,
})
const $mine: ThemedStyle<ViewStyle> = ({ colors }) => ({
  alignSelf: "flex-end",
  backgroundColor: colors.surfaceRaised,
})
const $theirs: ThemedStyle<ViewStyle> = ({ colors }) => ({
  alignSelf: "flex-start",
  borderWidth: 1,
  borderColor: colors.separator,
})
const $team: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.tint })
const $muted: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $prompt: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  justifyContent: "center",
  gap: spacing.xs,
})
const $centered: TextStyle = { textAlign: "center" }
const $link: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.tint,
  textDecorationLine: "underline",
})
