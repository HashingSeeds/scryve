import { useState } from "react"
import type { ViewStyle } from "react-native"
import { ScrollView, View } from "react-native"

import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { AlertNote } from "./AlertNote"
import { Button } from "./Button"
import { SegmentedControl } from "./SegmentedControl"
import { Sheet } from "./Sheet"
import { $sheetScroll } from "./sheetStyles"
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
  visible: boolean
  onClose: () => void
  onDismissed: () => void
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
  visible,
  onClose,
  onDismissed,
}: DeckVersionDialogProps) {
  const { themed } = useAppTheme()
  const [name, setName] = useState(initialName)
  const [note, setNote] = useState(initialNote)
  const [copyCards, setCopyCards] = useState(true)

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      onDismissed={onDismissed}
      dismissible={!busy}
      testID="deck-version-dialog"
    >
      <ScrollView
        style={$sheetScroll}
        contentContainerStyle={themed($content)}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
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
            optional
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
            <SegmentedControl
              testID="version-cards"
              segments={[
                {
                  id: "copy",
                  label: translate("decks:versionDialog.copyFrom", { version: copyFromLabel }),
                },
                { id: "empty", label: translate("decks:versionDialog.empty") },
              ]}
              selectedId={copyCards ? "copy" : "empty"}
              onSelect={(id) => setCopyCards(id === "copy")}
            />
            <Text
              size="meta"
              tone="dim"
              tx={copyCards ? "decks:versionDialog.copyDetail" : "decks:versionDialog.emptyDetail"}
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
      </ScrollView>
    </Sheet>
  )
}

const $content: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.md })
const $choices: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
