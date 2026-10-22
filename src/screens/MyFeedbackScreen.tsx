import { useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { Pressable, View } from "react-native"

import { Button } from "@/components/Button"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { statusLabel, type FeedbackOwnItem } from "@/features/feedback/status"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

export interface MyFeedbackScreenProps {
  items: readonly FeedbackOwnItem[] | undefined
  onOpen: (item: FeedbackOwnItem) => void
  onDeleteAll: () => void
  onBack: () => void
}

export function MyFeedbackScreen({ items, onOpen, onDeleteAll, onBack }: MyFeedbackScreenProps) {
  const { themed } = useAppTheme()
  const [confirming, setConfirming] = useState(false)
  return (
    <Screen
      preset="scroll"
      safeAreaEdges={["bottom"]}
      header={{ titleTx: "feedback:mine.title", leftTx: "common:back", onLeftPress: onBack }}
      contentContainerStyle={themed($content)}
    >
      {items?.length === 0 ? <Text tx="feedback:mine.empty" style={themed($muted)} /> : null}
      {items?.map((item) => (
        <Pressable
          key={item._id}
          accessibilityRole="button"
          onPress={() => onOpen(item)}
          style={themed($row)}
        >
          <View style={themed($rowHead)}>
            <Text text={item.title} weight="bold" style={$grow} numberOfLines={2} />
            {item.unread ? (
              <Text tx="feedback:mine.unread" size="xxs" weight="bold" style={themed($new)} />
            ) : null}
          </View>
          <Text
            text={[
              statusLabel(item),
              ...(item.published ? [] : [translate("feedback:mine.private")]),
            ].join(" · ")}
            size="xxs"
            style={themed($muted)}
          />
        </Pressable>
      ))}
      {items?.length ? (
        <Button
          tx="feedback:mine.deleteAll"
          style={themed($delete)}
          onPress={() => setConfirming(true)}
        />
      ) : null}
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
const $new: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.tint })
const $muted: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $delete: ThemedStyle<ViewStyle> = ({ spacing }) => ({ marginTop: spacing.lg })
