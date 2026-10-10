import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { ScrollView, TouchableOpacity, View } from "react-native"
import { useFocusEffect, useNavigation } from "expo-router"
import { useConvex, useMutation, useQuery, useConvexConnectionState } from "convex/react"
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
import { loadCardDetails, prefetchCardDetails } from "@/features/decks/cardDetailsCache"
import { CardSearchScreen } from "@/features/decks/CardSearchScreen"
import { cardDetailsKey, cardSection, printingKey, type DeckCard } from "@/features/decks/deckCards"
import { cardCountLabel } from "@/features/decks/deckCopy"
import {
  addDraftCard,
  addDraftCommander,
  cardLimitError,
  chooseDraftCommander,
  closeDeckDraft,
  closedDeckDraft,
  isCommanderPick,
  openDeckDraft,
  planDeckSave,
  removeDraftCard,
  reseedDeckDraft,
  restoreDraftUndo,
  setDraftNote,
  type DeckDraft,
} from "@/features/decks/deckDraft"
import { isDeckSyncEnabled, useDeckSync } from "@/features/decks/decksSync"
import { useDeckMetadataWrites } from "@/features/decks/decksSyncWrites"
import { deckStatLines, type StatsSource } from "@/features/decks/deckStatLines"
import { useDeckVersionWrites } from "@/features/decks/decksVersionWrites"
import {
  cachedCardIdentity,
  useDeckVersionCache,
  type KnownCardEntry,
} from "@/features/decks/deckVersionsCache"
import { DeckView } from "@/features/decks/DeckView"
import {
  deckQueryVersionId,
  isDeckKnownDeleted,
  resolveDeckView,
} from "@/features/decks/resolveDeckView"
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

const OFFLINE_CARD_MESSAGE = "You’re offline. Cards already in your decks can be added."

