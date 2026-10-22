import { useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"

import { Button } from "@/components/Button"
import { Screen } from "@/components/Screen"
import { SegmentedControl } from "@/components/SegmentedControl"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { Switch } from "@/components/Toggle/Switch"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

const KINDS = ["feature", "bug"] as const

export type FeedbackDraft = {
  kind: (typeof KINDS)[number]
  title: string
  body: string
  includeAccount: boolean
}

export interface FeedbackFormScreenProps {
  signedIn: boolean
  onSignIn: () => void
  onSubmit: (draft: FeedbackDraft) => Promise<void>
  onBack: () => void
}

export function FeedbackFormScreen({
  signedIn,
  onSignIn,
  onSubmit,
  onBack,
}: FeedbackFormScreenProps) {
  const { themed } = useAppTheme()
  const [kind, setKind] = useState<FeedbackDraft["kind"]>("feature")
  const [title, setTitle] = useState("")
  const [body, setBody] = useState("")
  const [includeAccount, setIncludeAccount] = useState(false)
  const [sending, setSending] = useState(false)
  const [failed, setFailed] = useState(false)
  const canSend = !!title.trim() && !!body.trim() && !sending

  async function send() {
    if (!canSend) return
    setSending(true)
    setFailed(false)
    try {
      await onSubmit({
        kind,
        title: title.trim(),
        body: body.trim(),
        includeAccount: signedIn && includeAccount,
      })
    } catch {
      setFailed(true)
      setSending(false)
    }
  }

  return (
    <Screen
      preset="scroll"
      safeAreaEdges={["bottom"]}
      header={{ titleTx: "feedback:form.title", leftTx: "common:back", onLeftPress: onBack }}
      contentContainerStyle={themed($content)}
    >
      <SegmentedControl
        segments={KINDS.map((id) => ({ id, label: translate(`feedback:form.${id}`) }))}
        selectedId={kind}
        accessibilityLabel={translate("feedback:form.kind")}
        onSelect={(id) => {
          const next = KINDS.find((candidate) => candidate === id)
          if (next) setKind(next)
        }}
      />
      <TextField
        labelTx="feedback:form.titleLabel"
        placeholderTx="feedback:form.titlePlaceholder"
        maxLength={120}
        value={title}
        onChangeText={setTitle}
      />
      <TextField
        labelTx="feedback:form.bodyLabel"
        placeholderTx={`feedback:form.bodyPlaceholder.${kind}`}
        multiline
        maxLength={2000}
        value={body}
        onChangeText={setBody}
      />
      {signedIn ? (
        <Switch
          testID="feedback-include-account"
          labelTx="feedback:form.includeAccount"
          helperTx="feedback:form.includeAccountHelper"
          value={includeAccount}
          onValueChange={setIncludeAccount}
        />
      ) : (
        <View style={themed($anonymous)}>
          <Text tx="feedback:form.anonymous" size="xs" style={themed($muted)} />
          <Button tx="feedback:form.signInToKeep" onPress={onSignIn} />
        </View>
      )}
      <Text tx="feedback:form.private" size="xs" style={themed($muted)} />
      <Button
        tx="feedback:form.send"
        preset="reversed"
        disabled={!canSend}
        onPress={() => void send()}
      />
      {failed ? <Text tx="feedback:form.sendFailed" accessibilityRole="alert" size="xs" /> : null}
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
const $anonymous: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $muted: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
