import { useCallback, useEffect, useRef, useState } from "react"
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
import { catalogCardDetails } from "@/features/decks/cardFocus"
import { cardCountLabel } from "@/features/decks/deckCopy"
import { creationFormat, useDeckFilters } from "@/features/decks/deckFilters"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { accessibleForeground } from "@/utils/colorContrast"
import { convexErrorMessage } from "@/utils/convexError"

import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import {
  DECK_GAME_LIST,
  deckFormatLabel,
  deckFormats,
  deckSections,
  defaultDeckFormat,
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

type GenericImportedCard = {
  game: "ygo" | "pokemon"
  identityNamespace?: string
  cardId?: string
  providerCardId?: string
  printingId?: string
  section: string
  entryKind: string
  originalReference: string
  category?: string
  name: string
  imageUrl?: string
  smallImageUrl?: string
  quantity: number
}

type FocusedPreviewCard = {
  detailKey: string
  name: string
  imageUrl?: string
  smallImageUrl?: string
  quantity: number
  boardLabel: string
  scryfallId?: string
  game?: string
  catalogCardId?: string
}

type PreconstructedDeckOutline = {
  name: string
  cards: PreviewCard[]
}

type ResolvedPreconstructedDeck = {
  name: string
  unresolved: string[]
  cards: ImportedCard[]
}

type CatalogDeck = {
  _id: Id<"deckCatalogs">
  game: string
  name: string
  kind: string
  format?: string
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

function importCards(cards: Array<ImportedCard | GenericImportedCard>) {
  return cards.map((card) => ({ ...card }))
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
  const searchTopDecks = useAction(api.deckCatalogs.searchTopDecks)
  const importCatalog = useMutation(api.decks.importCatalog)
  const fetchCardById = useAction(api.cards.byId)
  const fetchCatalogCardById = useAction(api.cards.byCatalogId)
  const { game, format: filterFormat, setGame, setFormat } = useDeckFilters()
  const [format, setDeckFormat] = useState(() => creationFormat(game, filterFormat))
  const [mode, setMode] = useState<CreationMode>("precon")
  const [name, setName] = useState("")
  const [note, setNote] = useState("")
  const [deckList, setDeckList] = useState("")
  const [preconQuery, setPreconQuery] = useState("")
  const [precons, setPrecons] = useState<PreconstructedDeck[]>([])
  const [catalogDecks, setCatalogDecks] = useState<CatalogDeck[]>([])
  const [selectedCatalogDeck, setSelectedCatalogDeck] = useState<CatalogDeck>()
  const [selectedPrecon, setSelectedPrecon] = useState<PreconstructedDeck>()
  const [preconOutline, setPreconOutline] = useState<PreconstructedDeckOutline>()
  const [resolvedPrecon, setResolvedPrecon] = useState<ResolvedPreconstructedDeck>()
  const [previewLoading, setPreviewLoading] = useState(false)
  const [focusedPreviewCard, setFocusedPreviewCard] = useState<FocusedPreviewCard>()
  const [previewDetailsByKey, setPreviewDetailsByKey] = useState<
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
  const catalogDetail = useQuery(
    api.deckCatalogs.detail,
    selectedCatalogDeck ? { catalogDeckId: selectedCatalogDeck._id } : "skip",
  )
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
    const nextFormat = defaultDeckFormat(next)
    setGame(next)
    setDeckFormat(nextFormat)
    setPreconQuery("")
    setPrecons([])
    setCatalogDecks([])
    setSelectedCatalogDeck(undefined)
    setSelectedPrecon(undefined)
    setFocusedPreviewCard(undefined)
    setMode("precon")
  }

  function chooseFormat(next: string) {
    setDeckFormat(next)
    setFormat(next)
    setPrecons([])
    setCatalogDecks([])
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
    if (mode !== "precon" || game !== "mtg") return undefined
    const timer = setTimeout(() => void runSearch(preconQuery), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [game, mode, preconQuery, runSearch])

  const runCatalogSearch = useCallback(
    async (query: string) => {
      const token = searchToken.current + 1
      searchToken.current = token
      try {
        setSearching(true)
        setSearchError(undefined)
        const found = await searchTopDecks({ game, format, query })
        if (searchToken.current === token) setCatalogDecks(found)
      } catch (cause) {
        if (searchToken.current === token)
          setSearchError(convexErrorMessage(cause, "Could not load Top Decks"))
      } finally {
        if (searchToken.current === token) setSearching(false)
      }
    },
    [format, game, searchTopDecks],
  )

  useEffect(() => {
    if (mode !== "precon" || game === "mtg") return undefined
    const timer = setTimeout(() => void runCatalogSearch(preconQuery), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [game, mode, preconQuery, runCatalogSearch])

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

  async function loadPreviewCardDetails(card: FocusedPreviewCard) {
    if (previewDetailsByKey[card.detailKey]) return
    try {
      const details = card.scryfallId
        ? await fetchCardById({ scryfallId: card.scryfallId })
        : card.game && card.catalogCardId
          ? catalogCardDetails(
              await fetchCatalogCardById({ game: card.game, cardId: card.catalogCardId }),
            )
          : undefined
      if (!details) {
        setPreviewDetailsError("No additional card details are available.")
        return
      }
      setPreviewDetailsByKey((current) => ({ ...current, [card.detailKey]: details }))
    } catch (cause) {
      setPreviewDetailsError(convexErrorMessage(cause, "Could not load card details"))
    }
  }

  function focusPreviewCard(card: PreviewCard, boardLabel: string) {
    const focused = {
      detailKey: card.scryfallId ?? `mtg:${card.name}`,
      name: card.name,
      imageUrl: card.imageUrl,
      smallImageUrl: card.smallImageUrl,
      quantity: card.quantity,
      boardLabel,
      scryfallId: card.scryfallId,
    }
    setFocusedPreviewCard(focused)
    setPreviewDetailsError(undefined)
    void loadPreviewCardDetails(focused)
  }

  function focusCatalogCard(
    card: FunctionReturnType<typeof api.deckCatalogs.detail>["entries"][number],
    boardLabel: string,
  ) {
    const catalogCardId = card.cardId ?? card.printingId ?? card.providerCardId
    const focused = {
      detailKey: `${card.game}:${catalogCardId ?? card.name}`,
      name: card.name,
      imageUrl: card.imageUrl,
      smallImageUrl: card.smallImageUrl,
      quantity: card.quantity,
      boardLabel,
      game: card.game,
      catalogCardId,
    }
    setFocusedPreviewCard(focused)
    setPreviewDetailsError(undefined)
    void loadPreviewCardDetails(focused)
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

  async function importTopDeck() {
    if (!capacityReady || atCapacity || !selectedCatalogDeck) return
    try {
      begin()
      const deckId = await importCatalog({ catalogDeckId: selectedCatalogDeck._id })
      onCreated(deckId)
    } catch (cause) {
      fail(cause, "Could not import Top Deck")
    } finally {
      setBusy(false)
    }
  }

  async function importPasted() {
    if (!capacityReady || atCapacity) return
    try {
      begin()
      const resolved = await resolvePasted({ list: deckList, game })
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
  const previewCardDialog = focusedPreviewCard ? (
    <CardFocusDialog
      card={{
        name: focusedPreviewCard.name,
        imageUrl: focusedPreviewCard.imageUrl,
        smallImageUrl: focusedPreviewCard.smallImageUrl,
        quantity: focusedPreviewCard.quantity,
        boardLabel: focusedPreviewCard.boardLabel,
      }}
      details={previewDetailsByKey[focusedPreviewCard.detailKey]}
      detailsError={previewDetailsError}
      onClose={() => setFocusedPreviewCard(undefined)}
    />
  ) : null

  if (selectedCatalogDeck) {
    const entries = catalogDetail?.entries ?? []
    const quantity = entries.reduce((total, entry) => total + entry.quantity, 0)
    return (
      <Screen
        preset="fixed"
        safeAreaEdges={["bottom"]}
        contentContainerStyle={themed($previewScreen)}
      >
        <Header
          title="Deck preview"
          leftTx="common:back"
          onLeftPress={() => {
            setSelectedCatalogDeck(undefined)
            setFocusedPreviewCard(undefined)
          }}
        />
        <ScrollView
          testID="catalog-deck-preview"
          contentContainerStyle={themed($previewContent)}
          showsVerticalScrollIndicator={false}
        >
          <View style={themed($previewSummary)}>
            <Text preset="subheading" text={selectedCatalogDeck.name} />
            <Text
              size="sm"
              style={themed($label)}
              text={`${DECK_GAME_LIST.find((candidate) => candidate.id === selectedCatalogDeck.game)?.shortLabel ?? selectedCatalogDeck.game} · ${deckFormatLabel(selectedCatalogDeck.game, selectedCatalogDeck.format ?? defaultDeckFormat(selectedCatalogDeck.game))}${entries.length ? ` · ${cardCountLabel(quantity)}` : ""}`}
            />
            <LoadingProgress
              state={catalogDetail ? "complete" : "loading"}
              accessibilityText={catalogDetail ? "Preview ready" : "Loading Top Deck"}
            />
          </View>
          {deckSections(
            selectedCatalogDeck.game,
            selectedCatalogDeck.format ?? defaultDeckFormat(selectedCatalogDeck.game),
          ).map((section) => {
            const sectionEntries = entries.filter((entry) => entry.section === section.id)
            if (sectionEntries.length === 0) return null
            return (
              <View key={section.id}>
                <View style={themed($previewSectionHeader)}>
                  <Text weight="bold" text={section.label} />
                  <Text
                    size="xs"
                    style={themed($label)}
                    text={`${sectionEntries.reduce((total, entry) => total + entry.quantity, 0)}`}
                  />
                </View>
                {sectionEntries.map((entry) => (
                  <TouchableOpacity
                    key={entry._id}
                    accessibilityRole="button"
                    accessibilityLabel={`Preview ${entry.name}`}
                    activeOpacity={0.75}
                    style={themed($previewCardRow)}
                    onPress={() => focusCatalogCard(entry, section.label)}
                  >
                    <View style={themed($previewThumbnailSlot)}>
                      {entry.smallImageUrl || entry.imageUrl ? (
                        <Image
                          source={entry.smallImageUrl ?? entry.imageUrl}
                          style={themed($previewThumbnail)}
                          cachePolicy="memory-disk"
                        />
                      ) : null}
                    </View>
                    <Text
                      style={themed($previewCardName)}
                      text={`${entry.quantity}× ${entry.name}`}
                    />
                  </TouchableOpacity>
                ))}
              </View>
            )
          })}
        </ScrollView>
        <BottomActionBar>
          <DeckCapacityStatus onReady={handleCapacity} />
          {error ? <AlertNote text={error} /> : null}
          <Button
            testID="import-catalog-deck"
            text={busy ? "Importing…" : "Import deck"}
            preset="reversed"
            disabled={busy || !capacityReady || atCapacity || !catalogDetail}
            onPress={importTopDeck}
          />
        </BottomActionBar>
        {previewCardDialog}
      </Screen>
    )
  }

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
                    accessibilityRole="button"
                    accessibilityLabel={`Preview ${card.name}`}
                    activeOpacity={0.75}
                    style={themed($previewCardRow)}
                    onPress={() => focusPreviewCard(card, section.label)}
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
        {previewCardDialog}
      </Screen>
    )
  }

  return (
    <Screen preset="scroll" safeAreaEdges={["bottom"]} contentInset="standard">
      <Header title="Add a deck" leftTx="common:back" onLeftPress={onBack} />
      <View style={themed($stack)}>
        <Text preset="subheading" text="System" />
        <FilterChips
          testID="game-picker-options"
          accessibilityLabel="Game"
          chips={DECK_GAME_LIST.map((candidate) => ({
            id: candidate.id,
            label: candidate.shortLabel,
          }))}
          selectedId={game}
          onSelect={chooseGame}
        />
        <Text preset="subheading" text="Format" />
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
        <Text preset="subheading" text="Start from" />
        <FilterChips
          testID="mode-picker-options"
          accessibilityLabel="Starting point"
          chips={MODES.map((candidate) => ({
            id: candidate.id,
            label: candidate.id === "precon" && game !== "mtg" ? "Top Decks" : candidate.label,
          }))}
          selectedId={mode}
          onSelect={(next) => setMode(next as CreationMode)}
        />

        {mode === "precon" && game === "mtg" ? (
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

        {mode === "precon" && game !== "mtg" ? (
          <View style={themed($stack)}>
            <TextField
              testID="top-deck-search-input"
              placeholder="Search Top Decks"
              value={preconQuery}
              maxLength={120}
              autoCorrect={false}
              clearButtonMode="while-editing"
              onChangeText={setPreconQuery}
            />
            {searching ? (
              <Text size="xs" style={themed($label)} text="Loading Top Decks…" />
            ) : searchError ? (
              <View style={themed($inlineStatus)}>
                <AlertNote text={searchError} />
                <Button text="Retry" onPress={() => void runCatalogSearch(preconQuery)} />
              </View>
            ) : null}
            {catalogDecks.map((deck) => (
              <Card
                key={deck._id}
                heading={deck.name}
                content={deck.kind === "tournament" ? "Tournament deck" : "Community deck"}
                footer="Preview deck"
                onPress={() => setSelectedCatalogDeck(deck)}
              />
            ))}
          </View>
        ) : null}

        {mode === "paste" ? (
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
                game === "ygo"
                  ? "Paste YDK card IDs or lines like 3 Ash Blossom. Main, Extra, and Side headings are supported."
                  : game === "pokemon"
                    ? "Paste a Pokemon TCG Live list with quantities, names, set codes, and card numbers."
                    : 'Use lines like "1 Sol Ring". Commander, Mainboard, and Sideboard headings are supported.'
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

        {mode === "blank" ? (
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
const $label: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
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
