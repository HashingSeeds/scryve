import { useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { Pressable, View } from "react-native"

import { Button } from "@/components/Button"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { Text } from "@/components/Text"
import { FeedbackLayout } from "@/features/feedback/FeedbackLayout"
import { RequestMeta } from "@/features/feedback/RequestParts"
import type { FeedbackOwnItem } from "@/features/feedback/status"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

export type UnsentRequest = { operationId: string; title: string; reason?: string }

export interface MyFeedbackScreenProps {
  items: readonly FeedbackOwnItem[] | undefined
  unsent: readonly UnsentRequest[]
  offline: boolean
  deleteFailed?: boolean
  onOpen: (item: FeedbackOwnItem) => void
  onDiscard: (operationId: string) => void
  onDeleteAll: () => void
  onBack: () => void
}

export function MyFeedbackScreen({
  items,
  unsent,
  offline,
  deleteFailed,
  onOpen,
  onDiscard,
  onDeleteAll,
  onBack,
}: MyFeedbackScreenProps) {
  const { themed } = useAppTheme()
  const [confirming, setConfirming] = useState(false)
  const empty = items?.length === 0 && unsent.length === 0
  return (
    <FeedbackLayout title={translate("feedback:mine.title")} offline={offline} onBack={onBack}>
      {empty ? <Text tx="feedback:mine.empty" style={themed($muted)} /> : null}
      {unsent.map((send) => (
        <View key={send.operationId} style={themed($row)}>
          <Text text={send.title} weight="bold" numberOfLines={2} />
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
      {items?.map((item) => (
        <Pressable
          key={item._id}
          accessibilityRole="button"
          onPress={() => onOpen(item)}
          style={({ pressed }) => [themed($row), pressed && $pressed]}
        >
          <View style={themed($rowHead)}>
            <Text text={item.title} weight="bold" style={$grow} numberOfLines={2} />
            {item.unread ? (
              <Text tx="feedback:mine.unread" size="xxs" weight="bold" style={themed($new)} />
            ) : null}
          </View>
          <RequestMeta item={item} visibility={item.published ? "public" : "private"} />
        </Pressable>
      ))}
      {empty || items === undefined ? null : (
        <View style={themed($delete)}>
          <Button tx="feedback:mine.deleteAll" onPress={() => setConfirming(true)} />
          <Text tx="feedback:mine.deleteHint" size="xs" style={themed($muted)} />
          {deleteFailed ? (
            <Text tx="feedback:mine.deleteFailed" size="xs" accessibilityRole="alert" />
          ) : null}
        </View>
      )}
      <ConfirmDialog
        visible={confirming}
        title={translate("feedback:mine.deleteConfirmTitle")}
        message={translate("feedback:mine.deleteConfirmBody")}
        confirmText={translate("feedback:mine.delete")}
        cancelText={translate("common:cancel")}
        destructive
        backdropAccessibilityLabel={translate("common:cancel")}
        onConfirm={() => {
          setConfirming(false)
          onDeleteAll()
        }}
        onClose={() => setConfirming(false)}
      />
    </FeedbackLayout>
  )
}

const $row: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  gap: spacing.xxs,
  paddingTop: spacing.md,
  borderTopWidth: 1,
  borderColor: colors.separator,
})
const $rowHead: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  alignItems: "flex-start",
  gap: spacing.sm,
})
const $grow: TextStyle = { flex: 1 }
const $pressed: ViewStyle = { opacity: 0.6 }
const $new: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.tint })
const $muted: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $discard: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  alignSelf: "flex-start",
  marginTop: spacing.xxs,
})
const $delete: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xs,
  marginTop: spacing.xl,
})
