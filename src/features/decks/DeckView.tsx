import { useState, type ComponentProps, type ReactNode } from "react"
import { ScrollView, SectionList, TouchableOpacity, View } from "react-native"
import type { TextStyle, ViewStyle } from "react-native"

import { BottomActionBar } from "@/components/BottomActionBar"
import { Button } from "@/components/Button"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { DialogCard } from "@/components/DialogCard"
import { Header } from "@/components/Header"
import { Text } from "@/components/Text"
import { TextAction } from "@/components/TextAction"
import { TextField } from "@/components/TextField"
import { localizedDeckSections } from "@/features/game/playSystems"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"

import { CardSearchScreen } from "./CardSearchScreen"
import { DeckAnalysisPanel, useDeckAnalysis } from "./DeckAnalysisPanel"
import { buildSections } from "./deckBuild"
import { DeckBuildTools } from "./DeckBuildTools"
import { DeckCardRow, DeckCardSectionHeader } from "./DeckCardRow"
import { cardSection, groupedCards, printingKey, totalQuantity, type DeckCard } from "./deckCards"
import { cardCountLabel } from "./deckCopy"
import { isCommanderPick, moveTarget, sideboardSection } from "./deckDraft"
import type { DeckStatsRecord } from "./deckStatLines"
import { DeckStats } from "./DeckStats"
import { deckFormatLabel, deckGame } from "../../../convex/lib/deckGames"
import { tracksResults } from "../../../convex/lib/systems"

export type DeckMode = "play" | "build"

export const DECK_MODES = [
  { mode: "play", tx: "decks:deckView.play" },
  { mode: "build", tx: "decks:deckView.build" },
] as const

type CardSearch = Pick<
  ComponentProps<typeof CardSearchScreen>,
  "onAdd" | "onRemove" | "offlineCandidates"
>

