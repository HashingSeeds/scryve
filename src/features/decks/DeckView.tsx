import { type ReactNode } from "react"
import { SectionList, TouchableOpacity, View } from "react-native"
import type { TextStyle, ViewStyle } from "react-native"

import { BottomActionBar } from "@/components/BottomActionBar"
import { Button } from "@/components/Button"
import { Header } from "@/components/Header"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { localizedDeckSections } from "@/features/game/playSystems"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { DeckAnalysisTab } from "./DeckAnalysisTab"
import { DeckCardRow, DeckCardSectionHeader } from "./DeckCardRow"
import { groupedCards, printingKey, totalQuantity, type DeckCard } from "./deckCards"
import { cardCountLabel } from "./deckCopy"
import type { DeckStatsRecord } from "./deckStatLines"
import { DeckStats } from "./DeckStats"
import { deckFormatLabel, deckGame } from "../../../convex/lib/deckGames"
import { systemDefinition, tracksResults } from "../../../convex/lib/systems"

export type DeckTab = "cards" | "notes" | "analysis"

export function deckTabs(game?: string): readonly DeckTab[] {
  return systemDefinition(game)?.deckAnalysis ? ["cards", "analysis", "notes"] : ["cards", "notes"]
}

export const DECK_TAB_LABELS = {
  cards: "decks:deckView.cardsTab",
  notes: "decks:deckView.notesTab",
  analysis: "decks:deckView.analysisTab",
} as const

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
  cardsLoading,
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
  onStats,
  onAdd,
  onChooseCommander,
  commanderWarnings,
  onNoteChange,
  onFocus,
  onIncrement,
  onDecrement,
  undo,
  stats,
  statsContent,
}: {
  tab: DeckTab
  onTabChange: (tab: DeckTab) => void
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
  cardsLoading?: boolean
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
  onStats?: () => void
  onAddMatch?: () => void
  onAdd: () => void
  onChooseCommander?: () => void
  commanderWarnings?: string[]
  onNoteChange: (note: string) => void
  onFocus: (card: DeckCard) => void
  onIncrement: (card: DeckCard) => void
  onDecrement: (card: DeckCard) => void
  undo?: { name: string; restore: () => void }
  statsContent?: ReactNode
  stats?: DeckStatsRecord
}) {
  const { themed, theme } = useAppTheme()
  const tracked = tracksResults(game)
  const sections = groupedCards(cards, localizedDeckSections(game, format))
  if (onChooseCommander && !sections.some((section) => section.board === "commander")) {
    sections.unshift({
      board: "commander",
      label: translate("systems:section.commander"),
      data: [],
      quantity: 0,
    })
  }
  return (
    <>
      <Header
        titleTx={
          editing
            ? "decks:deckView.editTitle"
            : guest
              ? "decks:deckView.guestTitle"
              : "decks:deckView.title"
        }
        backgroundColor={theme.colors.surface}
        leftTx={editing ? "common:cancel" : "common:back"}
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
                tx={editing ? (busy ? "decks:saving" : "common:save") : "common:edit"}
                style={[
                  themed($action),
                  (busy || editingDisabled || (editing && !dirty)) && $disabled,
                ]}
              />
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={translate("decks:deckView.details")}
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
                  cardsUnavailable ? undefined : cardCountLabel(totalQuantity(cards)),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              />
              {tracked && (stats ? <DeckStats record={stats} /> : statsContent)}
              {tracked && onStats && (stats || statsContent) ? (
                <TouchableOpacity
                  testID="open-deck-stats"
                  accessibilityRole="button"
                  style={$noteAction}
                  onPress={onStats}
                >
                  <Text size="sm" tx="decks:stats.viewStats" style={themed($action)} />
                </TouchableOpacity>
              ) : null}
              {tracked && onAddMatch ? (
                <TouchableOpacity
                  testID="add-match-result"
                  accessibilityRole="button"
                  style={$noteAction}
                  disabled={editing || busy}
                  onPress={onAddMatch}
                >
                  <Text
                    size="sm"
                    tx="decks:deckView.addMatch"
                    style={[themed($action), (editing || busy) && $disabled]}
                  />
                </TouchableOpacity>
              ) : null}
            </View>
            <View style={themed($tabs)} accessibilityRole="tablist">
              {deckTabs(game).map((value) => (
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
                    tx={DECK_TAB_LABELS[value]}
                    style={tab === value ? undefined : themed($dim)}
                  />
                </TouchableOpacity>
              ))}
            </View>
            {tab === "analysis" ? (
              cardsUnavailable ? (
                <Text
                  style={themed($notes)}
                  tx={
                    cardsLoading ? "decks:deckView.cardsLoading" : "decks:deckView.cardsUnavailable"
                  }
                />
              ) : cards.length === 0 ? (
                <Text style={themed($notes)} tx="decks:deckView.noCards" />
              ) : (
                <DeckAnalysisTab
                  game={game}
                  format={format}
                  cards={cards}
                  onChooseCommander={onChooseCommander}
                />
              )
            ) : tab === "notes" ? (
              <View style={themed($notes)}>
                {editing ? (
                  <TextField
                    testID="deck-note-input"
                    accessibilityLabel={translate("decks:deckView.notesLabel")}
                    value={note}
                    onChangeText={onNoteChange}
                    placeholderTx="decks:deckView.notePlaceholder"
                    multiline
                    maxLength={1000}
                    style={$noteInput}
                  />
                ) : (
                  <>
                    <Text text={note || translate("decks:deckView.noNotes")} size="sm" />
                    <TouchableOpacity
                      testID="edit-deck-notes"
                      style={$noteAction}
                      accessibilityRole="button"
                      disabled={editingDisabled}
                      onPress={onEdit}
                    >
                      <Text
                        tx="decks:deckView.editNotes"
                        style={[themed($action), editingDisabled && $disabled]}
                      />
                    </TouchableOpacity>
                  </>
                )}
              </View>
            ) : cardsUnavailable ? (
              <Text
                style={themed($notes)}
                tx={
                  cardsLoading ? "decks:deckView.cardsLoading" : "decks:deckView.cardsUnavailable"
                }
              />
            ) : cards.length === 0 ? (
              <Text
                style={themed($notes)}
                text={addOfflineNote ?? translate("decks:deckView.noCards")}
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
            <Text
              size="xs"
              style={$flex}
              tx="decks:deckView.removed"
              txOptions={{ card: undo.name }}
            />
            <TouchableOpacity style={$touch} accessibilityRole="button" onPress={undo.restore}>
              <Text tx="common:undo" style={themed($action)} />
            </TouchableOpacity>
          </View>
        ) : null}
        <View style={themed($footer)}>
          <Text
            size="xxs"
            style={[themed($dim), $flex]}
            text={
              dirty
                ? translate("decks:deckView.unsaved")
                : (saveStatus ??
                  (guest
                    ? translate("decks:deckView.savedOnDevice")
                    : translate("decks:deckView.saved")))
            }
          />
          <Button
            testID="deck-add-cards"
            tx="decks:deckView.addCards"
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
