import { useCallback, useEffect, useEffectEvent, useRef, useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { Keyboard, Linking, TouchableOpacity, View } from "react-native"
import { useAction, useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"

import { AlertNote } from "@/components/AlertNote"
import { Button } from "@/components/Button"
import { CardFocusDialog } from "@/components/CardFocusDialog"
import { Header } from "@/components/Header"
import { LoadingProgress } from "@/components/LoadingProgress"
import { RetryableError } from "@/components/RetryableError"
import { Screen } from "@/components/Screen"
import { SelectField } from "@/components/SelectField"
import { Text } from "@/components/Text"
import { TextAction } from "@/components/TextAction"
import { TextField } from "@/components/TextField"
import type { CloudAccess } from "@/features/auth/CloudScreen"
import { useConvexOnline } from "@/features/connected/useConvexOnline"
import { loadCardDetails, saveCardDetails } from "@/features/decks/cardDetailsCache"
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
import type { Id } from "../../convex/_generated/dataModel"
import {
  DECK_GAME_LIST,
  DEFAULT_DECK_GAME,
  deckFormatLabel,
  deckFormats,
  defaultDeckFormat,
  preconstructedFormat,
} from "../../convex/lib/deckGames"
import type { ProviderGame } from "../../convex/lib/games/providers"
import { isSystemId, type SystemId } from "../../convex/lib/systems"

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
  return ["Wizards", deck.type, deck.code?.toUpperCase(), deck.releaseDate?.slice(0, 4)]
    .filter(Boolean)
    .join(" · ")
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
  const destination = useSaveDestination(access)
  const saveNewDeck = useSaveNewDeck(destination.access?.ownerId)
  const [saving, setSaving] = useState(false)
  const savingNow = useRef(false)
  const [deviceId] = useState(() => new LocalGameRepository().getDeviceId())
  const searchPreconstructed = useAction(api.deckImports.searchPreconstructed)
  const previewPreconstructed = useAction(api.deckImports.previewPreconstructed)
  const resolvePreconstructed = useAction(api.deckImports.resolvePreconstructed)
  const resolvePasted = useAction(api.deckImports.resolvePasted)
  const resolveLink = useAction(api.deckImports.resolveLink)
  const cardsByName = useAction(api.cards.byNames)
  const searchTopDecks = useAction(api.deckCatalogs.browse)
  const { game, format: filterFormat, setGame, setFormat } = useDeckFilters()
  const [format, setDeckFormat] = useState(() => creationFormat(game, filterFormat))
  const browsable = useCapabilityReleased("exampleDecks")(game)
  const [pickedMode, setMode] = useState<CreationMode>()
  const mode =
    pickedMode === "precon" && !browsable
      ? "paste"
      : (pickedMode ?? (browsable ? "precon" : "paste"))
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
  const [precons, setPrecons] = useState<PreconstructedDeck[]>([])
  const [catalogDecks, setCatalogDecks] = useState<CatalogDeck[]>([])
  const [selectedCatalogDeck, setSelectedCatalogDeck] = useState<CatalogDeck>()
  const [selectedPrecon, setSelectedPrecon] = useState<PreconstructedDeck>()
  const [preconOutline, setPreconOutline] = useState<PreconstructedDeckOutline>()
  const [previewLoading, setPreviewLoading] = useState(false)
  const [focusedPreviewCard, setFocusedPreviewCard] = useState<FocusedPreviewCard>()
  const {
    detailsByKey: previewDetailsByKey,
    detailsError: previewDetailsError,
    detailsRetryAfterMs: previewDetailsRetryAfterMs,
    retryDetails: retryPreviewDetails,
  } = useCardDetails(focusedPreviewCard)
  const [error, setError] = useState<string>()
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
  const exampleOrigin: ImportOrigin | undefined = selectedCatalogDeck
    ? { kind: "catalog", source: selectedCatalogDeck._id }
    : selectedPrecon
      ? { kind: "precon", source: selectedPrecon.fileName }
      : undefined
  const exampleDraft = sameOrigin(example.draft, exampleOrigin) ? example.draft : undefined
  const editor = buildingPasted ? pasted : example
  const importDraft = buildingPasted ? pastedDraft : exampleDraft

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
    setPrecons([])
    setCatalogDecks([])
    setSelectedCatalogDeck(undefined)
    setSelectedPrecon(undefined)
    setFocusedPreviewCard(undefined)
    setMode(undefined)
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
          const preconsFound = preconResult.status === "fulfilled" && preconResult.value?.length
          if (!cursor && !query.trim() && !found.decks.length && !preconsFound)
            captureAnalytics("deck_browse_empty", { system: game, format, status: found.status })
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
    // why: the empty state must wait for an answer, not show during the debounce or a request that never lands.
    setSearching(true)
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
    if (!buildingPasted) {
      closeExample()
      return
    }
    invalidatePasted()
    setFocusedPreviewCard(undefined)
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

  function changeImportFormat(next: string) {
    const draft = editor.latest.current
    if (!draft) return
    const normalized = normalizeImportedCards(draft.cards, draft.game, next)
    if ("overflow" in normalized) {
      setError(translate("decks:addDeck.overflowOnFormat", { card: normalized.overflow }))
      return
    }
    if (buildingPasted) {
      setDeckFormat(next)
      setFormat(next)
    }
    editor.setDraft({ ...draft, format: next, cards: normalized.cards })
    setError(undefined)
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
      return placeholders.map((card) => ({ quantity: card.quantity, section: cardSection(card) }))
    if (draft.origin.kind === "text")
      return pastedLines(draft.origin.source, problem.line).map(({ quantity, board }) => ({
        quantity,
        section: board,
      }))
    return undefined
  }

  function replaceProblem(problem: ImportProblem, card: ImportedDeckCard) {
    const draft = editor.latest.current
    if (!draft) return undefined
    const copies = problemCopies(draft, problem) ?? [
      { quantity: card.quantity, section: cardSection(card) },
    ]
    const rest = withoutProblem(draft, problem)
    const normalized = normalizeImportedCards(
      [
        ...rest.cards,
        ...copies.map(({ quantity, section }) => ({
          ...card,
          quantity,
          section,
          ...(card.scryfallId &&
          (section === "main" || section === "sideboard" || section === "commander")
            ? { board: section }
            : {}),
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
      placeholderTx="decks:addDeck.optional"
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
      <Button tx="decks:addDeck.pasteList" preset="primary" onPress={() => setMode("paste")} />
      <TextAction tx="decks:versionDialog.empty" onPress={() => setMode("blank")} />
    </View>
  )

  if ((buildingPasted && pastedDraft) || exampleOrigin) {
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
      <TouchableOpacity
        accessibilityRole="link"
        accessibilityLabel={
          attribution.author
            ? translate("decks:addDeck.viewOnBy", {
                source: attribution.sourceName,
                author: attribution.author,
              })
            : translate("decks:addDeck.viewOn", { source: attribution.sourceName })
        }
        style={$importAttribution}
        onPress={() =>
          void Linking.openURL(attribution.sourceUrl).catch(() =>
            setError(translate("decks:addDeck.openFailed", { source: attribution.sourceName })),
          )
        }
      >
        <Text text={attributionLabel(attribution, " · ")} size="xs" tone="dim" />
      </TouchableOpacity>
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
        {importDraft ? null : (
          <LoadingProgress
            state="loading"
            accessibilityText={translate("decks:addDeck.loadingTopDeck")}
          />
        )}
      </>
    ) : selectedPrecon ? (
      <>
        {preconDetail(selectedPrecon) ? (
          <Text size="xs" tone="dim" text={preconDetail(selectedPrecon)} />
        ) : null}
        {["standard", "pioneer", "modern"].includes(draftFormat) ? (
          <Text size="xs" tone="dim" tx="decks:addDeck.originalPrecon" />
        ) : null}
        {importDraft ? null : (
          <LoadingProgress
            testID="precon-loading-progress"
            state={previewLoading ? "loading" : "unavailable"}
            accessibilityText={
              previewLoading
                ? preconOutline
                  ? translate("decks:addDeck.loadingImages")
                  : translate("decks:addDeck.loadingOfficial")
                : translate("decks:addDeck.previewUnavailable")
            }
          />
        )}
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
    return (
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
          onFormatChange={changeImportFormat}
          cards={cards}
          editable={Boolean(importDraft)}
          details={details}
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
          onBack={leaveImport}
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
          {focusedPreviewCard ? (
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

  return (
    <Screen preset="scroll" safeAreaEdges={["bottom"]} contentInset="standard">
      <Header titleTx="decks:shelf.addDeck" leftTx="common:back" onLeftPress={onBack} />
      <View style={themed($stack)}>
        <Text preset="subheading" tx="decks:settings.title" accessibilityRole="header" />
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
        <View
          testID="mode-picker-options"
          accessibilityRole="tablist"
          accessibilityLabel={translate("decks:addDeck.startingPoint")}
          style={themed($tabs)}
        >
          {MODES.filter(({ id }) => id !== "precon" || browsable).map((candidate) => (
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
              clearable
              onChangeText={setPreconQuery}
            />
            {browseOffline ? (
              <AlertNote tone="info" text={translate("decks:addDeck.browseOffline")} />
            ) : searching ? (
              <Text size="xs" tone="dim" tx="decks:deckLimit.loading" />
            ) : searchError ? (
              <View style={themed($inlineStatus)}>
                <AlertNote text={searchError} />
                <TextAction
                  tx="common:retry"
                  onPress={() => void runCatalogSearch(preconQuery, searchCursor.current)}
                />
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
                <TextAction
                  tx="decks:addDeck.checkAgain"
                  disabled={searching}
                  onPress={() => void runCatalogSearch(preconQuery)}
                />
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
                onPress={() => openPrecon(deck)}
              >
                <View style={$flex1}>
                  <Text weight="medium" text={deck.name} numberOfLines={2} />
                  {preconDetail(deck) ? (
                    <Text size="xs" tone="dim" text={preconDetail(deck)} />
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
                  <Text size="xs" tone="dim" text={catalogDeckDetail(deck)} />
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
                tx="decks:addDeck.returnToDeck"
                disabled={resolvingPasted}
                onPress={() => {
                  if (resolvingPasted) return
                  Keyboard.dismiss()
                  setBuildingPasted(true)
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
}

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
const $inlineStatus: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xs,
  alignItems: "flex-start",
})
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
const $importAttribution: ViewStyle = {
  minHeight: 44,
  maxWidth: "100%",
  justifyContent: "center",
  alignSelf: "flex-start",
}
