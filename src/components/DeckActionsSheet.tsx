import type { TextStyle, ViewStyle } from "react-native"
import { ScrollView, TouchableOpacity, View } from "react-native"

import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { Icon } from "./Icon"
import { Sheet } from "./Sheet"
import { $sheetScroll, $sheetScrollContent } from "./sheetStyles"
import { Text } from "./Text"

export type DeckAction = {
  id: string
  label: string
  onPress: () => void
  destructive?: boolean
  detail?: string
  // why: an action that can't run right now stays listed, with this reason under it.
  blocked?: string
  selected?: boolean
}

export function DeckActionsSheet({
  visible,
  actions,
  onClose,
  onDismissed,
  testID = "deck-actions-sheet",
}: {
  visible: boolean
  actions: readonly DeckAction[]
  onClose: () => void
  onDismissed: () => void
  testID?: string
}) {
  const { themed, theme } = useAppTheme()
  return (
    <Sheet visible={visible} onClose={onClose} onDismissed={onDismissed} testID={testID}>
      <ScrollView style={themed($sheetScroll)} contentContainerStyle={themed($sheetScrollContent)}>
        {actions.map(({ id, label, onPress, destructive, detail, blocked, selected }) => {
          const note = blocked ?? detail
          return (
            <TouchableOpacity
              key={id}
              testID={`deck-action-${id}`}
              accessibilityRole="button"
              accessibilityHint={note}
              accessibilityState={{ disabled: Boolean(blocked), selected }}
              disabled={Boolean(blocked)}
              style={themed($row)}
              onPress={onPress}
            >
              <View style={$labelRow}>
                <Text
                  weight="medium"
                  tone={blocked ? "dim" : undefined}
                  style={
                    destructive && !blocked
                      ? themed($destructive)
                      : selected
                        ? { color: theme.colors.tint }
                        : undefined
                  }
                  text={label}
                />
                {selected ? <Icon icon="check" size={18} color={theme.colors.tint} /> : null}
              </View>
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
const $labelRow: ViewStyle = {
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
}
const $destructive: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.error })
