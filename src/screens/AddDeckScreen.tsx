import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { Keyboard, Linking, ScrollView, TouchableOpacity, View } from "react-native"
import { type ImageStyle } from "expo-image"
import { useAction, useMutation, useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"

import { AlertNote } from "@/components/AlertNote"
import { BottomActionBar } from "@/components/BottomActionBar"
import { Button } from "@/components/Button"
import { CardFocusDialog } from "@/components/CardFocusDialog"
import { CardImage } from "@/components/CardImage"
import { ConfirmDialog } from "@/components/ConfirmDialog"
import { DeckListSkeleton } from "@/components/DeckLoadingState"
import { Header } from "@/components/Header"
import { LoadingProgress } from "@/components/LoadingProgress"
import { RetryableError } from "@/components/RetryableError"
import { Screen } from "@/components/Screen"
import { SelectField } from "@/components/SelectField"
import { Text } from "@/components/Text"
import { TextField } from "@/components/TextField"
import { ConvexQueryBoundary } from "@/features/async/ConvexQueryBoundary"
import type { CloudAccess } from "@/features/auth/CloudScreen"
import { useConvexOnline } from "@/features/connected/useConvexOnline"
import { loadCardDetails } from "@/features/decks/cardDetailsCache"
import { CardSearchScreen } from "@/features/decks/CardSearchScreen"
import { getCommanderWarnings } from "@/features/decks/commanderSelection"
import { DeckCardRow, DeckCardSectionHeader } from "@/features/decks/DeckCardRow"
import { cardDetailsKey, cardSection, printingKey, type DeckCard } from "@/features/decks/deckCards"
import { cardCountLabel, deckNameWarning } from "@/features/decks/deckCopy"
import {
  addCommanderCard,
  adjustCardQuantity,
  canChooseCommander,
  cardLimitError,
  incrementCard,
  isCommanderPick,
} from "@/features/decks/deckDraft"
import { creationFormat, useDeckFilters } from "@/features/decks/deckFilters"
import { DeckLimitDialog } from "@/features/decks/DeckLimit"
import {
  guestDeckRouteId,
  replaceGuestDeck,
  saveGuestDeck,
  type GuestDeckPayload,
} from "@/features/decks/guestDeck"
import { GuestDeckImportNotice } from "@/features/decks/GuestDeckImportNotice"
import { useCardDetails } from "@/features/decks/useCardDetails"
import { useGuestDeckImport } from "@/features/decks/useGuestDeckImport"
import { localizedDeckSections } from "@/features/game/playSystems"
import { appLocale, type TxKeyPath } from "@/i18n"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { accessibleForeground } from "@/utils/colorContrast"
import { convexErrorMessage, convexRetryAfterMs } from "@/utils/convexError"

import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import {
  DECK_GAME_LIST,
  DEFAULT_DECK_GAME,
  deckFormatLabel,
  deckFormats,
  defaultDeckFormat,
  preconstructedFormat,
} from "../../convex/lib/deckGames"
import { FREE_DECK_LIMIT, MAX_PREMIUM_DECKS } from "../../convex/lib/policy"
import { isSystemId, type SystemId } from "../../convex/lib/systems"

const DECK_LIST_HELPERS = {
  mtg: "decks:addDeck.listHelperMtg",
  ygo: "decks:addDeck.listHelperYgo",
  pokemon: "decks:addDeck.listHelperPokemon",
  fab: "decks:addDeck.listHelperFab",
} as const satisfies Record<SystemId, TxKeyPath>

type CreationMode = "precon" | "paste" | "blank"

type PendingSave = "blank" | "precon" | "topDeck" | "pasted"

type DeckCapacity = FunctionReturnType<typeof api.decks.capacity>

type CapacityState = { status: "checking" } | { status: "ready"; capacity: DeckCapacity }

const MODES = [
  { id: "precon", labelTx: "decks:addDeck.modeBrowse" },
  { id: "paste", labelTx: "decks:addDeck.modeImport" },
  { id: "blank", labelTx: "decks:addDeck.modeBuild" },
] as const satisfies ReadonlyArray<{ id: CreationMode; labelTx: TxKeyPath }>

const SEARCH_DEBOUNCE_MS = 350

const IMPORT_KINDS = ["text", "link"] as const

const DECK_LINK_SOURCES = new Map<
  string,
  { name: string; placeholder: string; helperTx: TxKeyPath }
>([
  [
    "mtg",
    {
      name: "Archidekt",
      placeholder: "https://archidekt.com/decks/12345",
      helperTx: "decks:addDeck.linkHelperMtg",
    },
  ],
  [
    "ygo",
    {
      name: "YGOPRODeck",
      placeholder: "https://ygoprodeck.com/deck/12345",
      helperTx: "decks:addDeck.linkHelperYgo",
    },
  ],
  [
    "pokemon",
    {
      name: "Limitless",
      placeholder: "https://play.limitlesstcg.com/tournament/…/player/…",
      helperTx: "decks:addDeck.linkHelperPokemon",
    },
  ],
])

type PastedDraft = {
  source: string
  kind: "text" | "link"
  attribution?: { sourceName: string; sourceUrl: string; author?: string }
  game: string
  format: string
  resolved: Pick<
    FunctionReturnType<typeof api.deckImports.resolvePasted>,
    "unresolved" | "invalidLines"
  >
  cards: GuestDeckPayload["cards"]
  omitted: boolean
}

function importableCards(draft: PastedDraft) {
  return draft.cards.filter(
    (card) =>
      !draft.omitted ||
      !card.originalReference ||
      !draft.resolved.unresolved.includes(card.originalReference),
  )
}

function attributionLabel(attribution: { sourceName: string; author?: string }, separator: string) {
  return attribution.author
    ? `${attribution.sourceName}${separator}${attribution.author}`
    : attribution.sourceName
}

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
  game: Exclude<SystemId, "mtg">
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
  card: Pick<
    FunctionReturnType<typeof api.deckCatalogs.detail>["entries"][number],
    "game" | "cardId" | "printingId" | "providerCardId" | "name" | "originalReference"
  >,
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
  printingKey?: string
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
  const capacity = useQuery(api.decks.capacity)

  useEffect(() => {
    if (capacity) onReady(capacity)
  }, [capacity, onReady])

  return capacity ? null : (
    <Text size="xs" style={themed($label)} tx="decks:addDeck.checkingLimit" />
  )
}

function DeckCapacityStatus({ onReady }: { onReady: (capacity: DeckCapacity) => void }) {
  const { themed } = useAppTheme()
  return (
    <View testID="deck-capacity-status" style={themed($capacityStatus)}>
      <ConvexQueryBoundary
        fallback={({ retry }) => (
          <View style={themed($inlineStatus)}>
            <Text size="xs" style={themed($label)} tx="decks:addDeck.limitUnavailable" />
            <Button testID="retry-deck-capacity" tx="common:retry" onPress={retry} />
          </View>
        )}
      >
        <CapacityQuery onReady={onReady} />
      </ConvexQueryBoundary>
    </View>
  )
}

