import type { TextStyle, ViewStyle } from "react-native"
import { ScrollView, TouchableOpacity } from "react-native"

import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { Sheet } from "./Sheet"
import { $sheetScroll } from "./sheetStyles"
import { Text } from "./Text"

export type DeckAction = {
  id: string
  label: string
  onPress: () => void
  destructive?: boolean
  detail?: string
  // why: an action that can't run right now stays listed, with this reason under it.
  blocked?: string
}

export function DeckActionsSheet({
  visible,
  actions,
  onClose,
  onDismissed,
}: {
  visible: boolean
  actions: readonly DeckAction[]
  onClose: () => void
  onDismissed: () => void
}) {
  const { themed } = useAppTheme()
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      onDismissed={onDismissed}
      testID="deck-actions-sheet"
    >
      <ScrollView style={$sheetScroll}>
        {actions.map(({ id, label, onPress, destructive, detail, blocked }) => {
          const note = blocked ?? detail
          return (
            <TouchableOpacity
              key={id}
              testID={`deck-action-${id}`}
              accessibilityRole="button"
              accessibilityHint={note}
              accessibilityState={{ disabled: Boolean(blocked) }}
              disabled={Boolean(blocked)}
              style={themed($row)}
              onPress={onPress}
            >
              <Text
                weight="medium"
                tone={blocked ? "dim" : undefined}
                style={destructive && !blocked ? themed($destructive) : undefined}
                text={label}
              />
              {note ? <Text size="meta" tone="dim" text={note} /> : null}
            </TouchableOpacity>
          )
        })}
      </ScrollView>
    </Sheet>
  )
}

const $row: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 48,
  justifyContent: "center",
  gap: spacing.xxxs,
  paddingVertical: spacing.sm,
})
const $destructive: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.error })
