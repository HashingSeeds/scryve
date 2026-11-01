import { useMemo, useState, type ReactNode } from "react"
import { SectionList, View } from "react-native"
import type { ImageStyle, TextStyle, ViewStyle } from "react-native"

import { AlertNote } from "@/components/AlertNote"
import { BottomActionBar } from "@/components/BottomActionBar"
import { Button } from "@/components/Button"
import { Header } from "@/components/Header"
import { PressableIcon } from "@/components/Icon"
import { SectionHeader, TrailingNumber } from "@/components/NumberLane"
import { Text } from "@/components/Text"
import { TextAction } from "@/components/TextAction"
import { TextField } from "@/components/TextField"
import { LocalGameRepository } from "@/features/game/localPersistence"
import { localizedDeckSections } from "@/features/game/playSystems"
import { isRTL, type TxKeyPath } from "@/i18n"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { typography } from "@/theme/typography"

import { firstUnambiguousCardName } from "./cardNameMatch"
import { CardSearchScreen } from "./CardSearchScreen"
import { DeckAnalysisSheet, useDeckAnalysis } from "./DeckAnalysisPanel"
import { buildSections } from "./deckBuild"
import { DeckBuildTools } from "./DeckBuildTools"
import { DeckCardListSkeleton, DeckCardRow, DeckCardSectionHeader } from "./DeckCardRow"
import { printingKey, totalQuantity, type DeckCard } from "./deckCards"
import { cardCountLabel, deckNameWarning } from "./deckCopy"
import { canChooseCommander, isCommanderPick } from "./deckDraft"
import type { GuestDeckPayload } from "./guestDeck"
import { lineCardName, type ImportProblem } from "./importLines"
import { SaveDestination, type SaveDestinationState } from "./SaveDestination"
import { useCardNameIndex } from "./useCardNameIndex"
import { deckFormatLabel } from "../../../convex/lib/deckGames"

type Card = GuestDeckPayload["cards"][number]

/** why: Header drops labels on its built-in icon actions, so screens pass this as LeftActionComponent to keep "Back" for screen readers. */
export function HeaderBackIcon({ onPress }: { onPress: () => void }) {
  const { themed } = useAppTheme()
  return (
    <PressableIcon
      icon="back"
      accessibilityRole="button"
      accessibilityLabel={translate("common:back")}
      onPress={onPress}
      containerStyle={themed($backIcon)}
      style={isRTL ? $flipped : undefined}
    />
  )
}

