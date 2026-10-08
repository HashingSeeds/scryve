import { type ReactNode } from "react"
import { SectionList, TouchableOpacity, View } from "react-native"
import type { TextStyle, ViewStyle } from "react-native"

import { BottomActionBar } from "@/components/BottomActionBar"
import { Button } from "@/components/Button"
import { Header } from "@/components/Header"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { DeckCardRow, DeckCardSectionHeader } from "./DeckCardRow"
import { groupedCards, printingKey, totalQuantity, type DeckCard } from "./deckCards"
import { deckFormatLabel, deckGame, deckSections } from "../../../convex/lib/deckGames"

export function DeckView({
  tab,
  onTabChange: setTab,
  name,
  game,
  format,
  cards,
  note,
  editing,
  dirty,
  busy,
  guest,
  cardsUnavailable,
  cardsCached,
  canAddOffline,
  addOfflineNote,
  editingDisabled,
  saveStatus,
  error,
  onBack,
  onEdit,
  onSave,
  onCancel,
  onDetails,
  onAddMatch,
  onAdd,
  onChooseCommander,
  commanderWarnings,
  onNoteChange,
  onFocus,
  onIncrement,
  onDecrement,
  undo,
}: {
  tab: "cards" | "notes"
  onTabChange: (tab: "cards" | "notes") => void
  name: string
  game: string
  format: string
  cards: DeckCard[]
  note: string
  editing: boolean
  dirty: boolean
  busy?: boolean
  guest?: boolean
  cardsUnavailable?: boolean
  cardsCached?: boolean
  canAddOffline?: boolean
  addOfflineNote?: string
  editingDisabled?: boolean
  saveStatus?: string
  error?: ReactNode
  onBack: () => void
  onEdit: () => void
  onSave: () => void
  onCancel: () => void
  onDetails: () => void
  onAddMatch?: () => void
  onAdd: () => void
  onChooseCommander?: () => void
  commanderWarnings?: string[]
  onNoteChange: (note: string) => void
  onFocus: (card: DeckCard) => void
  onIncrement: (card: DeckCard) => void
  onDecrement: (card: DeckCard) => void
  undo?: { name: string; restore: () => void }
}) {
  const { themed, theme } = useAppTheme()
  const sections = groupedCards(cards, deckSections(game, format))
  if (onChooseCommander && !sections.some((section) => section.board === "commander")) {
    sections.unshift({ board: "commander", label: "Commander", data: [], quantity: 0 })
  }
  return (
    <>
      <Header
        title={editing ? "Edit deck" : guest ? "Guest deck" : "Deck"}
        backgroundColor={theme.colors.surface}
        leftTx={editing ? undefined : "common:back"}
        leftText={editing ? "Cancel" : undefined}
        onLeftPress={editing ? onCancel : onBack}
        RightActionComponent={
          <View style={$row}>
            <TouchableOpacity
              accessibilityRole="button"
              testID={editing ? "save-version-button" : "edit-deck-button"}
              disabled={busy || editingDisabled || (editing && !dirty)}
              style={$touch}
              onPress={editing ? onSave : onEdit}
            >
              <Text
                text={editing ? (busy ? "Saving…" : "Save") : "Edit"}
                style={[
                  themed($action),
                  (busy || editingDisabled || (editing && !dirty)) && $disabled,
                ]}
              />
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Deck details"
              testID="deck-settings-button"
              style={$touch}
              disabled={busy || editing || editingDisabled}
              onPress={onDetails}
            >
              <Text text="•••" style={busy || editing || editingDisabled ? $disabled : undefined} />
            </TouchableOpacity>
          </View>
        }
      />
      <SectionList
        testID="deck-cards-list"
        style={$flex}
        contentContainerStyle={themed($content)}
        sections={tab === "cards" ? sections : []}
        keyExtractor={(card, index) => `${printingKey(card)}:${index}`}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <>
            <View style={themed($title)}>
              <Text text={name} preset="heading" size="xl" />
              <Text
                size="xs"
                style={themed($dim)}
                text={[
                  deckGame(game)?.shortLabel ?? game,
                  deckFormatLabel(game, format),
                  cardsUnavailable
                    ? undefined
                    : `${totalQuantity(cards)} ${totalQuantity(cards) === 1 ? "card" : "cards"}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              />
              {onAddMatch ? (
                <TouchableOpacity
                  testID="add-match-result"
                  accessibilityRole="button"
                  style={$noteAction}
                  disabled={editing || busy}
                  onPress={onAddMatch}
                >
                  <Text
                    size="sm"
                    text="Add match result"
                    style={[themed($action), (editing || busy) && $disabled]}
                  />
                </TouchableOpacity>
              ) : null}
            </View>
            <View style={themed($tabs)} accessibilityRole="tablist">
              {(["cards", "notes"] as const).map((value) => (
                <TouchableOpacity
                  key={value}
                  accessibilityRole="tab"
                  testID={`deck-tab-${value}`}
                  accessibilityState={{ selected: tab === value }}
                  style={[themed($tab), tab === value && themed($selectedTab)]}
                  onPress={() => setTab(value)}
                >
                  <Text
                    size="sm"
                    text={value === "cards" ? "Cards" : "Notes"}
                    style={tab === value ? undefined : themed($dim)}
                  />
                </TouchableOpacity>
              ))}
            </View>
            {tab === "notes" ? (
              <View style={themed($notes)}>
                {editing ? (
                  <TextField
                    testID="deck-note-input"
                    accessibilityLabel="Deck notes"
                    value={note}
                    onChangeText={onNoteChange}
                    placeholder="Add a note"
                    multiline
                    maxLength={1000}
                    style={$noteInput}
                  />
                ) : (
                  <>
                    <Text text={note || "No notes yet."} size="sm" />
                    <TouchableOpacity
                      testID="edit-deck-notes"
                      style={$noteAction}
                      accessibilityRole="button"
                      disabled={editingDisabled}
                      onPress={onEdit}
                    >
                      <Text
                        text="Edit notes"
                        style={[themed($action), editingDisabled && $disabled]}
                      />
                    </TouchableOpacity>
                  </>
                )}
              </View>
            ) : cardsUnavailable ? (
              <Text style={themed($notes)} text="Card list unavailable offline." />
            ) : cards.length === 0 ? (
              <Text
                style={themed($notes)}
                text={addOfflineNote ?? "No cards yet. Add your first card below."}
              />
            ) : null}
            {addOfflineNote && tab === "cards" && cards.length > 0 ? (
              <Text style={themed($notes)} text={addOfflineNote} />
            ) : null}
          </>
        }
        renderSectionHeader={({ section }) => (
          <DeckCardSectionHeader
            label={section.label}
            quantity={section.quantity}
            onChooseCommander={section.board === "commander" ? onChooseCommander : undefined}
            disabled={busy || editingDisabled}
          />
        )}
        renderItem={({ item }) => (
          <DeckCardRow
            card={item}
            game={game}
            format={format}
            editing={editing}
            disabled={busy || cardsUnavailable || cardsCached || editingDisabled}
            onFocus={onFocus}
            onIncrement={onIncrement}
            onDecrement={onDecrement}
          />
        )}
      />
      <BottomActionBar style={themed($bar)}>
        {error}
        {commanderWarnings?.map((warning) => (
          <Text key={warning} size="xs" text={warning} />
        ))}
        {undo ? (
          <View style={$row}>
            <Text size="xs" style={$flex} text={`Removed ${undo.name}`} />
            <TouchableOpacity style={$touch} accessibilityRole="button" onPress={undo.restore}>
              <Text text="Undo" style={themed($action)} />
            </TouchableOpacity>
          </View>
        ) : null}
        <View style={themed($footer)}>
          <Text
            size="xxs"
            style={[themed($dim), $flex]}
            text={dirty ? "Unsaved changes" : (saveStatus ?? (guest ? "Saved on device" : "Saved"))}
          />
          <Button
            testID="deck-add-cards"
            text="+ Add cards"
            onPress={onAdd}
            disabled={
              busy || cardsUnavailable || editingDisabled || (cardsCached && !canAddOffline)
            }
            style={$primary}
            preset="primary"
          />
        </View>
      </BottomActionBar>
    </>
  )
}
const $flex: ViewStyle = { flex: 1 }
const $row: ViewStyle = { flexDirection: "row", alignItems: "center" }
const $touch: ViewStyle = {
  minWidth: 44,
  minHeight: 44,
  alignItems: "center",
  justifyContent: "center",
}
const $disabled: TextStyle = { opacity: 0.4 }
const $noteInput: TextStyle = { minHeight: 160, textAlignVertical: "top" }
const $noteAction: ViewStyle = { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" }
const $content: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.md,
  paddingBottom: spacing.lg,
  width: "100%",
  maxWidth: 720,
  alignSelf: "center",
})
const $title: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xs,
  paddingTop: spacing.sm,
  paddingBottom: spacing.lg,
})
const $dim: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $action: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.brandText })
const $tabs: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  gap: spacing.lg,
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
})
const $tab: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 44,
  justifyContent: "center",
  paddingHorizontal: spacing.xxs,
  borderBottomWidth: 2,
  borderBottomColor: "transparent",
})
const $selectedTab: ThemedStyle<ViewStyle> = ({ colors }) => ({ borderBottomColor: colors.tint })
const $notes: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingVertical: spacing.lg,
  gap: spacing.sm,
})
const $bar: ThemedStyle<ViewStyle> = ({ colors }) => ({ backgroundColor: colors.surface })
const $footer: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.sm,
  alignItems: "center",
  width: "100%",
  maxWidth: 720,
  alignSelf: "center",
})
const $primary: ViewStyle = { flex: 2, minHeight: 44 }
