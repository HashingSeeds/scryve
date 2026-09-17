import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { ScrollView, TouchableOpacity, View } from "react-native"
import { useFocusEffect, useNavigation } from "expo-router"
import { useMutation, useQuery } from "convex/react"
import { usePreventRemove } from "expo-router/react-navigation"

import { AlertNote } from "@/components/AlertNote"
import { BottomActionBar } from "@/components/BottomActionBar"
import { Button } from "@/components/Button"
import { CardFocusDialog } from "@/components/CardFocusDialog"
import { DeckListSkeleton } from "@/components/DeckLoadingState"
import { DeckSettingsDialog } from "@/components/DeckSettingsDialog"
import type { DeckVersionDraft } from "@/components/DeckVersionDialog"
import { DeckVersionDialog } from "@/components/DeckVersionDialog"
import { $dialogActions, $dialogButton, $dialogText, DialogCard } from "@/components/DialogCard"
import { Header } from "@/components/Header"
import { LoadingProgress } from "@/components/LoadingProgress"
import { Screen } from "@/components/Screen"
import { Text } from "@/components/Text"
import { ConvexQueryBoundary } from "@/features/async/ConvexQueryBoundary"
import type { CloudAccess } from "@/features/auth/CloudScreen"
import { CardSearchScreen } from "@/features/decks/CardSearchScreen"
import { cardSection, printingKey, type DeckCard } from "@/features/decks/deckCards"
import { cardCountLabel } from "@/features/decks/deckCopy"
import { isDeckSyncEnabled, useDeckSync } from "@/features/decks/decksSync"
import { DECK_CONFLICT_REASON, useDeckMetadataWrites } from "@/features/decks/decksSyncWrites"
import {
  DECK_VERSION_CONFLICT_REASON,
  DECK_VERSION_QUEUE_CONFLICT_REASON,
  useDeckVersionWrites,
  type PendingVersionWrite,
} from "@/features/decks/decksVersionWrites"
import { useDeckVersionCache } from "@/features/decks/deckVersionsCache"
import { DeckView } from "@/features/decks/DeckView"
import { useCardDetails } from "@/features/decks/useCardDetails"
import { useAppTheme } from "@/theme/context"
import { $styles } from "@/theme/styles"
import type { ThemedStyle } from "@/theme/types"
import { captureAnalytics } from "@/utils/analytics"
import { convexErrorCode, convexErrorMessage } from "@/utils/convexError"

import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { deckFormatLabel, deckGame, deckSections } from "../../convex/lib/deckGames"
import { versionLabel } from "../../convex/lib/deckVersions"

type DeckDialog =
  | "none"
  | "newVersion"
  | "renameVersion"
  | "deleteVersion"
  | "settings"
  | "deleteDeck"
  | "discard"
  | "syncConflict"
export function cardDetailsKey(card: DeckCard, game: string) {
  if (card.scryfallId) return card.scryfallId
  const identity = [
    card.cardId,
    card.printingId,
    card.providerCardId,
    card.originalReference,
    card.name,
  ].find(Boolean)
  return `${game}:${identity ?? "unknown"}:${card.originalReference ?? ""}`
}

function boardLabel(sections: readonly { id: string; label: string }[], board: string) {
  return sections.find((section) => section.id === board)?.label ?? board
}

function mergedPrintings(cards: DeckCard[]) {
  const merged = new Map<string, DeckCard>()
  for (const card of cards) {
    const current = merged.get(printingKey(card))
    merged.set(
      printingKey(card),
      current ? { ...current, quantity: current.quantity + card.quantity } : card,
    )
  }
  return [...merged.values()]
}

function cardsChanged(draft: DeckCard[], stored: DeckCard[]) {
  return (
    draft.length !== stored.length ||
    draft.some(
      (card, index) =>
        printingKey(card) !== printingKey(stored[index]) ||
        card.quantity !== stored[index].quantity,
    )
  )
}

export type DeckDetailSummary = {
  name: string
  game: string
  format: string
  cardQuantity?: number
}

type DeckDetailScreenProps = {
  reviewChanges?: boolean
  access?: CloudAccess
  deckId: string
  summary?: DeckDetailSummary
  onBack: () => void
}