function importCards(cards: Array<ImportedCard | GenericImportedCard>) {
  return cards.map((card) => ({
    name: card.name,
    quantity: card.quantity,
    imageUrl: card.imageUrl,
    smallImageUrl: card.smallImageUrl,
    ...("scryfallId" in card
      ? { oracleId: card.oracleId, scryfallId: card.scryfallId, board: card.board }
      : {
          game: card.game,
          identityNamespace: card.identityNamespace,
          cardId: card.cardId,
          providerCardId: card.providerCardId,
          printingId: card.printingId,
          section: card.section,
          entryKind: card.entryKind,
          originalReference: card.originalReference,
          category: card.category,
        }),
  }))
}

function normalizeImportedCards(cards: GuestDeckPayload["cards"], game: string, format: string) {
  const supportsCommander = localizedDeckSections(game, format).some(
    (section) => section.id === "commander",
  )
  const cardsByPrinting = new Map<string, GuestDeckPayload["cards"][number]>()
  for (const entry of cards) {
    const card = { ...entry }
    if (!supportsCommander && cardSection(card) === "commander") {
      card.section = "main"
      card.board = "main"
      delete card.commanderColor
    }
    const key = printingKey(card)
    const existing = cardsByPrinting.get(key)
    const quantity = (existing?.quantity ?? 0) + card.quantity
    if (quantity > 999) return { overflow: card.name }
    cardsByPrinting.set(key, { ...(existing ?? card), quantity })
  }
  return { cards: [...cardsByPrinting.values()] }
}

function preconDetail(deck: PreconstructedDeck) {
  return ["Wizards", deck.type, deck.code?.toUpperCase(), deck.releaseDate?.slice(0, 4)]
    .filter(Boolean)
    .join(" · ")
}

function catalogSourceLabel(deck: CatalogDeck) {
  return deck.kind === "official"
    ? // eslint-disable-next-line no-restricted-syntax -- official catalog decks are only Yu-Gi-Oh! and Pokémon, named by publisher.
      deck.game === "ygo"
      ? "Konami"
      : "Pokémon"
    : deck.source === "mtgo-examples"
      ? translate("decks:addDeck.sourceMtgoExample")
      : deck.source === "limitless"
        ? "Limitless"
        : deck.source === "ygoprodeck-decks"
          ? "YGOPRODeck"
          : deck.kind === "tournament"
            ? translate("decks:addDeck.sourceTournament")
            : translate("decks:addDeck.sourceExample")
}

