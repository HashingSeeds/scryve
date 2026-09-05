import { useState } from "react"
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

export type DeckSettingsDraft = { name: string; format: string; note: string }

export interface DeckSettingsDialogProps {
  game: string
  initial: DeckSettingsDraft
  busy?: boolean
  error?: string
  onSubmit: (draft: DeckSettingsDraft) => void
  onDelete: () => void
  onClose: () => void
}

export function DeckSettingsDialog({
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
  const [note, setNote] = useState(initial.note)

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
      <Text preset="subheading" text="Deck settings" />
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
      <TextField
        testID="deck-note-input"
        label="Notes"
        helper="What is this deck trying to do, and what do you want to try next?"
        value={note}
        multiline
        numberOfLines={4}
        textAlignVertical="top"
        maxLength={1000}
        onChangeText={setNote}
      />
      {error ? <AlertNote text={error} /> : null}
      <Button
        testID="deck-settings-save"
        text={busy ? "Saving…" : "Save changes"}
        preset="reversed"
        disabled={busy || !name.trim()}
        onPress={() => onSubmit({ name, format, note })}
      />
      <Button
        testID="delete-deck-button"
        text="Delete deck"
        style={themed($destructiveButton)}
        textStyle={themed($destructiveText)}
        disabled={busy}
        onPress={onDelete}
      />
    </DialogCard>
  )
}

const $destructiveButton: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.errorBackground,
  borderColor: colors.error,
  borderWidth: 1,
})
const $destructiveText: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.error })
