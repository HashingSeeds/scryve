import type { ReactNode } from "react"
import type { ImageStyle, TextStyle, ViewStyle } from "react-native"
import { Image, Pressable, View } from "react-native"
import { Trans } from "react-i18next"
import Svg, { Circle, Path, Rect } from "react-native-svg"

import { PressableIcon } from "@/components/Icon"
import { SegmentedControl } from "@/components/SegmentedControl"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { Switch } from "@/components/Toggle/Switch"
import type { BugScreenshot } from "@/features/feedback/bugReport"
import { FeedbackLayout } from "@/features/feedback/FeedbackLayout"
import type { FeedbackThread } from "@/features/feedback/status"
import { appLocale } from "@/i18n"
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
  screenshot: BugScreenshot | null
  sentScreenshotUri?: string
  signedIn: boolean
  includeAccount: boolean
  offline: boolean
  error?: string
  onKind: (kind: SuggestKind) => void
  onDraft: (draft: string) => void
  onSend: () => void
  onPickScreenshot: () => void
  onRemoveScreenshot: () => void
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
  screenshot,
  sentScreenshotUri,
  signedIn,
  includeAccount,
  offline,
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
    Boolean(draft.trim()) && !offline && outgoing === undefined && (!started || Boolean(request))
  const opened = started || outgoing !== undefined

  return (
    <FeedbackLayout
      title={translate(opened ? "feedback:mine.title" : "feedback:suggest.title")}
      heading={false}
      chat
      offline={offline}
      onBack={onBack}
      footer={
        thread === null ? undefined : (
          <>
            {error ? <Text text={error} accessibilityRole="alert" size="xs" /> : null}
            {screenshot ? (
              <View style={themed($attachment)}>
                <Image
                  source={{ uri: screenshot.uri }}
                  style={themed($thumbnail)}
                  accessibilityLabel={translate("feedback:suggest.selectedScreenshot")}
                />
                <PressableIcon
                  icon="x"
                  size={16}
                  accessibilityRole="button"
                  accessibilityLabel={translate("feedback:suggest.removeScreenshot")}
                  hitSlop={12}
                  onPress={onRemoveScreenshot}
                />
              </View>
            ) : null}
            <View style={themed($composer)}>
              {opened ? null : (
                <ComposerButton
                  label={translate("feedback:suggest.addScreenshot")}
                  onPress={onPickScreenshot}
                >
                  <AttachGlyph />
                </ComposerButton>
              )}
              <TextField
                testID="feedback-composer"
                placeholderTx={
                  opened
                    ? "feedback:thread.replyPlaceholder"
                    : `feedback:suggest.bodyPlaceholder.${kind}`
                }
                multiline
                maxLength={2000}
                value={draft}
                onChangeText={onDraft}
                containerStyle={$grow}
                inputWrapperStyle={themed($input)}
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
      {thread === null ? <Text tx="feedback:thread.missing" style={themed($muted)} /> : null}
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
          ) : (
            <Text size="xs" style={themed($muted)}>
              {translate("feedback:suggest.anonymous")}{" "}
              <Text
                size="xs"
                accessibilityRole="link"
                style={themed($link)}
                tx="feedback:suggest.signInToKeep"
                onPress={onSignIn}
              />
            </Text>
          )}
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
          <Text tx="feedback:suggest.sentryDisclosure" size="xs" style={themed($muted)} />
        </>
      )}
      {request || outgoing !== undefined ? (
        <Text
          tx={`feedback:suggest.${request?.kind ?? kind}`}
          size="xxs"
          weight="bold"
          style={themed($muted)}
        />
      ) : null}
      {request ? (
        <>
          <Message
            from="player"
            body={request.body}
            at={request.createdAt}
            status={firstIsLatest ? "sent" : undefined}
            screenshotUri={sentScreenshotUri}
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
          screenshotUri={request ? undefined : sentScreenshotUri}
        />
      ) : null}
      {request && !outgoing ? (
        <AccountStatus request={request} onLinkAccount={onLinkAccount} onSignIn={onSignIn} />
      ) : null}
    </FeedbackLayout>
  )
}

function Message({
  from,
  body,
  at,
  status,
  screenshotUri,
}: {
  from: "player" | "team"
  body: string
  at?: number
  status?: "sending" | "sent"
  screenshotUri?: string
}) {
  const { themed } = useAppTheme()
  const mine = from === "player"
  const meta = [
    translate(mine ? "feedback:thread.you" : "feedback:thread.team"),
    at === undefined ? undefined : messageTime(at),
    status ? translate(`feedback:thread.${status}`) : undefined,
  ]
    .filter(Boolean)
    .join(" · ")
  return (
    <View style={[themed($message), mine ? themed($mine) : themed($theirs)]}>
      {screenshotUri ? (
        <Image
          source={{ uri: screenshotUri }}
          style={themed($sentScreenshot)}
          accessibilityLabel={translate("feedback:suggest.selectedScreenshot")}
        />
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
    return <Text tx="feedback:thread.linkedElsewhere" size="xs" style={themed($muted)} />
  if (request.linked) return <Text tx="feedback:thread.linked" size="xs" style={themed($muted)} />
  return (
    <Text size="xs" style={themed($muted)}>
      {translate("feedback:thread.notLinked")}{" "}
      <Text
        size="xs"
        accessibilityRole="link"
        style={themed($link)}
        tx={request.canLink ? "feedback:thread.includeAccount" : "feedback:thread.signInToKeep"}
        onPress={request.canLink ? onLinkAccount : onSignIn}
      />
    </Text>
  )
}

// why: the time alone reads as today; older messages lead with the date.
function messageTime(at: number) {
  const date = new Date(at)
  const time = date.toLocaleTimeString(appLocale, { hour: "numeric", minute: "2-digit" })
  if (date.toDateString() === new Date().toDateString()) return time
  return `${date.toLocaleDateString(appLocale, { month: "short", day: "numeric" })} ${time}`
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
const $input: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: COMPOSER_BUTTON_SIZE,
  maxHeight: 140,
  paddingVertical: spacing.xxs,
})
const $composerButton: ThemedStyle<ViewStyle> = () => ({
  width: COMPOSER_BUTTON_SIZE,
  height: COMPOSER_BUTTON_SIZE,
  borderRadius: COMPOSER_BUTTON_SIZE / 2,
  alignItems: "center",
  justifyContent: "center",
})
const $filled: ThemedStyle<ViewStyle> = ({ colors }) => ({ backgroundColor: colors.text })
const $attachment: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "flex-start",
  gap: spacing.xs,
})
const $thumbnail: ThemedStyle<ImageStyle> = ({ colors }) => ({
  width: 48,
  height: 48,
  borderRadius: 4,
  backgroundColor: colors.surfaceRaised,
})
const $sentScreenshot: ThemedStyle<ImageStyle> = ({ colors }) => ({
  width: 96,
  height: 160,
  borderRadius: 4,
  resizeMode: "cover",
  backgroundColor: colors.surface,
})
const $message: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  maxWidth: "85%",
  gap: spacing.xxs,
  paddingHorizontal: spacing.sm,
  paddingVertical: spacing.xs,
  borderRadius: 12,
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
const $link: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: colors.tint,
  textDecorationLine: "underline",
})
