import { useCallback, useEffect, useRef, useState, type ReactNode } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { ScrollView, TouchableOpacity, View } from "react-native"
import { Image, type ImageStyle } from "expo-image"
import { useAction, useMutation, useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"

import { AlertNote } from "@/components/AlertNote"
import { BottomActionBar } from "@/components/BottomActionBar"
import { Button } from "@/components/Button"
import { Card } from "@/components/Card"
import type { FocusedCardDetails } from "@/components/CardFocusDialog"
import { CardFocusDialog } from "@/components/CardFocusDialog"
import { DeckListSkeleton } from "@/components/DeckLoadingState"
import { FilterChips } from "@/components/FilterChips"
import { Header } from "@/components/Header"
import { LoadingProgress } from "@/components/LoadingProgress"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { ConvexQueryBoundary } from "@/features/async/ConvexQueryBoundary"
import { cardCountLabel } from "@/features/decks/deckCopy"
import { creationFormat, useDeckFilters } from "@/features/decks/deckFilters"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { accessibleForeground } from "@/utils/colorContrast"
import { convexErrorMessage } from "@/utils/convexError"

import { api } from "../../convex/_generated/api"
import {
  DECK_GAME_LIST,
  deckFormatLabel,
  deckFormats,
  deckSections,
  preconSearchFormat,
  preconstructedFormat,
} from "../../convex/lib/deckGames"

type CreationMode = "precon" | "paste" | "blank"

type DeckCapacity = FunctionReturnType<typeof api.decks.listMine>["capacity"]

type CapacityState = { status: "checking" } | { status: "ready"; capacity: DeckCapacity }

const MODES: Array<{ id: CreationMode; label: string }> = [
  { id: "precon", label: "Official precon" },
  { id: "paste", label: "Paste list" },
  { id: "blank", label: "From scratch" },
]

const SEARCH_DEBOUNCE_MS = 350

type SetupField = "game" | "format" | "mode"

type PreconstructedDeck = {
  fileName: string
  name: string
  code?: string
  releaseDate?: string
  type?: string
}

type PreviewCard = {
  oracleId?: string
  scryfallId?: string
  name: string
  imageUrl?: string
  smallImageUrl?: string
  quantity: number
  board: "main" | "sideboard" | "commander"
}

type ImportedCard = PreviewCard & {
  oracleId: string
  scryfallId: string
}

type FocusedPreviewCard = PreviewCard & { scryfallId: string }

type PreconstructedDeckOutline = {
  name: string
  cards: PreviewCard[]
}

type ResolvedPreconstructedDeck = {
  name: string
  unresolved: string[]
  cards: ImportedCard[]
}

function CapacityQuery({ onReady }: { onReady: (capacity: DeckCapacity) => void }) {
  const { themed } = useAppTheme()
  const mine = useQuery(api.decks.listMine)

  useEffect(() => {
    if (mine) onReady(mine.capacity)
  }, [mine, onReady])

  return mine ? null : <Text size="xs" style={themed($label)} text="Checking deck limit…" />
}

function DeckCapacityStatus({ onReady }: { onReady: (capacity: DeckCapacity) => void }) {
  const { themed } = useAppTheme()
  return (
    <View testID="deck-capacity-status" style={themed($capacityStatus)}>
      <ConvexQueryBoundary
        fallback={({ retry }) => (
          <View style={themed($inlineStatus)}>
            <Text size="xs" style={themed($label)} text="Deck limit unavailable." />
            <Button testID="retry-deck-capacity" text="Retry" onPress={retry} />
          </View>
        )}
      >
        <CapacityQuery onReady={onReady} />
      </ConvexQueryBoundary>
    </View>
  )
}

function importCards(cards: ImportedCard[]) {
  return cards.map(({ oracleId, scryfallId, name, imageUrl, smallImageUrl, quantity, board }) => ({
    oracleId,
    scryfallId,
    name,
    ...(imageUrl ? { imageUrl } : {}),
    ...(smallImageUrl ? { smallImageUrl } : {}),
    quantity,
    board,
  }))
}

function preconDetail(deck: PreconstructedDeck) {
  return [deck.type, deck.code?.toUpperCase(), deck.releaseDate?.slice(0, 4)]
    .filter(Boolean)
    .join(" · ")
}

function totalQuantity(cards: PreviewCard[]) {
  return cards.reduce((total, card) => total + card.quantity, 0)
}

function previewSections(
  cards: PreviewCard[],
  configured: readonly { id: string; label: string }[],
) {
  const knownIds = new Set(configured.map((section) => section.id))
  const extras = [
    ...new Set(cards.map((card) => card.board).filter((board) => !knownIds.has(board))),
  ]
  return [
    ...configured,
    ...extras.map((id) => ({ id, label: id.charAt(0).toUpperCase() + id.slice(1) })),
  ]
    .map((section) => {
      const entries = cards.filter((card) => card.board === section.id)
      return {
        ...section,
        entries,
        quantity: totalQuantity(entries),
      }
    })
    .filter((section) => section.entries.length > 0)
}

export function AddDeckScreen({
  onBack,
  onCreated,
}: {
  onBack: () => void
  onCreated: (deckId: string) => void
}) {
  const { themed } = useAppTheme()
  const [capacityState, setCapacityState] = useState<CapacityState>({ status: "checking" })
  const capacity = capacityState.status === "ready" ? capacityState.capacity : undefined
  const capacityReady = capacityState.status === "ready"
  const atCapacity = capacity?.canCreate === false
  const createDeck = useMutation(api.decks.create)
  const createImportedDeck = useMutation(api.decks.importResolved)
  const searchPreconstructed = useAction(api.deckImports.searchPreconstructed)
  const previewPreconstructed = useAction(api.deckImports.previewPreconstructed)
  const resolvePreconstructed = useAction(api.deckImports.resolvePreconstructed)
  const resolvePasted = useAction(api.deckImports.resolvePasted)
  const fetchCardById = useAction(api.cards.byId)
  const { game, format: filterFormat, setGame, setFormat } = useDeckFilters()
  const [format, setDeckFormat] = useState(() => creationFormat(game, filterFormat))
  const [mode, setMode] = useState<CreationMode>("precon")
  const [setupComplete, setSetupComplete] = useState(false)
  const [openField, setOpenField] = useState<SetupField>()
  const [name, setName] = useState("")
  const [note, setNote] = useState("")
  const [deckList, setDeckList] = useState("")
  const [preconQuery, setPreconQuery] = useState("")
  const [precons, setPrecons] = useState<PreconstructedDeck[]>([])
  const [selectedPrecon, setSelectedPrecon] = useState<PreconstructedDeck>()
  const [preconOutline, setPreconOutline] = useState<PreconstructedDeckOutline>()
  const [resolvedPrecon, setResolvedPrecon] = useState<ResolvedPreconstructedDeck>()
  const [previewLoading, setPreviewLoading] = useState(false)
  const [focusedPreviewCard, setFocusedPreviewCard] = useState<FocusedPreviewCard>()
  const [previewDetailsByScryfallId, setPreviewDetailsByScryfallId] = useState<
    Record<string, FocusedCardDetails>
  >({})
  const [previewDetailsError, setPreviewDetailsError] = useState<string>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string>()
  const [previewError, setPreviewError] = useState<string>()
  const searchToken = useRef(0)
  const previewToken = useRef(0)
  const preconFormat = preconSearchFormat(format)
  const handleCapacity = useCallback(
    (next: DeckCapacity) => setCapacityState({ status: "ready", capacity: next }),
    [],
  )

  function begin() {
    setBusy(true)
    setError(undefined)
  }

  function fail(cause: unknown, fallback: string) {
    setError(convexErrorMessage(cause, fallback))
  }

  function chooseGame(next: string) {
    setGame(next)
    setDeckFormat(creationFormat(next, ""))
    setPrecons([])
    setOpenField(undefined)
  }

  function chooseFormat(next: string) {
    setDeckFormat(next)
    setFormat(next)
    setOpenField(undefined)
  }

  const runSearch = useCallback(
    async (query: string) => {
      const token = searchToken.current + 1
      searchToken.current = token
      if (query.trim().length < 2 && !preconFormat) {
        setPrecons([])
        return
      }
      try {
        setSearching(true)
        setSearchError(undefined)
        const found = await searchPreconstructed({
          query,
          ...(preconFormat ? { format: preconFormat } : {}),
        })
        if (searchToken.current === token) setPrecons(found)
      } catch (cause) {
        if (searchToken.current === token)
          setSearchError(convexErrorMessage(cause, "Could not search official decks"))
      } finally {
        if (searchToken.current === token) setSearching(false)
      }
    },
    [preconFormat, searchPreconstructed],
  )

  useEffect(() => {
    if (!setupComplete || mode !== "precon") return undefined
    const timer = setTimeout(() => void runSearch(preconQuery), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [mode, preconQuery, runSearch, setupComplete])

  async function createBlank() {
    if (!capacityReady || atCapacity) return
    try {
      begin()
      const deckId = await createDeck({ name, format, game, ...(note.trim() ? { note } : {}) })
      setName("")
      setNote("")
      onCreated(deckId)
    } catch (cause) {
      fail(cause, "Could not create deck")
    } finally {
      setBusy(false)
    }
  }

  async function previewPrecon(deck: PreconstructedDeck, keepOutline = false) {
    const token = previewToken.current + 1
    previewToken.current = token
    try {
      setSelectedPrecon(deck)
      if (!keepOutline) setPreconOutline(undefined)
      setResolvedPrecon(undefined)
      setError(undefined)
      setPreviewError(undefined)
      setPreviewLoading(true)
      const outline = await previewPreconstructed({ fileName: deck.fileName })
      if (previewToken.current !== token) return
      setPreconOutline(outline)
      const resolved = await resolvePreconstructed({ fileName: deck.fileName })
      if (previewToken.current === token) setResolvedPrecon(resolved)
    } catch (cause) {
      if (previewToken.current === token)
        setPreviewError(convexErrorMessage(cause, "Could not load this deck"))
    } finally {
      if (previewToken.current === token) setPreviewLoading(false)
    }
  }

  function closePreview() {
    previewToken.current += 1
    setSelectedPrecon(undefined)
    setPreconOutline(undefined)
    setResolvedPrecon(undefined)
    setFocusedPreviewCard(undefined)
    setPreviewDetailsError(undefined)
    setPreviewError(undefined)
    setError(undefined)
  }

  async function loadPreviewCardDetails(scryfallId: string) {
    if (previewDetailsByScryfallId[scryfallId]) return
    try {
      const { manaCost, typeLine, oracleText, setName, collectorNumber, rarity } =
        await fetchCardById({ scryfallId })
      setPreviewDetailsByScryfallId((current) => ({
        ...current,
        [scryfallId]: { manaCost, typeLine, oracleText, setName, collectorNumber, rarity },
      }))
    } catch (cause) {
      setPreviewDetailsError(convexErrorMessage(cause, "Could not load card details"))
    }
  }

  function focusPreviewCard(card: PreviewCard) {
    if (!card.scryfallId) return
    setFocusedPreviewCard({ ...card, scryfallId: card.scryfallId })
    setPreviewDetailsError(undefined)
    void loadPreviewCardDetails(card.scryfallId)
  }

  async function importPrecon() {
    if (
      !capacityReady ||
      atCapacity ||
      !selectedPrecon ||
      !resolvedPrecon ||
      resolvedPrecon.unresolved.length
    )
      return
    try {
      begin()
      const deckId = await createImportedDeck({
        name: resolvedPrecon.name || selectedPrecon.name,
        format: preconSearchFormat(format) ? format : preconstructedFormat(selectedPrecon.type),
        game,
        cards: importCards(resolvedPrecon.cards),
      })
      onCreated(deckId)
    } catch (cause) {
      fail(cause, "Could not import official deck")
    } finally {
      setBusy(false)
    }
  }

  async function importPasted() {
    if (!capacityReady || atCapacity) return
    try {
      begin()
      const resolved = await resolvePasted({ list: deckList })
      const problems = [
        resolved.unresolved.length
          ? `Unmatched cards: ${resolved.unresolved.join(", ")}`
          : undefined,
        resolved.invalidLines.length
          ? `Lines not understood: ${resolved.invalidLines.slice(0, 8).join(" | ")}`
          : undefined,
      ].filter((problem): problem is string => problem !== undefined)
      if (problems.length) {
        setError(problems.join(". "))
        return
      }
      const deckId = await createImportedDeck({
        name,
        format,
        game,
        ...(note.trim() ? { note } : {}),
        cards: importCards(resolved.cards),
      })
      setName("")
      setNote("")
      setDeckList("")
      onCreated(deckId)
    } catch (cause) {
      fail(cause, "Could not import deck list")
    } finally {
      setBusy(false)
    }
  }

  const noteField = (
    <TextField
      testID="deck-note-input"
      label="Notes"
      placeholder="Optional"
      value={note}
      multiline
      numberOfLines={3}
      textAlignVertical="top"
      maxLength={1000}
      onChangeText={setNote}
    />
  )

  if (selectedPrecon) {
    const previewFormat = preconSearchFormat(format)
      ? format
      : preconstructedFormat(selectedPrecon.type)
    const cards = resolvedPrecon?.cards ?? preconOutline?.cards ?? []
    const gameLabel = DECK_GAME_LIST.find((candidate) => candidate.id === game)?.shortLabel ?? game
    const configuredSections = deckSections(game, previewFormat)
    const sections = previewSections(cards, configuredSections)
    const unresolved = resolvedPrecon?.unresolved.length ?? 0
    const cannotImport =
      busy || !capacityReady || atCapacity || previewLoading || !resolvedPrecon || unresolved > 0

    return (
      <Screen
        preset="fixed"
        safeAreaEdges={["bottom"]}
        contentContainerStyle={themed($previewScreen)}
      >
        <Header title="Deck preview" leftTx="common:back" onLeftPress={closePreview} />
        <ScrollView
          testID="precon-preview"
          contentContainerStyle={themed($previewContent)}
          showsVerticalScrollIndicator={false}
        >
          <View style={themed($previewSummary)}>
            <Text
              preset="subheading"
              text={resolvedPrecon?.name || preconOutline?.name || selectedPrecon.name}
            />
            <Text
              size="sm"
              style={themed($label)}
              text={[
                gameLabel,
                deckFormatLabel(game, previewFormat),
                cards.length ? cardCountLabel(totalQuantity(cards)) : undefined,
              ]
                .filter(Boolean)
                .join(" · ")}
            />
            {preconDetail(selectedPrecon) ? (
              <Text size="xs" style={themed($label)} text={preconDetail(selectedPrecon)} />
            ) : null}
            <LoadingProgress
              testID="precon-loading-progress"
              state={previewLoading ? "loading" : resolvedPrecon ? "complete" : "unavailable"}
              accessibilityText={
                previewLoading
                  ? preconOutline
                    ? "Loading card images"
                    : "Loading official card list"
                  : resolvedPrecon
                    ? "Preview ready"
                    : "Preview unavailable"
              }
            />
          </View>

          {previewError ? (
            <View style={themed($inlineStatus)}>
              <AlertNote text={previewError} />
              <Button
                testID="retry-precon-preview"
                text="Retry"
                onPress={() => void previewPrecon(selectedPrecon, true)}
              />
            </View>
          ) : null}
          {error ? <AlertNote text={error} /> : null}
          {unresolved > 0 ? (
            <AlertNote
              text={`This deck has ${unresolved} card${unresolved === 1 ? "" : "s"} we could not match, so it cannot be imported yet.`}
            />
          ) : null}

          {cards.length === 0 && previewLoading ? (
            <DeckListSkeleton sections={configuredSections} />
          ) : (
            sections.map((section) => (
              <View key={section.id}>
                <View style={themed($previewSectionHeader)}>
                  <Text weight="bold" text={section.label} />
                  <Text size="xs" style={themed($label)} text={`${section.quantity}`} />
                </View>
                {section.entries.map((card) => (
                  <TouchableOpacity
                    key={`${card.board}:${card.scryfallId ?? card.name}`}
                    accessibilityRole={card.scryfallId ? "button" : undefined}
                    accessibilityLabel={card.scryfallId ? `Preview ${card.name}` : undefined}
                    activeOpacity={card.scryfallId ? 0.75 : 1}
                    style={themed($previewCardRow)}
                    disabled={!card.scryfallId}
                    onPress={() => focusPreviewCard(card)}
                  >
                    <View style={themed($previewThumbnailSlot)}>
                      {card.smallImageUrl || card.imageUrl ? (
                        <Image
                          source={card.smallImageUrl ?? card.imageUrl}
                          style={themed($previewThumbnail)}
                          cachePolicy="memory-disk"
                        />
                      ) : null}
                    </View>
                    <Text
                      style={themed($previewCardName)}
                      text={`${card.quantity}× ${card.name}`}
                    />
                  </TouchableOpacity>
                ))}
              </View>
            ))
          )}
        </ScrollView>
        <BottomActionBar>
          <DeckCapacityStatus onReady={handleCapacity} />
          {atCapacity ? (
            <AlertNote text="You've reached your deck limit. Archive a deck to import this one." />
          ) : null}
          <TouchableOpacity
            testID="import-preview-button"
            accessibilityRole="button"
            accessibilityState={{ disabled: cannotImport }}
            style={[
              themed($previewImportButton),
              cannotImport && themed($previewImportButtonDisabled),
            ]}
            disabled={cannotImport}
            onPress={() => void importPrecon()}
          >
            <Text
              weight="bold"
              style={themed($previewImportButtonText)}
              text={busy ? "Importing…" : "Import deck"}
            />
          </TouchableOpacity>
        </BottomActionBar>
        {focusedPreviewCard ? (
          <CardFocusDialog
            card={{
              name: focusedPreviewCard.name,
              imageUrl: focusedPreviewCard.imageUrl,
              smallImageUrl: focusedPreviewCard.smallImageUrl,
              quantity: focusedPreviewCard.quantity,
              boardLabel:
                sections.find((section) => section.id === focusedPreviewCard.board)?.label ??
                focusedPreviewCard.board,
            }}
            details={previewDetailsByScryfallId[focusedPreviewCard.scryfallId]}
            detailsError={previewDetailsError}
            onClose={() => setFocusedPreviewCard(undefined)}
          />
        ) : null}
      </Screen>
    )
  }

  return (
    <Screen preset="scroll" safeAreaEdges={["bottom"]} contentInset="standard">
      <Header
        title={setupComplete && mode === "precon" ? "Find a deck" : "Add a deck"}
        leftTx="common:back"
        onLeftPress={onBack}
      />
      <View style={themed($stack)}>
        {!setupComplete ? (
          <View style={themed($setup)}>
            <Text size="xxs" style={themed($label)} text="Step 1 of 2" />
            <SelectorField
              testID="game-picker"
              label="Game"
              value={DECK_GAME_LIST.find((candidate) => candidate.id === game)?.shortLabel ?? game}
              open={openField === "game"}
              onPress={() => setOpenField((current) => (current === "game" ? undefined : "game"))}
            >
              <FilterChips
                testID="game-picker-options"
                accessibilityLabel="Game"
                chips={DECK_GAME_LIST.map((candidate) => ({
                  id: candidate.id,
                  label: candidate.available
                    ? candidate.shortLabel
                    : `${candidate.shortLabel} · soon`,
                  disabled: !candidate.available,
                }))}
                selectedId={game}
                onSelect={chooseGame}
              />
            </SelectorField>
            <SelectorField
              testID="format-picker"
              label="Format"
              value={deckFormatLabel(game, format)}
              open={openField === "format"}
              onPress={() =>
                setOpenField((current) => (current === "format" ? undefined : "format"))
              }
            >
              <FilterChips
                testID="format-picker-options"
                accessibilityLabel="Format"
                chips={deckFormats(game).map((candidate) => ({
                  id: candidate.id,
                  label: candidate.label,
                }))}
                selectedId={format}
                onSelect={chooseFormat}
              />
            </SelectorField>
            <SelectorField
              testID="mode-picker"
              label="Start from"
              value={MODES.find((candidate) => candidate.id === mode)?.label ?? mode}
              open={openField === "mode"}
              onPress={() => setOpenField((current) => (current === "mode" ? undefined : "mode"))}
            >
              <FilterChips
                testID="mode-picker-options"
                accessibilityLabel="Starting point"
                chips={MODES.map((candidate) => ({ id: candidate.id, label: candidate.label }))}
                selectedId={mode}
                onSelect={(next) => {
                  setMode(next as CreationMode)
                  setOpenField(undefined)
                }}
              />
            </SelectorField>
            <Button
              testID="continue-add-deck"
              text="Continue"
              preset="reversed"
              onPress={() => setSetupComplete(true)}
            />
          </View>
        ) : (
          <View style={themed($summary)}>
            <View style={themed($summaryCopy)}>
              <Text
                weight="medium"
                text={`${DECK_GAME_LIST.find((candidate) => candidate.id === game)?.shortLabel ?? game} · ${deckFormatLabel(game, format)}`}
              />
              <Text
                size="xxs"
                style={themed($label)}
                text={MODES.find((candidate) => candidate.id === mode)?.label}
              />
            </View>
            <TouchableOpacity
              testID="change-deck-setup"
              accessibilityRole="button"
              onPress={() => setSetupComplete(false)}
            >
              <Text size="sm" weight="medium" style={themed($link)} text="Change" />
            </TouchableOpacity>
          </View>
        )}

        {setupComplete && mode === "precon" ? (
          <View style={themed($stack)}>
            <TextField
              testID="precon-search-input"
              placeholder="Search official decks"
              value={preconQuery}
              maxLength={120}
              autoCorrect={false}
              clearButtonMode="while-editing"
              onChangeText={setPreconQuery}
            />
            {searching ? (
              <Text size="xs" style={themed($label)} text="Searching…" />
            ) : searchError ? (
              <View style={themed($inlineStatus)}>
                <AlertNote text={searchError} />
                <Button
                  testID="retry-precon-search"
                  text="Retry"
                  onPress={() => void runSearch(preconQuery)}
                />
              </View>
            ) : precons.length === 0 && preconQuery.trim() ? (
              <Text size="xs" style={themed($label)} text="No official decks found." />
            ) : null}
            {precons.map((deck) => (
              <Card
                key={deck.fileName}
                heading={deck.name}
                content={preconDetail(deck)}
                footer="Preview deck"
                disabled={previewLoading}
                onPress={() => previewPrecon(deck)}
              />
            ))}
          </View>
        ) : null}

        {setupComplete && mode === "paste" ? (
          <View style={themed($stack)}>
            <TextField
              testID="deck-name-input"
              label="Deck name"
              value={name}
              maxLength={80}
              onChangeText={setName}
            />
            <TextField
              label="Deck list"
              helper={
                'Use lines like "1 Sol Ring". Commander, Mainboard, and Sideboard headings are supported.'
              }
              value={deckList}
              multiline
              numberOfLines={12}
              textAlignVertical="top"
              maxLength={50_000}
              onChangeText={setDeckList}
            />
            {noteField}
            <Button
              text={busy ? "Resolving cards…" : "Import deck list"}
              preset="reversed"
              disabled={busy || !capacityReady || atCapacity || !name.trim() || !deckList.trim()}
              onPress={importPasted}
            />
          </View>
        ) : null}

        {setupComplete && mode === "blank" ? (
          <View style={themed($stack)}>
            <TextField
              testID="deck-name-input"
              label="Deck name"
              value={name}
              maxLength={80}
              onChangeText={setName}
            />
            {noteField}
            <Button
              text={busy ? "Creating…" : "Create deck"}
              preset="reversed"
              disabled={busy || !capacityReady || atCapacity || !name.trim()}
              onPress={createBlank}
            />
          </View>
        ) : null}

        {error ? <AlertNote text={error} /> : null}
        <DeckCapacityStatus onReady={handleCapacity} />
        {atCapacity ? (
          <AlertNote
            text={
              capacity?.premium
                ? "You've reached the deck limit. Archive a deck to add another."
                : "You've reached your deck limit. Archive a deck to add another."
            }
          />
        ) : null}
      </View>
    </Screen>
  )
}

function SelectorField({
  testID,
  label,
  value,
  open,
  onPress,
  children,
}: {
  testID: string
  label: string
  value: string
  open: boolean
  onPress: () => void
  children: ReactNode
}) {
  const { themed } = useAppTheme()
  return (
    <View style={themed($field)}>
      <TouchableOpacity
        testID={testID}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={themed($selector)}
        onPress={onPress}
      >
        <View style={themed($summaryCopy)}>
          <Text size="xxs" style={themed($label)} text={label} />
          <Text weight="medium" text={value} />
        </View>
        <Text style={themed($label)} text={open ? "⌃" : "⌄"} />
      </TouchableOpacity>
      {open ? children : null}
    </View>
  )
}

const $stack: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.sm,
  marginTop: spacing.sm,
})
const $capacityStatus: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 40,
  justifyContent: "center",
  paddingVertical: spacing.xxxs,
})
const $inlineStatus: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xs,
  alignItems: "flex-start",
})
const $field: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xxs })
const $label: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $link: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.tint })
const $setup: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.sm })
const $selector: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  minHeight: 64,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  paddingHorizontal: spacing.sm,
  borderWidth: 1,
  borderColor: colors.separator,
})
const $summary: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  minHeight: 56,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  paddingBottom: spacing.sm,
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
})
const $summaryCopy: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xxxs })
const $previewScreen: ThemedStyle<ViewStyle> = () => ({ flex: 1, width: "100%" })
const $previewContent: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: "100%",
  maxWidth: 720,
  alignSelf: "center",
  paddingHorizontal: spacing.lg,
  paddingBottom: spacing.lg,
})
const $previewSummary: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xxxs,
  paddingTop: spacing.sm,
  paddingBottom: spacing.xs,
})
const $previewSectionHeader: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  paddingTop: spacing.md,
  paddingBottom: spacing.xxs,
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
})
const $previewCardRow: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  minHeight: 68,
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
})
const $previewThumbnailSlot: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  width: 36,
  height: 50,
  borderRadius: spacing.xxxs,
  overflow: "hidden",
  backgroundColor: colors.separator,
})
const $previewThumbnail: ThemedStyle<ImageStyle> = () => ({ width: 36, height: 50 })
const $previewCardName: ThemedStyle<TextStyle> = () => ({ flex: 1 })
const $previewImportButton: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  minHeight: 56,
  alignItems: "center",
  justifyContent: "center",
  borderRadius: spacing.xxxs,
  backgroundColor: colors.tint,
})
const $previewImportButtonDisabled: ThemedStyle<ViewStyle> = () => ({ opacity: 0.5 })
const $previewImportButtonText: ThemedStyle<TextStyle> = ({ colors }) => ({
  color: accessibleForeground(colors.tint),
})
