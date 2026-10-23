import { useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"

import { Button } from "@/components/Button"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { Switch } from "@/components/Toggle/Switch"
import { FeedbackLayout } from "@/features/feedback/FeedbackLayout"
import type { FeedbackThread } from "@/features/feedback/status"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

export interface FeedbackThreadScreenProps {
  thread: FeedbackThread | null | undefined
  offline: boolean
  error?: string
  restore?: { id: number; text: string }
  onReply: (body: string) => void
  onIncludeAccount: (included: boolean) => void
  onSignIn: () => void
  onBack: () => void
}

export function FeedbackThreadScreen({
  thread,
  offline,
  error,
  restore,
  onReply,
  onIncludeAccount,
  onSignIn,
  onBack,
}: FeedbackThreadScreenProps) {
  const { themed } = useAppTheme()
  const [reply, setReply] = useState("")
  const [restored, setRestored] = useState<number>()
  if (restore && restore.id !== restored) {
    setRestored(restore.id)
    setReply((draft) => (draft.trim() ? `${restore.text}\n\n${draft}` : restore.text))
  }
  const request = thread?.request

  return (
    <FeedbackLayout
      title={translate("feedback:mine.title")}
      offline={offline}
      onBack={onBack}
      footer={
        request ? (
          <Button
            tx="feedback:thread.send"
            preset="reversed"
            disabled={!reply.trim() || offline}
            onPress={() => {
              onReply(reply.trim())
              setReply("")
            }}
          />
        ) : undefined
      }
    >
      {thread === null ? <Text tx="feedback:thread.missing" style={themed($muted)} /> : null}
      {request ? (
        <>
          <Text
            tx={`feedback:suggest.${request.kind}`}
            size="xxs"
            weight="bold"
            style={themed($muted)}
          />
          <Text text={request.body} />
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
          <TextField
            labelTx="feedback:thread.replyLabel"
            placeholderTx="feedback:thread.replyPlaceholder"
            multiline
            maxLength={2000}
            value={reply}
            onChangeText={setReply}
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

const $message: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xxs })
const $team: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.tint })
const $muted: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
