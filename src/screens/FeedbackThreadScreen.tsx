import { useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { Pressable, View } from "react-native"

import { Button } from "@/components/Button"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { Switch } from "@/components/Toggle/Switch"
import { FeedbackLayout } from "@/features/feedback/FeedbackLayout"
import { RequestMeta } from "@/features/feedback/RequestParts"
import type { FeedbackThread } from "@/features/feedback/status"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

export type UnsentReply = { operationId: string; body: string; reason?: string }

export interface FeedbackThreadScreenProps {
  thread: FeedbackThread | null | undefined
  unsent: readonly UnsentReply[]
  offline: boolean
  error?: string
  restore?: { id: number; text: string }
  onReply: (body: string) => void
  onDiscard: (operationId: string) => void
  onIncludeAccount: (included: boolean) => void
  onSignIn: () => void
  onBack: () => void
}

export function FeedbackThreadScreen({
  thread,
  unsent,
  offline,
  error,
  restore,
  onReply,
  onDiscard,
  onIncludeAccount,
  onSignIn,
  onBack,
}: FeedbackThreadScreenProps) {
  const { themed } = useAppTheme()
  const [reply, setReply] = useState("")
  const [restored, setRestored] = useState<number>()
  const [showOriginal, setShowOriginal] = useState(false)
  if (restore && restore.id !== restored) {
    setRestored(restore.id)
    setReply(restore.text)
  }
  const request = thread?.request

  return (
    <FeedbackLayout
      title={request?.title ?? translate("feedback:mine.title")}
      offline={offline}
      onBack={onBack}
    >
      {thread === null ? <Text tx="feedback:thread.missing" style={themed($muted)} /> : null}
      {request ? (
        <>
          <RequestMeta item={request} visibility={request.published ? "public" : "private"} />
          <Text text={request.body} />
          {request.original ? (
            <View style={themed($original)}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: showOriginal }}
                hitSlop={8}
                onPress={() => setShowOriginal((shown) => !shown)}
              >
                <Text
                  tx={showOriginal ? "feedback:thread.editedHide" : "feedback:thread.editedShow"}
                  size="xs"
                  style={themed($muted)}
                />
              </Pressable>
              {showOriginal ? (
                <>
                  <Text text={request.original.title} weight="bold" style={themed($muted)} />
                  <Text text={request.original.body} style={themed($muted)} />
                </>
              ) : null}
            </View>
          ) : null}
          {thread?.messages.map((message) => (
            <View key={message._id} style={themed($message)}>
              <Text
                tx={message.from === "team" ? "feedback:thread.team" : "feedback:thread.you"}
                size="xxs"
                weight="bold"
                style={themed(message.from === "team" ? $team : $muted)}
              />
              <Text text={message.body} />
            </View>
          ))}
          {unsent.map((send) => (
            <View key={send.operationId} style={themed($message)}>
              <Text tx="feedback:thread.you" size="xxs" weight="bold" style={themed($muted)} />
              <Text text={send.body} />
              {send.reason ? (
                <>
                  <Text
                    text={translate("feedback:mine.notSent", { reason: send.reason })}
                    size="xxs"
                    accessibilityRole="alert"
                  />
                  <Button
                    tx="feedback:mine.discard"
                    style={themed($discard)}
                    onPress={() => onDiscard(send.operationId)}
                  />
                </>
              ) : (
                <Text
                  tx={offline ? "feedback:mine.waiting" : "feedback:mine.sending"}
                  size="xxs"
                  style={themed($muted)}
                />
              )}
            </View>
          ))}
          <TextField
            labelTx="feedback:thread.replyLabel"
            placeholderTx="feedback:thread.replyPlaceholder"
            multiline
            maxLength={2000}
            value={reply}
            onChangeText={setReply}
          />
          <Button
            tx={offline ? "feedback:thread.sendOffline" : "feedback:thread.send"}
            preset="reversed"
            disabled={!reply.trim()}
            onPress={() => {
              onReply(reply.trim())
              setReply("")
            }}
          />
          {error ? <Text text={error} accessibilityRole="alert" size="xs" /> : null}
          {request.linkedElsewhere ? (
            <Text tx="feedback:thread.linkedElsewhere" size="xs" style={themed($muted)} />
          ) : request.canLink ? (
            <Switch
              testID="feedback-thread-account"
              labelTx="feedback:thread.includeAccount"
              helperTx="feedback:thread.includeAccountHelper"
              value={request.linked}
              onValueChange={onIncludeAccount}
            />
          ) : request.linked ? (
            <Text tx="feedback:thread.linked" size="xs" style={themed($muted)} />
          ) : (
            <Button tx="feedback:thread.signInToKeep" onPress={onSignIn} />
          )}
        </>
      ) : null}
    </FeedbackLayout>
  )
}

const $original: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xxs })
const $message: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xxs })
const $team: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.tint })
const $muted: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $discard: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignSelf: "flex-start",
  marginTop: spacing.xxs,
})
