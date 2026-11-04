import {
  createContext,
  use,
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react"
import type { ViewStyle } from "react-native"
import { Keyboard, Linking, TouchableOpacity, View } from "react-native"
import { useAction, useQueries, useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"

import { AlertNote } from "@/components/AlertNote"
import { Button } from "@/components/Button"
import { CardFocusDialog, colorLabel } from "@/components/CardFocusDialog"
import { CardSymbolText } from "@/components/CardSymbolText"
import { FilterPill } from "@/components/FilterPill"
import { HeaderIcon } from "@/components/Header"
import { LoadingProgress } from "@/components/LoadingProgress"
import { RetryableError } from "@/components/RetryableError"
import { Screen } from "@/components/Screen"
import { SegmentedControl } from "@/components/SegmentedControl"
import { SelectField } from "@/components/SelectField"
import { Tabs } from "@/components/Tabs"
import { Text } from "@/components/Text"
import { TextAction } from "@/components/TextAction"
import { TextField } from "@/components/TextField"
import { useSheetPresence } from "@/components/useSheetPresence"
import type { CloudAccess } from "@/features/auth/CloudScreen"
import { useConvexOnline } from "@/features/connected/useConvexOnline"
import { loadCardDetails, saveCardDetails } from "@/features/decks/cardDetailsCache"
import { identityLabel, SEARCH_COLORS, toggleColor } from "@/features/decks/colorMatch"
import { getCommanderWarnings } from "@/features/decks/commanderSelection"
import { cardDetailsKey, cardSection, printingKey, type DeckCard } from "@/features/decks/deckCards"
import { deckNameWarning } from "@/features/decks/deckCopy"
import { isCommanderPick, MAX_CARD_COPIES, type DeckEdits } from "@/features/decks/deckDraft"
import { creationFormat, useDeckFilters } from "@/features/decks/deckFilters"
import { type GuestDeckPayload } from "@/features/decks/guestDeck"
import { ImportBuild } from "@/features/decks/ImportBuild"
import { pastedLines, type ImportProblem } from "@/features/decks/importLines"
import { useSaveNewDeck } from "@/features/decks/localDeckSync"
import { SaveDestination, useSaveDestination } from "@/features/decks/SaveDestination"
import { useCapabilityReleased } from "@/features/decks/useCapabilityReleased"
import { useCardDetails } from "@/features/decks/useCardDetails"
import { useDeckEditor } from "@/features/decks/useDeckEditor"
import { LocalGameRepository } from "@/features/game/localPersistence"
import { localizedDeckSections } from "@/features/game/playSystems"
import { isSystemVisible } from "@/features/game/systemVisibility"
import { appLocale, type TxKeyPath } from "@/i18n"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import type { ThemedStyle } from "@/theme/types"
import { captureAnalytics } from "@/utils/analytics"
import { convexErrorMessage, convexRetryAfterMs } from "@/utils/convexError"

import { api } from "../../convex/_generated/api"
import {
  DECK_GAME_LIST,
  DEFAULT_DECK_GAME,
  deckFormatLabel,
  deckFormats,
  defaultDeckFormat,
  PRECON_SOURCE,
  preconstructedFormat,
} from "../../convex/lib/deckGames"
import type { ProviderGame } from "../../convex/lib/games/providers"
import { hasCommandZone, isSystemId, type SystemId } from "../../convex/lib/systems"

const DECK_LIST_HELPERS = {
  mtg: "decks:addDeck.listHelperMtg",
  ygo: "decks:addDeck.listHelperYgo",
  pokemon: "decks:addDeck.listHelperPokemon",
  lorcana: "decks:addDeck.listHelperLorcana",
  fab: "decks:addDeck.listHelperFab",
  riftbound: "decks:addDeck.listHelperRiftbound",
} as const satisfies Record<SystemId, TxKeyPath>

type CreationMode = "precon" | "paste" | "blank"

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

type ImportedDeckCard = GuestDeckPayload["cards"][number]

type ImportOrigin = { kind: "text" | "link" | "catalog" | "precon"; source: string }

type ImportDraft = DeckEdits<ImportedDeckCard> & {
  origin: ImportOrigin
  name?: string
  attribution?: { sourceName: string; sourceUrl: string; author?: string }
  game: string
  format: string
  problems: ImportProblem[]
}

function attributionLabel(attribution: { sourceName: string; author?: string }, separator: string) {
  return attribution.author
    ? `${attribution.sourceName}${separator}${attribution.author}`
    : attribution.sourceName
}

function sameOrigin(draft: ImportDraft | undefined, origin: ImportOrigin | undefined) {
  return Boolean(
    draft && origin && draft.origin.kind === origin.kind && draft.origin.source === origin.source,
  )
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
  game: ProviderGame
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
  originalReference?: string
  printingKey?: string
}

type PreconstructedDeckOutline = {
  name: string
  cards: PreviewCard[]
}

type CatalogDeck = FunctionReturnType<typeof api.deckCatalogs.list>[number]

type FeedCheck =
  | FunctionReturnType<typeof api.deckCatalogs.ensureFresh>
  | { status: "checking" }
  | { status: "failed"; error: string }

// why: MTGJSON names deck files `<Name>_<SET>`, so the set code survives without a column for it.
function catalogPrecon(deck: CatalogDeck): PreconstructedDeck {
  const code = deck.externalId.split("_").at(-1)
  return {
    fileName: deck.externalId,
    name: deck.name,
    ...(code && code !== deck.externalId ? { code } : {}),
    ...(deck.publishedAt === undefined
      ? {}
      : { releaseDate: new Date(deck.publishedAt).toISOString().slice(0, 10) }),
  }
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

function normalizeImportedCards(cards: ImportedDeckCard[], game: string, format: string) {
  const supportsCommander = localizedDeckSections(game, format).some(
    (section) => section.id === "commander",
  )
  const cardsByPrinting = new Map<string, ImportedDeckCard>()
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
  return ["Wizards", deck.code?.toUpperCase(), deck.releaseDate?.slice(0, 4)]
    .filter(Boolean)
    .join(" · ")
}

function preconSource(deck: PreconstructedDeck) {
  return (
    [deck.code?.toUpperCase(), deck.releaseDate?.slice(0, 4)].filter(Boolean).join(" ") || undefined
  )
}

function preconFormat(deck: PreconstructedDeck, format: string) {
  return format ? format : preconstructedFormat(deck.type)
}

const PUBLISHERS = new Map([
  ["ygo", "Konami"],
  ["pokemon", "Pokémon"],
  ["lorcana", "Ravensburger"],
  ["fab", "Legend Story Studios"],
  ["riftbound", "Riot Games"],
])

function catalogSourceLabel(deck: CatalogDeck) {
  return deck.kind === "official"
    ? PUBLISHERS.get(deck.game)
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

export type AddDeckProps = {
  onBack: () => void
  onCreated: (deckId: string) => void
  onPreview: () => void
  onClosePreview: () => void
  access?: CloudAccess
}

const AddDeckContext = createContext<ReturnType<typeof useAddDeck> | undefined>(undefined)

export function AddDeckProvider({ children, ...props }: AddDeckProps & { children: ReactNode }) {
  return <AddDeckContext value={useAddDeck(props)}>{children}</AddDeckContext>
}

export function useAddDeckFlow() {
  const flow = use(AddDeckContext)
  if (!flow) throw new Error("useAddDeckFlow must be used inside AddDeckProvider")
  return flow
}

function useAddDeck({ onBack, onCreated, onPreview, onClosePreview, access }: AddDeckProps) {
  const { themed } = useAppTheme()
  const destination = useSaveDestination(access)
  const saveNewDeck = useSaveNewDeck(destination.access?.ownerId)
  const [saving, setSaving] = useState(false)
  const savingNow = useRef(false)
  const [deviceId] = useState(() => new LocalGameRepository().getDeviceId())
  const previewPreconstructed = useAction(api.deckImports.previewPreconstructed)
  const resolvePreconstructed = useAction(api.deckImports.resolvePreconstructed)
  const resolvePasted = useAction(api.deckImports.resolvePasted)
  const resolveLink = useAction(api.deckImports.resolveLink)
  const cardsByName = useAction(api.cards.byNames)
  const ensureFresh = useAction(api.deckCatalogs.ensureFresh)
  const { game, format: filterFormat, setGame, setFormat } = useDeckFilters()
  const [format, setDeckFormat] = useState(() => creationFormat(game, filterFormat))
  const browsable = useCapabilityReleased("exampleDecks")(game)
  const [pickedMode, setMode] = useState<CreationMode>()
  const mode =
    pickedMode === "precon" && !browsable
      ? "paste"
      : (pickedMode ?? (browsable ? "precon" : "paste"))
  const [name, setName] = useState("")
  const [note, setNote] = useState("")
  const [deckList, setDeckList] = useState("")
  const [importKind, setImportKind] = useState<"text" | "link">("text")
  const [deckLink, setDeckLink] = useState("")
  const linkSource = DECK_LINK_SOURCES.get(game)
  const importSource = importKind === "link" ? deckLink : deckList
  const pasted = useDeckEditor<ImportDraft | undefined>(undefined)
  const example = useDeckEditor<ImportDraft | undefined>(undefined)
  const { draft: pastedDraft, setDraft: setPastedDraft } = pasted
  const { latest: latestExample, setDraft: setExampleDraft } = example
  const [resolvingPasted, setResolvingPasted] = useState(false)
  const [buildingPasted, setBuildingPasted] = useState(false)
  const pastedToken = useRef(0)
  const pastedDraftCurrent =
    pastedDraft?.origin.source === importSource &&
    pastedDraft.origin.kind === importKind &&
    pastedDraft.game === game &&
    pastedDraft.format === format
  const [preconQuery, setPreconQuery] = useState("")
  const [searchTerm, setSearchTerm] = useState("")
  const [pickedColors, setPickedColors] = useState<string[]>([])
  const filtersColors = game === DEFAULT_DECK_GAME && hasCommandZone(game, format)
  const catalogColors = filtersColors ? pickedColors : NO_COLORS
  const browseKey = `${game}:${format}`
  const [browsedFormats, setBrowsedFormats] = useState<
    Record<string, { game: string; format: string }>
  >({})
  // why: Convex drops a result once nothing subscribes to it, so formats seen on this visit stay subscribed and switching back renders at once.
  const catalogQueries = useMemo(
    () => ({
      ...Object.fromEntries(
        Object.entries(browsedFormats).map(([key, args]) => [
          key,
          { query: api.deckCatalogs.list, args: { ...args, query: "" } },
        ]),
      ),
      ...(mode === "precon"
        ? {
            current: {
              query: api.deckCatalogs.list,
              args: {
                game,
                format,
                query: searchTerm,
                ...(catalogColors.length ? { colors: catalogColors } : {}),
              },
            },
          }
        : {}),
    }),
    [browsedFormats, catalogColors, format, game, mode, searchTerm],
  )
  const catalogResult: CatalogDeck[] | Error | undefined = useQueries(catalogQueries).current
  const catalogError = catalogResult instanceof Error ? catalogResult : undefined
  const catalogDecks = catalogResult instanceof Error ? [] : (catalogResult ?? [])
  useEffect(() => {
    if (mode === "precon")
      setBrowsedFormats((browsed) =>
        browseKey in browsed ? browsed : { ...browsed, [browseKey]: { game, format } },
      )
  }, [browseKey, format, game, mode])
  const [feedChecks, setFeedChecks] = useState<Record<string, FeedCheck>>({})
  const feed: FeedCheck | undefined = feedChecks[browseKey]
  const [selectedCatalogDeck, setSelectedCatalogDeck] = useState<CatalogDeck>()
  const [selectedPrecon, setSelectedPrecon] = useState<PreconstructedDeck>()
  const [preconOutline, setPreconOutline] = useState<PreconstructedDeckOutline>()
  const [previewLoading, setPreviewLoading] = useState(false)
  const [focusedPreviewCard, setFocusedPreviewCard] = useState<FocusedPreviewCard>()
  const previewSheet = useSheetPresence(focusedPreviewCard)
  const shownPreviewCard = previewSheet.shown
  const {
    detailsByKey: previewDetailsByKey,
    detailsError: previewDetailsError,
    detailsRetryAfterMs: previewDetailsRetryAfterMs,
    retryDetails: retryPreviewDetails,
  } = useCardDetails(focusedPreviewCard)
  const [error, setError] = useState<string>()
  const online = useConvexOnline()
  const waitingForDecks =
    catalogResult === undefined ||
    (catalogDecks.length === 0 && (!feed || feed.status === "checking"))
  const browseOffline = !online && waitingForDecks
  const browseEmpty =
    mode === "precon" &&
    !waitingForDecks &&
    !catalogError &&
    catalogDecks.length === 0 &&
    feed?.status !== "failed"
  const [previewError, setPreviewError] = useState<string>()
  const [previewRetryAfterMs, setPreviewRetryAfterMs] = useState<number>()
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
  const exampleOrigin: ImportOrigin | undefined = selectedCatalogDeck
    ? { kind: "catalog", source: selectedCatalogDeck._id }
    : selectedPrecon
      ? { kind: "precon", source: selectedPrecon.fileName }
      : undefined
  const exampleDraft = sameOrigin(example.draft, exampleOrigin) ? example.draft : undefined
  const editor = buildingPasted ? pasted : example
  const importDraft = buildingPasted ? pastedDraft : exampleDraft
  const reviewing = Boolean((buildingPasted && pastedDraft) || exampleOrigin)

  useEffect(() => {
    if (!selectedCatalogDeck || catalogDetail?.deck._id !== selectedCatalogDeck._id) return
    const origin = { kind: "catalog", source: selectedCatalogDeck._id } as const
    if (sameOrigin(latestExample.current, origin)) return
    setExampleDraft({
      origin,
      name: selectedCatalogDeck.name,
      game: selectedCatalogDeck.game,
      format: selectedCatalogDeck.format ?? defaultDeckFormat(selectedCatalogDeck.game),
      cards: catalogDetail.entries.map(
        ({ _id, _creationTime, catalogDeckId: _catalogDeckId, ...entry }) => entry,
      ),
      problems: [],
    })
  }, [catalogDetail, latestExample, selectedCatalogDeck, setExampleDraft])

  function fail(cause: unknown, fallback: string) {
    setError(convexErrorMessage(cause, fallback))
  }

  async function saveGuest(payload: GuestDeckPayload) {
    if (savingNow.current) return
    savingNow.current = true
    setSaving(true)
    try {
      onCreated(await saveNewDeck(payload, destination.value))
    } catch (cause) {
      fail(cause, translate("decks:addDeck.saveLocalFailed"))
    } finally {
      savingNow.current = false
      setSaving(false)
    }
  }
  const saveTx = (deviceTx: TxKeyPath) => (destination.access ? "decks:addDeck.saveDeck" : deviceTx)

  function invalidatePasted() {
    pastedToken.current += 1
    setResolvingPasted(false)
    setError(undefined)
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
    setSearchTerm("")
    setSelectedCatalogDeck(undefined)
    setSelectedPrecon(undefined)
    setFocusedPreviewCard(undefined)
    setMode(undefined)
  }

  function chooseFormat(next: string) {
    invalidatePasted()
    setDeckFormat(next)
    setFormat(next)
  }

  async function checkFeed(feedGame: string, feedFormat: string) {
    const key = `${feedGame}:${feedFormat}`
    setFeedChecks((checks) => ({ ...checks, [key]: { status: "checking" } }))
    let check: FeedCheck
    try {
      check = await ensureFresh({ game: feedGame, format: feedFormat })
    } catch (cause) {
      check = {
        status: "failed",
        error: convexErrorMessage(cause, translate("decks:addDeck.loadDecksFailed")),
      }
    }
    setFeedChecks((checks) => ({ ...checks, [key]: check }))
  }

  const checkFeedOnce = useEffectEvent(() => {
    if (mode === "precon" && (!feed || feed.status === "failed")) void checkFeed(game, format)
  })
  useEffect(() => {
    if (online) checkFeedOnce()
  }, [game, format, mode, online])

  useEffect(() => {
    const term = preconQuery.trim()
    const timer = setTimeout(() => setSearchTerm(term), term ? SEARCH_DEBOUNCE_MS : 0)
    return () => clearTimeout(timer)
  }, [preconQuery])

  const reportEmptyBrowse = useEffectEvent(() => {
    if (feed && feed.status !== "checking" && feed.status !== "failed")
      captureAnalytics("deck_browse_empty", { system: game, format, status: feed.status })
  })
  useEffect(() => {
    if (browseEmpty && !searchTerm) reportEmptyBrowse()
  }, [browseEmpty, searchTerm, game, format])

  function createBlank() {
    void saveGuest({ name, format, game, ...(note.trim() ? { note } : {}), cards: [] })
  }

  const previewPrecon = useCallback(
    async (deck: PreconstructedDeck, keepOutline = false) => {
      const token = previewToken.current + 1
      previewToken.current = token
      try {
        setSelectedPrecon(deck)
        if (!keepOutline) setPreconOutline(undefined)
        setError(undefined)
        setPreviewError(undefined)
        setPreviewRetryAfterMs(undefined)
        setPreviewLoading(true)
        const outline = await previewPreconstructed({ fileName: deck.fileName })
        if (previewToken.current !== token) return
        setPreconOutline(outline)
        const resolved = await resolvePreconstructed({ fileName: deck.fileName })
        if (previewToken.current !== token) return
        const deckFormat = preconFormat(deck, format)
        const normalized = normalizeImportedCards(importCards(resolved.cards), game, deckFormat)
        setExampleDraft({
          origin: { kind: "precon", source: deck.fileName },
          name: resolved.name || deck.name,
          game,
          format: deckFormat,
          cards: "overflow" in normalized ? importCards(resolved.cards) : normalized.cards,
          problems: resolved.unresolved.map((line) => ({ line, kind: "unmatched" })),
        })
      } catch (cause) {
        if (previewToken.current === token) {
          setPreviewError(convexErrorMessage(cause, translate("decks:addDeck.previewFailed")))
          setPreviewRetryAfterMs(convexRetryAfterMs(cause))
        }
      } finally {
        if (previewToken.current === token) setPreviewLoading(false)
      }
    },
    [format, game, previewPreconstructed, resolvePreconstructed, setExampleDraft],
  )

  function openPrecon(deck: PreconstructedDeck) {
    if (sameOrigin(latestExample.current, { kind: "precon", source: deck.fileName }))
      setSelectedPrecon(deck)
    else void previewPrecon(deck)
    onPreview()
  }

  function openCatalogDeck(deck: CatalogDeck) {
    setSelectedCatalogDeck(deck)
    onPreview()
  }

  function closeExample() {
    previewToken.current += 1
    setPreviewLoading(false)
    setPreviewRetryAfterMs(undefined)
    setSelectedCatalogDeck(undefined)
    setSelectedPrecon(undefined)
    setPreconOutline(undefined)
    setFocusedPreviewCard(undefined)
    setPreviewError(undefined)
    setError(undefined)
  }

  async function reviewPasted() {
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
          ? pastedDraft?.origin.kind === "link" && pastedDraft.origin.source === deckLink
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
        origin: { kind: importKind, source: importSource },
        game,
        format: suggestedFormat,
        cards: normalized.cards,
        problems: [
          ...resolved.unresolved.map((line) => ({ line, kind: "unmatched" as const })),
          ...resolved.invalidLines.map((line) => ({ line, kind: "invalid" as const })),
        ],
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
      Keyboard.dismiss()
      setBuildingPasted(true)
      onPreview()
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

  function leaveImport() {
    closeExample()
    invalidatePasted()
    setBuildingPasted(false)
  }

  function focusImportCard(card: DeckCard, boardLabel: string) {
    const cardGame = importDraft?.game ?? game
    setFocusedPreviewCard({
      ...card,
      detailKey: cardDetailsKey(card, cardGame),
      printingKey: printingKey(card),
      game: cardGame,
      catalogCardId: card.cardId ?? card.printingId ?? card.providerCardId,
      boardLabel,
    })
  }

  function addImportCard(card: ImportedDeckCard) {
    const draft = editor.latest.current
    if (!draft) return undefined
    return editor.edit({ type: "add", card }, draft)
  }

  function removeImportCard(card: DeckCard) {
    const draft = editor.latest.current
    if (!draft) return
    if (card.quantity <= 1) setFocusedPreviewCard(undefined)
    editor.edit({ type: "remove", card }, draft)
  }

  function withoutProblem(draft: ImportDraft, problem: ImportProblem): ImportDraft {
    return {
      ...draft,
      undo: undefined,
      problems: draft.problems.filter(
        (entry) => entry.line !== problem.line || entry.kind !== problem.kind,
      ),
      cards:
        problem.kind === "unmatched"
          ? draft.cards.filter((card) => card.originalReference !== problem.line)
          : draft.cards,
    }
  }

  function problemCopies(draft: ImportDraft, problem: ImportProblem) {
    const placeholders = draft.cards.filter((card) => card.originalReference === problem.line)
    if (placeholders.length > 0)
      return placeholders.map((card) => ({
        quantity: card.quantity,
        section: cardSection(card),
        board: card.board,
      }))
    if (draft.origin.kind === "text")
      return pastedLines(draft.origin.source, problem.line).map(({ quantity, board }) => ({
        quantity,
        section: board,
        board,
      }))
    return undefined
  }

  function replaceProblem(problem: ImportProblem, card: ImportedDeckCard) {
    const draft = editor.latest.current
    if (!draft) return undefined
    const copies = problemCopies(draft, problem) ?? [
      { quantity: card.quantity, section: cardSection(card), board: card.board },
    ]
    const rest = withoutProblem(draft, problem)
    const normalized = normalizeImportedCards(
      [
        ...rest.cards,
        ...copies.map(({ quantity, section, board }) => ({
          ...card,
          quantity,
          section,
          ...(card.scryfallId && board ? { board } : {}),
        })),
      ],
      draft.game,
      draft.format,
    )
    if ("overflow" in normalized)
      return translate("decks:addDeck.overflowAfterMatch", { card: normalized.overflow })
    editor.setDraft({ ...rest, cards: normalized.cards })
    return undefined
  }

  function removeProblem(problem: ImportProblem) {
    const draft = editor.latest.current
    if (draft) editor.setDraft(withoutProblem(draft, problem))
  }

  function removeAllProblems() {
    const draft = editor.latest.current
    if (draft) editor.setDraft(draft.problems.reduce(withoutProblem, draft))
  }

  async function applyGuess(problem: ImportProblem, cardName: string) {
    const started = editor.latest.current
    try {
      const { cards } = await cardsByName({ names: [cardName], deviceId })
      const found = cards.find((card) => card.name === cardName)
      if (!found) return translate("decks:importBuild.useFailed", { card: cardName })
      saveCardDetails({ [found.scryfallId]: found })
      const draft = editor.latest.current
      if (
        !started ||
        !sameOrigin(draft, started.origin) ||
        draft?.game !== started.game ||
        !draft.problems.some((entry) => entry.line === problem.line && entry.kind === problem.kind)
      )
        return undefined
      return replaceProblem(problem, {
        name: found.name,
        oracleId: found.oracleId,
        scryfallId: found.scryfallId,
        imageUrl: found.imageUrl,
        smallImageUrl: found.smallImageUrl,
        quantity: 1,
      })
    } catch (cause) {
      return convexErrorMessage(cause, translate("decks:importBuild.useFailed", { card: cardName }))
    }
  }

  const importName = buildingPasted
    ? name
    : (exampleDraft?.name ?? selectedCatalogDeck?.name ?? selectedPrecon?.name ?? "")

  function renameImport(next: string) {
    if (buildingPasted) setName(next)
    else if (exampleDraft) setExampleDraft({ ...exampleDraft, name: next })
  }

  function saveImport() {
    if (
      !importDraft ||
      (buildingPasted && (!pastedDraftCurrent || resolvingPasted)) ||
      importDraft.problems.length > 0 ||
      importDraft.cards.length === 0 ||
      !importName.trim()
    )
      return
    const attribution = importDraft.attribution
    void saveGuest({
      name: importName,
      format: importDraft.format,
      game: importDraft.game,
      ...(attribution
        ? {
            note: `Imported from ${attributionLabel(attribution, " by ")}\n${attribution.sourceUrl}`,
          }
        : {}),
      cards: importDraft.cards,
    })
  }

  const noteField = (
    <TextField
      testID="deck-note-input"
      labelTx="decks:addDeck.notes"
      optional
      value={note}
      multiline
      numberOfLines={3}
      textAlignVertical="top"
      maxLength={1000}
      onChangeText={(next) => {
        setNote(next)
      }}
    />
  )
  const emptyCatalog = (
    <View style={themed($stack)}>
      <Text
        weight="bold"
        tx={
          preconQuery.trim() || catalogColors.length
            ? "decks:addDeck.noMatches"
            : "decks:addDeck.noDecksHere"
        }
      />
      <Text
        size="sm"
        text={
          preconQuery.trim() || catalogColors.length
            ? translate("decks:addDeck.noMatchesDetail")
            : translate("decks:addDeck.noListsYet", { format: deckFormatLabel(game, format) })
        }
      />
      <Button tx="decks:addDeck.pasteList" preset="primary" onPress={() => setMode("paste")} />
      <TextAction tx="decks:versionDialog.empty" onPress={() => setMode("blank")} />
    </View>
  )

  let review: ReactElement | undefined
  if (reviewing) {
    const draftGame = importDraft?.game ?? selectedCatalogDeck?.game ?? game
    const draftFormat =
      importDraft?.format ??
      (selectedCatalogDeck
        ? (selectedCatalogDeck.format ?? defaultDeckFormat(selectedCatalogDeck.game))
        : selectedPrecon
          ? preconFormat(selectedPrecon, format)
          : format)
    const cards: DeckCard[] | undefined = importDraft?.cards ?? preconOutline?.cards
    const cachedRules = importDraft?.commanderSelected ? loadCardDetails() : {}
    const commanderWarnings =
      importDraft?.commanderSelected && cards
        ? getCommanderWarnings(
            cards,
            (card) =>
              cachedRules[cardDetailsKey(card, draftGame)] ??
              previewDetailsByKey[cardDetailsKey(card, draftGame)],
          )
        : []
    const focusedImportCard = importDraft?.cards.find(
      (card) => printingKey(card) === focusedPreviewCard?.printingKey,
    )
    const attribution = importDraft?.attribution
    const details = attribution ? (
      <TextAction
        accessibilityRole="link"
        accessibilityLabel={
          attribution.author
            ? translate("decks:addDeck.viewOnBy", {
                source: attribution.sourceName,
                author: attribution.author,
              })
            : translate("decks:addDeck.viewOn", { source: attribution.sourceName })
        }
        text={attributionLabel(attribution, " · ")}
        size="xs"
        style={$importAttribution}
        onPress={() =>
          void Linking.openURL(attribution.sourceUrl).catch(() =>
            setError(translate("decks:addDeck.openFailed", { source: attribution.sourceName })),
          )
        }
      />
    ) : selectedCatalogDeck ? (
      <>
        <Text size="xs" tone="dim" text={catalogDeckDetail(selectedCatalogDeck)} />
        {selectedCatalogDeck.kind === "example" ? (
          <Text size="xs" tone="dim" tx="decks:addDeck.datedExample" />
        ) : null}
        {selectedCatalogDeck.sourceUrl ? (
          <TextAction
            accessibilityRole="link"
            tx="decks:addDeck.viewSource"
            size="xs"
            style={$importAttribution}
            onPress={() =>
              void Linking.openURL(selectedCatalogDeck.sourceUrl!).catch(() =>
                setError(translate("decks:addDeck.openSourceFailed")),
              )
            }
          />
        ) : null}
      </>
    ) : selectedPrecon ? (
      <>
        {["standard", "pioneer", "modern"].includes(draftFormat) ? (
          <Text size="xs" tone="dim" tx="decks:addDeck.originalPrecon" />
        ) : null}
        {previewError ? (
          <RetryableError
            message={previewError}
            retryAfterMs={previewRetryAfterMs}
            onRetry={() => void previewPrecon(selectedPrecon, true)}
            testID="retry-precon-preview"
          />
        ) : null}
      </>
    ) : null
    const progress = selectedCatalogDeck ? (
      <LoadingProgress
        state="loading"
        edge="bottom"
        accessibilityText={translate("decks:addDeck.loadingTopDeck")}
      />
    ) : selectedPrecon ? (
      <LoadingProgress
        testID="precon-loading-progress"
        edge="bottom"
        state={importDraft || previewLoading ? "loading" : "unavailable"}
        accessibilityText={
          !importDraft && !previewLoading
            ? translate("decks:addDeck.previewUnavailable")
            : importDraft || preconOutline
              ? translate("decks:addDeck.loadingImages")
              : translate("decks:addDeck.loadingOfficial")
        }
      />
    ) : undefined
    review = (
      <Screen
        key="import-build"
        preset="fixed"
        safeAreaEdges={["bottom"]}
        contentContainerStyle={$importScreen}
      >
        <ImportBuild
          name={importName}
          onNameChange={renameImport}
          game={draftGame}
          format={draftFormat}
          cards={cards}
          editable={Boolean(importDraft)}
          source={
            selectedPrecon && !importDraft?.attribution && !selectedCatalogDeck
              ? preconSource(selectedPrecon)
              : undefined
          }
          details={details}
          progress={progress}
          problems={importDraft?.problems ?? []}
          onApplyGuess={applyGuess}
          onRemoveProblem={removeProblem}
          onReplaceProblem={replaceProblem}
          onRemoveAllProblems={removeAllProblems}
          error={error}
          commanderWarnings={commanderWarnings}
          undo={
            importDraft?.undo
              ? {
                  name: importDraft.undo.name,
                  restore: () => editor.edit({ type: "undo" }, importDraft),
                }
              : undefined
          }
          destination={destination}
          saveTx={saveTx("decks:addDeck.saveDeckOnDevice")}
          saving={saving}
          saveDisabled={
            saving ||
            !importDraft ||
            (buildingPasted && (resolvingPasted || !pastedDraftCurrent)) ||
            importDraft.problems.length > 0 ||
            importDraft.cards.length === 0 ||
            !importName.trim()
          }
          onSave={saveImport}
          onBack={onClosePreview}
          onFocus={focusImportCard}
          onAdd={addImportCard}
          onRemove={removeImportCard}
          imageFor={(card) => {
            const details = previewDetailsByKey[cardDetailsKey(card, draftGame)]
            return (
              card.smallImageUrl ?? details?.smallImageUrl ?? card.imageUrl ?? details?.imageUrl
            )
          }}
        >
          {shownPreviewCard ? (
            <CardFocusDialog
              visible={previewSheet.visible}
              onDismissed={previewSheet.onDismissed}
              card={{
                game: shownPreviewCard.game ?? "mtg",
                cardId: shownPreviewCard.scryfallId ?? shownPreviewCard.catalogCardId,
                name: shownPreviewCard.name,
                imageUrl: shownPreviewCard.imageUrl,
                smallImageUrl: shownPreviewCard.smallImageUrl,
                quantity: focusedImportCard?.quantity ?? shownPreviewCard.quantity,
                boardLabel: shownPreviewCard.boardLabel,
              }}
              details={previewDetailsByKey[shownPreviewCard.detailKey]}
              detailsError={previewDetailsError}
              detailsRetryAfterMs={previewDetailsRetryAfterMs}
              onRetryDetails={retryPreviewDetails}
              onClose={() => setFocusedPreviewCard(undefined)}
              {...(focusedImportCard
                ? {
                    onIncrement:
                      focusedImportCard.quantity >= MAX_CARD_COPIES ||
                      isCommanderPick({ game: draftGame, format: draftFormat }, focusedImportCard)
                        ? undefined
                        : () => addImportCard(focusedImportCard),
                    onDecrement: () => removeImportCard(focusedImportCard),
                  }
                : {})}
            />
          ) : null}
        </ImportBuild>
      </Screen>
    )
  }

  const browse = (
    <Screen
      preset="scroll"
      safeAreaEdges={["bottom"]}
      contentInset="standard"
      header={{
        titleTx: "decks:shelf.addDeck",
        collapseTitle: false,
        LeftActionComponent: (
          <HeaderIcon icon="back" label={translate("common:back")} onPress={onBack} />
        ),
      }}
    >
      <View style={themed($stack)}>
        <View style={themed($configRow)}>
          <View style={$flex1}>
            <SelectField
              testID="game-picker-options"
              label={translate("decks:shelf.system")}
              field="system"
              value={game}
              options={DECK_GAME_LIST.filter((candidate) => isSystemVisible(candidate.id)).map(
                (candidate) => ({
                  id: candidate.id,
                  label: candidate.shortLabel,
                }),
              )}
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
        <Tabs
          testID="mode-picker-options"
          accessibilityLabel={translate("decks:addDeck.startingPoint")}
          tabs={MODES.filter(({ id }) => id !== "precon" || browsable).map(({ id, labelTx }) => ({
            id,
            label: translate(labelTx),
          }))}
          selectedId={mode}
          onSelect={(next) => {
            invalidatePasted()
            setMode(next)
          }}
        />
        {mode === "precon" ? (
          <View style={themed($stack)}>
            <TextField
              testID="precon-search-input"
              placeholderTx="decks:shelf.search"
              value={preconQuery}
              maxLength={120}
              autoCorrect={false}
              clearable
              onChangeText={setPreconQuery}
            />
            {filtersColors ? (
              <View style={themed($colorFilters)}>
                {SEARCH_COLORS.map((color) => (
                  <FilterPill
                    key={color}
                    testID={`precon-color-${color}`}
                    label={colorLabel(color)}
                    selected={pickedColors.includes(color)}
                    onPress={() => setPickedColors((current) => toggleColor(current, color))}
                  />
                ))}
              </View>
            ) : null}
            {browseOffline ? (
              <AlertNote tone="info" text={translate("decks:addDeck.browseOffline")} />
            ) : waitingForDecks ? (
              <Text size="xs" tone="dim" tx="decks:deckLimit.loading" />
            ) : catalogError ? (
              <AlertNote
                text={convexErrorMessage(catalogError, translate("decks:addDeck.loadDecksFailed"))}
              />
            ) : feed?.status === "failed" && catalogDecks.length === 0 ? (
              <View style={themed($inlineStatus)}>
                <AlertNote text={feed.error} />
                <TextAction tx="common:retry" onPress={() => void checkFeed(game, format)} />
              </View>
            ) : browseEmpty && feed?.status !== "rate_limited" && feed?.status !== "unavailable" ? (
              emptyCatalog
            ) : null}
            {feed?.status === "rate_limited" || feed?.status === "unavailable" ? (
              <View style={themed($inlineStatus)}>
                <Text
                  size="sm"
                  text={
                    feed.status === "rate_limited"
                      ? translate("decks:addDeck.rateLimited", {
                          count: Math.ceil((feed.retryAfterMs ?? 30_000) / 1000),
                        })
                      : translate("decks:addDeck.refreshFailed")
                  }
                />
                <TextAction
                  tx="decks:addDeck.checkAgain"
                  onPress={() => void checkFeed(game, format)}
                />
              </View>
            ) : null}
            {catalogDecks.map((deck) => {
              const open = () =>
                deck.source === PRECON_SOURCE
                  ? openPrecon(catalogPrecon(deck))
                  : openCatalogDeck(deck)
              const identity = deck.game === DEFAULT_DECK_GAME ? deck.identityColors : undefined
              return (
                <TouchableOpacity
                  key={deck._id}
                  testID={`catalog-deck-${deck.externalId}`}
                  accessibilityRole="button"
                  accessibilityLabel={[
                    translate("decks:addDeck.openDeck", { card: deck.name }),
                    identity ? identityLabel(identity) : undefined,
                  ]
                    .filter(Boolean)
                    .join(". ")}
                  activeOpacity={0.75}
                  style={themed($resultRow)}
                  disabled={previewLoading}
                  onPress={open}
                >
                  <View style={$flex1}>
                    <Text weight="medium" text={deck.name} numberOfLines={2} />
                    <Text
                      size="meta"
                      tone="dim"
                      text={
                        deck.source === PRECON_SOURCE
                          ? preconDetail(catalogPrecon(deck))
                          : catalogDeckDetail(deck)
                      }
                    />
                  </View>
                  {identity ? (
                    <CardSymbolText
                      game={DEFAULT_DECK_GAME}
                      size="xs"
                      text={(identity.length ? identity : ["C"])
                        .map((color) => `{${color}}`)
                        .join("")}
                    />
                  ) : null}
                </TouchableOpacity>
              )
            })}
          </View>
        ) : null}

        {mode === "paste" ? (
          <View style={themed($stack)}>
            {linkSource ? (
              <SegmentedControl
                testID="import-source"
                accessibilityLabel={translate("decks:addDeck.importSource")}
                segments={IMPORT_KINDS.map((kind) => ({
                  id: kind,
                  label:
                    kind === "text"
                      ? translate("decks:addDeck.pasteText")
                      : translate("decks:addDeck.sourceLink", { source: linkSource.name }),
                }))}
                selectedId={importKind}
                onSelect={(id) => {
                  const kind = IMPORT_KINDS.find((candidate) => candidate === id)
                  if (!kind) return
                  invalidatePasted()
                  setImportKind(kind)
                }}
              />
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
                tx="decks:addDeck.returnToDeck"
                disabled={resolvingPasted}
                onPress={() => {
                  if (resolvingPasted) return
                  Keyboard.dismiss()
                  setBuildingPasted(true)
                  onPreview()
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
                    : importKind === "link" && linkSource
                      ? translate("decks:addDeck.importSourceDeck", { source: linkSource.name })
                      : translate("decks:addDeck.importList")
              }
              preset="primary"
              disabled={resolvingPasted || !importSource.trim()}
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
            <SaveDestination destination={destination} />
            <Button
              tx="decks:addDeck.createDeck"
              preset="primary"
              disabled={saving || !name.trim()}
              onPress={createBlank}
            />
          </View>
        ) : null}

        {error ? <AlertNote text={error} /> : null}
      </View>
    </Screen>
  )

  return { browse, review, leavePreview: leaveImport }
}

const NO_COLORS: string[] = []
const $stack: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.sm,
  marginTop: spacing.sm,
})
const $flex1 = { flex: 1 } as const
const $importScreen: ViewStyle = { flex: 1, width: "100%" }
const $configRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.xs,
})
const $colorFilters: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  flexWrap: "wrap",
  gap: spacing.xs,
})
const $inlineStatus: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xs,
  alignItems: "flex-start",
})
const $resultRow: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  minHeight: 68,
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  paddingVertical: spacing.xs,
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
})
const $importAttribution: ViewStyle = {
  minHeight: 44,
  maxWidth: "100%",
  justifyContent: "center",
  alignSelf: "flex-start",
}