function DeckDetailPlaceholder({
  summary,
  onBack,
  failure,
  access,
}: {
  summary?: DeckDetailSummary
  onBack: () => void
  access?: CloudAccess
  failure?: { kind: "missing" | "unavailable"; retry: () => void }
}) {
  const { themed, theme } = useAppTheme()
  const loadingGameLabel = summary ? (deckGame(summary.game)?.shortLabel ?? summary.game) : null
  const loadingMetadata = summary
    ? [
        loadingGameLabel,
        deckFormatLabel(summary.game, summary.format),
        summary.cardQuantity !== undefined ? cardCountLabel(summary.cardQuantity) : undefined,
      ]
        .filter(Boolean)
        .join(" · ")
    : null
  const loadingSections = summary ? deckSections(summary.game, summary.format) : []
  const statusText = failure?.kind === "missing" ? "Deck not found" : "Deck unavailable"

  return (
    <Screen
      preset="fixed"
      safeAreaEdges={["bottom"]}
      backgroundColor={theme.colors.surface}
      contentContainerStyle={themed($screen)}
    >
      <Header
        title=""
        backgroundColor={theme.colors.surface}
        leftTx="common:back"
        onLeftPress={onBack}
        RightActionComponent={
          <View style={themed($headerAction)}>
            <Text size="lg" text="•••" />
          </View>
        }
      />
      <ScrollView
        style={$styles.flex1}
        contentContainerStyle={themed($loadingContent)}
        scrollEnabled={false}
      >
        <View style={themed($headerBlock)}>
          <View style={themed($titleBlock)}>
            <Text preset="heading" size="xl" text={summary?.name ?? "Deck"} />
            {loadingMetadata ? (
              <Text size="sm" style={themed($dimmedText)} text={loadingMetadata} />
            ) : null}
            <LoadingProgress
              testID="deck-loading-progress"
              state={failure || access?.message ? "unavailable" : "loading"}
              accessibilityText={failure ? statusText : "Loading deck"}
            />
          </View>
          <View style={themed($tabs)} accessibilityRole="tablist">
            {(["cards", "notes"] as const).map((tab) => (
              <TouchableOpacity
                key={tab}
                testID={`deck-tab-${tab}`}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === "cards", disabled: true }}
                style={[themed($tab), tab === "cards" && themed($selectedTab)]}
                disabled
              >
                <Text
                  size="sm"
                  weight={tab === "cards" ? "bold" : "normal"}
                  text={tab.charAt(0).toUpperCase() + tab.slice(1)}
                />
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            testID="current-version-button"
            style={themed($currentVersion)}
            disabled
          >
            <Text size="xs" style={themed($dimmedText)} text="Current version" />
            <Text weight="medium" text="Current ›" />
          </TouchableOpacity>
          {access?.message ? (
            <Button text={access.actionLabel ?? access.message} onPress={access.request} />
          ) : null}
          {failure ? (
            <View style={themed($queryFailure)}>
              <Text preset="subheading" text={statusText} />
              <Text
                size="sm"
                style={themed($dimmedText)}
                text={
                  failure.kind === "missing"
                    ? "This deck may have been deleted."
                    : "Could not load this deck."
                }
              />
              {failure.kind === "unavailable" ? (
                <Button testID="retry-deck-detail" text="Retry" onPress={failure.retry} />
              ) : null}
            </View>
          ) : null}
        </View>
        <DeckListSkeleton sections={loadingSections} density="comfortable" />
      </ScrollView>
      <BottomActionBar style={themed($actionBar)}>
        <View style={themed($actionRow)}>
          <Button
            testID="edit-deck-button"
            text="Edit list"
            preset="primary"
            style={$primaryActionButton}
            disabled
          />
        </View>
      </BottomActionBar>
    </Screen>
  )
}

export function DeckDetailScreen(props: DeckDetailScreenProps) {
  return (
    <ConvexQueryBoundary
      resetKey={props.deckId}
      fallback={({ error, retry }) => (
        <DeckDetailPlaceholder
          summary={props.summary}
          onBack={props.onBack}
          failure={{
            kind:
              convexErrorCode(error) === "deck_not_found" || /deck not found/i.test(error.message)
                ? "missing"
                : "unavailable",
            retry,
          }}
        />
      )}
    >
      <DeckDetailContent key={props.access?.ownerId} {...props} />
    </ConvexQueryBoundary>
  )
}

function DeckDetailContent({
  deckId,
  summary,
  onBack,
  access,
  reviewChanges,
}: DeckDetailScreenProps) {
  const { themed, theme } = useAppTheme()
  const navigation = useNavigation()
  const syncEnabled = useMemo(() => isDeckSyncEnabled(), [])
  const synced = useDeckSync(syncEnabled, access?.ownerId)
  const metadataWrites = useDeckMetadataWrites(syncEnabled, access?.ownerId)
  const versionWrites = useDeckVersionWrites(syncEnabled, access?.ownerId)
  const knownDeleted = [...synced.metadata, ...metadataWrites.metadata].some(
    (deck) => deck.deckId === deckId && deck.deleted,
  )
  const [selectedVersionId, setSelectedVersionId] = useState<Id<"deckVersions">>()
  const pinnedVersionTarget = useRef<
    { versionId: Id<"deckVersions">; expectedRevision: number } | undefined
  >(undefined)
  const mappedSelection =
    selectedVersionId !== undefined ? versionWrites.mappedVersion(selectedVersionId) : undefined
  const versionCache = useDeckVersionCache(
    syncEnabled && !knownDeleted,
    access?.ownerId,
    deckId,
    mappedSelection,
  )
  const isProvisionalSelection =
    selectedVersionId !== undefined &&
    mappedSelection === selectedVersionId &&
    versionCache.versions.some(
      (candidate) => candidate.versionId === selectedVersionId && candidate.local,
    )
  const queryVersionId =
    mappedSelection === undefined || isProvisionalSelection
      ? undefined
      : (mappedSelection as Id<"deckVersions">)
  const detail = useQuery(
    api.decks.detail,
    (access?.ready ?? true) && !knownDeleted
      ? {
          deckId: deckId as Id<"decks">,
          ...(queryVersionId ? { versionId: queryVersionId } : {}),
        }
      : "skip",
  )
  // Keeps the server-known capacity hint so offline new-version creation has a guard.
  const recordVersionCapacity = versionCache.recordCapacity
  useEffect(() => {
    const capacity = detail?.capacity
    if (capacity) recordVersionCapacity({ limit: capacity.limit, premium: capacity.premium })
  }, [detail, recordVersionCapacity])
  const statsAvailable = Boolean(detail)
  useFocusEffect(
    useCallback(() => {
      if (statsAvailable) captureAnalytics("stats_viewed", { surface: "deck" })
    }, [statsAvailable]),
  )
  const saveVersion = useMutation(api.decks.saveVersion)
  const createVersion = useMutation(api.decks.createVersion)
  const updateVersion = useMutation(api.decks.updateVersion)
  const deleteVersion = useMutation(api.decks.deleteVersion)
  const updateDeck = useMutation(api.decks.update)
  const archiveDeck = useMutation(api.decks.archive)
  const [tab, setTab] = useState<"cards" | "notes">("cards")
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<DeckCard[]>([])
  const [dialog, setDialog] = useState<DeckDialog>("none")
  const [pendingNavigation, setPendingNavigation] =
    useState<Parameters<typeof navigation.dispatch>[0]>()
  const [adding, setAdding] = useState(false)
  const [draftNote, setDraftNote] = useState("")
  const [draftMetadataRevision, setDraftMetadataRevision] = useState<number>()
  const [settingsMetadataRevision, setSettingsMetadataRevision] = useState<number>()
  const [undo, setUndo] = useState<{ name: string; cards: DeckCard[] }>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [focusedKey, setFocusedKey] = useState<string>()
  const metadataSaveStarted = useRef(false)
  const settingsSaveStarted = useRef(false)

  const pendingMetadata = metadataWrites.pending.filter((write) => write.deckId === deckId)
  const pendingCards = versionWrites.pending.filter((write) => write.deckId === deckId)
  const failedEdit = metadataWrites.failures
    .filter((failure) => failure.action.deckId === deckId)
    .sort(
      (left, right) =>
        right.failedAt - left.failedAt ||
        right.action.expectedRevision - left.action.expectedRevision,
    )[0]
  const failedCardEdit = versionWrites.failures
    .filter((failure) => failure.action.deckId === deckId)
    .sort((left, right) => right.failedAt - left.failedAt)[0]
  const reviewRequested = useRef(reviewChanges)
  useEffect(() => {
    if (reviewRequested.current && (failedEdit || failedCardEdit)) {
      reviewRequested.current = false
      setDialog("syncConflict")
    }
  }, [failedEdit, failedCardEdit])
  const optimisticMetadata = pendingMetadata.length
    ? metadataWrites.metadata.find((deck) => deck.deckId === deckId && !deck.deleted)
    : undefined
  const cachedMetadata = syncEnabled
    ? (optimisticMetadata ??
      synced.metadata.find((deck) => deck.deckId === deckId && !deck.deleted) ??
      metadataWrites.metadata.find((deck) => deck.deckId === deckId && !deck.deleted))
    : undefined
  const deck = optimisticMetadata ?? detail?.deck ?? cachedMetadata ?? failedEdit?.action
  const canQueueMetadata = Boolean(
    syncEnabled &&
    access?.ownerId &&
    metadataWrites.metadata.some((item) => item.deckId === deckId),
  )
  const canQueueCards = syncEnabled && Boolean(access?.ownerId)
  const currentMetadataRevision = metadataWrites.metadata.find(
    (item) => item.deckId === deckId && !item.deleted,
  )?.revision

  const cachedVersion = versionCache.version
  const staleSelection = selectedVersionId !== undefined && detail?.version?._id !== mappedSelection
  const version = staleSelection ? undefined : detail?.version
  const activeVersionId = version?._id ?? cachedVersion?.versionId
  const storedCards = useMemo(
    () =>
      version
        ? mergedPrintings(
            (detail?.cards ?? []).map(
              ({ _id: _, _creationTime: __, deckVersionId: ___, ...card }) => card,
            ),
          )
        : [],
    [version, detail?.cards],
  )
  const cachedCards = useMemo(
    () =>
      (detail === undefined || staleSelection) && versionCache.cards !== undefined
        ? mergedPrintings(
            versionCache.cards.map(
              ({ _id: _, _creationTime: __, deckVersionId: ___, ...card }) => card,
            ),
          )
        : undefined,
    [versionCache.cards, detail, staleSelection],
  )
  const canQueueVersionLifecycle = syncEnabled && Boolean(access?.ownerId)
  const versionTarget = version
    ? { versionId: version._id, expectedRevision: version.syncRevision ?? 0 }
    : cachedVersion && versionCache.cards !== undefined
      ? {
          versionId: cachedVersion.versionId as Id<"deckVersions">,
          expectedRevision: cachedVersion.revision,
        }
      : undefined
  const overlayVersionId = selectedVersionId ?? activeVersionId
  const overlayVersionIds = new Set<string>()
  if (overlayVersionId) {
    overlayVersionIds.add(overlayVersionId)
    const mapped = versionWrites.mappedVersion(overlayVersionId)
    if (mapped !== overlayVersionId) overlayVersionIds.add(mapped)
  }
  const pendingCardWrite = versionWrites.pending
    .filter((write) => write.deckId === deckId && (write.op ?? "cards") === "cards")
    .filter((write) => {
      const mapped = versionWrites.mappedVersion(write.versionId)
      return (
        overlayVersionIds.has(write.versionId) ||
        (mapped !== write.versionId && overlayVersionIds.has(mapped))
      )
    })
    .reduce<PendingVersionWrite | undefined>(
      (newest, action) =>
        !newest || action.expectedRevision > newest.expectedRevision ? action : newest,
      undefined,
    )
  const displayCards = pendingCardWrite
    ? mergedPrintings(pendingCardWrite.cards as DeckCard[])
    : storedCards.length > 0
      ? storedCards
      : (cachedCards ?? storedCards)
  const cardsUnavailable = !detail && cachedCards === undefined && !pendingCardWrite
  const cards = editing ? draft : displayCards
  const writeMotion = versionWrites.pending.length + versionWrites.failures.length
  const lastWriteMotion = useRef(-1)
  const refreshVersionCache = versionCache.refresh
  useEffect(() => {
    if (lastWriteMotion.current === writeMotion) return
    lastWriteMotion.current = writeMotion
    refreshVersionCache()
  }, [refreshVersionCache, writeMotion])
  const editingBase = useRef<DeckCard[]>([])
  const editingFromCache = useRef(false)
  const cardsCached = editing
    ? versionTarget
      ? false
      : editingFromCache.current
    : cachedCards !== undefined
  const cardsDirty =
    editing && !editingFromCache.current && cardsChanged(draft, editingBase.current)
  const noteDirty = editing && draftNote !== (deck?.note ?? "")
  const draftChanged = cardsDirty || noteDirty
  const focusedCard = cards.find((card) => printingKey(card) === focusedKey)
  const { details, detailsError } = useCardDetails(
    focusedCard
      ? {
          ...focusedCard,
          detailKey: cardDetailsKey(focusedCard, detail?.deck.game ?? "mtg"),
          game: detail?.deck.game ?? focusedCard.game ?? "mtg",
          catalogCardId: focusedCard.cardId ?? focusedCard.printingId ?? focusedCard.providerCardId,
        }
      : undefined,
  )
  const versionSummary = detail?.versions.find((candidate) => candidate._id === version?._id)
  // Offline selection resolves through the cached rows; saved drafts included.
  const activeVersionSummary =
    versionSummary ??
    versionCache.versions.find((candidate) => candidate.versionId === activeVersionId)
  const cachedVersionRows = useMemo(
    () =>
      versionCache.versions
        .filter((candidate) => !candidate.deleted)
        .map((candidate) => ({
          _id: candidate.versionId as Id<"deckVersions">,
          versionNumber: candidate.versionNumber,
          name: candidate.name,
          note: candidate.note,
          cardCount: candidate.cardCount,
          cardQuantity: candidate.cardQuantity,
          record: undefined,
        })),
    [versionCache.versions],
  )
  const versionRows = detail?.versions ?? cachedVersionRows
  const cachedVersionCount = versionCache.versions.filter((version) => !version.deleted).length
  const canAddVersion =
    detail?.capacity.canCreate === true ||
    (detail === undefined &&
      canQueueVersionLifecycle &&
      cachedVersionCount < (versionCache.capacity?.limit ?? 0))
  const canDeleteVersion = detail
    ? (detail.versions.length ?? 0) > 1
    : canQueueVersionLifecycle && cachedVersionCount > 1
  const canManageVersion =
    Boolean(detail) || (canQueueVersionLifecycle && activeVersionSummary !== undefined)
  const premium = detail?.capacity.premium === true || versionCache.capacity?.premium === true
  const versionCapture =
    pendingCardWrite || storedCards.length > 0 || cachedCards !== undefined
      ? displayCards
      : undefined

  useEffect(() => {
    if (!editing || !editingFromCache.current || detail === undefined) return
    editingFromCache.current = false
    setDraft(displayCards)
    editingBase.current = displayCards
  }, [detail, displayCards, editing])

  // Keeps the persistent cache fresh with live reads so the next offline session is current.
  useEffect(() => {
    const liveVersion = detail?.version
    const recordCards = versionCache.record
    if (!detail || !liveVersion || !recordCards) return
    recordCards(liveVersion._id, liveVersion.syncRevision ?? 0, detail.cards)
  }, [detail, versionCache.record])

  usePreventRemove(draftChanged, ({ data }) => {
    setPendingNavigation(data.action)
    setDialog("discard")
  })

  useEffect(() => {
    if (editing || !pendingNavigation) return
    const action = pendingNavigation
    setPendingNavigation(undefined)
    navigation.dispatch(action)
  }, [editing, navigation, pendingNavigation])

  function fail(cause: unknown, fallback: string) {
    setError(convexErrorMessage(cause, fallback))
  }

  async function run(work: () => Promise<void>, fallback: string) {
    if (access && !access.ready) {
      access.request()
      return false
    }
    try {
      setBusy(true)
      setError(undefined)
      await work()
      return true
    } catch (cause) {
      fail(cause, fallback)
      return false
    } finally {
      setBusy(false)
    }
  }

  function pinVersionTarget() {
    pinnedVersionTarget.current = versionTarget ? { ...versionTarget } : undefined
  }

  function pinnedRevisionFor(versionId: string | undefined) {
    const pinned = pinnedVersionTarget.current
    return pinned && pinned.versionId === versionId ? pinned.expectedRevision : undefined
  }

  function startEditing() {
    if (knownDeleted) return
    metadataSaveStarted.current = false
    pinVersionTarget()
    editingFromCache.current = detail === undefined && !versionTarget
    editingBase.current = displayCards
    setDraft(displayCards)
    setDraftNote(deck?.note ?? "")
    setDraftMetadataRevision(currentMetadataRevision)
    setUndo(undefined)
    setError(undefined)
    setEditing(true)
  }

  function discardEdits() {
    setDraft([])
    setUndo(undefined)
    setError(undefined)
    setEditing(false)
  }

  function requestDiscard() {
    if (draftChanged) {
      setDialog("discard")
      return
    }
    discardEdits()
  }

  function addCard(card: DeckCard) {
    if (knownDeleted) return
    setUndo(undefined)
    setDraft((current) => {
      const existing = current.find((candidate) => printingKey(candidate) === printingKey(card))
      return existing
        ? current.map((candidate) =>
            candidate === existing
              ? { ...candidate, quantity: Math.min(999, candidate.quantity + 1) }
              : candidate,
          )
        : [...current, card]
    })
  }

  function removeCard(card: DeckCard) {
    if (knownDeleted) return
    setUndo(card.quantity === 1 ? { name: card.name, cards: draft } : undefined)
    setDraft((current) =>
      current.flatMap((candidate) =>
        printingKey(candidate) === printingKey(card)
          ? candidate.quantity > 1
            ? [{ ...candidate, quantity: candidate.quantity - 1 }]
            : []
          : [candidate],
      ),
    )
  }

  function focusCard(card: DeckCard) {
    setFocusedKey(printingKey(card))
  }

  function decrementFocusedCard(card: DeckCard) {
    if (card.quantity <= 1) setFocusedKey(undefined)
    removeCard(card)
  }

  async function save() {
    if (metadataSaveStarted.current) return
    metadataSaveStarted.current = true
    if (knownDeleted) {
      metadataSaveStarted.current = false
      fail(new Error("This deck was deleted."), "Could not save deck")
      return
    }
    if (noteDirty && !cardsDirty && canQueueMetadata && draftMetadataRevision !== undefined) {
      try {
        setError(undefined)
        metadataWrites.update(deckId, { note: draftNote }, draftMetadataRevision)
        captureAnalytics("deck_used", { feature: "saved" })
        setEditing(false)
        setUndo(undefined)
      } catch (cause) {
        metadataSaveStarted.current = false
        fail(cause, "Could not save deck")
      }
      return
    }
    const cardTarget = pinnedVersionTarget.current ?? versionTarget
    const queueCard = cardsDirty && canQueueCards && Boolean(cardTarget)
    const queueNote = noteDirty && canQueueMetadata && draftMetadataRevision !== undefined
    if (queueCard || (noteDirty && queueNote && !cardsDirty)) {
      try {
        setError(undefined)
        if (queueCard && cardTarget)
          versionWrites.update(deckId, cardTarget.versionId, draft, cardTarget.expectedRevision)
        if (queueNote) metadataWrites.update(deckId, { note: draftNote }, draftMetadataRevision)
        if (noteDirty && !queueNote)
          await updateDeck({ deckId: deckId as Id<"decks">, note: draftNote })
        captureAnalytics("deck_used", { feature: "saved" })
        setEditing(false)
        setUndo(undefined)
      } catch (cause) {
        metadataSaveStarted.current = false
        fail(cause, "Could not save deck")
      }
      return
    }
    const saved = await run(async () => {
      if (cardsDirty) {
        await saveVersion({
          deckId: deckId as Id<"decks">,
          ...(version ? { versionId: version._id } : {}),
          cards: draft,
        })
      }
      if (noteDirty) {
        if (canQueueMetadata && draftMetadataRevision !== undefined)
          metadataWrites.update(deckId, { note: draftNote }, draftMetadataRevision)
        else await updateDeck({ deckId: deckId as Id<"decks">, note: draftNote })
      }
      captureAnalytics("deck_used", { feature: "saved" })
      setEditing(false)
      setUndo(undefined)
    }, "Could not save deck")
    if (!saved) metadataSaveStarted.current = false
  }

  function chooseVersion(versionId: string) {
    setSelectedVersionId(versionId as Id<"deckVersions">)
  }

  function startNewVersion() {
    setError(undefined)
    if (!canAddVersion) {
      const limit = detail?.capacity.limit ?? versionCache.capacity?.limit ?? 0
      setError(
        `This deck holds up to ${limit} version${limit === 1 ? "" : "s"}. Delete one to add another.`,
      )
      return
    }
    setDialog("newVersion")
  }

  async function submitNewVersion({ name, note, copyCards }: DeckVersionDraft) {
    if (canQueueVersionLifecycle) {
      // Copy captures what the user currently sees locally, queue overlay included;
      // a server snapshot fromVersionId would silently miss pending offline cards.
      const captured = copyCards ? versionCapture : undefined
      if (copyCards && captured === undefined) {
        setError("Saved cards are not available. Reconnect or create an empty version.")
        return
      }
      try {
        const provisionalId = versionWrites.createVersion(
          deckId,
          name.trim(),
          note.trim(),
          captured ?? [],
        )
        setSelectedVersionId(provisionalId as Id<"deckVersions">)
        setDialog("none")
      } catch (cause) {
        fail(cause, "Could not create version")
      }
      return
    }
    if (!detail) {
      setError("Reconnect to create versions.")
      return
    }
    await run(async () => {
      const versionId = await createVersion({
        deckId: deckId as Id<"decks">,
        name,
        ...(note.trim() ? { note } : {}),
        ...(copyCards && version ? { fromVersionId: version._id } : {}),
      })
      setSelectedVersionId(versionId)
      setDialog("none")
    }, "Could not create version")
  }

  async function submitRenameVersion({ name, note }: DeckVersionDraft) {
    if (canQueueVersionLifecycle && activeVersionId) {
      try {
        versionWrites.renameVersion(
          deckId,
          activeVersionId as Id<"deckVersions">,
          { name, note },
          pinnedRevisionFor(activeVersionId) ?? versionTarget?.expectedRevision ?? 0,
        )
        setDialog("none")
      } catch (cause) {
        fail(cause, "Could not update version")
      }
      return
    }
    if (!version) return
    await run(async () => {
      await updateVersion({ versionId: version._id, name, note })
      setDialog("none")
    }, "Could not update version")
  }

  function startDeleteVersion() {
    setError(undefined)
    if (!editing) pinVersionTarget()
    setDialog("deleteVersion")
  }

  async function confirmDeleteVersion() {
    const versionId =
      version?._id ?? (activeVersionSummary ? (activeVersionId as Id<"deckVersions">) : undefined)
    if (!versionId) return
    const expectedRevision = pinnedRevisionFor(versionId) ?? versionTarget?.expectedRevision ?? 0
    if (canQueueVersionLifecycle) {
      try {
        versionWrites.deleteVersion(deckId, versionId, expectedRevision)
        setSelectedVersionId(undefined)
        setDialog("none")
      } catch (cause) {
        fail(cause, "Could not delete version")
      }
      return
    }
    await run(async () => {
      if (!version) return
      await deleteVersion({ versionId: version._id })
      setSelectedVersionId(undefined)
      setDialog("none")
    }, "Could not delete version")
  }

  async function submitSettings({ name, format }: { name: string; format: string }) {
    if (knownDeleted) {
      settingsSaveStarted.current = false
      fail(new Error("This deck was deleted."), "Could not update deck")
      return
    }
    if (canQueueMetadata && settingsMetadataRevision !== undefined) {
      if (settingsSaveStarted.current) return
      settingsSaveStarted.current = true
      try {
        setError(undefined)
        metadataWrites.update(deckId, { name, format }, settingsMetadataRevision)
        setDialog("none")
      } catch (cause) {
        settingsSaveStarted.current = false
        fail(cause, "Could not update deck")
      }
      return
    }
    await run(async () => {
      await updateDeck({ deckId: deckId as Id<"decks">, name, format })
      setDialog("none")
    }, "Could not update deck")
  }

  async function deleteDeck() {
    await run(async () => {
      await archiveDeck({ deckId: deckId as Id<"decks"> })
      setDialog("none")
      onBack()
    }, "Could not delete deck")
  }

  if (!deck) return <DeckDetailPlaceholder summary={summary} onBack={onBack} access={access} />

  const configuredSections = deckSections(deck.game, deck.format)
  const accountMetadata =
    metadataWrites.metadata.find((item) => item.deckId === deckId && !item.deleted) ??
    cachedMetadata ??
    detail?.deck
  const versionConflict = failedEdit?.reason === DECK_CONFLICT_REASON
  const versionCardConflict =
    failedCardEdit?.reason === DECK_VERSION_CONFLICT_REASON ||
    failedCardEdit?.reason === DECK_VERSION_QUEUE_CONFLICT_REASON
  const failedVersionSnapshot = failedCardEdit
    ? versionCache.versions.find(
        (snapshot) => snapshot.versionId === failedCardEdit.action.versionId,
      )
    : undefined
  const comparedFields =
    failedEdit && accountMetadata
      ? [
          { label: "Name", local: failedEdit.action.name, account: accountMetadata.name },
          {
            label: "Format",
            local: deckFormatLabel(failedEdit.action.game, failedEdit.action.format),
            account: deckFormatLabel(accountMetadata.game, accountMetadata.format),
          },
          {
            label: "Notes",
            local: failedEdit.action.note ?? "",
            account: accountMetadata.note ?? "",
          },
        ].filter((field) => field.local !== field.account)
      : []
  const failureMessage =
    (failedCardEdit &&
    !/\[CONVEX|Server Error|ArgumentValidationError|\n/i.test(failedCardEdit.reason)
      ? failedCardEdit.reason
      : failedEdit && !/\[CONVEX|Server Error|ArgumentValidationError|\n/i.test(failedEdit.reason)
        ? failedEdit.reason
        : undefined) ?? "This edit could not be synced. Try again or discard it."
  const syncError =
    failedEdit || failedCardEdit ? (
      <Button text="Review changes" onPress={() => setDialog("syncConflict")} />
    ) : undefined

  return (
    <Screen
      preset="fixed"
      safeAreaEdges={["bottom"]}
      backgroundColor={theme.colors.surface}
      contentContainerStyle={themed($screen)}
    >
      <DeckView
        tab={tab}
        onTabChange={setTab}
        name={deck.name}
        game={deck.game}
        format={deck.format}
        cards={cards}
        note={editing ? draftNote : (deck.note ?? "")}
        editing={editing}
        dirty={draftChanged}
        busy={busy}
        cardsUnavailable={cardsUnavailable}
        cardsCached={cardsCached}
        editingDisabled={knownDeleted}
        saveStatus={
          syncEnabled && access?.ownerId
            ? failedEdit || failedCardEdit
              ? "Local edit not synced"
              : metadataWrites.capacityBlocked || versionWrites.capacityBlocked
                ? "Sync paused. Resolve a saved local edit to continue."
                : pendingMetadata.length || pendingCards.length
                  ? "Saved locally · Pending sync"
                  : "Synced"
            : undefined
        }
        onBack={onBack}
        onEdit={startEditing}
        onSave={save}
        onCancel={requestDiscard}
        onDetails={() => {
          if (knownDeleted) return
          settingsSaveStarted.current = false
          setSettingsMetadataRevision(currentMetadataRevision)
          setDialog("settings")
        }}
        onAdd={() => {
          if (knownDeleted) return
          if (!editing) startEditing()
          setAdding(true)
        }}
        onNoteChange={setDraftNote}
        onFocus={focusCard}
        onIncrement={addCard}
        onDecrement={removeCard}
        undo={
          undo
            ? {
                name: undo.name,
                restore: () => {
                  setDraft(undo.cards)
                  setUndo(undefined)
                },
              }
            : undefined
        }
        error={
          dialog === "none" && (error || syncError) ? (
            <View style={themed($syncFailure)}>
              {error ? <AlertNote text={error} /> : null}
              {syncError}
            </View>
          ) : undefined
        }
      />
      {dialog === "syncConflict" && failedCardEdit && !failedEdit ? (
        <DialogCard
          visible
          placement="bottom"
          wide
          onClose={() => setDialog("none")}
          dialogTestID="version-sync-conflict"
          backdropAccessibilityLabel="Later"
          accessibilityViewIsModal
        >
          <ScrollView contentContainerStyle={themed($syncFailure)}>
            <Text
              preset="subheading"
              text={versionCardConflict ? "Keep which card list?" : "Review saved card edits"}
            />
            <Text
              size="sm"
              text={
                knownDeleted
                  ? "Deck deleted. Your card edits are saved on this device."
                  : versionCardConflict
                    ? "The card list changed on another device after you saved. Your edits are still saved on this device."
                    : failureMessage
              }
            />
            <View style={themed($conflictVersion)}>
              <Text
                size="sm"
                text={`${failedCardEdit.action.cards.reduce((total, card) => total + card.quantity, 0)} cards · ${failedCardEdit.action.cards.length} entries`}
              />
              <Text
                size="sm"
                text={
                  failedCardEdit.action.cards
                    .slice(0, 3)
                    .map((card) => card.name)
                    .join(", ") || "No cards"
                }
                numberOfLines={2}
              />
              {failedVersionSnapshot ? (
                <Text
                  size="sm"
                  text={`Account copy: ${failedVersionSnapshot.cardQuantity} cards · ${failedVersionSnapshot.cardCount} entries · revision ${failedVersionSnapshot.revision}`}
                />
              ) : null}
            </View>
            {error ? <AlertNote text={error} /> : null}
            <Button
              testID="reapply-version-cards"
              text={versionCardConflict ? "Keep mine" : "Retry sync"}
              preset="primary"
              onPress={() => {
                try {
                  versionWrites.reapplyFailure(failedCardEdit.action.operationId)
                  setDialog("none")
                } catch (cause) {
                  fail(cause, "Could not save your card changes")
                }
              }}
            />
            <Button
              testID="discard-version-cards"
              text={versionCardConflict ? "Keep account" : "Discard local edit"}
              onPress={() => {
                try {
                  versionWrites.discardFailure(failedCardEdit.action.operationId)
                  setDialog("none")
                } catch (cause) {
                  fail(cause, "Could not discard local card edits")
                }
              }}
            />
            <Button text="Later" onPress={() => setDialog("none")} />
          </ScrollView>
        </DialogCard>
      ) : null}
      {dialog === "syncConflict" && failedEdit ? (
        <DialogCard
          visible
          placement="bottom"
          wide
          onClose={() => setDialog("none")}
          dialogTestID="deck-sync-conflict"
          backdropAccessibilityLabel="Later"
          accessibilityViewIsModal
        >
          <ScrollView contentContainerStyle={themed($syncFailure)}>
            <Text
              preset="subheading"
              text={versionConflict ? "Keep which version?" : "Review local edit"}
            />
            {versionConflict && !knownDeleted && accountMetadata ? (
              <>
                <View style={themed($comparisonRow)}>
                  <Text weight="bold" size="sm" text="This device" style={$comparisonCell} />
                  <Text weight="bold" size="sm" text="Account" style={$comparisonCell} />
                </View>
                {comparedFields.map((field) => (
                  <View key={field.label} style={themed($conflictVersion)}>
                    <Text weight="medium" size="xs" text={field.label} />
                    <View style={themed($comparisonRow)}>
                      <Text
                        size="sm"
                        text={field.local || "Empty"}
                        accessibilityLabel={`${field.label}, this device: ${field.local || "Empty"}`}
                        style={$comparisonCell}
                      />
                      <Text
                        size="sm"
                        text={field.account || "Empty"}
                        accessibilityLabel={`${field.label}, account: ${field.account || "Empty"}`}
                        style={$comparisonCell}
                      />
                    </View>
                  </View>
                ))}
                {comparedFields.length === 0 ? (
                  <Text size="sm" text="Both versions match." />
                ) : null}
              </>
            ) : (
              <>
                <Text
                  size="sm"
                  text={
                    knownDeleted
                      ? "Deck deleted. Your edit is saved on this device."
                      : failureMessage
                  }
                />
                <View style={themed($conflictVersion)}>
                  <Text size="sm" text={`Name: ${failedEdit.action.name}`} />
                  <Text
                    size="sm"
                    text={`Format: ${deckFormatLabel(failedEdit.action.game, failedEdit.action.format)}`}
                  />
                  <Text size="sm" text={`Note: ${failedEdit.action.note || "No note"}`} />
                </View>
              </>
            )}
            {error ? <AlertNote text={error} /> : null}
            <Button
              testID="reapply-deck-metadata"
              text={versionConflict ? "Keep mine" : "Retry sync"}
              preset="primary"
              disabled={knownDeleted || !accountMetadata}
              onPress={() => {
                try {
                  metadataWrites.reapplyFailure(failedEdit.action.operationId)
                  setDialog("none")
                } catch (cause) {
                  fail(cause, "Could not save your changes")
                }
              }}
            />
            <Button
              testID="discard-deck-metadata"
              text={versionConflict && !knownDeleted ? "Keep account" : "Discard local edit"}
              onPress={() => {
                try {
                  metadataWrites.discardFailure(failedEdit.action.operationId)
                  setDialog("none")
                } catch (cause) {
                  fail(cause, "Could not discard local edit")
                }
              }}
            />
            <Button text="Later" onPress={() => setDialog("none")} />
          </ScrollView>
        </DialogCard>
      ) : null}
      {adding && detail ? (
        <CardSearchScreen
          game={detail.deck.game}
          format={detail.deck.format}
          onClose={() => setAdding(false)}
          onAdd={(card) => {
            const existing = draft.find((entry) => printingKey(entry) === printingKey(card))
            if (existing && existing.quantity >= 999) return "A card can have at most 999 copies."
            if (!existing && draft.length >= 300) return "A deck can have at most 300 entries."
            addCard(card)
            return undefined
          }}
        />
      ) : null}

      {focusedCard && detail ? (
        <CardFocusDialog
          card={{
            game: detail.deck.game,
            cardId:
              focusedCard.scryfallId ??
              focusedCard.cardId ??
              focusedCard.printingId ??
              focusedCard.providerCardId,
            name: focusedCard.name,
            imageUrl: focusedCard.imageUrl,
            smallImageUrl: focusedCard.smallImageUrl,
            quantity: focusedCard.quantity,
            boardLabel: boardLabel(configuredSections, cardSection(focusedCard)),
          }}
          details={details}
          detailsError={detailsError}
          {...(editing
            ? {
                onIncrement: () => addCard(focusedCard),
                onDecrement: () => decrementFocusedCard(focusedCard),
              }
            : {})}
          onClose={() => setFocusedKey(undefined)}
        />
      ) : null}

      {dialog === "newVersion" && (detail || canQueueVersionLifecycle) ? (
        <DeckVersionDialog
          title="New version"
          submitLabel="Create version"
          copyFromLabel={
            (versionSummary ?? activeVersionSummary ?? version) !== undefined
              ? versionLabel(
                  (versionSummary ?? activeVersionSummary ?? version) as { versionNumber: number },
                )
              : undefined
          }
          busy={busy}
          error={error}
          onSubmit={submitNewVersion}
          onClose={() => setDialog("none")}
        />
      ) : null}

      {dialog === "renameVersion" && activeVersionSummary ? (
        <DeckVersionDialog
          title="Version details"
          submitLabel="Save"
          initialName={versionLabel(activeVersionSummary)}
          initialNote={activeVersionSummary.note ?? ""}
          notesLocked={!premium}
          busy={busy}
          error={error}
          onSubmit={submitRenameVersion}
          {...(canDeleteVersion ? { onDelete: startDeleteVersion } : {})}
          onClose={() => setDialog("none")}
        />
      ) : null}

      {dialog === "settings" ? (
        <DeckSettingsDialog
          game={deck.game}
          initial={{
            name: deck.name,
            format: deck.format,
          }}
          busy={busy}
          error={error}
          onSubmit={submitSettings}
          onDelete={() => setDialog("deleteDeck")}
          onClose={() => setDialog("none")}
        >
          {detail || cachedVersionRows.length > 0 ? (
            <View style={themed($versions)}>
              <View style={themed($versionHeading)}>
                <Text weight="bold" size="sm" text="Versions" />
                {detail || canQueueVersionLifecycle ? (
                  <TouchableOpacity
                    testID="version-picker-__new__"
                    accessibilityRole="button"
                    accessibilityLabel="New version"
                    disabled={editing}
                    onPress={startNewVersion}
                  >
                    <Text weight="bold" size="sm" style={themed($textAction)} text="New version" />
                  </TouchableOpacity>
                ) : null}
              </View>
              {versionRows.map((candidate) => {
                const selected = candidate._id === activeVersionId
                const record = candidate.record
                // Live records only; cached rows must not present unknown stats as fresh.
                const candidateRecord = record?.games
                  ? `${record.wins}–${record.losses}${record.draws ? `–${record.draws}` : ""}`
                  : detail
                    ? "Unplayed"
                    : ""
                return (
                  <TouchableOpacity
                    key={candidate._id}
                    testID={`version-picker-${candidate._id}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    style={themed($versionRow)}
                    disabled={editing}
                    onPress={() => {
                      chooseVersion(candidate._id)
                      setDialog("none")
                    }}
                  >
                    <View
                      testID={`version-marker-${candidate._id}`}
                      style={[themed($versionMark), selected && themed($versionMarkSelected)]}
                    />
                    <View style={themed($versionCopy)}>
                      <Text weight="medium" text={versionLabel(candidate)} />
                      {candidate.note ? (
                        <Text
                          size="xxs"
                          style={themed($dimmedText)}
                          text={candidate.note}
                          numberOfLines={2}
                        />
                      ) : null}
                    </View>
                    <View style={themed($versionContext)}>
                      <Text weight="medium" style={$tabularNumbers} text={candidateRecord} />
                      <Text
                        size="xxs"
                        style={themed($dimmedText)}
                        text={cardCountLabel(candidate.cardQuantity)}
                      />
                    </View>
                    {selected && canManageVersion ? (
                      <TouchableOpacity
                        testID="rename-version-button"
                        accessibilityRole="button"
                        onPress={() => {
                          if (!editing) pinVersionTarget()
                          setDialog("renameVersion")
                        }}
                      >
                        <Text size="lg" text="•••" />
                      </TouchableOpacity>
                    ) : null}
                  </TouchableOpacity>
                )
              })}
            </View>
          ) : null}
        </DeckSettingsDialog>
      ) : null}

      {dialog === "deleteVersion" ? (
        <DialogCard
          visible
          onClose={() => setDialog("none")}
          closeDisabled={busy}
          backdropTestID="delete-version-backdrop"
          backdropAccessibilityLabel="Keep this version"
          dialogTestID="delete-version-dialog"
          dialogAccessibilityRole="alert"
          accessibilityViewIsModal
        >
          <Text preset="subheading" text="Delete this version?" style={themed($dialogText)} />
          <Text
            size="sm"
            text="Games already played with it keep their record, but the list will no longer be editable or selectable."
            style={themed($dialogText)}
          />
          {error ? <AlertNote text={error} /> : null}
          <View style={themed($dialogActions)}>
            <Button
              text="Cancel"
              style={themed($dialogButton)}
              disabled={busy}
              onPress={() => setDialog("none")}
            />
            <Button
              text="Delete"
              testID="delete-version-confirm"
              style={[themed($dialogButton), themed($destructiveButton)]}
              textStyle={themed($destructiveText)}
              disabled={busy}
              onPress={confirmDeleteVersion}
            />
          </View>
        </DialogCard>
      ) : null}

      {dialog === "deleteDeck" ? (
        <DialogCard
          visible
          onClose={() => setDialog("none")}
          closeDisabled={busy}
          backdropTestID="delete-deck-backdrop"
          backdropAccessibilityLabel="Keep this deck"
          dialogTestID="delete-deck-dialog"
          dialogAccessibilityRole="alert"
          accessibilityViewIsModal
        >
          <Text preset="subheading" text="Delete this deck?" style={themed($dialogText)} />
          <Text
            size="sm"
            text="Past games keep their record of this deck, but it will no longer be available to pick or edit."
            style={themed($dialogText)}
          />
          <View style={themed($dialogActions)}>
            <Button
              text="Cancel"
              style={themed($dialogButton)}
              disabled={busy}
              onPress={() => setDialog("none")}
            />
            <Button
              text="Delete"
              testID="delete-deck-confirm"
              style={[themed($dialogButton), themed($destructiveButton)]}
              textStyle={themed($destructiveText)}
              disabled={busy}
              onPress={deleteDeck}
            />
          </View>
        </DialogCard>
      ) : null}

      {dialog === "discard" ? (
        <DialogCard
          visible
          onClose={() => {
            setPendingNavigation(undefined)
            setDialog("none")
          }}
          closeDisabled={busy}
          backdropTestID="discard-edits-backdrop"
          backdropAccessibilityLabel="Keep editing"
          dialogTestID="discard-edits-dialog"
          dialogAccessibilityRole="alert"
          accessibilityViewIsModal
        >
          <Text preset="subheading" text="Discard changes?" style={themed($dialogText)} />
          <Text size="sm" text="Your edits will be lost." style={themed($dialogText)} />
          <View style={themed($dialogActions)}>
            <Button
              text="Keep editing"
              style={themed($dialogButton)}
              disabled={busy}
              onPress={() => {
                setPendingNavigation(undefined)
                setDialog("none")
              }}
            />
            <Button
              text="Discard"
              testID="discard-edits-confirm"
              style={[themed($dialogButton), themed($destructiveButton)]}
              textStyle={themed($destructiveText)}
              disabled={busy}
              onPress={() => {
                setDialog("none")
                discardEdits()
              }}
            />
          </View>
        </DialogCard>
      ) : null}
    </Screen>
  )
}

const $tabularNumbers: TextStyle = { fontVariant: ["tabular-nums"] }

const $screen: ThemedStyle<ViewStyle> = () => ({ flex: 1, width: "100%" })
const $actionBar: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.surface,
})

const $loadingContent: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  width: "100%",
  maxWidth: 720,
  alignSelf: "center",
  gap: spacing.sm,
  paddingHorizontal: spacing.lg,
  paddingBottom: spacing.lg,
})

const $queryFailure: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  gap: spacing.xs,
  alignItems: "flex-start",
})
const $headerBlock: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.md })
const $titleBlock: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xxs })

const $tabs: ThemedStyle<ViewStyle> = ({ colors }) => ({
  flexDirection: "row",
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
})
const $tab: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flex: 1,
  alignItems: "center",
  paddingVertical: spacing.xs,
  borderBottomWidth: 2,
  borderBottomColor: "transparent",
})
const $selectedTab: ThemedStyle<ViewStyle> = ({ colors }) => ({ borderBottomColor: colors.tint })
const $currentVersion: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  paddingVertical: spacing.xs,
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
})
const $versions: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $versionHeading: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minHeight: 36,
  flexDirection: "row",
  alignItems: "center",
  justifyContent: "space-between",
  gap: spacing.sm,
})
const $textAction: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.brandText })
const $versionRow: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  minHeight: 72,
  flexDirection: "row",
  alignItems: "center",
  gap: spacing.sm,
  paddingVertical: spacing.xxs,
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
})
const $versionMark: ThemedStyle<ViewStyle> = () => ({
  width: 5,
  height: 34,
  borderRadius: 3,
})
const $versionMarkSelected: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.gameMenu.actions.history,
})
const $versionCopy: ThemedStyle<ViewStyle> = ({ spacing }) => ({ flex: 1, gap: spacing.xxxs })
const $versionContext: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  minWidth: 64,
  alignItems: "flex-end",
  gap: spacing.xxxs,
})
const $headerAction: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  height: 56,
  minWidth: 56,
  alignItems: "center",
  justifyContent: "center",
  paddingHorizontal: spacing.md,
})

const $actionRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  justifyContent: "center",
  gap: spacing.xs,
})
const $syncFailure: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })
const $primaryActionButton: ViewStyle = { minWidth: 160, minHeight: 44 }

const $dimmedText: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.textDim })
const $destructiveButton: ThemedStyle<ViewStyle> = ({ colors }) => ({
  backgroundColor: colors.errorBackground,
  borderColor: colors.error,
  borderWidth: 1,
})
const $destructiveText: ThemedStyle<TextStyle> = ({ colors }) => ({ color: colors.error })

const $conflictVersion: ThemedStyle<ViewStyle> = ({ colors, spacing }) => ({
  gap: spacing.xs,
  paddingVertical: spacing.sm,
  borderBottomWidth: 1,
  borderBottomColor: colors.separator,
})

const $comparisonCell: TextStyle = { flex: 1, flexShrink: 1 }
const $comparisonRow: ThemedStyle<ViewStyle> = ({ spacing }) => ({
  flexDirection: "row",
  gap: spacing.md,
})
