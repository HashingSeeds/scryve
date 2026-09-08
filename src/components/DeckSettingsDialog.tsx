import { useState, type ReactNode } from "react"
import { ScrollView } from "react-native"
import type { TextStyle, ViewStyle } from "react-native"

import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { AlertNote } from "./AlertNote"
import { Button } from "./Button"
import { DialogCard } from "./DialogCard"
import { SelectField } from "./SelectField"
import { Text } from "./Text"
import { TextField } from "./TextField"
import { deckFormats } from "../../convex/lib/deckGames"

export type DeckSettingsDraft = { name: string; format: string }

export interface DeckSettingsDialogProps {
  children?: ReactNode
  game: string
  initial: DeckSettingsDraft
  busy?: boolean
  error?: string
  onSubmit: (draft: DeckSettingsDraft) => void
  onDelete: () => void
  onClose: () => void
}

export function DeckSettingsDialog({
  children,
  game,
  initial,
  busy,
  error,
  onSubmit,
  onDelete,
  onClose,
}: DeckSettingsDialogProps) {
  const { themed } = useAppTheme()
  const [name, setName] = useState(initial.name)
  const [format, setFormat] = useState(initial.format)

  return (
    <DialogCard
      visible
      onClose={onClose}
      closeDisabled={busy}
      backdropTestID="deck-settings-backdrop"
      backdropAccessibilityLabel="Close deck settings"
      dialogTestID="deck-settings-dialog"
      accessibilityViewIsModal
      placement="bottom"
      wide
    >
      <ScrollView contentContainerStyle={$content} keyboardShouldPersistTaps="handled">
        <Text preset="subheading" text="Deck details" />
        <TextField
          testID="deck-name-input"
          label="Deck name"
          value={name}
          maxLength={80}
          onChangeText={setName}
        />
        <SelectField
          testID="deck-format-picker"
          label="Format"
          value={format}
          options={deckFormats(game).map((candidate) => ({
            id: candidate.id,
            label: candidate.label,
          }))}
          onSelect={(next) => {
            if (next) setFormat(next)
          }}
        />
        {children}
        {error ? <AlertNote text={error} /> : null}
        <Button
          testID="deck-settings-save"
          text={busy ? "Saving…" : "Save changes"}
          preset="reversed"
          disabled={busy || !name.trim()}
          onPress={() => onSubmit({ name, format })}
        />
        <Button
          testID="delete-deck-button"
          text="Delete deck"
          style={themed($destructiveButton)}
          textStyle={themed($destructiveText)}
          disabled={busy}
          onPress={onDelete}
        />
      </ScrollView>
    </DialogCard>
  )
}

const $destructiveButton: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.errorBackground,
  borderColor: colors.error,
  borderWidth: 1,
})
const $destructiveText: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.error })

const $content: ViewStyle = { gap: 16 }
