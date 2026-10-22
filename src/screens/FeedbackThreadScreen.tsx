import { useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { Pressable, View } from "react-native"

import { Button } from "@/components/Button"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { Switch } from "@/components/Toggle/Switch"
import { statusLabel, type FeedbackThread } from "@/features/feedback/status"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

export interface FeedbackThreadScreenProps {
  thread: FeedbackThread | null | undefined
  onReply: (body: string) => Promise<void>
  onIncludeAccount: (included: boolean) => void
  onSignIn: () => void
  onBack: () => void
}

export function FeedbackThreadScreen({
  thread,
  onReply,
  onIncludeAccount,
  onSignIn,
  onBack,
}: FeedbackThreadScreenProps) {
  const { themed } = useAppTheme()
  const [reply, setReply] = useState("")
  const [sending, setSending] = useState(false)
  const [failed, setFailed] = useState(false)
  const [showOriginal, setShowOriginal] = useState(false)

  async function send() {
    if (!reply.trim() || sending) return
    setSending(true)
    setFailed(false)
    try {
      await onReply(reply.trim())
      setReply("")
    } catch {
      setFailed(true)
    } finally {
      setSending(false)
    }
  }

  return (
    <Screen
      preset="scroll"
      safeAreaEdges={["bottom"]}
      header={{ titleTx: "feedback:thread.title", leftTx: "common:back", onLeftPress: onBack }}
      contentContainerStyle={themed($content)}
    >
      {thread === null ? <Text tx="feedback:thread.missing" style={themed($muted)} /> : null}
      {thread ? (
        <>
          <View style={themed($head)}>
            <Text text={thread.request.title} preset="subheading" accessibilityRole="header" />
            <Text
              text={statusLabel(thread.request)}
              size="xxs"
              weight="bold"
              style={themed($muted)}
            />
            <Text text={thread.request.body} />
            {thread.request.original ? (
              <View style={themed($original)}>
                <View style={themed($originalHead)}>
                  <Text
                    tx="feedback:thread.edited"
                    size="xxs"
                    weight="bold"
                    style={themed($muted)}
                  />
                  <Pressable
                    accessibilityRole="button"
                    hitSlop={8}
                    onPress={() => setShowOriginal((shown) => !shown)}
                  >
                    <Text
                      tx={
                        showOriginal
                          ? "feedback:thread.hideOriginal"
                          : "feedback:thread.showOriginal"
                      }
                      size="xxs"
                      style={themed($team)}
                    />
                  </Pressable>
                </View>
                {showOriginal ? (
                  <>
                    <Text
                      text={thread.request.original.title}
                      weight="bold"
                      style={themed($muted)}
                    />
                    <Text text={thread.request.original.body} style={themed($muted)} />
                  </>
                ) : null}
              </View>
            ) : null}
          </View>
          {thread.messages.map((message) => (
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
          <Button
            tx="feedback:thread.send"
            preset="reversed"
            disabled={!reply.trim() || sending}
            onPress={() => void send()}
          />
          {failed ? (
            <Text tx="feedback:thread.sendFailed" accessibilityRole="alert" size="xs" />
          ) : null}
          {thread.request.canLink ? (
            <Switch
              testID="feedback-thread-account"
              labelTx="feedback:thread.includeAccount"
              helperTx="feedback:thread.includeAccountHelper"
              value={thread.request.linked}
              onValueChange={onIncludeAccount}
            />
          ) : thread.request.linked ? (
            <Text tx="feedback:thread.linked" size="xs" style={themed($muted)} />
          ) : (
            <Button tx="feedback:thread.signInToKeep" onPress={onSignIn} />
          )}
        </>
      ) : null}
    </Screen>
  )
}

const $content: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: "100%",
  maxWidth: 680,
  alignSelf: "center",
  paddingHorizontal: spacing.lg,
  paddingBottom: spacing.lg,
  gap: spacing.md,
})
const $head: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  gap: spacing.xs,
  paddingBottom: spacing.md,
  borderBottomWidth: 1,
  borderColor: colors.separator,
})
const $original: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xxs })
const $originalHead: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  justifyContent: "space-between",
  gap: spacing.sm,
})
const $message: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xxs })
const $team: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.tint })
const $muted: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
