import { useState } from "react"
import type { ViewStyle } from "react-native"
import { View } from "react-native"

import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { AlertNote } from "./AlertNote"
import { Button } from "./Button"
import { ChoiceButton } from "./ChoiceButton"
import { DialogCard } from "./DialogCard"
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
      backdropAccessibilityLabel={translate("decks:versionDialog.close")}
      dialogTestID="deck-version-dialog"
      accessibilityViewIsModal
      placement="bottom"
      wide
    >
      <Text preset="subheading" text={title} />
      <TextField
        testID="version-name-input"
        labelTx="decks:versionDialog.name"
        helperTx="decks:versionDialog.nameHelper"
        value={name}
        maxLength={40}
        onChangeText={setName}
      />
      {notesLocked ? null : (
        <TextField
          testID="version-note-input"
          labelTx="decks:versionDialog.notes"
          helperTx="decks:versionDialog.notesHelper"
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
            text={translate("decks:versionDialog.copyFrom", { version: copyFromLabel })}
            detail={translate("decks:versionDialog.copyDetail")}
            selected={copyCards}
            onPress={() => setCopyCards(true)}
          />
          <ChoiceButton
            testID="version-empty-cards"
            tx="decks:versionDialog.empty"
            detail={translate("decks:versionDialog.emptyDetail")}
            selected={!copyCards}
            onPress={() => setCopyCards(false)}
          />
        </View>
      ) : null}
      {error ? <AlertNote text={error} /> : null}
      <Button
        testID="version-submit"
        text={busy ? translate("decks:saving") : submitLabel}
        preset="primary"
        disabled={busy || !name.trim()}
        onPress={() => onSubmit({ name, note, copyCards })}
      />
      {onDelete ? (
        <Button
          testID="delete-version-button"
          tx="decks:versionDialog.delete"
          preset="destructive"
          disabled={busy}
          onPress={onDelete}
        />
      ) : null}
    </DialogCard>
  )
}

const $choices: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