function catalogDeckDetail(deck: CatalogDeck) {
  return [
    catalogSourceLabel(deck),
    deck.publishedAt === undefined
      ? undefined
      : new Date(deck.publishedAt).toLocaleDateString(appLocale, {
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

export function catalogPreviewSections<Entry extends { section: string }>(
  entries: Entry[],
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
      ? [{ id: "other", label: translate("decks:addDeck.otherSection"), entries: unknownEntries }]
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
  const [pendingSave, setPendingSave] = useState<PendingSave>()
  useEffect(() => {
    if (access && !access.ready) setCapacityState({ status: "checking" })
  }, [access])
  const createDeck = useMutation(api.decks.create)
  const createImportedDeck = useMutation(api.decks.importResolved)
  const searchPreconstructed = useAction(api.deckImports.searchPreconstructed)
  const previewPreconstructed = useAction(api.deckImports.previewPreconstructed)
  const resolvePreconstructed = useAction(api.deckImports.resolvePreconstructed)
  const resolvePasted = useAction(api.deckImports.resolvePasted)
  const resolveLink = useAction(api.deckImports.resolveLink)
  const searchTopDecks = useAction(api.deckCatalogs.browse)
  const importCatalog = useMutation(api.decks.importCatalog)
  const { game, format: filterFormat, setGame, setFormat } = useDeckFilters()
  const [format, setDeckFormat] = useState(() => creationFormat(game, filterFormat))
  const [mode, setMode] = useState<CreationMode>("precon")
  const [catalogStatus, setCatalogStatus] =
    useState<FunctionReturnType<typeof api.deckCatalogs.browse>["status"]>("ready")
  const [catalogCursor, setCatalogCursor] = useState<string | null>(null)
  const [retryAfterMs, setRetryAfterMs] = useState<number>()
  const [name, setName] = useState("")
  const [note, setNote] = useState("")
  const [deckList, setDeckList] = useState("")
  const [importKind, setImportKind] = useState<"text" | "link">("text")
  const [deckLink, setDeckLink] = useState("")
  const linkSource = DECK_LINK_SOURCES.get(game)
  const importSource = importKind === "link" ? deckLink : deckList
  const [pastedDraft, setPastedDraftState] = useState<PastedDraft>()
  // why: search taps can land before a re-render, so import edits read this ref, which every draft write updates first.
  const latestPastedDraft = useRef(pastedDraft)
  function setPastedDraft(next: PastedDraft | undefined) {
    latestPastedDraft.current = next
    setPastedDraftState(next)
  }
  const [resolvingPasted, setResolvingPasted] = useState(false)
  const [reviewingPasted, setReviewingPasted] = useState(false)
  const [editingPasted, setEditingPasted] = useState(false)
  const [addingPastedCard, setAddingPastedCard] = useState(false)
  const [choosingPastedCommander, setChoosingPastedCommander] = useState(false)
  const [pastedCommanderSelected, setPastedCommanderSelected] = useState(false)
  const pastedToken = useRef(0)
  const pastedDraftCurrent =
    pastedDraft?.source === importSource &&
    pastedDraft.kind === importKind &&
    pastedDraft.game === game &&
    pastedDraft.format === format
  const pastedProblems = pastedDraft
    ? [...pastedDraft.resolved.unresolved, ...pastedDraft.resolved.invalidLines]
    : []
  const pastedCards = pastedDraft ? importableCards(pastedDraft) : []
  const sourceAttribution = pastedDraft?.attribution
    ? `Imported from ${attributionLabel(pastedDraft.attribution, " by ")}\n${pastedDraft.attribution.sourceUrl}`
    : ""
  const [preconQuery, setPreconQuery] = useState("")
  const [precons, setPrecons] = useState<PreconstructedDeck[]>([])
  const [catalogDecks, setCatalogDecks] = useState<CatalogDeck[]>([])
  const [selectedCatalogDeck, setSelectedCatalogDeck] = useState<CatalogDeck>()
  const [selectedPrecon, setSelectedPrecon] = useState<PreconstructedDeck>()
  const [preconOutline, setPreconOutline] = useState<PreconstructedDeckOutline>()
  const [resolvedPrecon, setResolvedPrecon] = useState<ResolvedPreconstructedDeck>()
  const [previewLoading, setPreviewLoading] = useState(false)
  const [focusedPreviewCard, setFocusedPreviewCard] = useState<FocusedPreviewCard>()
  const {
    detailsByKey: previewDetailsByKey,
    detailsError: previewDetailsError,
    detailsRetryAfterMs: previewDetailsRetryAfterMs,
    retryDetails: retryPreviewDetails,
  } = useCardDetails(focusedPreviewCard)
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [guestConflict, setGuestConflict] = useState(false)
  const [pendingGuestPayload, setPendingGuestPayload] = useState<GuestDeckPayload>()
  const [confirmGuestReplace, setConfirmGuestReplace] = useState(false)
  const [guestReplacementLocalId, setGuestReplacementLocalId] = useState<string>()
  const transfer = useGuestDeckImport(access)
  const guestDecks = transfer.guestDecks
  const guestFull = guestDecks.length >= FREE_DECK_LIMIT
  const guestReplacement = guestDecks.find((deck) => deck.localId === guestReplacementLocalId)
  const waitingForGuest = Boolean(
    access?.ready &&
    guestDecks.length &&
    (transfer.importing || (!transfer.result && !transfer.error) || transfer.result?.limitReached),
  )
  const guestBlocked = guestMode && guestConflict && guestFull
  useEffect(() => {
    if (!guestFull || !guestMode) {
      setGuestConflict(false)
      setConfirmGuestReplace(false)
    }
  }, [guestFull, guestMode])
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string>()
  const online = useConvexOnline()
  const browseOffline = !online && (searching || Boolean(searchError))
  const searchCursor = useRef<string | undefined>(undefined)
  const [previewError, setPreviewError] = useState<string>()
  const [previewRetryAfterMs, setPreviewRetryAfterMs] = useState<number>()
  const searchToken = useRef(0)
  const previewToken = useRef(0)
  useEffect(
    () => () => {
      previewToken.current += 1
      pastedToken.current += 1
    },
    [],
  )
  const catalogDetail = useQuery(
    api.deckCatalogs.detail,
    selectedCatalogDeck ? { catalogDeckId: selectedCatalogDeck._id } : "skip",
  )
  const handleCapacity = useCallback(
    (next: DeckCapacity) => setCapacityState({ status: "ready", capacity: next }),
    [],
  )
  useEffect(() => {
    setGuestConflict(false)
    setPendingGuestPayload(undefined)
  }, [mode, game, format, selectedPrecon?.fileName, selectedCatalogDeck?._id])
  const resumeSave = useEffectEvent((save: PendingSave) => {
    setPendingSave(undefined)
    const saves = {
      blank: createBlank,
      precon: importPrecon,
      topDeck: importTopDeck,
      pasted: importPasted,
    } satisfies Record<PendingSave, () => Promise<void>>
    void saves[save]()
  })
  useEffect(() => {
    if (pendingSave && capacity?.canCreate) resumeSave(pendingSave)
  }, [pendingSave, capacity?.canCreate])

  function begin() {
    setBusy(true)
    setError(undefined)
  }

  function fail(cause: unknown, fallback: string) {
    setError(convexErrorMessage(cause, fallback))
  }

  function saveGuest(payload: GuestDeckPayload) {
    setPendingGuestPayload(payload)
    try {
      onCreated(guestDeckRouteId(saveGuestDeck(payload).localId))
    } catch (cause) {
      if (guestFull) {
        setGuestConflict(true)
        setError(undefined)
        return
      }
      fail(cause, translate("decks:addDeck.saveLocalFailed"))
    }
  }

  function replaceLocalGuest() {
    if (!pendingGuestPayload || !guestReplacementLocalId) return
    try {
      const payload =
        mode === "blank" && !selectedPrecon && !selectedCatalogDeck
          ? { ...pendingGuestPayload, name, format, game, note }
          : pendingGuestPayload
      onCreated(guestDeckRouteId(replaceGuestDeck(payload, guestReplacementLocalId).localId))
    } catch (cause) {
      fail(cause, translate("decks:addDeck.replaceLocalFailed"))
    }
  }

  function invalidatePasted() {
    pastedToken.current += 1
    setResolvingPasted(false)
    setError(undefined)
    setGuestConflict(false)
    setPendingGuestPayload(undefined)
  }

  function chooseGame(next: string) {
    invalidatePasted()
    setImportKind("text")
    previewToken.current += 1
    setPreviewRetryAfterMs(undefined)
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
    setCatalogStatus("ready")
    setCatalogCursor(null)
  }

  function chooseFormat(next: string) {
    invalidatePasted()
    setDeckFormat(next)
    setFormat(next)
    setCatalogStatus("ready")
    setCatalogCursor(null)
    setPrecons([])
    setCatalogDecks([])
  }

  const runCatalogSearch = useCallback(
    async (query: string, cursor?: string) => {
      const token = ++searchToken.current
      searchCursor.current = cursor
      try {
        setSearching(true)
        setSearchError(undefined)
        const [catalogResult, preconResult] = await Promise.allSettled([
          searchTopDecks({
            game,
            format,
            query,
            source: "all",
            ...(cursor ? { cursor } : {}),
          }),
          // eslint-disable-next-line no-restricted-syntax -- preconstructed decks come from MTGJSON, which covers only Magic.
          game === "mtg" && !cursor
            ? searchPreconstructed({ query, ...(format ? { format } : {}) })
            : Promise.resolve(null),
        ])
        if (searchToken.current !== token) return
        if (preconResult.status === "fulfilled" && preconResult.value)
          setPrecons(preconResult.value)
        const failures = [catalogResult, preconResult].filter(
          (result) => result.status === "rejected",
        )
        if (failures.length)
          setSearchError(
            failures
              .map((result) =>
                convexErrorMessage(result.reason, translate("decks:addDeck.loadDecksFailed")),
              )
              .join("\n"),
          )
        if (catalogResult.status === "fulfilled") {
          const found = catalogResult.value
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
          setSearchError(convexErrorMessage(cause, translate("decks:addDeck.loadDecksFailed")))
      } finally {
        if (searchToken.current === token) setSearching(false)
      }
    },
    [format, game, searchPreconstructed, searchTopDecks],
  )

  useEffect(() => {
    if (mode !== "precon") return undefined
    setPrecons([])
    setCatalogDecks([])
    setCatalogCursor(null)
    setCatalogStatus("ready")
    const timer = setTimeout(() => void runCatalogSearch(preconQuery), SEARCH_DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      searchToken.current += 1
    }
  }, [mode, preconQuery, runCatalogSearch])

  const retryUnfinishedSearch = useEffectEvent(() => {
    if (mode === "precon" && (searching || searchError))
      void runCatalogSearch(preconQuery, searchCursor.current)
  })
  const wasOnline = useRef(online)
  useEffect(() => {
    if (online && !wasOnline.current) retryUnfinishedSearch()
    wasOnline.current = online
  }, [online])

  async function createBlank() {
    if (guestMode) {
      saveGuest({ name, format, game, ...(note.trim() ? { note } : {}), cards: [] })
      return
    }
    if (access && !access.ready) {
      access.request()
      return
    }
    if (!capacityReady || waitingForGuest) return
    if (atCapacity) {
      setPendingSave("blank")
      return
    }
    try {
      begin()
      const deckId = await createDeck({ name, format, game, ...(note.trim() ? { note } : {}) })
      setName("")
      setNote("")
      onCreated(deckId)
    } catch (cause) {
      fail(cause, translate("decks:addDeck.createFailed"))
    } finally {
      setBusy(false)
    }
  }

  const previewPrecon = useCallback(
    async (deck: PreconstructedDeck, keepOutline = false) => {
      const token = previewToken.current + 1
      previewToken.current = token
      try {
        setSelectedPrecon(deck)
        if (!keepOutline) setPreconOutline(undefined)
        setResolvedPrecon(undefined)
        setError(undefined)
        setPreviewError(undefined)
        setPreviewRetryAfterMs(undefined)
        setPreviewLoading(true)
        const outline = await previewPreconstructed({ fileName: deck.fileName })
        if (previewToken.current !== token) return
        setPreconOutline(outline)
        const resolved = await resolvePreconstructed({ fileName: deck.fileName })
        if (previewToken.current === token) setResolvedPrecon(resolved)
      } catch (cause) {
        if (previewToken.current === token) {
          setPreviewError(convexErrorMessage(cause, translate("decks:addDeck.previewFailed")))
          setPreviewRetryAfterMs(convexRetryAfterMs(cause))
        }
      } finally {
        if (previewToken.current === token) setPreviewLoading(false)
      }
    },
    [previewPreconstructed, resolvePreconstructed],
  )

  function closePreview() {
    previewToken.current += 1
    setPreviewRetryAfterMs(undefined)
    setSelectedPrecon(undefined)
    setPreconOutline(undefined)
    setResolvedPrecon(undefined)
    setFocusedPreviewCard(undefined)
    setPreviewError(undefined)
    setError(undefined)
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
  }

  function focusCatalogCard(
    card: Pick<
      FunctionReturnType<typeof api.deckCatalogs.detail>["entries"][number],
      | "game"
      | "cardId"
      | "printingId"
      | "providerCardId"
      | "scryfallId"
      | "name"
      | "originalReference"
      | "quantity"
      | "imageUrl"
      | "smallImageUrl"
    >,
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
  }

  async function importPrecon() {
    if (guestMode && selectedPrecon && resolvedPrecon && !resolvedPrecon.unresolved.length) {
      saveGuest({
        name: resolvedPrecon.name || selectedPrecon.name,
        format: format ? format : preconstructedFormat(selectedPrecon.type),
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
      waitingForGuest ||
      !selectedPrecon ||
      !resolvedPrecon ||
      resolvedPrecon.unresolved.length
    )
      return
    if (atCapacity) {
      setPendingSave("precon")
      return
    }
    try {
      begin()
      const deckId = await createImportedDeck({
        name: resolvedPrecon.name || selectedPrecon.name,
        format: format ? format : preconstructedFormat(selectedPrecon.type),
        game,
        cards: importCards(resolvedPrecon.cards),
      })
      onCreated(deckId)
    } catch (cause) {
      fail(cause, translate("decks:addDeck.importOfficialFailed"))
    } finally {
      setBusy(false)
    }
  }

  async function importTopDeck() {
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
    if (!capacityReady || waitingForGuest || !selectedCatalogDeck) return
    if (atCapacity) {
      setPendingSave("topDeck")
      return
    }
    try {
      begin()
      const deckId = await importCatalog({ catalogDeckId: selectedCatalogDeck._id })
      onCreated(deckId)
    } catch (cause) {
      fail(cause, translate("decks:addDeck.importTopDeckFailed"))
    } finally {
      setBusy(false)
    }
  }

  async function reviewPasted() {
    if (!guestMode && access && !access.ready) {
      access.request()
      return
    }
    const token = ++pastedToken.current
    setResolvingPasted(true)
    setError(undefined)
    try {
      if (importKind === "link" && !linkSource) return
      const result =
        importKind === "link"
          ? {
              kind: "link" as const,
              resolved: await resolveLink({ url: deckLink.trim(), game }),
            }
          : { kind: "text" as const, resolved: await resolvePasted({ list: deckList, game }) }
      if (pastedToken.current !== token) return
      const resolved = result.resolved
      const suggestedFormat =
        result.kind === "link"
          ? pastedDraft?.kind === "link" && pastedDraft.source === deckLink
            ? format
            : (result.resolved.format ?? format)
          : format
      const normalized = normalizeImportedCards(importCards(resolved.cards), game, suggestedFormat)
      if ("overflow" in normalized) {
        setError(translate("decks:addDeck.overflowAfterMatch", { card: normalized.overflow }))
        return
      }
      if (result.kind === "link") {
        setName((current) => (current.trim() ? current : result.resolved.name.slice(0, 80)))
        setDeckFormat(suggestedFormat)
        setFormat(suggestedFormat)
      }
      setPastedDraft({
        source: importSource,
        kind: importKind,
        game,
        format: suggestedFormat,
        resolved,
        cards: normalized.cards,
        omitted: false,
        ...(result.kind === "link"
          ? {
              attribution: {
                sourceName: result.resolved.sourceName,
                sourceUrl: result.resolved.sourceUrl,
                ...(result.resolved.author ? { author: result.resolved.author } : {}),
              },
            }
          : {}),
      })
      setEditingPasted(false)
      setPastedCommanderSelected(false)
      Keyboard.dismiss()
      setReviewingPasted(true)
    } catch (cause) {
      if (pastedToken.current === token)
        fail(
          cause,
          importKind === "link"
            ? translate("decks:addDeck.linkFailed")
            : translate("decks:addDeck.resolveFailed"),
        )
    } finally {
      if (pastedToken.current === token) setResolvingPasted(false)
    }
  }

  function changeImportSource() {
    if (busy) return
    invalidatePasted()
    setFocusedPreviewCard(undefined)
    setAddingPastedCard(false)
    setChoosingPastedCommander(false)
    setPastedCommanderSelected(false)
    setEditingPasted(false)
    setReviewingPasted(false)
  }

  function editImport() {
    if (busy) return
    setFocusedPreviewCard(undefined)
    if (editingPasted) Keyboard.dismiss()
    setEditingPasted((current) => !current)
  }

  function focusImportCard(card: DeckCard, boardLabel: string) {
    setFocusedPreviewCard({
      ...card,
      detailKey: cardDetailsKey(card, game),
      printingKey: printingKey(card),
      game,
      catalogCardId: card.cardId ?? card.printingId ?? card.providerCardId,
      boardLabel,
    })
  }

  function changeImportQuantity(card: DeckCard, delta: number) {
    const draft = latestPastedDraft.current
    if (!draft || busy) return
    setGuestConflict(false)
    setPendingGuestPayload(undefined)
    if (card.quantity + delta <= 0) setFocusedPreviewCard(undefined)
    setPastedDraft({ ...draft, cards: adjustCardQuantity(draft.cards, card, delta) })
  }

  function changeImportFormat(next?: string) {
    if (!next || !pastedDraft || busy) return
    const normalized = normalizeImportedCards(pastedDraft.cards, game, next)
    if ("overflow" in normalized) {
      setError(translate("decks:addDeck.overflowOnFormat", { card: normalized.overflow }))
      return
    }
    setDeckFormat(next)
    setFormat(next)
    setPastedDraft({ ...pastedDraft, format: next, cards: normalized.cards })
    setError(undefined)
    setGuestConflict(false)
    setPendingGuestPayload(undefined)
  }

  function addImportCard(card: GuestDeckPayload["cards"][number]) {
    if (busy) return translate("decks:addDeck.waitForSave")
    const draft = latestPastedDraft.current
    if (!draft) return translate("decks:addDeck.reviewFirst")
    const cards = importableCards(draft)
    if (isCommanderPick({ game, format }, card)) {
      const cached = loadCardDetails()
      const result = addCommanderCard(cards, card, (entry) => cached[cardDetailsKey(entry, game)])
      if ("error" in result) return result.error
      setPastedDraft({ ...draft, cards: result.cards })
      setPastedCommanderSelected(true)
    } else {
      const limitError = cardLimitError(cards, card)
      if (limitError) return limitError
      setPastedDraft({ ...draft, cards: incrementCard(cards, card) })
    }
    if (choosingPastedCommander) setAddingPastedCard(false)
    setGuestConflict(false)
    setPendingGuestPayload(undefined)
    return undefined
  }

  async function importPasted() {
    if (
      !pastedDraft ||
      !pastedDraftCurrent ||
      resolvingPasted ||
      (!pastedDraft.omitted && pastedProblems.length > 0) ||
      pastedCards.length === 0
    )
      return
    if (!guestMode && access && !access.ready) {
      access.request()
      return
    }
    if (!capacityReady || waitingForGuest) return
    if (atCapacity) {
      setPendingSave("pasted")
      return
    }
    const payload = {
      name,
      format,
      game,
      ...(sourceAttribution ? { note: sourceAttribution } : {}),
      cards: pastedCards,
    }
    if (guestMode) {
      saveGuest(payload)
      return
    }
    try {
      begin()
      const deckId = await createImportedDeck(payload)
      onCreated(deckId)
    } catch (cause) {
      fail(cause, translate("decks:addDeck.importListFailed"))
    } finally {
      setBusy(false)
    }
  }

  const noteField = (
    <TextField
      testID="deck-note-input"
      labelTx="decks:addDeck.notes"
      placeholderTx="decks:addDeck.optional"
      value={note}
      multiline
      numberOfLines={3}
      textAlignVertical="top"
      maxLength={1000}
      editable={!busy}
      onChangeText={(next) => {
        if (busy) return
        setNote(next)
        setGuestConflict(false)
        setPendingGuestPayload(undefined)
      }}
    />
  )
  const focusedImportCard = reviewingPasted
    ? pastedCards.find((card) => printingKey(card) === focusedPreviewCard?.printingKey)
    : undefined
  const previewCardDialog = focusedPreviewCard ? (
    <CardFocusDialog
      card={{
        game: focusedPreviewCard.game ?? "mtg",
        cardId: focusedPreviewCard.scryfallId ?? focusedPreviewCard.catalogCardId,
        name: focusedPreviewCard.name,
        imageUrl: focusedPreviewCard.imageUrl,
        smallImageUrl: focusedPreviewCard.smallImageUrl,
        quantity: focusedImportCard?.quantity ?? focusedPreviewCard.quantity,
        boardLabel: focusedPreviewCard.boardLabel,
      }}
      details={previewDetailsByKey[focusedPreviewCard.detailKey]}
      detailsError={previewDetailsError}
      detailsRetryAfterMs={previewDetailsRetryAfterMs}
      onRetryDetails={retryPreviewDetails}
      onClose={() => setFocusedPreviewCard(undefined)}
      {...(editingPasted && focusedImportCard
        ? {
            onIncrement:
              busy ||
              focusedImportCard.quantity >= 999 ||
              isCommanderPick({ game, format }, focusedImportCard)
                ? undefined
                : () => changeImportQuantity(focusedImportCard, 1),
            onDecrement: busy ? undefined : () => changeImportQuantity(focusedImportCard, -1),
          }
        : {})}
    />
  ) : null
  const guestRecovery = guestBlocked ? (
    <>
      <View style={themed($stack)}>
        <Text weight="bold" tx="decks:addDeck.guestFull" txOptions={{ limit: FREE_DECK_LIMIT }} />
        {guestDecks.map((deck) => (
          <Button
            key={deck.localId}
            preset="reversed"
            text={translate("decks:addDeck.replaceDeck", { name: deck.deck.name })}
            style={themed($previewImportButton)}
            textStyle={themed($previewImportButtonText)}
            onPress={() => {
              setGuestReplacementLocalId(deck.localId)
              setConfirmGuestReplace(true)
            }}
          />
        ))}
        {access?.request ? (
          <TouchableOpacity
            accessibilityRole="button"
            style={themed($plainAction)}
            onPress={access.request}
          >
            <Text tx="decks:addDeck.signInUpgrade" style={themed($textAction)} />
          </TouchableOpacity>
        ) : null}
        <Text
          size="xs"
          style={themed($label)}
          tx="decks:addDeck.proSubscription"
          txOptions={{ limit: MAX_PREMIUM_DECKS }}
        />
      </View>
      <ConfirmDialog
        visible={confirmGuestReplace}
        title={translate("decks:addDeck.replaceTitle")}
        backdropAccessibilityLabel={translate("decks:addDeck.cancelReplace")}
        message={
          guestReplacement
            ? translate("decks:addDeck.replaceBody", { name: guestReplacement.deck.name })
            : translate("decks:addDeck.replaceSelectedBody")
        }
        confirmText={translate("decks:addDeck.replace")}
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
      {pendingSave ? (
        <DeckLimitDialog access={access} onClose={() => setPendingSave(undefined)} />
      ) : null}
      {guestRecovery}
    </>
  )

  const emptyCatalog = (
    <View style={themed($stack)}>
      <Text
        weight="bold"
        tx={preconQuery.trim() ? "decks:addDeck.noMatches" : "decks:addDeck.noDecksHere"}
      />
      <Text
        size="sm"
        text={
          preconQuery.trim()
            ? translate("decks:addDeck.noMatchesDetail")
            : translate("decks:addDeck.noListsYet", { format: deckFormatLabel(game, format) })
        }
      />
      <Button
        tx="decks:addDeck.pasteList"
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
        <Text tx="decks:versionDialog.empty" style={themed($textAction)} />
      </TouchableOpacity>
    </View>
  )

  if (reviewingPasted && pastedDraft) {
    const singleCommander = canChooseCommander({ game, format }, pastedCards)
    const cachedRules = singleCommander && pastedCommanderSelected ? loadCardDetails() : {}
    const commanderWarnings =
      singleCommander && pastedCommanderSelected
        ? getCommanderWarnings(
            pastedCards,
            (card) =>
              cachedRules[cardDetailsKey(card, game)] ??
              previewDetailsByKey[cardDetailsKey(card, game)],
          )
        : []
    const sections = catalogPreviewSections(
      pastedCards.map((card) => ({ ...card, section: cardSection(card) })),
      localizedDeckSections(pastedDraft.game, pastedDraft.format),
    )
    if (
      editingPasted &&
      singleCommander &&
      !sections.some((section) => section.id === "commander")
    ) {
      sections.unshift({
        id: "commander",
        label: translate("systems:section.commander"),
        entries: [],
      })
    }
    return (
      <Screen
        key="import-review"
        preset="fixed"
        safeAreaEdges={["bottom"]}
        contentContainerStyle={themed($previewScreen)}
      >
        <Header
          titleTx={editingPasted ? "decks:deckView.editTitle" : "decks:addDeck.reviewTitle"}
          leftTx="common:back"
          onLeftPress={busy ? undefined : changeImportSource}
          rightTx={editingPasted ? "common:done" : "common:edit"}
          onRightPress={busy ? undefined : editImport}
        />
        <ScrollView
          testID="pasted-deck-review"
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={themed($previewContent)}
          showsVerticalScrollIndicator={false}
        >
          <View style={themed($previewSummary)}>
            {editingPasted ? (
              <View style={themed($importFields)}>
                <TextField
                  testID="deck-name-input"
                  accessibilityLabel={translate("decks:settings.name")}
                  placeholderTx="decks:settings.name"
                  value={name}
                  maxLength={80}
                  helper={deckNameWarning(name)}
                  editable={!busy}
                  onChangeText={(next) => {
                    if (busy) return
                    setName(next)
                    setGuestConflict(false)
                    setPendingGuestPayload(undefined)
                  }}
                />
                <SelectField
                  testID="format-picker-options"
                  label={translate("decks:settings.format")}
                  field="format"
                  value={format}
                  disabled={busy}
                  options={deckFormats(game)}
                  onSelect={changeImportFormat}
                />
              </View>
            ) : (
              <Text
                preset="subheading"
                text={name.trim() || translate("decks:addDeck.importedDeck")}
              />
            )}
            <View style={themed($importSummaryRow)}>
              <Text
                size="sm"
                style={themed($label)}
                text={`${editingPasted ? "" : `${deckFormatLabel(pastedDraft.game, pastedDraft.format)} · `}${cardCountLabel(pastedCards.reduce((total, card) => total + card.quantity, 0))}`}
              />
              {pastedDraft.attribution ? (
                <TouchableOpacity
                  accessibilityRole="link"
                  accessibilityLabel={
                    pastedDraft.attribution.author
                      ? translate("decks:addDeck.viewOnBy", {
                          source: pastedDraft.attribution.sourceName,
                          author: pastedDraft.attribution.author,
                        })
                      : translate("decks:addDeck.viewOn", {
                          source: pastedDraft.attribution.sourceName,
                        })
                  }
                  style={$importAttribution}
                  onPress={() =>
                    void Linking.openURL(pastedDraft.attribution!.sourceUrl).catch(() =>
                      setError(
                        translate("decks:addDeck.openFailed", {
                          source: pastedDraft.attribution!.sourceName,
                        }),
                      ),
                    )
                  }
                >
                  <Text
                    text={attributionLabel(pastedDraft.attribution, " · ")}
                    size="xs"
                    style={themed($label)}
                  />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>
          {error ? <AlertNote text={error} /> : null}
          {!name.trim() ? <AlertNote text={translate("decks:addDeck.nameRequired")} /> : null}
          {pastedProblems.length > 0 && !pastedDraft.omitted ? (
            <View style={themed($stack)}>
              <Text weight="bold" tx="decks:addDeck.fixLines" />
              {pastedDraft.resolved.unresolved.map((line, index) => (
                <Text
                  key={`unmatched:${index}`}
                  tx="decks:addDeck.unmatchedLine"
                  txOptions={{ line }}
                />
              ))}
              {pastedDraft.resolved.invalidLines.map((line, index) => (
                <Text
                  key={`invalid:${index}`}
                  tx="decks:addDeck.invalidLine"
                  txOptions={{ line }}
                />
              ))}
              <Text tx="decks:addDeck.changeSource" />
              <Button
                testID="omit-import-problems"
                tx="decks:addDeck.removeProblems"
                disabled={!pastedDraftCurrent || busy || resolvingPasted}
                onPress={() => setPastedDraft({ ...pastedDraft, omitted: true })}
              />
            </View>
          ) : null}
          {pastedDraft.omitted ? (
            <AlertNote
              text={translate("decks:addDeck.problemsRemoved", { count: pastedProblems.length })}
            />
          ) : null}
          {sections.map((section) => (
            <View key={section.id}>
              <DeckCardSectionHeader
                label={section.label}
                quantity={section.entries.reduce((total, card) => total + card.quantity, 0)}
                disabled={busy}
                onChooseCommander={
                  editingPasted && singleCommander && section.id === "commander"
                    ? () => {
                        if (busy) return
                        setFocusedPreviewCard(undefined)
                        setChoosingPastedCommander(true)
                        setAddingPastedCard(true)
                      }
                    : undefined
                }
              />
              {section.entries.map((card, index) => {
                const details = previewDetailsByKey[cardDetailsKey(card, game)]
                return (
                  <DeckCardRow
                    key={`${printingKey(card)}:${index}`}
                    card={card}
                    game={game}
                    format={format}
                    editing={editingPasted}
                    disabled={busy}
                    testID={`import-card-${section.id}-${index}`}
                    imageTestID={`import-card-thumbnail-${section.id}-${index}`}
                    imageSource={
                      card.smallImageUrl ??
                      details?.smallImageUrl ??
                      card.imageUrl ??
                      details?.imageUrl
                    }
                    onFocus={(entry) => focusImportCard(entry, section.label)}
                    onIncrement={(entry) => changeImportQuantity(entry, 1)}
                    onDecrement={(entry) => changeImportQuantity(entry, -1)}
                  />
                )
              })}
            </View>
          ))}
        </ScrollView>
        <BottomActionBar>
          {!guestMode && (access?.ready ?? true) ? (
            <DeckCapacityStatus key={access?.ownerId} onReady={handleCapacity} />
          ) : null}
          {saveRecovery}
          {commanderWarnings.map((warning) => (
            <Text key={warning} size="xs" text={warning} />
          ))}
          <View style={themed($configRow)}>
            {editingPasted ? (
              <Button
                testID="import-add-cards"
                tx="decks:deckView.addCards"
                onPress={() => {
                  if (busy) return
                  setChoosingPastedCommander(false)
                  setAddingPastedCard(true)
                }}
                disabled={busy}
                style={$flex1}
              />
            ) : null}
            <Button
              testID="save-import-button"
              tx={
                busy
                  ? "decks:saving"
                  : guestMode
                    ? "decks:addDeck.saveOnDevice"
                    : "decks:addDeck.saveDeck"
              }
              preset="reversed"
              style={$flex1}
              disabled={
                busy ||
                resolvingPasted ||
                !pastedDraftCurrent ||
                (!pastedDraft.omitted && pastedProblems.length > 0) ||
                pastedCards.length === 0 ||
                !name.trim() ||
                (!capacityReady && !canRequestAccess) ||
                guestBlocked ||
                waitingForGuest
              }
              onPress={importPasted}
            />
          </View>
        </BottomActionBar>
        {previewCardDialog}
        {addingPastedCard ? (
          <CardSearchScreen
            game={game}
            format={format}
            commanderCards={pastedCards}
            initialSection={choosingPastedCommander ? "commander" : undefined}
            onAdd={addImportCard}
            onClose={() => {
              Keyboard.dismiss()
              setAddingPastedCard(false)
            }}
          />
        ) : null}
      </Screen>
    )
  }

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
          titleTx="decks:addDeck.previewTitle"
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
              <Text size="xs" tx="decks:addDeck.datedExample" />
            ) : null}
            {selectedCatalogDeck.sourceUrl ? (
              <TouchableOpacity
                accessibilityRole="link"
                style={themed($plainAction)}
                onPress={() =>
                  void Linking.openURL(selectedCatalogDeck.sourceUrl!).catch(() =>
                    setError(translate("decks:addDeck.openSourceFailed")),
                  )
                }
              >
                <Text tx="decks:addDeck.viewSource" style={themed($textAction)} />
              </TouchableOpacity>
            ) : null}
            <LoadingProgress
              state={catalogDetail ? "complete" : "loading"}
              accessibilityText={
                catalogDetail
                  ? translate("decks:addDeck.previewReady")
                  : translate("decks:addDeck.loadingTopDeck")
              }
            />
          </View>
          {catalogPreviewSections(
            entries,
            localizedDeckSections(
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
                    accessibilityLabel={translate("decks:addDeck.previewCard", {
                      card: entry.name,
                    })}
                    activeOpacity={0.75}
                    style={themed($previewCardRow)}
                    onPress={() => focusCatalogCard(entry, section.label)}
                  >
                    <View style={themed($previewThumbnailSlot)}>
                      <CardImage
                        game={selectedCatalogDeck.game}
                        cardId={
                          entry.scryfallId ??
                          entry.cardId ??
                          entry.printingId ??
                          entry.providerCardId
                        }
                        source={entry.smallImageUrl ?? entry.imageUrl}
                        accessibilityLabel={entry.name}
                        compact
                        testID={`catalog-card-thumbnail-${entry._id}`}
                        style={themed($previewThumbnail)}
                      />
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
              tx={
                busy
                  ? "decks:addDeck.importing"
                  : guestMode
                    ? "decks:addDeck.saveDeckOnDevice"
                    : "decks:addDeck.importDeck"
              }
              preset="reversed"
              disabled={
                busy ||
                (!capacityReady && !canRequestAccess) ||
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
    const previewFormat = format ? format : preconstructedFormat(selectedPrecon.type)
    const cards = (resolvedPrecon?.cards ?? preconOutline?.cards ?? []).map((card) => {
      const details = previewDetailsByKey[card.scryfallId ?? `mtg:${card.name}`]
      return {
        ...card,
        imageUrl: card.imageUrl ?? details?.imageUrl,
        smallImageUrl: card.smallImageUrl ?? details?.smallImageUrl ?? details?.imageUrl,
      }
    })
    const gameLabel = DECK_GAME_LIST.find((candidate) => candidate.id === game)?.shortLabel ?? game
    const configuredSections = localizedDeckSections(game, previewFormat)
    const sections = previewSections(cards, configuredSections)
    const unresolved = resolvedPrecon?.unresolved.length ?? 0
    const cannotImport =
      busy ||
      (!capacityReady && !canRequestAccess) ||
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
        <Header
          titleTx="decks:addDeck.previewTitle"
          leftTx="common:back"
          onLeftPress={closePreview}
        />
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
            {["standard", "pioneer", "modern"].includes(previewFormat) ? (
              <Text size="xs" tx="decks:addDeck.originalPrecon" />
            ) : null}
            <LoadingProgress
              testID="precon-loading-progress"
              state={previewLoading ? "loading" : resolvedPrecon ? "complete" : "unavailable"}
              accessibilityText={
                previewLoading
                  ? preconOutline
                    ? translate("decks:addDeck.loadingImages")
                    : translate("decks:addDeck.loadingOfficial")
                  : resolvedPrecon
                    ? translate("decks:addDeck.previewReady")
                    : translate("decks:addDeck.previewUnavailable")
              }
            />
          </View>

          {previewError && selectedPrecon ? (
            <RetryableError
              message={previewError}
              retryAfterMs={previewRetryAfterMs}
              onRetry={() => void previewPrecon(selectedPrecon, true)}
              testID="retry-precon-preview"
            />
          ) : null}
          {!guestMode && access?.message ? (
            <Button text={access.actionLabel ?? access.message} onPress={access.request} />
          ) : null}
          {error ? <AlertNote text={error} /> : null}
          {unresolved > 0 ? (
            <AlertNote text={translate("decks:addDeck.unresolvedCards", { count: unresolved })} />
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
                    accessibilityLabel={translate("decks:addDeck.previewCard", { card: card.name })}
                    activeOpacity={0.75}
                    style={themed($previewCardRow)}
                    onPress={() => focusPreviewCard(card, section.label)}
                  >
                    <View style={themed($previewThumbnailSlot)}>
                      <CardImage
                        game="mtg"
                        cardId={card.scryfallId}
                        source={card.smallImageUrl ?? card.imageUrl}
                        accessibilityLabel={card.name}
                        compact
                        style={themed($previewThumbnail)}
                      />
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
                tx={
                  busy
                    ? "decks:addDeck.importing"
                    : guestMode
                      ? "decks:addDeck.saveDeckOnDevice"
                      : "decks:addDeck.importDeck"
                }
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
      <Header titleTx="decks:shelf.addDeck" leftTx="common:back" onLeftPress={onBack} />
      <View style={themed($stack)}>
        {saveRecovery}
        <Text preset="subheading" tx="decks:settings.title" accessibilityRole="header" />
        <View style={themed($configRow)}>
          <View style={$flex1}>
            <SelectField
              testID="game-picker-options"
              label={translate("decks:shelf.system")}
              field="system"
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
              label={translate("decks:settings.format")}
              field="format"
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
          accessibilityLabel={translate("decks:addDeck.startingPoint")}
          style={themed($tabs)}
        >
          {MODES.map((candidate) => (
            <TouchableOpacity
              key={candidate.id}
              testID={`mode-picker-options-${candidate.id}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === candidate.id }}
              style={[themed($tab), mode === candidate.id && themed($selectedTab)]}
              onPress={() => {
                invalidatePasted()
                setMode(candidate.id)
              }}
            >
              <Text tx={candidate.labelTx} weight={mode === candidate.id ? "bold" : "normal"} />
            </TouchableOpacity>
          ))}
        </View>
        {mode === "precon" ? (
          <View style={themed($stack)}>
            <TextField
              testID="precon-search-input"
              placeholderTx="decks:shelf.search"
              value={preconQuery}
              maxLength={120}
              autoCorrect={false}
              clearButtonMode="while-editing"
              onChangeText={setPreconQuery}
            />
            {browseOffline ? (
              <AlertNote tone="info" text={translate("decks:addDeck.browseOffline")} />
            ) : searching ? (
              <Text size="xs" style={themed($label)} tx="decks:deckLimit.loading" />
            ) : searchError ? (
              <View style={themed($inlineStatus)}>
                <AlertNote text={searchError} />
                <TouchableOpacity
                  accessibilityRole="button"
                  style={themed($plainAction)}
                  onPress={() => void runCatalogSearch(preconQuery, searchCursor.current)}
                >
                  <Text tx="common:retry" style={themed($textAction)} />
                </TouchableOpacity>
              </View>
            ) : catalogDecks.length === 0 &&
              precons.length === 0 &&
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
                      ? translate("decks:addDeck.rateLimited", {
                          count: Math.ceil((retryAfterMs ?? 30_000) / 1000),
                        })
                      : catalogStatus === "refreshing"
                        ? translate("decks:addDeck.refreshing")
                        : translate("decks:addDeck.refreshFailed")
                  }
                />
                <TouchableOpacity
                  accessibilityRole="button"
                  disabled={searching}
                  style={[themed($plainAction), searching && themed($previewImportButtonDisabled)]}
                  onPress={() => void runCatalogSearch(preconQuery)}
                >
                  <Text tx="decks:addDeck.checkAgain" style={themed($textAction)} />
                </TouchableOpacity>
              </View>
            ) : null}
            {precons.map((deck) => (
              <TouchableOpacity
                key={deck.fileName}
                testID={`precon-result-${deck.fileName}`}
                accessibilityRole="button"
                accessibilityLabel={translate("decks:addDeck.previewCard", { card: deck.name })}
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
                <Text weight="medium" style={themed($textAction)} tx="decks:addDeck.preview" />
              </TouchableOpacity>
            ))}
            {catalogDecks.map((deck) => (
              <TouchableOpacity
                key={deck._id}
                accessibilityRole="button"
                accessibilityLabel={translate("decks:addDeck.previewCard", { card: deck.name })}
                activeOpacity={0.75}
                style={themed($resultRow)}
                onPress={() => setSelectedCatalogDeck(deck)}
              >
                <View style={$flex1}>
                  <Text weight="medium" text={deck.name} numberOfLines={2} />
                  <Text size="xs" style={themed($label)} text={catalogDeckDetail(deck)} />
                </View>
                <Text weight="medium" style={themed($textAction)} tx="decks:addDeck.preview" />
              </TouchableOpacity>
            ))}
            {catalogCursor ? (
              <Button
                tx="decks:addDeck.loadMore"
                disabled={searching}
                onPress={() => void runCatalogSearch(preconQuery, catalogCursor)}
              />
            ) : null}
          </View>
        ) : null}

        {mode === "paste" ? (
          <View style={themed($stack)}>
            {linkSource ? (
              <View
                accessibilityRole="tablist"
                accessibilityLabel={translate("decks:addDeck.importSource")}
                style={themed($tabs)}
              >
                {IMPORT_KINDS.map((kind) => (
                  <TouchableOpacity
                    key={kind}
                    testID={`import-source-${kind}`}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: importKind === kind }}
                    style={[themed($tab), importKind === kind && themed($selectedTab)]}
                    onPress={() => {
                      invalidatePasted()
                      setImportKind(kind)
                    }}
                  >
                    <Text
                      text={
                        kind === "text"
                          ? translate("decks:addDeck.pasteText")
                          : translate("decks:addDeck.sourceLink", { source: linkSource.name })
                      }
                    />
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
            <TextField
              testID="deck-name-input"
              labelTx="decks:settings.name"
              value={name}
              maxLength={80}
              helper={deckNameWarning(name)}
              onChangeText={setName}
            />
            {importKind === "link" && linkSource ? (
              <>
                <TextField
                  testID="deck-link-input"
                  label={translate("decks:addDeck.sourceLink", { source: linkSource.name })}
                  placeholder={linkSource.placeholder}
                  helperTx={linkSource.helperTx}
                  value={deckLink}
                  maxLength={2048}
                  keyboardType="url"
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={(next) => {
                    invalidatePasted()
                    setDeckLink(next)
                  }}
                />
                <Button
                  tx="decks:addDeck.pasteInstead"
                  onPress={() => {
                    invalidatePasted()
                    setImportKind("text")
                  }}
                />
              </>
            ) : (
              <TextField
                labelTx="decks:addDeck.deckList"
                accessibilityLabel={translate("decks:addDeck.deckList")}
                helperTx={DECK_LIST_HELPERS[isSystemId(game) ? game : DEFAULT_DECK_GAME]}
                value={deckList}
                multiline
                numberOfLines={12}
                textAlignVertical="top"
                maxLength={50_000}
                onChangeText={(next) => {
                  invalidatePasted()
                  setDeckList(next)
                }}
              />
            )}
            {pastedDraftCurrent ? (
              <Button
                testID="return-import-review-button"
                tx="decks:addDeck.returnToReview"
                disabled={resolvingPasted || busy}
                onPress={() => {
                  if (resolvingPasted || busy) return
                  Keyboard.dismiss()
                  setReviewingPasted(true)
                }}
              />
            ) : null}
            <Button
              testID="review-import-button"
              text={
                resolvingPasted
                  ? translate("decks:addDeck.loadingDeck")
                  : pastedDraftCurrent
                    ? translate("decks:addDeck.reloadSource")
                    : pastedDraft
                      ? translate("decks:detail.reviewChanges")
                      : importKind === "link" && linkSource
                        ? translate("decks:addDeck.reviewSourceDeck", { source: linkSource.name })
                        : translate("decks:addDeck.reviewList")
              }
              preset="reversed"
              disabled={busy || resolvingPasted || !importSource.trim()}
              onPress={reviewPasted}
            />
          </View>
        ) : null}

        {mode === "blank" ? (
          <View style={themed($stack)}>
            <TextField
              testID="deck-name-input"
              labelTx="decks:settings.name"
              value={name}
              maxLength={80}
              helper={deckNameWarning(name)}
              onChangeText={setName}
            />
            {noteField}
            <Button
              tx={busy ? "decks:addDeck.creating" : "decks:addDeck.createDeck"}
              preset="reversed"
              disabled={
                busy ||
                (!capacityReady && !canRequestAccess) ||
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

const $importFields: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.md })
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

const $importSummaryRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  alignItems: "center",
  justifyContent: "space-between",
  columnGap: spacing.sm,
})
const $importAttribution: ViewStyle = {
  minHeight: 44,
  maxWidth: "100%",
  justifyContent: "center",
}
