import { useState } from "react"
import { ScrollView } from "react-native"
import type { ViewStyle } from "react-native"

import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { AlertNote } from "./AlertNote"
import { Button } from "./Button"
import { SelectField } from "./SelectField"
import { Sheet } from "./Sheet"
import { $sheetScroll } from "./sheetStyles"
import { Text } from "./Text"
import { TextField } from "./TextField"
import { deckFormats } from "../../convex/lib/deckGames"
import { deckNameWarning } from "../features/decks/deckCopy"

export type DeckSettingsDraft = { name: string; format: string }

export interface DeckSettingsDialogProps {
  game: string
  initial: DeckSettingsDraft
  busy?: boolean
  error?: string
  onSubmit: (draft: DeckSettingsDraft) => void
  visible: boolean
  onClose: () => void
  onDismissed: () => void
}

export function DeckSettingsDialog({
  game,
  initial,
  busy,
  error,
  onSubmit,
  visible,
  onClose,
  onDismissed,
}: DeckSettingsDialogProps) {
  const { themed } = useAppTheme()
  const [name, setName] = useState(initial.name)
  const [format, setFormat] = useState(initial.format)

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      onDismissed={onDismissed}
      dismissible={!busy}
      testID="deck-settings-dialog"
    >
      <ScrollView
        style={$sheetScroll}
        contentContainerStyle={themed($content)}
        keyboardShouldPersistTaps="handled"
      >
        <Text preset="subheading" tx="decks:settings.title" />
        <TextField
          testID="deck-name-input"
          labelTx="decks:settings.name"
          value={name}
          maxLength={80}
          helper={deckNameWarning(name)}
          onChangeText={setName}
        />
        <SelectField
          testID="deck-format-picker"
          label={translate("decks:settings.format")}
          field="format"
          value={format}
          options={deckFormats(game).map((candidate) => ({
            id: candidate.id,
            label: candidate.label,
          }))}
          onSelect={(next) => {
            if (next) setFormat(next)
          }}
        />
        {error ? <AlertNote text={error} /> : null}
        <Button
          testID="deck-settings-save"
          tx={busy ? "decks:saving" : "decks:settings.save"}
          preset="primary"
          disabled={busy || !name.trim()}
          onPress={() => onSubmit({ name, format })}
        />
      </ScrollView>
    </Sheet>
  )
}

const $content: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.md })
