import type { TextStyle, ViewStyle } from "react-native"
import { ScrollView, TouchableOpacity } from "react-native"

import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { DialogCard } from "./DialogCard"
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
  actions,
  onClose,
}: {
  actions: readonly DeckAction[]
  onClose: () => void
}) {
  const { themed } = useAppTheme()
  return (
    <DialogCard
      visible
      onClose={onClose}
      backdropTestID="deck-actions-backdrop"
      backdropAccessibilityLabel={translate("decks:actions.close")}
      dialogTestID="deck-actions-sheet"
      accessibilityViewIsModal
      placement="bottom"
      wide
    >
      <ScrollView>
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
                size="md"
                weight="medium"
                tone={blocked ? "dim" : undefined}
                style={destructive && !blocked ? themed($destructive) : undefined}
                text={label}
              />
              {note ? <Text size="xs" tone="dim" text={note} /> : null}
            </TouchableOpacity>
          )
        })}
      </ScrollView>
    </DialogCard>
  )
}

const $row: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 48,
  justifyContent: "center",
  gap: spacing.xxxs,
  paddingVertical: spacing.sm,
})
const $destructive: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.error })
