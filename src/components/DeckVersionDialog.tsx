import { useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { View } from "react-native"

import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { AlertNote } from "./AlertNote"
import { Button } from "./Button"
import { ChoiceButton } from "./ChoiceButton"
import { $dialogActions, $dialogButton, $dialogText, DialogCard } from "./DialogCard"
import { Text } from "./Text"
import { TextField } from "./TextField"

export type DeckVersionDraft = { name: string; note: string; copyCards: boolean }

export interface DeckVersionDialogProps {
  title: string
  submitLabel: string
  initialName?: string
  initialNote?: string
  copyFromLabel?: string
  notesLocked?: boolean
  busy?: boolean
  error?: string
  onSubmit: (draft: DeckVersionDraft) => void
  onDelete?: () => void
  onClose: () => void
}

export function DeckVersionDialog({
  title,
  submitLabel,
  initialName = "",
  initialNote = "",
  copyFromLabel,
  notesLocked,
  busy,
  error,
  onSubmit,
  onDelete,
  onClose,
}: DeckVersionDialogProps) {
  const { themed } = useAppTheme()
  const [name, setName] = useState(initialName)
  const [note, setNote] = useState(initialNote)
  const [copyCards, setCopyCards] = useState(true)

  return (
    <DialogCard
      visible
      onClose={onClose}
      closeDisabled={busy}
      backdropTestID="deck-version-backdrop"
      backdropAccessibilityLabel="Close version editor"
      dialogTestID="deck-version-dialog"
      accessibilityViewIsModal
    >
      <Text preset="subheading" text={title} style={themed($dialogText)} />
      <TextField
        testID="version-name-input"
        label="Version name"
        helper='Something you will recognise later, like "vs Control" or "Budget swap".'
        value={name}
        maxLength={40}
        onChangeText={setName}
      />
      {notesLocked ? null : (
        <TextField
          testID="version-note-input"
          label="Notes"
          helper="What changed, and what are you testing?"
          value={note}
          multiline
          numberOfLines={3}
          textAlignVertical="top"
          maxLength={1000}
          onChangeText={setNote}
        />
      )}
      {copyFromLabel ? (
        <View style={themed($choices)}>
          <ChoiceButton
            testID="version-copy-cards"
            text={`Copy ${copyFromLabel}`}
            detail="Start from the current list"
            selected={copyCards}
            onPress={() => setCopyCards(true)}
          />
          <ChoiceButton
            testID="version-empty-cards"
            text="Start empty"
            detail="Build this version from scratch"
            selected={!copyCards}
            onPress={() => setCopyCards(false)}
          />
        </View>
      ) : null}
      {error ? <AlertNote text={error} /> : null}
      <View style={themed($dialogActions)}>
        <Button text="Cancel" style={themed($dialogButton)} disabled={busy} onPress={onClose} />
        <Button
          testID="version-submit"
          text={busy ? "Saving…" : submitLabel}
          preset="reversed"
          style={themed($dialogButton)}
          disabled={busy || !name.trim()}
          onPress={() => onSubmit({ name, note, copyCards })}
        />
      </View>
      {onDelete ? (
        <Button
          testID="delete-version-button"
          text="Delete version"
          style={themed($destructiveButton)}
          textStyle={themed($destructiveText)}
          disabled={busy}
          onPress={onDelete}
        />
      ) : null}
    </DialogCard>
  )
}

const $choices: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $destructiveButton: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.errorBackground,
  borderColor: colors.error,
  borderWidth: 1,
})
const $destructiveText: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.error })