export function DeckView({
  mode,
  onModeChange,
  name,
  game,
  format,
  cards,
  savedCards,
  note,
  savedNote,
  changes,
  busy,
  guest,
  cardsUnavailable,
  cardsLoading,
  cardsCached,
  addUnavailable,
  editingDisabled,
  detailsDisabled,
  saveStatus,
  version,
  error,
  onBack,
  onSave,
  onDiscard,
  onDetails,
  onVersions,
  onAddMatch,
  onStats,
  cardSearch,
  canChooseCommander,
  commanderWarnings,
  onNoteChange,
  onFocus,
  onIncrement,
  onDecrement,
  onMove,
  undo,
  stats,
  statsContent,
}: {
  mode: DeckMode
  onModeChange: (mode: DeckMode) => void
  name: string
  game: string
  format: string
  cards: DeckCard[]
  savedCards: DeckCard[]
  note: string
  savedNote: string
  changes: number
  busy?: boolean
  guest?: boolean
  cardsUnavailable?: boolean
  cardsLoading?: boolean
  cardsCached?: boolean
  addUnavailable?: string
  editingDisabled?: boolean
  detailsDisabled?: boolean
  saveStatus?: string
  version?: { label: string; latest: boolean }
  error?: ReactNode
  onBack: () => void
  onSave: () => void
  onDiscard: () => void
  onDetails: () => void
  onVersions?: () => void
  onStats?: () => void
  onAddMatch?: () => void
  cardSearch: CardSearch
  canChooseCommander?: boolean
  commanderWarnings?: string[]
  onNoteChange: (note: string) => void
  onFocus: (card: DeckCard) => void
  onIncrement: (card: DeckCard) => void
  onDecrement: (card: DeckCard) => void
  onMove?: (card: DeckCard) => void
  undo?: { name: string; restore: () => void }
  statsContent?: ReactNode
  stats?: DeckStatsRecord
}) {
  const { themed, theme } = useAppTheme()
  const [search, setSearch] = useState<"cards" | "commander">()
  const [analysisOpen, setAnalysisOpen] = useState(false)
  const [discarding, setDiscarding] = useState(false)
  const building = mode === "build"
  const analysis = useDeckAnalysis(game, format, building ? cards : savedCards)
  const tracked = tracksResults(game)
  const deckSections = localizedDeckSections(game, format)
  const chooseCommander = canChooseCommander ? () => setSearch("commander") : undefined
  const sections = building
    ? buildSections(
        cards,
        deckSections,
        analysis && ((card) => analysis.detailsFor(card)?.typeLine),
      )
    : groupedCards(savedCards, deckSections)
  if (building && chooseCommander && !sections.some((section) => section.board === "commander")) {
    sections.unshift({
      board: "commander",
      label: translate("systems:section.commander"),
      data: [],
      quantity: 0,
    })
  }
  const shownCards = building ? cards : savedCards
  const side = sideboardSection({ game, format })
  const sideCount = totalQuantity(shownCards.filter((card) => cardSection(card) === side?.id))
  const mainCount = totalQuantity(shownCards) - sideCount
  const sectionLabel = (id: string) => deckSections.find((section) => section.id === id)?.label
  const cardsMessage = cardsUnavailable ? (
    <Text
      style={themed($notes)}
      tx={cardsLoading ? "decks:deckView.cardsLoading" : "decks:deckView.cardsUnavailable"}
    />
  ) : shownCards.length === 0 ? (
    <Text
      style={themed($notes)}
      text={(building && addUnavailable) || translate("decks:deckView.noCards")}
    />
  ) : building && addUnavailable ? (
    <Text style={themed($notes)} text={addUnavailable} />
  ) : null
  const rowsDisabled = busy || cardsUnavailable || cardsCached || editingDisabled
  return (
    <>
      <Header
        titleTx={guest ? "decks:deckView.guestTitle" : "decks:deckView.title"}
        backgroundColor={theme.colors.surface}
        leftTx="common:back"
        onLeftPress={onBack}
        RightActionComponent={
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={translate("decks:deckView.details")}
            testID="deck-settings-button"
            style={$touch}
            disabled={busy || detailsDisabled || editingDisabled}
            onPress={onDetails}
          >
            <Text
              text="•••"
              style={busy || detailsDisabled || editingDisabled ? $disabled : undefined}
            />
          </TouchableOpacity>
        }
      />
      <SectionList
        testID="deck-cards-list"
        style={$flex}
        contentContainerStyle={themed($content)}
        sections={sections}
        keyExtractor={(card, index) => `${printingKey(card)}:${index}`}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <>
            <View style={themed($title)}>
              <Text text={name} preset="heading" size="xl" />
              <Text
                size="xs"
                tone="dim"
                text={[
                  deckGame(game)?.shortLabel ?? game,
                  deckFormatLabel(game, format),
                  cardsUnavailable
                    ? undefined
                    : sideCount
                      ? translate("decks:deckView.cardCountWithSide", {
                          main: mainCount,
                          side: sideCount,
                        })
                      : cardCountLabel(mainCount),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              />
              {version ? (
                <View style={$row}>
                  <TextAction
                    testID="deck-version-button"
                    text={version.label}
                    disabled={changes > 0 || busy || !onVersions}
                    onPress={onVersions}
                  />
                  {version.latest ? null : (
                    <Text
                      size="sm"
                      weight="medium"
                      tone="dim"
                      style={themed($notLatest)}
                      tx="decks:deckView.notLatest"
                    />
                  )}
                </View>
              ) : null}
              {building ? null : (
                <>
                  {tracked && (stats ? <DeckStats record={stats} /> : statsContent)}
                  {tracked && onStats && (stats || statsContent) ? (
                    <TextAction
                      testID="open-deck-stats"
                      tx="decks:stats.viewStats"
                      style={$noteAction}
                      onPress={onStats}
                    />
                  ) : null}
                  {tracked && onAddMatch ? (
                    <TextAction
                      testID="add-match-result"
                      tx="decks:deckView.addMatch"
                      style={$noteAction}
                      disabled={busy}
                      onPress={onAddMatch}
                    />
                  ) : null}
                </>
              )}
            </View>
            <View style={themed($modes)} accessibilityRole="tablist">
              {DECK_MODES.map((option) => (
                <TouchableOpacity
                  key={option.mode}
                  accessibilityRole="tab"
                  testID={`deck-mode-${option.mode}`}
                  accessibilityState={{ selected: mode === option.mode }}
                  style={[themed($mode), mode === option.mode && themed($selectedMode)]}
                  onPress={() => onModeChange(option.mode)}
                >
                  <Text size="sm" tx={option.tx} tone={mode === option.mode ? undefined : "dim"} />
                </TouchableOpacity>
              ))}
            </View>
            {building ? (
              <DeckBuildTools
                analysis={cardsUnavailable || cards.length === 0 ? undefined : analysis?.analysis}
                findDisabled={
                  busy || cardsUnavailable || editingDisabled || Boolean(addUnavailable)
                }
                onFind={() => setSearch("cards")}
                onAnalysis={() => setAnalysisOpen(true)}
              />
            ) : null}
            {cardsMessage}
          </>
        }
        renderSectionHeader={({ section }) => (
          <DeckCardSectionHeader
            label={section.label}
            quantity={section.quantity}
            onChooseCommander={
              building && section.board === "commander" ? chooseCommander : undefined
            }
            disabled={busy || editingDisabled}
          />
        )}
        renderItem={({ item }) => {
          const to = building && onMove ? moveTarget({ game, format }, item) : undefined
          return (
            <DeckCardRow
              card={item}
              game={game}
              format={format}
              editing={building}
              subtitle={building ? analysis?.detailsFor(item)?.typeLine : undefined}
              disabled={rowsDisabled}
              onFocus={onFocus}
              onIncrement={onIncrement}
              onDecrement={onDecrement}
              move={
                to && onMove
                  ? {
                      label: translate("decks:cardRow.move", {
                        card: item.name,
                        section: sectionLabel(to) ?? to,
                      }),
                      onPress: () => onMove(item),
                    }
                  : undefined
              }
            />
          )
        }}
        ListFooterComponent={
          building ? (
            <View style={themed($notes)}>
              <Text size="sm" weight="semiBold" tx="decks:build.notes" />
              <TextField
                testID="deck-note-input"
                accessibilityLabel={translate("decks:deckView.notesLabel")}
                value={note}
                onChangeText={onNoteChange}
                placeholderTx="decks:deckView.notePlaceholder"
                editable={!busy && !editingDisabled}
                multiline
                maxLength={1000}
                style={$noteInput}
              />
            </View>
          ) : savedNote ? (
            <View style={themed($notes)}>
              <Text size="sm" weight="semiBold" tx="decks:build.notes" />
              <Text size="sm" text={savedNote} testID="deck-note" />
            </View>
          ) : null
        }
      />
      <BottomActionBar style={themed($bar)}>
        {error}
        {building
          ? commanderWarnings?.map((warning) => <Text key={warning} size="xs" text={warning} />)
          : null}
        {building && undo ? (
          <View style={$row}>
            <Text
              size="xs"
              style={$flex}
              tx="decks:deckView.removed"
              txOptions={{ card: undo.name }}
            />
            <TextAction tx="common:undo" style={$touch} onPress={undo.restore} />
          </View>
        ) : null}
        {changes > 0 ? (
          <View style={themed($footer)} testID="deck-draft-bar">
            <Text
              size="sm"
              weight="semiBold"
              style={$flex}
              tx="decks:build.changes"
              txOptions={{ count: changes }}
            />
            <Button
              testID="deck-draft-discard"
              tx="decks:detail.discard"
              disabled={busy}
              style={$barButton}
              onPress={() => setDiscarding(true)}
            />
            <Button
              testID="save-version-button"
              tx={busy ? "decks:saving" : "common:save"}
              preset="primary"
              disabled={busy || editingDisabled}
              style={$barButton}
              onPress={onSave}
            />
          </View>
        ) : (
          <View style={themed($footer)}>
            <Text
              size="xxs"
              tone="dim"
              style={$flex}
              text={
                saveStatus ??
                translate(guest ? "decks:deckView.savedOnDevice" : "decks:deckView.saved")
              }
            />
          </View>
        )}
      </BottomActionBar>
      {search ? (
        <CardSearchScreen
          game={game}
          format={format}
          offlineCandidates={cardSearch.offlineCandidates}
          initialSection={search === "commander" ? "commander" : undefined}
          commanderCards={cards}
          onClose={() => setSearch(undefined)}
          onRemove={cardSearch.onRemove}
          onAdd={(card) => {
            const addError = cardSearch.onAdd(card)
            if (!addError && search === "commander" && isCommanderPick({ game, format }, card))
              setSearch(undefined)
            return addError
          }}
        />
      ) : null}
      <ConfirmDialog
        visible={discarding && changes > 0}
        title={translate("decks:detail.discardTitle")}
        message={translate("decks:detail.discardBody")}
        confirmText={translate("decks:detail.discard")}
        cancelText={translate("decks:detail.keepEditing")}
        backdropAccessibilityLabel={translate("decks:detail.keepEditing")}
        destructive
        busy={busy}
        dialogTestID="deck-discard-dialog"
        confirmTestID="deck-discard-confirm"
        cancelTestID="deck-discard-cancel"
        onClose={() => setDiscarding(false)}
        onConfirm={() => {
          setDiscarding(false)
          onDiscard()
        }}
      />
      {analysisOpen && analysis ? (
        <DialogCard
          visible
          placement="bottom"
          wide
          onClose={() => setAnalysisOpen(false)}
          dialogTestID="deck-analysis-sheet"
          backdropAccessibilityLabel={translate("common:close")}
          accessibilityViewIsModal
        >
          <ScrollView>
            <Text preset="subheading" tx="decks:build.analysis" />
            <DeckAnalysisPanel
              analysis={analysis.analysis}
              onChooseCommander={
                chooseCommander &&
                (() => {
                  setAnalysisOpen(false)
                  chooseCommander()
                })
              }
            />
          </ScrollView>
        </DialogCard>
      ) : null}
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
const $noteInput: TextStyle = { minHeight: 120, textAlignVertical: "top" }
const $noteAction: ViewStyle = { minHeight: 44, justifyContent: "center", alignSelf: "flex-start" }
const $barButton: ViewStyle = { minHeight: 44 }
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
  paddingBottom: spacing.md,
})
const $notLatest: ThemedStyle<TextStyle> = ({ spacing }) => ({ marginLeft: spacing.sm })
const $modes: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  gap: spacing.lg,
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
})
const $mode: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 44,
  justifyContent: "center",
  paddingHorizontal: spacing.xxs,
  borderBottomWidth: 2,
  borderBottomColor: "transparent",
})
const $selectedMode: ThemedStyle<ViewStyle> = ({ colors }) => ({ borderBottomColor: colors.tint })
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