function boardLabel(sections: readonly { id: string; label: string }[], board: string) {
  return sections.find((section) => section.id === board)?.label ?? board
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
  onAddMatch?: (versionId: Id<"deckVersions">, deckName: string) => void
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
  onAddMatch,
  access,
  reviewChanges,
}: DeckDetailScreenProps) {
  const { themed, theme } = useAppTheme()
  const navigation = useNavigation()
  const client = useConvex()
  const syncEnabled = useMemo(() => isDeckSyncEnabled(), [])
  const synced = useDeckSync(syncEnabled, access?.ownerId, access?.ready ?? false)
  const metadataWrites = useDeckMetadataWrites(syncEnabled, access?.ownerId, access?.ready ?? false)
  const versionWrites = useDeckVersionWrites(syncEnabled, access?.ownerId, access?.ready ?? false)
  const knownDeleted = isDeckKnownDeleted(deckId, synced.metadata, metadataWrites.metadata)
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
  const queryVersionId = deckQueryVersionId(
    selectedVersionId,
    mappedSelection,
    versionCache.versions,
  )
  const detail = useQuery(
    api.decks.detail,
    (access?.ready ?? true) && !knownDeleted
      ? {
          deckId: deckId as Id<"decks">,
          ...(queryVersionId ? { versionId: queryVersionId } : {}),
        }
      : "skip",
  )
  const connection = useConvexConnectionState()
  const offline = connection?.isWebSocketConnected === false
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
  const [statsSource, setStatsSource] = useState<StatsSource>("scryve")
  const [draft, setDraftState] = useState(closedDeckDraft)
  // why: search taps can land before a re-render, so limit checks read this ref, which every draft write updates first.
  const latestDraft = useRef(draft)
  const setDraft = useCallback((update: DeckDraft | ((current: DeckDraft) => DeckDraft)) => {
    latestDraft.current = typeof update === "function" ? update(latestDraft.current) : update
    setDraftState(latestDraft.current)
  }, [])
  const [dialog, setDialog] = useState<DeckDialog>("none")
  const [pendingNavigation, setPendingNavigation] =
    useState<Parameters<typeof navigation.dispatch>[0]>()
  const [adding, setAdding] = useState(false)
  const [choosingCommander, setChoosingCommander] = useState(false)
  const [settingsMetadataRevision, setSettingsMetadataRevision] = useState<number>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [focusedKey, setFocusedKey] = useState<string>()
  const metadataSaveStarted = useRef(false)
  const settingsSaveStarted = useRef(false)

  const view = resolveDeckView({
    deckId,
    detail,
    draft,
    sync: { enabled: syncEnabled, ownerId: access?.ownerId },
    syncedMetadata: synced.metadata,
    metadataWrites,
    versionWrites,
    versionCache,
    selectedVersionId,
    loadCardDetails,
  })
  const { deck, cards, cardsUnavailable, cardsCached, version, versionTarget } = view
  const { activeVersionId, activeVersionSummary, failedEdit, failedCardEdit } = view
  const game = deck?.game ?? "mtg"
  // Known cards from this account's cached versions, filtered to the deck's game system.
  // why: memoized because the card search reruns its offline filter whenever this list changes identity.
  const offlineCandidates = useMemo(
    () => Object.values(versionCache.knownCards).filter((entry) => entry.game === game),
    [versionCache.knownCards, game],
  )
  const reviewRequested = useRef(reviewChanges)
  useEffect(() => {
    if (reviewRequested.current && (failedEdit || failedCardEdit)) {
      reviewRequested.current = false
      setDialog("syncConflict")
    }
  }, [failedEdit, failedCardEdit])
  const writeMotion = versionWrites.pending.length + versionWrites.failures.length
  const lastWriteMotion = useRef(-1)
  const refreshVersionCache = versionCache.refresh
  useEffect(() => {
    if (lastWriteMotion.current === writeMotion) return
    lastWriteMotion.current = writeMotion
    refreshVersionCache()
  }, [refreshVersionCache, writeMotion])
  const focusedCard = cards.find((card) => printingKey(card) === focusedKey)
  const { details, detailsError, detailsRetryAfterMs, retryDetails } = useCardDetails(
    focusedCard
      ? {
          ...focusedCard,
          detailKey: cardDetailsKey(focusedCard, detail?.deck.game ?? "mtg"),
          game: detail?.deck.game ?? focusedCard.game ?? "mtg",
          catalogCardId: focusedCard.cardId ?? focusedCard.printingId ?? focusedCard.providerCardId,
        }
      : undefined,
    game === "mtg" && deck?.format === "commander",
  )

  const { displayCards } = view
  useEffect(() => {
    if (!draft.editing || !draft.fromCache || detail === undefined) return
    setDraft((current) => reseedDeckDraft(current, displayCards))
  }, [detail, displayCards, draft.editing, draft.fromCache, setDraft])

  // Keeps the persistent cache fresh with live reads so the next offline session is current.
  useEffect(() => {
    const liveVersion = detail?.version
    const recordCards = versionCache.record
    if (!detail || !liveVersion || !recordCards) return
    recordCards(liveVersion._id, liveVersion.syncRevision ?? 0, detail.cards)
  }, [detail, versionCache.record])

  useEffect(() => {
    const liveVersion = detail?.version
    if (!detail || !liveVersion || !client) return
    void prefetchCardDetails(client, {
      game: detail.deck.game,
      versionId: liveVersion._id,
      revision: liveVersion.syncRevision ?? 0,
      cards: detail.cards,
    })
  }, [detail, client])

  usePreventRemove(view.changes.any, ({ data }) => {
    setPendingNavigation(data.action)
    setDialog("discard")
  })

  useEffect(() => {
    if (draft.editing || !pendingNavigation) return
    const action = pendingNavigation
    setPendingNavigation(undefined)
    navigation.dispatch(action)
  }, [draft.editing, navigation, pendingNavigation])

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
    setDraft(
      openDeckDraft({
        cards: displayCards,
        note: deck?.note ?? "",
        metadataRevision: view.currentMetadataRevision,
        fromCache: detail === undefined && !versionTarget,
      }),
    )
    setError(undefined)
  }

  function discardEdits() {
    setDraft(closedDeckDraft)
    setError(undefined)
  }

  function requestDiscard() {
    if (view.changes.any) {
      setDialog("discard")
      return
    }
    discardEdits()
  }

  function addCard(card: DeckCard) {
    if (knownDeleted) return
    const alreadyInDraft = latestDraft.current.cards.some(
      (candidate) => printingKey(candidate) === printingKey(card),
    )
    if (!alreadyInDraft && offline) {
      const entry = offlineCardEntry(card)
      if (!entry) {
        setError(OFFLINE_CARD_MESSAGE)
        return
      }
      // The cached card carries the full server identity; the candidate may not.
      card = {
        ...entry.card,
        quantity: card.quantity,
        ...(card.section ? { section: card.section } : {}),
        ...(card.board ? { board: card.board } : {}),
      }
    }
    setDraft((current) => addDraftCard(current, card))
  }

  /**
   * The known-cards entry an offline add may draw from, or undefined when the card is
   * unknown. Entries must match the deck's game system, so a Magic printing never
   * lands in a Yugioh deck.
   */
  function offlineCardEntry(card: DeckCard): KnownCardEntry | undefined {
    const entry = versionCache.knownCards[cachedCardIdentity(card)]
    return entry !== undefined && entry.game === game ? entry : undefined
  }

  function removeCard(card: DeckCard) {
    if (knownDeleted) return
    setDraft((current) => removeDraftCard(current, card))
  }

  function focusCard(card: DeckCard) {
    setFocusedKey(printingKey(card))
  }

  function chooseCommander(color?: DeckCard["commanderColor"]) {
    if (!focusedCard || knownDeleted || cardsUnavailable || cardsCached) return
    const cached = loadCardDetails()
    const next = chooseDraftCommander(
      latestDraft.current,
      printingKey(focusedCard),
      (card) => (card === focusedCard ? details : cached[cardDetailsKey(card, game)]),
      color,
    )
    setFocusedKey(undefined)
    if ("error" in next) {
      setError(next.error)
      return
    }
    setError(undefined)
    setDraft(next)
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
    const cardTarget = pinnedVersionTarget.current ?? versionTarget
    const noteRevision = draft.metadataRevision
    const plan = planDeckSave({
      changes: view.changes,
      canQueueCards: view.canQueueVersions && Boolean(cardTarget),
      canQueueNote: view.canQueueMetadata && noteRevision !== undefined,
    })
    const finish = () => {
      captureAnalytics("deck_used", { feature: "saved" })
      setDraft(closeDeckDraft)
    }
    if (plan.immediate) {
      try {
        setError(undefined)
        if (plan.cards === "queue" && cardTarget)
          versionWrites.update(
            deckId,
            cardTarget.versionId,
            draft.cards,
            cardTarget.expectedRevision,
          )
        if (plan.note === "queue" && noteRevision !== undefined)
          metadataWrites.update(deckId, { note: draft.note }, noteRevision)
        if (plan.note === "mutation")
          await updateDeck({ deckId: deckId as Id<"decks">, note: draft.note })
        finish()
      } catch (cause) {
        metadataSaveStarted.current = false
        fail(cause, "Could not save deck")
      }
      return
    }
    const saved = await run(async () => {
      if (plan.cards === "mutation") {
        await saveVersion({
          deckId: deckId as Id<"decks">,
          ...(version ? { versionId: version._id } : {}),
          cards: draft.cards,
        })
      }
      if (plan.note === "queue" && noteRevision !== undefined)
        metadataWrites.update(deckId, { note: draft.note }, noteRevision)
      else if (plan.note === "mutation")
        await updateDeck({ deckId: deckId as Id<"decks">, note: draft.note })
      finish()
    }, "Could not save deck")
    if (!saved) metadataSaveStarted.current = false
  }

  function chooseVersion(versionId: string) {
    setSelectedVersionId(versionId as Id<"deckVersions">)
  }

  function startNewVersion() {
    setError(undefined)
    if (!view.canAddVersion) {
      const limit = view.versionLimit
      setError(
        `This deck holds up to ${limit} version${limit === 1 ? "" : "s"}. Delete one to add another.`,
      )
      return
    }
    setDialog("newVersion")
  }

  async function submitNewVersion({ name, note, copyCards }: DeckVersionDraft) {
    if (view.canQueueVersions) {
      // Copy captures what the user currently sees locally, queue overlay included;
      // a server snapshot fromVersionId would silently miss pending offline cards.
      const captured = copyCards ? view.versionCapture : undefined
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
    if (view.canQueueVersions && activeVersionId) {
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
    if (!draft.editing) pinVersionTarget()
    setDialog("deleteVersion")
  }

  async function confirmDeleteVersion() {
    const versionId =
      version?._id ?? (activeVersionSummary ? (activeVersionId as Id<"deckVersions">) : undefined)
    if (!versionId) return
    const expectedRevision = pinnedRevisionFor(versionId) ?? versionTarget?.expectedRevision ?? 0
    if (view.canQueueVersions) {
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
    if (view.canQueueMetadata && settingsMetadataRevision !== undefined) {
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
  const { accountMetadata, versionConflict, versionCardConflict, failureMessage } = view
  const copyFromVersion = activeVersionSummary ?? version
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
        note={view.note}
        editing={draft.editing}
        dirty={view.changes.any}
        busy={busy}
        cardsUnavailable={cardsUnavailable}
        cardsCached={cardsCached}
        canAddOffline={offlineCandidates.length > 0}
        addOfflineNote={
          offline && cardsCached && offlineCandidates.length === 0
            ? "No offline cards yet. Open cards online and they'll be available here."
            : undefined
        }
        editingDisabled={knownDeleted}
        saveStatus={view.saveStatus}
        onBack={onBack}
        onEdit={startEditing}
        onSave={save}
        onCancel={requestDiscard}
        stats={
          detail?.record
            ? { record: detail.record, source: statsSource, onSourceChange: setStatsSource }
            : undefined
        }
        onAddMatch={
          onAddMatch && version && !knownDeleted
            ? () => onAddMatch(version._id, deck.name)
            : undefined
        }
        onDetails={() => {
          if (knownDeleted) return
          settingsSaveStarted.current = false
          setSettingsMetadataRevision(view.currentMetadataRevision)
          setDialog("settings")
        }}
        onAdd={() => {
          if (knownDeleted) return
          if (!draft.editing) startEditing()
          setChoosingCommander(false)
          setAdding(true)
        }}
        onChooseCommander={
          view.singleCommander && !cardsUnavailable && (!cardsCached || versionTarget)
            ? () => {
                if (!draft.editing) startEditing()
                setChoosingCommander(true)
                setAdding(true)
              }
            : undefined
        }
        commanderWarnings={view.commanderWarnings}
        onNoteChange={(note) => setDraft((current) => setDraftNote(current, note))}
        onFocus={focusCard}
        onIncrement={addCard}
        onDecrement={removeCard}
        undo={
          draft.undo
            ? { name: draft.undo.name, restore: () => setDraft(restoreDraftUndo) }
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
              {view.failedVersionSnapshot ? (
                <Text
                  size="sm"
                  text={`Account copy: ${view.failedVersionSnapshot.cardQuantity} cards · ${view.failedVersionSnapshot.cardCount} entries · revision ${view.failedVersionSnapshot.revision}`}
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
                {view.comparedFields.map((field) => (
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
                {view.comparedFields.length === 0 ? (
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
      {adding ? (
        <CardSearchScreen
          game={detail?.deck.game ?? deck.game ?? "mtg"}
          format={detail?.deck.format ?? deck.format}
          offlineCandidates={offlineCandidates}
          initialSection={choosingCommander ? "commander" : undefined}
          commanderCards={draft.cards}
          onClose={() => setAdding(false)}
          onAdd={(card) => {
            if (isCommanderPick(deck, card)) {
              const cached = loadCardDetails()
              const next = addDraftCommander(
                latestDraft.current,
                card,
                (entry) => cached[cardDetailsKey(entry, deck.game)],
              )
              if ("error" in next) return next.error
              setDraft(next)
              if (choosingCommander) setAdding(false)
              return undefined
            }
            const limitError = cardLimitError(latestDraft.current.cards, card)
            if (limitError) return limitError
            addCard(card)
            return undefined
          }}
        />
      ) : null}

      {focusedCard ? (
        <CardFocusDialog
          key={printingKey(focusedCard)}
          card={{
            game: detail?.deck.game ?? deck.game ?? focusedCard.game ?? "mtg",
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
            commanderColor: focusedCard.commanderColor,
          }}
          details={details}
          detailsError={detailsError}
          detailsRetryAfterMs={detailsRetryAfterMs}
          onRetryDetails={retryDetails}
          onSetCommander={
            draft.editing &&
            view.singleCommander &&
            !cardsUnavailable &&
            !cardsCached &&
            !knownDeleted
              ? chooseCommander
              : undefined
          }
          {...(draft.editing
            ? {
                onIncrement: isCommanderPick(deck, focusedCard)
                  ? undefined
                  : () => addCard(focusedCard),
                onDecrement: () => decrementFocusedCard(focusedCard),
              }
            : {})}
          onClose={() => setFocusedKey(undefined)}
        />
      ) : null}

      {dialog === "newVersion" && (detail || view.canQueueVersions) ? (
        <DeckVersionDialog
          title="New version"
          submitLabel="Create version"
          copyFromLabel={copyFromVersion ? versionLabel(copyFromVersion) : undefined}
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
          notesLocked={!view.premium}
          busy={busy}
          error={error}
          onSubmit={submitRenameVersion}
          {...(view.canDeleteVersion ? { onDelete: startDeleteVersion } : {})}
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
          {view.hasVersionRows ? (
            <View style={themed($versions)}>
              <View style={themed($versionHeading)}>
                <Text weight="bold" size="sm" text="Versions" />
                {detail || view.canQueueVersions ? (
                  <TouchableOpacity
                    testID="version-picker-__new__"
                    accessibilityRole="button"
                    accessibilityLabel="New version"
                    disabled={draft.editing}
                    onPress={startNewVersion}
                  >
                    <Text weight="bold" size="sm" style={themed($textAction)} text="New version" />
                  </TouchableOpacity>
                ) : null}
              </View>
              {view.versionRows.map((candidate) => {
                const selected = candidate._id === activeVersionId
                // Live records only; cached rows must not present unknown stats as fresh.
                const recordLines = candidate.record
                  ? deckStatLines(candidate.record, statsSource)
                  : []
                const candidateRecord = recordLines.length
                  ? recordLines.map((line) => `${line.label} ${line.text}`)
                  : detail
                    ? ["Unplayed"]
                    : []
                return (
                  <TouchableOpacity
                    key={candidate._id}
                    testID={`version-picker-${candidate._id}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    style={themed($versionRow)}
                    disabled={draft.editing}
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
                      {candidateRecord.map((text) => (
                        <Text key={text} weight="medium" style={$tabularNumbers} text={text} />
                      ))}
                      <Text
                        size="xxs"
                        style={themed($dimmedText)}
                        text={cardCountLabel(candidate.cardQuantity)}
                      />
                    </View>
                    {selected && view.canManageVersion ? (
                      <TouchableOpacity
                        testID="rename-version-button"
                        accessibilityRole="button"
                        onPress={() => {
                          if (!draft.editing) pinVersionTarget()
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
