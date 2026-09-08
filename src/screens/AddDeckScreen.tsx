import { useCallback, useEffect, useRef, useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { Linking, ScrollView, TouchableOpacity, View } from "react-native"
import { Image, type ImageStyle } from "expo-image"
import { useAction, useMutation, useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"

import { AlertNote } from "@/components/AlertNote"
import { BottomActionBar } from "@/components/BottomActionBar"
import { Button } from "@/components/Button"
import type { FocusedCardDetails } from "@/components/CardFocusDialog"
import { CardFocusDialog } from "@/components/CardFocusDialog"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { DeckListSkeleton } from "@/components/DeckLoadingState"
import { Header } from "@/components/Header"
import { LoadingProgress } from "@/components/LoadingProgress"
import { Screen } from "@/components/Screen"
import { SelectField } from "@/components/SelectField"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { ConvexQueryBoundary } from "@/features/async/ConvexQueryBoundary"
import type { CloudAccess } from "@/features/auth/CloudScreen"
import { AccountDeckCapacity } from "@/features/decks/AccountDeckCapacity"
import { catalogCardDetails } from "@/features/decks/cardFocus"
import { cardCountLabel } from "@/features/decks/deckCopy"
import { creationFormat, useDeckFilters } from "@/features/decks/deckFilters"
import { replaceGuestDeck, saveGuestDeck, type GuestDeckPayload } from "@/features/decks/guestDeck"
import { GuestDeckImportNotice } from "@/features/decks/GuestDeckImportNotice"
import { useGuestDeckImport } from "@/features/decks/useGuestDeckImport"
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
  { id: "precon", label: "Browse" },
  { id: "paste", label: "Paste" },
  { id: "blank", label: "Empty" },
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

function catalogCardDetailKey(
  card: FunctionReturnType<typeof api.deckCatalogs.detail>["entries"][number],
) {
  return `${card.game}:${card.cardId ?? card.printingId ?? card.providerCardId ?? `${card.name}:${card.originalReference ?? ""}`}`
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
  originalReference?: string
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
  source?: string
  sourceUrl?: string
  publishedAt?: number
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

function catalogSourceLabel(deck: CatalogDeck) {
  return deck.kind === "official"
    ? deck.game === "ygo"
      ? "Konami"
      : "Pokémon"
    : deck.source === "mtgo-examples"
      ? "MTGO example"
      : deck.source === "limitless"
        ? "Limitless"
        : deck.source === "ygoprodeck-decks"
          ? "YGOPRODeck"
          : deck.kind === "tournament"
            ? "Tournament deck"
            : "Example deck"
}

function catalogDeckDetail(deck: CatalogDeck) {
  return [
    catalogSourceLabel(deck),
    deck.publishedAt === undefined
      ? undefined
      : new Date(deck.publishedAt).toLocaleDateString(undefined, {
          year: "numeric",
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        }),
  ]
    .filter(Boolean)
    .join(" · ")
}

function totalQuantity(cards: PreviewCard[]) {
  return cards.reduce((total, card) => total + card.quantity, 0)
}

export function catalogPreviewSections(
  entries: FunctionReturnType<typeof api.deckCatalogs.detail>["entries"],
  configured: readonly { id: string; label: string }[],
) {
  const knownIds = new Set(configured.map((section) => section.id))
  const unknownEntries = entries.filter((entry) => !knownIds.has(entry.section))
  return [
    ...configured.map((section) => ({
      ...section,
      entries: entries.filter((entry) => entry.section === section.id),
    })),
    ...(unknownEntries.length > 0
      ? [{ id: "other", label: "Other", entries: unknownEntries }]
      : []),
  ].filter((section) => section.entries.length > 0)
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
  access,
}: {
  onBack: () => void
  onCreated: (deckId: string) => void
  access?: CloudAccess
}) {
  const { themed } = useAppTheme()
  const [capacityState, setCapacityState] = useState<CapacityState>({ status: "checking" })
  const capacity = capacityState.status === "ready" ? capacityState.capacity : undefined
  const signedIn = access?.signedIn ?? Boolean(access?.ownerId)
  const guestMode = Boolean(access && !access.loading && !signedIn)
  const capacityReady = guestMode || ((access?.ready ?? true) && capacityState.status === "ready")
  const atCapacity = !guestMode && capacityReady && capacity?.canCreate === false
  const canRequestAccess = Boolean(access && !access.ready && !access.loading)
  useEffect(() => {
    if (access && !access.ready) setCapacityState({ status: "checking" })
  }, [access])
  const createDeck = useMutation(api.decks.create)
  const createImportedDeck = useMutation(api.decks.importResolved)
  const searchPreconstructed = useAction(api.deckImports.searchPreconstructed)
  const previewPreconstructed = useAction(api.deckImports.previewPreconstructed)
  const resolvePreconstructed = useAction(api.deckImports.resolvePreconstructed)
  const resolvePasted = useAction(api.deckImports.resolvePasted)
  const searchTopDecks = useAction(api.deckCatalogs.browse)
  const importCatalog = useMutation(api.decks.importCatalog)
  const fetchCardById = useAction(api.cards.byId)
  const fetchCatalogCardById = useAction(api.cards.byCatalogId)
  const fetchPokemonCardByReference = useAction(api.cards.byPokemonReference)
  const { game, format: filterFormat, setGame, setFormat } = useDeckFilters()
  const [format, setDeckFormat] = useState(() => creationFormat(game, filterFormat))
  const [mode, setMode] = useState<CreationMode>("precon")
  const [catalogSource, setCatalogSource] = useState<"examples" | "official">(() =>
    ["commander", "brawl", "constructed"].includes(format) ? "official" : "examples",
  )
  const showMagicOfficial = game === "mtg" && catalogSource === "official"
  const [catalogStatus, setCatalogStatus] =
    useState<FunctionReturnType<typeof api.deckCatalogs.browse>["status"]>("ready")
  const [catalogCursor, setCatalogCursor] = useState<string | null>(null)
  const [retryAfterMs, setRetryAfterMs] = useState<number>()
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
  const [saveAttempted, setSaveAttempted] = useState(false)
  const [guestConflict, setGuestConflict] = useState(false)
  const [pendingGuestPayload, setPendingGuestPayload] = useState<GuestDeckPayload>()
  const [confirmGuestReplace, setConfirmGuestReplace] = useState(false)
  const [guestReplacementLocalId, setGuestReplacementLocalId] = useState<string>()
  const transfer = useGuestDeckImport(access)
  const guestDeck = transfer.guestDeck
  const waitingForGuest = Boolean(
    access?.ready &&
    guestDeck &&
    (transfer.importing ||
      (!transfer.result && !transfer.error) ||
      transfer.result?.status === "limit_reached"),
  )
  const guestBlocked = guestMode && guestConflict && Boolean(guestDeck)
  useEffect(() => {
    if (!guestDeck || !guestMode) {
      setGuestConflict(false)
      setConfirmGuestReplace(false)
    }
  }, [guestDeck, guestMode])
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
  useEffect(() => {
    setSaveAttempted(false)
    setGuestConflict(false)
    setPendingGuestPayload(undefined)
  }, [mode, game, format, selectedPrecon?.fileName, selectedCatalogDeck?._id])

  function begin() {
    setBusy(true)
    setError(undefined)
  }

  function fail(cause: unknown, fallback: string) {
    setError(convexErrorMessage(cause, fallback))
  }

  function saveGuest(payload: GuestDeckPayload) {
    setSaveAttempted(true)
    setPendingGuestPayload(payload)
    try {
      saveGuestDeck(payload)
      onCreated("guest")
    } catch (cause) {
      if (guestDeck) {
        setGuestConflict(true)
        setError(undefined)
        return
      }
      fail(cause, "Could not save deck locally")
    }
  }

  function replaceLocalGuest() {
    if (!pendingGuestPayload || !guestReplacementLocalId) return
    try {
      const payload =
        mode === "blank" && !selectedPrecon && !selectedCatalogDeck
          ? { ...pendingGuestPayload, name, format, game, note }
          : pendingGuestPayload
      replaceGuestDeck(payload, guestReplacementLocalId)
      onCreated("guest")
    } catch (cause) {
      fail(cause, "Could not replace local deck")
    }
  }

  function chooseGame(next: string) {
    const nextFormat = defaultDeckFormat(next)
    setGame(next, nextFormat)
    setDeckFormat(nextFormat)
    setPreconQuery("")
    setPrecons([])
    setCatalogDecks([])
    setSelectedCatalogDeck(undefined)
    setSelectedPrecon(undefined)
    setFocusedPreviewCard(undefined)
    setMode("precon")
    setCatalogSource(
      ["commander", "brawl", "constructed"].includes(nextFormat) ? "official" : "examples",
    )
    setCatalogStatus("ready")
    setCatalogCursor(null)
  }

  function chooseFormat(next: string) {
    setDeckFormat(next)
    setFormat(next)
    setCatalogSource(["commander", "brawl", "constructed"].includes(next) ? "official" : "examples")
    setCatalogStatus("ready")
    setCatalogCursor(null)
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
    if (mode !== "precon" || !showMagicOfficial) return undefined
    const timer = setTimeout(() => void runSearch(preconQuery), SEARCH_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      searchToken.current += 1
    }
  }, [showMagicOfficial, mode, preconQuery, runSearch])

  const runCatalogSearch = useCallback(
    async (query: string, cursor?: string) => {
      const token = ++searchToken.current
      try {
        setSearching(true)
        setSearchError(undefined)
        const found = await searchTopDecks({
          game,
          format,
          query,
          source: catalogSource,
          ...(cursor ? { cursor } : {}),
        })
        if (searchToken.current === token) {
          setCatalogDecks((current) =>
            cursor
              ? [
                  ...current,
                  ...found.decks.filter((deck) => !current.some((row) => row._id === deck._id)),
                ]
              : found.decks,
          )
          setCatalogStatus(found.status)
          setCatalogCursor(found.cursor)
          setRetryAfterMs(found.retryAfterMs)
        }
      } catch (cause) {
        if (searchToken.current === token)
          setSearchError(convexErrorMessage(cause, "Could not load decks"))
      } finally {
        if (searchToken.current === token) setSearching(false)
      }
    },
    [format, game, catalogSource, searchTopDecks],
  )

  useEffect(() => {
    if (mode !== "precon" || showMagicOfficial) return undefined
    setCatalogDecks([])
    setCatalogCursor(null)
    setCatalogStatus("ready")
    const timer = setTimeout(() => void runCatalogSearch(preconQuery), SEARCH_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      searchToken.current += 1
    }
  }, [showMagicOfficial, mode, preconQuery, runCatalogSearch])

  async function createBlank() {
    setSaveAttempted(true)
    if (guestMode) {
      saveGuest({ name, format, game, ...(note.trim() ? { note } : {}), cards: [] })
      return
    }
    if (access && !access.ready) {
      access.request()
      return
    }
    if (!capacityReady || atCapacity || waitingForGuest) return
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
          : card.game === "pokemon" && card.originalReference
            ? catalogCardDetails(
                await fetchPokemonCardByReference({
                  name: card.name,
                  originalReference: card.originalReference,
                }),
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
      detailKey: catalogCardDetailKey(card),
      name: card.name,
      imageUrl: card.imageUrl,
      smallImageUrl: card.smallImageUrl,
      quantity: card.quantity,
      boardLabel,
      game: card.game,
      catalogCardId,
      scryfallId: card.scryfallId,
      originalReference: card.originalReference,
    }
    setFocusedPreviewCard(focused)
    setPreviewDetailsError(undefined)
    void loadPreviewCardDetails(focused)
  }

  async function importPrecon() {
    setSaveAttempted(true)
    if (guestMode && selectedPrecon && resolvedPrecon && !resolvedPrecon.unresolved.length) {
      saveGuest({
        name: resolvedPrecon.name || selectedPrecon.name,
        format: preconSearchFormat(format) ? format : preconstructedFormat(selectedPrecon.type),
        game,
        cards: importCards(resolvedPrecon.cards),
      })
      return
    }
    if (access && !access.ready) {
      access.request()
      return
    }
    if (
      !capacityReady ||
      atCapacity ||
      waitingForGuest ||
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
    setSaveAttempted(true)
    if (guestMode && selectedCatalogDeck && catalogDetail) {
      saveGuest({
        name: selectedCatalogDeck.name,
        format: selectedCatalogDeck.format ?? defaultDeckFormat(selectedCatalogDeck.game),
        game: selectedCatalogDeck.game,
        cards: catalogDetail.entries.map(
          ({ _id, _creationTime, catalogDeckId: _catalogDeckId, ...entry }) => entry,
        ),
      })
      return
    }
    if (access && !access.ready) {
      access.request()
      return
    }
    if (!capacityReady || atCapacity || waitingForGuest || !selectedCatalogDeck) return
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
    setSaveAttempted(true)
    if (!guestMode && access && !access.ready) {
      access.request()
      return
    }
    if (!capacityReady || atCapacity || waitingForGuest) return
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
      const payload = {
        name,
        format,
        game,
        ...(note.trim() ? { note } : {}),
        cards: importCards(resolved.cards),
      }
      if (guestMode) {
        saveGuest(payload)
        return
      }
      const deckId = await createImportedDeck(payload)
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
  const guestRecovery = guestBlocked ? (
    <>
      <View style={themed($stack)}>
        <Text weight="bold" text="One deck saved on this device" />
        <Button
          preset="reversed"
          text="Replace saved deck…"
          style={themed($previewImportButton)}
          textStyle={themed($previewImportButtonText)}
          onPress={() => {
            setGuestReplacementLocalId(guestDeck?.localId)
            setConfirmGuestReplace(true)
          }}
        />
        {access?.request ? (
          <TouchableOpacity
            accessibilityRole="button"
            style={themed($plainAction)}
            onPress={access.request}
          >
            <Text text="Sign in to keep both" style={themed($textAction)} />
          </TouchableOpacity>
        ) : null}
        <Text size="xs" style={themed($label)} text="Free account · 2 decks + sync" />
      </View>
      <ConfirmDialog
        visible={confirmGuestReplace}
        title="Replace local deck?"
        message="Your existing local deck will be replaced."
        confirmText="Replace"
        dialogTestID="confirm-guest-replace"
        confirmTestID="confirm-guest-replace-action"
        cancelTestID="cancel-guest-replace"
        onClose={() => setConfirmGuestReplace(false)}
        onConfirm={() => {
          setConfirmGuestReplace(false)
          replaceLocalGuest()
        }}
      />
    </>
  ) : null

  const saveRecovery = (
    <>
      <GuestDeckImportNotice access={access} transfer={transfer} />
      {atCapacity && saveAttempted && transfer.result?.status !== "limit_reached" ? (
        <AccountDeckCapacity access={access} />
      ) : null}
      {guestRecovery}
    </>
  )

  const emptyCatalog = (
    <View style={themed($stack)}>
      <Text weight="bold" text={preconQuery.trim() ? "No matching decks" : "No decks here yet"} />
      <Text
        size="sm"
        text={
          preconQuery.trim()
            ? "Try another search, paste a list, or start an empty deck."
            : `We don’t have ${deckFormatLabel(game, format)} lists yet. Paste a list or start an empty deck.`
        }
      />
      <Button
        text="Paste a list"
        preset="reversed"
        style={themed($previewImportButton)}
        textStyle={themed($previewImportButtonText)}
        onPress={() => setMode("paste")}
      />
      <TouchableOpacity
        accessibilityRole="button"
        style={themed($plainAction)}
        onPress={() => setMode("blank")}
      >
        <Text text="Start empty" style={themed($textAction)} />
      </TouchableOpacity>
    </View>
  )

  if (selectedCatalogDeck) {
    const entries = (catalogDetail?.entries ?? []).map((entry) => {
      const details = previewDetailsByKey[catalogCardDetailKey(entry)]
      return {
        ...entry,
        imageUrl: entry.imageUrl ?? details?.imageUrl,
        smallImageUrl: entry.smallImageUrl ?? details?.smallImageUrl ?? details?.imageUrl,
      }
    })
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
            <Text size="xs" style={themed($label)} text={catalogDeckDetail(selectedCatalogDeck)} />
            {selectedCatalogDeck.kind === "example" ? (
              <Text size="xs" text="Dated example. Cards may no longer be legal in this format." />
            ) : null}
            {selectedCatalogDeck.sourceUrl ? (
              <TouchableOpacity
                accessibilityRole="link"
                style={themed($plainAction)}
                onPress={() =>
                  void Linking.openURL(selectedCatalogDeck.sourceUrl!).catch(() =>
                    setError("Could not open the deck source."),
                  )
                }
              >
                <Text text="View source deck" style={themed($textAction)} />
              </TouchableOpacity>
            ) : null}
            <LoadingProgress
              state={catalogDetail ? "complete" : "loading"}
              accessibilityText={catalogDetail ? "Preview ready" : "Loading Top Deck"}
            />
          </View>
          {catalogPreviewSections(
            entries,
            deckSections(
              selectedCatalogDeck.game,
              selectedCatalogDeck.format ?? defaultDeckFormat(selectedCatalogDeck.game),
            ),
          ).map((section) => {
            const sectionEntries = section.entries
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
                          testID={`catalog-card-thumbnail-${entry._id}`}
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
          {!guestMode && (access?.ready ?? true) ? (
            <DeckCapacityStatus key={access?.ownerId} onReady={handleCapacity} />
          ) : null}
          {!guestMode && access?.message ? (
            <Button text={access.actionLabel ?? access.message} onPress={access.request} />
          ) : null}
          {error ? <AlertNote text={error} /> : null}
          {saveRecovery}
          {!guestBlocked ? (
            <Button
              testID="import-catalog-deck"
              text={busy ? "Importing…" : guestMode ? "Save deck on this device" : "Import deck"}
              preset="reversed"
              disabled={
                busy ||
                (!capacityReady && !canRequestAccess) ||
                (atCapacity && saveAttempted) ||
                guestBlocked ||
                waitingForGuest ||
                !catalogDetail
              }
              onPress={importTopDeck}
            />
          ) : null}
        </BottomActionBar>
        {previewCardDialog}
      </Screen>
    )
  }

  if (selectedPrecon) {
    const previewFormat = preconSearchFormat(format)
      ? format
      : preconstructedFormat(selectedPrecon.type)
    const cards = (resolvedPrecon?.cards ?? preconOutline?.cards ?? []).map((card) => {
      const details = previewDetailsByKey[card.scryfallId ?? `mtg:${card.name}`]
      return {
        ...card,
        imageUrl: card.imageUrl ?? details?.imageUrl,
        smallImageUrl: card.smallImageUrl ?? details?.smallImageUrl ?? details?.imageUrl,
      }
    })
    const gameLabel = DECK_GAME_LIST.find((candidate) => candidate.id === game)?.shortLabel ?? game
    const configuredSections = deckSections(game, previewFormat)
    const sections = previewSections(cards, configuredSections)
    const unresolved = resolvedPrecon?.unresolved.length ?? 0
    const cannotImport =
      busy ||
      (!capacityReady && !canRequestAccess) ||
      (atCapacity && saveAttempted) ||
      guestBlocked ||
      waitingForGuest ||
      previewLoading ||
      !resolvedPrecon ||
      unresolved > 0

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
          {!guestMode && access?.message ? (
            <Button text={access.actionLabel ?? access.message} onPress={access.request} />
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
          {!guestMode && (access?.ready ?? true) ? (
            <DeckCapacityStatus key={access?.ownerId} onReady={handleCapacity} />
          ) : null}
          {saveRecovery}
          {!guestBlocked ? (
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
                text={busy ? "Importing…" : guestMode ? "Save deck on this device" : "Import deck"}
              />
            </TouchableOpacity>
          ) : null}
        </BottomActionBar>
        {previewCardDialog}
      </Screen>
    )
  }

  return (
    <Screen preset="scroll" safeAreaEdges={["bottom"]} contentInset="standard">
      <Header title="Add deck" leftTx="common:back" onLeftPress={onBack} />
      <View style={themed($stack)}>
        <Text preset="subheading" text="Deck details" accessibilityRole="header" />
        <View style={themed($configRow)}>
          <View style={$flex1}>
            <SelectField
              testID="game-picker-options"
              label="System"
              value={game}
              options={DECK_GAME_LIST.map((candidate) => ({
                id: candidate.id,
                label: candidate.shortLabel,
              }))}
              onSelect={(next) => {
                if (next) chooseGame(next)
              }}
            />
          </View>
          <View style={$flex1}>
            <SelectField
              testID="format-picker-options"
              label="Format"
              value={format}
              options={deckFormats(game).map((candidate) => ({
                id: candidate.id,
                label: candidate.label,
              }))}
              onSelect={(next) => {
                if (next) chooseFormat(next)
              }}
            />
          </View>
        </View>
        <View
          testID="mode-picker-options"
          accessibilityRole="tablist"
          accessibilityLabel="Starting point"
          style={themed($tabs)}
        >
          {MODES.map((candidate) => (
            <TouchableOpacity
              key={candidate.id}
              testID={`mode-picker-options-${candidate.id}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === candidate.id }}
              style={[themed($tab), mode === candidate.id && themed($selectedTab)]}
              onPress={() => setMode(candidate.id)}
            >
              <Text text={candidate.label} weight={mode === candidate.id ? "bold" : "normal"} />
            </TouchableOpacity>
          ))}
        </View>
        {mode === "precon" ? (
          <View accessibilityRole="tablist" accessibilityLabel="Deck source" style={themed($tabs)}>
            {(
              [
                { id: "examples", label: "Examples" },
                { id: "official", label: "Official decks" },
              ] as const
            ).map((candidate) => (
              <TouchableOpacity
                key={candidate.id}
                testID={`catalog-source-${candidate.id}`}
                accessibilityRole="tab"
                accessibilityState={{ selected: catalogSource === candidate.id }}
                style={[themed($tab), catalogSource === candidate.id && themed($selectedTab)]}
                onPress={() => {
                  setCatalogSource(candidate.id)
                  setSearchError(undefined)
                }}
              >
                <Text
                  text={candidate.label}
                  weight={catalogSource === candidate.id ? "bold" : "normal"}
                />
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {mode === "precon" && showMagicOfficial ? (
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
            ) : (guestMode || (access?.ready ?? true)) && precons.length === 0 ? (
              emptyCatalog
            ) : null}
            {precons.length > 0 && ["standard", "pioneer", "modern"].includes(format) ? (
              <Text
                size="xs"
                style={themed($label)}
                text="Original precon lists. Cards may no longer be legal in this format."
              />
            ) : null}
            {precons.map((deck) => (
              <TouchableOpacity
                key={deck.fileName}
                testID={`precon-result-${deck.fileName}`}
                accessibilityRole="button"
                accessibilityLabel={`Preview ${deck.name}`}
                activeOpacity={0.75}
                style={themed($resultRow)}
                disabled={previewLoading}
                onPress={() => previewPrecon(deck)}
              >
                <View style={$flex1}>
                  <Text weight="medium" text={deck.name} numberOfLines={2} />
                  {preconDetail(deck) ? (
                    <Text size="xs" style={themed($label)} text={preconDetail(deck)} />
                  ) : null}
                </View>
                <Text weight="medium" style={themed($textAction)} text="Preview" />
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {mode === "precon" && !showMagicOfficial ? (
          <View style={themed($stack)}>
            <TextField
              testID="top-deck-search-input"
              placeholder="Search decks"
              value={preconQuery}
              maxLength={120}
              autoCorrect={false}
              clearButtonMode="while-editing"
              onChangeText={setPreconQuery}
            />
            {searching ? (
              <Text size="xs" style={themed($label)} text="Loading decks…" />
            ) : searchError ? (
              <View style={themed($inlineStatus)}>
                <AlertNote text={searchError} />
                <Button text="Retry" onPress={() => void runCatalogSearch(preconQuery)} />
              </View>
            ) : catalogDecks.length === 0 &&
              !["rate_limited", "unavailable", "refreshing"].includes(catalogStatus) ? (
              emptyCatalog
            ) : null}
            {catalogStatus === "rate_limited" ||
            catalogStatus === "unavailable" ||
            catalogStatus === "refreshing" ? (
              <View style={themed($inlineStatus)}>
                <Text
                  size="sm"
                  text={
                    catalogStatus === "rate_limited"
                      ? `Refresh available in ${Math.ceil((retryAfterMs ?? 30_000) / 1000)} seconds. Saved results remain available.`
                      : catalogStatus === "refreshing"
                        ? "Refreshing decks. Saved results remain available."
                        : "Could not refresh decks. Saved results remain available."
                  }
                />
                <Button
                  text="Check again"
                  disabled={searching}
                  onPress={() => void runCatalogSearch(preconQuery)}
                />
              </View>
            ) : null}
            {catalogDecks.map((deck) => (
              <TouchableOpacity
                key={deck._id}
                accessibilityRole="button"
                accessibilityLabel={`Preview ${deck.name}`}
                activeOpacity={0.75}
                style={themed($resultRow)}
                onPress={() => setSelectedCatalogDeck(deck)}
              >
                <View style={$flex1}>
                  <Text weight="medium" text={deck.name} numberOfLines={2} />
                  <Text size="xs" style={themed($label)} text={catalogDeckDetail(deck)} />
                </View>
                <Text weight="medium" style={themed($textAction)} text="Preview" />
              </TouchableOpacity>
            ))}
            {catalogCursor ? (
              <Button
                text="Load more"
                disabled={searching}
                onPress={() => void runCatalogSearch(preconQuery, catalogCursor)}
              />
            ) : null}
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
              accessibilityLabel="Deck list"
              helper={
                game === "ygo"
                  ? "Paste YDK card IDs or lines like 3 Ash Blossom. Main, Extra, and Side headings are supported."
                  : game === "pokemon"
                    ? "Paste a Pokémon TCG Live list with quantities, names, set codes, and card numbers."
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
            {saveRecovery}
            <Button
              text={
                busy
                  ? "Resolving cards…"
                  : guestMode
                    ? "Save deck on this device"
                    : "Import deck list"
              }
              preset="reversed"
              disabled={
                busy ||
                (!capacityReady && !canRequestAccess) ||
                (atCapacity && saveAttempted) ||
                guestBlocked ||
                waitingForGuest ||
                !name.trim() ||
                !deckList.trim()
              }
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
            {saveRecovery}
            <Button
              text={busy ? "Creating…" : "Create deck"}
              preset="reversed"
              disabled={
                busy ||
                (!capacityReady && !canRequestAccess) ||
                (atCapacity && saveAttempted) ||
                guestBlocked ||
                waitingForGuest ||
                !name.trim()
              }
              onPress={createBlank}
            />
          </View>
        ) : null}

        {!guestMode && access?.message ? (
          <Button text={access.actionLabel ?? access.message} onPress={access.request} />
        ) : null}
        {error ? <AlertNote text={error} /> : null}
        {!guestMode && (access?.ready ?? true) ? (
          <DeckCapacityStatus key={access?.ownerId} onReady={handleCapacity} />
        ) : null}
      </View>
    </Screen>
  )
}

const $stack: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.sm,
  marginTop: spacing.sm,
})
const $flex1 = { flex: 1 } as const
const $configRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.xs,
})
const $capacityStatus: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  justifyContent: "center",
  paddingVertical: spacing.xxxs,
})
const $inlineStatus: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xs,
  alignItems: "flex-start",
})
const $label: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $textAction: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.brandText })
const $resultRow: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  minHeight: 68,
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  paddingVertical: spacing.xs,
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
})
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

const $plainAction: ThemedStyle<ViewStyle> = () => ({
  minHeight: 44,
  justifyContent: "center",
})

const $tabs: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  gap: spacing.md,
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
})
const $tab: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 44,
  justifyContent: "center",
  paddingVertical: spacing.xs,
  borderBottomWidth: 2,
  borderBottomColor: "transparent",
})
const $selectedTab: ThemedStyle<ViewStyle> = ({ colors }) => ({ borderBottomColor: colors.text })