export function ImportBuild({
  name,
  onNameChange,
  game,
  format,
  cards,
  editable,
  source,
  details,
  progress,
  problems,
  onApplyGuess,
  onRemoveProblem,
  onReplaceProblem,
  onRemoveAllProblems,
  error,
  commanderWarnings,
  undo,
  destination,
  saveTx,
  saveDisabled,
  saving,
  onSave,
  onBack,
  onFocus,
  onAdd,
  onRemove,
  imageFor,
  children,
}: {
  name: string
  onNameChange: (name: string) => void
  game: string
  format: string
  cards?: DeckCard[]
  editable: boolean
  source?: string
  details?: ReactNode
  progress?: ReactNode
  problems: readonly ImportProblem[]
  onApplyGuess: (problem: ImportProblem, card: string) => Promise<string | undefined>
  onRemoveProblem: (problem: ImportProblem) => void
  onReplaceProblem: (problem: ImportProblem, card: Card) => string | undefined
  onRemoveAllProblems: () => void
  error?: string
  commanderWarnings: string[]
  undo?: { name: string; restore: () => void }
  destination: SaveDestinationState
  saveTx: TxKeyPath
  saveDisabled: boolean
  saving: boolean
  onSave: () => void
  onBack: () => void
  onFocus: (card: DeckCard, sectionLabel: string) => void
  onAdd: (card: Card) => string | undefined
  onRemove: (card: Card) => void
  imageFor?: (card: DeckCard) => string | undefined
  children?: ReactNode
}) {
  const { themed, theme } = useAppTheme()
  const [search, setSearch] = useState<{ commander?: boolean; fixing?: ImportProblem }>()
  const [analysisOpen, setAnalysisOpen] = useState(false)
  const [using, setUsing] = useState<string>()
  const [useError, setUseError] = useState<string>()
  const [deviceId] = useState(() => new LocalGameRepository().getDeviceId())
  const shown = cards ?? []
  const analysis = useDeckAnalysis(game, format, editable ? shown : [])
  const [listFinal, setListFinal] = useState(false)
  if (!listFinal && cards && editable && !analysis?.detailsPending) setListFinal(true)
  const nameIndex = useCardNameIndex(
    game,
    deviceId,
    problems.some((problem) => problem.kind === "unmatched"),
  )
  const guesses = useMemo(
    () =>
      new Map(
        problems.flatMap((problem) => {
          const guess =
            nameIndex && problem.kind === "unmatched"
              ? firstUnambiguousCardName(nameIndex, [lineCardName(problem.line)])
              : undefined
          return guess ? [[problem.line, guess.name] as const] : []
        }),
      ),
    [nameIndex, problems],
  )
  const deckSections = localizedDeckSections(game, format)
  const chooseCommander =
    editable && canChooseCommander({ game, format }, shown)
      ? () => setSearch({ commander: true })
      : undefined
  const sections = buildSections(
    listFinal ? shown : [],
    deckSections,
    analysis && ((card) => analysis.detailsFor(card)?.typeLine),
  )
  if (listFinal && chooseCommander && !sections.some((section) => section.board === "commander")) {
    sections.unshift({
      board: "commander",
      label: translate("systems:section.commander"),
      data: [],
      quantity: 0,
    })
  }
  const rowIndexes = new Map<string, number>()
  const boardCounts = new Map<string, number>()
  for (const section of sections)
    for (const card of section.data) {
      const index = boardCounts.get(section.board) ?? 0
      rowIndexes.set(printingKey(card), index)
      boardCounts.set(section.board, index + 1)
    }

  async function applyGuess(problem: ImportProblem, card: string) {
    setUsing(problem.line)
    setUseError(undefined)
    const failure = await onApplyGuess(problem, card)
    setUsing(undefined)
    setUseError(failure)
  }

  return (
    <>
      <View>
        <Header
          titleTx="decks:importBuild.title"
          backgroundColor={theme.colors.surface}
          LeftActionComponent={<HeaderBackIcon onPress={onBack} />}
        />
        {listFinal ? null : progress}
      </View>
      <SectionList
        testID="import-build"
        style={$flex}
        contentContainerStyle={themed($content)}
        sections={sections}
        keyExtractor={(card, index) => `${printingKey(card)}:${index}`}
        stickySectionHeadersEnabled={false}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <>
            <View style={themed($title)}>
              {editable ? (
                <TextField
                  testID="deck-name-input"
                  accessibilityLabel={translate("decks:settings.name")}
                  placeholderTx="decks:settings.name"
                  value={name}
                  maxLength={80}
                  helper={deckNameWarning(name)}
                  onChangeText={onNameChange}
                  inputWrapperStyle={$nameWrapper}
                  style={$name}
                />
              ) : (
                <Text testID="deck-name-title" preset="heading" size="xl" text={name} />
              )}
              <Text
                size="xs"
                tone="dim"
                testID="import-build-summary"
                text={[
                  deckFormatLabel(game, format),
                  cards ? cardCountLabel(totalQuantity(cards)) : undefined,
                  source,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              />
              {details}
            </View>
            <DeckBuildTools
              analysis={listFinal && shown.length > 0 ? analysis?.analysis : undefined}
              analysisPending={!listFinal && analysis !== undefined && (!cards || cards.length > 0)}
              findDisabled={!listFinal}
              onFind={() => setSearch({})}
              onAnalysis={() => setAnalysisOpen(true)}
            />
            {error ? <AlertNote text={error} /> : null}
            {useError ? <AlertNote text={useError} /> : null}
            {!name.trim() ? <AlertNote text={translate("decks:addDeck.nameRequired")} /> : null}
            {problems.length > 1 ? (
              <SectionHeader
                testID="import-problems-header"
                label={translate("decks:importBuild.linesToFix")}
                style={themed($problemsHeader)}
                action={
                  <>
                    <TextAction
                      testID="import-remove-all-problems"
                      tx="decks:importBuild.removeAll"
                      size="xs"
                      onPress={onRemoveAllProblems}
                    />
                    <TrailingNumber preset="sectionLabel" value={problems.length} />
                  </>
                }
              />
            ) : null}
            {problems.map((problem, index) => {
              const guess = guesses.get(problem.line)
              return (
                <View key={`${problem.kind}:${problem.line}`} style={themed($problem)}>
                  <View style={$flex} testID={`import-problem-${index}`}>
                    <Text
                      size="sm"
                      weight="medium"
                      text={
                        guess
                          ? translate("decks:importBuild.didYouMean", { card: guess })
                          : translate(
                              problem.kind === "invalid"
                                ? "decks:importBuild.unreadable"
                                : "decks:importBuild.notFound",
                            )
                      }
                    />
                    <Text size="meta" tone="dim" text={`"${problem.line}"`} />
                  </View>
                  {guess ? (
                    <TextAction
                      testID={`import-use-guess-${index}`}
                      accessibilityLabel={translate("decks:importBuild.useItLabel", {
                        card: guess,
                        line: problem.line,
                      })}
                      tx="decks:importBuild.useIt"
                      disabled={!editable || using !== undefined}
                      style={$touch}
                      onPress={() => void applyGuess(problem, guess)}
                    />
                  ) : (
                    <TextAction
                      testID={`import-search-${index}`}
                      accessibilityLabel={translate("decks:importBuild.searchLabel", {
                        line: problem.line,
                      })}
                      tx="decks:importBuild.search"
                      disabled={!editable}
                      style={$touch}
                      onPress={() => setSearch({ fixing: problem })}
                    />
                  )}
                  <TextAction
                    testID={`import-remove-problem-${index}`}
                    accessibilityLabel={translate("decks:importBuild.removeLabel", {
                      line: problem.line,
                    })}
                    tx="common:remove"
                    disabled={using === problem.line}
                    style={$touch}
                    onPress={() => onRemoveProblem(problem)}
                  />
                </View>
              )
            })}
            {listFinal ? null : (
              <View>
                <DeckCardListSkeleton
                  sections={deckSections}
                  commanderAction={canChooseCommander({ game, format }, shown)}
                />
              </View>
            )}
          </>
        }
        renderSectionHeader={({ section }) => (
          <DeckCardSectionHeader
            label={section.label}
            quantity={section.quantity}
            onChooseCommander={section.board === "commander" ? chooseCommander : undefined}
            disabled={saving}
          />
        )}
        renderItem={({ item, section }) => {
          const index = rowIndexes.get(printingKey(item))
          return (
            <DeckCardRow
              card={item}
              game={game}
              format={format}
              editing={editable}
              subtitle={analysis?.detailsFor(item)?.typeLine}
              disabled={saving}
              testID={`import-card-${section.board}-${index}`}
              imageTestID={`import-card-thumbnail-${section.board}-${index}`}
              imageSource={imageFor?.(item)}
              onFocus={(card) => onFocus(card, section.label)}
              onIncrement={onAdd}
              onDecrement={onRemove}
            />
          )
        }}
      />
      <BottomActionBar style={themed($bar)}>
        {commanderWarnings.map((warning) => (
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
            <TextAction tx="common:undo" style={$touch} onPress={undo.restore} />
          </View>
        ) : null}
        <SaveDestination destination={destination} />
        <Button
          testID="save-import-button"
          tx={saving ? "decks:saving" : saveTx}
          preset="primary"
          disabled={saveDisabled}
          onPress={onSave}
        />
      </BottomActionBar>
      {children}
      {search ? (
        <CardSearchScreen
          game={game}
          format={format}
          initialSection={search.commander ? "commander" : undefined}
          commanderCards={shown}
          onClose={() => setSearch(undefined)}
          onRemove={onRemove}
          onAdd={(card) => {
            if (search.fixing) {
              const replaceError = onReplaceProblem(search.fixing, card)
              if (!replaceError) setSearch({})
              return replaceError
            }
            const addError = onAdd(card)
            if (addError) return addError
            if (search.commander && isCommanderPick({ game, format }, card)) setSearch(undefined)
            return undefined
          }}
        />
      ) : null}
      {analysis ? (
        <DeckAnalysisSheet
          visible={analysisOpen}
          analysis={analysis.analysis}
          onClose={() => setAnalysisOpen(false)}
          onChooseCommander={chooseCommander}
        />
      ) : null}
    </>
  )
}

const $flex: ViewStyle = { flex: 1 }
const $row: ViewStyle = { flexDirection: "row", alignItems: "center" }
const $touch: ViewStyle = { minHeight: 44, justifyContent: "center" }
const $content: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  paddingHorizontal: spacing.md,
  paddingBottom: spacing.lg,
  width: "100%",
  maxWidth: 720,
  alignSelf: "center",
})
const $nameWrapper: ViewStyle = {
  borderWidth: 0,
  backgroundColor: "transparent",
}
const $name: TextStyle = {
  height: 34,
  marginVertical: 0,
  marginHorizontal: 0,
  fontFamily: typography.primary.bold,
  fontSize: 24,
  lineHeight: 34,
}
const $title: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xs,
  paddingTop: spacing.sm,
})
const $problemsHeader: ThemedStyle<ViewStyle> = ({ spacing }) => ({ paddingTop: spacing.sm })
const $backIcon: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  height: "100%",
  minWidth: 44,
  alignItems: "center",
  justifyContent: "center",
  paddingHorizontal: spacing.md,
})
const $flipped: ImageStyle = { transform: [{ rotate: "180deg" }] }
const $problem: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  paddingVertical: spacing.xs,
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
})
const $bar: ThemedStyle<ViewStyle> = ({ colors }) => ({ backgroundColor: colors.surface })
