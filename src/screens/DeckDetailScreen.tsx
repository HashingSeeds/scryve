import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { TextStyle, ViewStyle } from "react-native"
import { Platform, ScrollView, Share, View } from "react-native"
import * as Clipboard from "expo-clipboard"
import { router, useFocusEffect } from "expo-router"
import { useConvex, useMutation, useQuery, useConvexConnectionState } from "convex/react"

import { AlertNote } from "@/components/AlertNote"
import { Button } from "@/components/Button"
import { CardFocusDialog } from "@/components/CardFocusDialog"
import { DeckActionsSheet, type DeckAction } from "@/components/DeckActionsSheet"
import { DeckListSkeleton } from "@/components/DeckLoadingState"
import { DeckSettingsDialog } from "@/components/DeckSettingsDialog"
import type { DeckVersionDraft } from "@/components/DeckVersionDialog"
import { $dialogActions, $dialogButton, $dialogText, DialogCard } from "@/components/DialogCard"
import { Header, HeaderIcon } from "@/components/Header"
import { LoadingProgress } from "@/components/LoadingProgress"
import { Screen } from "@/components/Screen"
import { Sheet } from "@/components/Sheet"
import { $sheetScroll } from "@/components/sheetStyles"
import { Text } from "@/components/Text"
import { useSheetPresence } from "@/components/useSheetPresence"
import { ConvexQueryBoundary } from "@/features/async/ConvexQueryBoundary"
import type { CloudAccess } from "@/features/auth/CloudScreen"
import { readPublicCloudConfig } from "@/features/auth/config"
import { loadCardDetails, prefetchCardDetails } from "@/features/decks/cardDetailsCache"
import { countCardChanges } from "@/features/decks/deckBuild"
import { cardDetailsKey, cardSection, printingKey, type DeckCard } from "@/features/decks/deckCards"
import {
  cardCountLabel,
  deckVersionLabel,
  recordText,
  versionTitle,
} from "@/features/decks/deckCopy"
import {
  closeDeckDraft,
  closedDeckDraft,
  draftChanges,
  isCommanderPick,
  openDeckDraft,
  planDeckSave,
  reseedDeckDraft,
  startsNewList,
} from "@/features/decks/deckDraft"
import { useAccountDeckDraft } from "@/features/decks/deckDraftStore"
import { DeckPlay } from "@/features/decks/DeckPlay"
import { isDeckSyncEnabled, useDeckSync } from "@/features/decks/decksSync"
import { useDeckMetadataWrites } from "@/features/decks/decksSyncWrites"
import { allRecord } from "@/features/decks/deckStatLines"
import { useDeckVersionWrites } from "@/features/decks/decksVersionWrites"
import {
  cachedCardIdentity,
  useDeckVersionCache,
  type KnownCardEntry,
} from "@/features/decks/deckVersionsCache"
import { DeckVersionsDialogs } from "@/features/decks/DeckVersionsDialogs"
import { DeckModeTabs, DeckView, type DeckMode } from "@/features/decks/DeckView"
import { useLocalDeckSync } from "@/features/decks/localDeckSync"
import { useMatchSideboard } from "@/features/decks/matchSideboard"
import {
  deckQueryVersionId,
  isDeckKnownDeleted,
  resolveDeckView,
} from "@/features/decks/resolveDeckView"
import {
  forgetAccountDraft,
  keepAccountDraft,
  loadAccountDraft,
  type SavedAccountDraft,
} from "@/features/decks/savedDeckDrafts"
import { shareUrl } from "@/features/decks/shareLinks"
import { SideboardSwapSheet } from "@/features/decks/SideboardSwapSheet"
import { useCardDetails } from "@/features/decks/useCardDetails"
import { LocalGameRepository } from "@/features/game/localPersistence"
import { localizedDeckSections } from "@/features/game/playSystems"
import type { LocalGame } from "@/features/game/types"
import { statsDate } from "@/features/stats/DeckStatsParts"
import { translate } from "@/i18n/translate"
import { useAppTheme } from "@/theme/context"
import { $styles } from "@/theme/styles"
import type { ThemedStyle } from "@/theme/types"
import { captureAnalytics } from "@/utils/analytics"
import { convexErrorCode, convexErrorMessage } from "@/utils/convexError"

import { api } from "../../convex/_generated/api"
import type { Id } from "../../convex/_generated/dataModel"
import { deckFormatLabel, deckGame } from "../../convex/lib/deckGames"
import { picksCommander, tracksResults } from "../../convex/lib/systems"

type DeckDialog =
  | "none"
  | "newVersion"
  | "versions"
  | "renameVersion"
  | "deleteVersion"
  | "actions"
  | "settings"
  | "deleteDeck"
  | "moveDeck"
  | "syncConflict"
  | "sideboard"

const SHEET_DIALOGS: ReadonlySet<DeckDialog> = new Set([
  "actions",
  "sideboard",
  "syncConflict",
  "settings",
  "newVersion",
  "versions",
  "renameVersion",
])
const isSheetDialog = (dialog: DeckDialog) => SHEET_DIALOGS.has(dialog)

const NEW_LIST_NOTICE_MS = 8_000

function keepDraft(
  ownerId: string | undefined,
  deckId: string,
  saved: SavedAccountDraft,
  savedNote: string | undefined,
) {
  if (draftChanges(saved.draft, savedNote).any) keepAccountDraft(ownerId, deckId, saved)
  else forgetAccountDraft(ownerId, deckId)
}

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
  onMovedToDevice?: (localId: string) => void
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
  const loadingSections = summary ? localizedDeckSections(summary.game, summary.format) : []
  const statusText =
    failure?.kind === "missing"
      ? translate("decks:detail.notFound")
      : translate("decks:detail.unavailable")

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
        LeftActionComponent={
          <HeaderIcon icon="back" label={translate("common:back")} onPress={onBack} />
        }
        RightActionComponent={
          <HeaderIcon icon="more" label={translate("decks:deckView.details")} disabled />
        }
      />
      <ScrollView
        style={$styles.flex1}
        contentContainerStyle={themed($loadingContent)}
        scrollEnabled={false}
      >
        <View style={themed($headerBlock)}>
          <View style={themed($titleBlock)}>
            <Text
              preset="heading"
              size="xl"
              text={summary?.name ?? translate("decks:deckView.title")}
            />
            {loadingMetadata ? <Text size="sm" tone="dim" text={loadingMetadata} /> : null}
            <LoadingProgress
              testID="deck-loading-progress"
              state={failure || access?.message ? "unavailable" : "loading"}
              accessibilityText={failure ? statusText : translate("decks:detail.loading")}
            />
          </View>
          <DeckModeTabs mode="play" disabled />
          {access?.message ? (
            <Button text={access.actionLabel ?? access.message} onPress={access.request} />
          ) : null}
          {failure ? (
            <View style={themed($queryFailure)}>
              <Text preset="subheading" text={statusText} />
              <Text
                size="sm"
                tone="dim"
                tx={
                  failure.kind === "missing"
                    ? "decks:detail.maybeDeleted"
                    : "decks:detail.loadFailed"
                }
              />
              {failure.kind === "unavailable" ? (
                <Button testID="retry-deck-detail" tx="common:retry" onPress={failure.retry} />
              ) : null}
            </View>
          ) : null}
        </View>
        <DeckListSkeleton sections={loadingSections} />
      </ScrollView>
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
  onMovedToDevice,
  access,
  reviewChanges,
}: DeckDetailScreenProps) {
  const { themed, theme } = useAppTheme()
  const client = useConvex()
  const syncEnabled = useMemo(() => isDeckSyncEnabled(), [])
  const synced = useDeckSync(syncEnabled, access?.ownerId, access?.ready ?? false)
  const metadataWrites = useDeckMetadataWrites(syncEnabled, access?.ownerId, access?.ready ?? false)
  const versionWrites = useDeckVersionWrites(syncEnabled, access?.ownerId, access?.ready ?? false)
  const knownDeleted = isDeckKnownDeleted(deckId, synced.metadata, metadataWrites.metadata)
  const [restored] = useState(() => loadAccountDraft(access?.ownerId, deckId))
  const [selectedVersionId, setSelectedVersionId] = useState(restored?.versionId)
  const pinnedVersionTarget = useRef<
    { versionId: Id<"deckVersions">; expectedRevision: number } | undefined
  >(restored?.pinned)
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
  const detailQueryActive = (access?.ready ?? true) && !knownDeleted
  const detail = useQuery(
    api.decks.detail,
    detailQueryActive
      ? {
          deckId: deckId as Id<"decks">,
          ...(queryVersionId ? { versionId: queryVersionId } : {}),
        }
      : "skip",
  )
  const deckMetadata = synced.metadata.find((deck) => deck.deckId === deckId)
  const statsDeckKey = deckMetadata?.deckKey ?? detail?.deck.deckKey
  const connection = useConvexConnectionState()
  const offline = connection?.isWebSocketConnected === false
  const firstConnectionPending =
    offline && connection?.hasEverConnected !== true && connection?.connectionRetries === 0
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
  const setBringingVersion = useMutation(api.decks.setBringingVersion)
  const shareDeck = useMutation(api.decks.share)
  const unshareDeck = useMutation(api.decks.unshare)
  const { keepOnDevice: moveToDevice } = useLocalDeckSync(access?.ownerId)
  const {
    draft,
    latest: latestDraft,
    setDraft,
    edit,
    subscribe: subscribeDraft,
  } = useAccountDeckDraft({ ownerId: access?.ownerId, deckId })
  // why: an unsaved draft brought back from storage reopens where it can be finished.
  const [mode, setMode] = useState<DeckMode>(draft.editing ? "build" : "play")
  const building = mode === "build"
  const [dialog, setDialog] = useState<DeckDialog>("none")
  const dialogs = useSheetPresence(dialog === "none" ? undefined : dialog, isSheetDialog)
  const [settingsMetadataRevision, setSettingsMetadataRevision] = useState<number>()
  const [error, setError] = useState<string>()
  const [linkCopied, setLinkCopied] = useState(false)
  const [newListNotice, setNewListNotice] = useState(false)
  const [busy, setBusy] = useState(false)
  const [bringingPending, setBringingPending] = useState<Id<"deckVersions">>()
  const [focusedKey, setFocusedKey] = useState<string>()
  const focus = useSheetPresence(focusedKey)
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
  const { matchVersionId } = view
  const [activeGame, setActiveGame] = useState<LocalGame | null>(null)
  useFocusEffect(useCallback(() => setActiveGame(new LocalGameRepository().loadActiveGame()), []))
  const brought = activeGame?.account
  const bringsThisDeck =
    brought !== undefined &&
    brought.ownerId === access?.ownerId &&
    ((statsDeckKey !== undefined && brought.deckKey === statsDeckKey) ||
      view.versionRows.some((row) => row._id === brought.deckVersionId))
  const sideboard = useMatchSideboard(bringsThisDeck ? activeGame : undefined, {
    game: deck?.game,
    format: deck?.format,
  })
  // why: Build opens its draft on the first change, so controls follow what that draft would allow.
  const editableCached = draft.editing ? cardsCached : detail === undefined && !versionTarget
  const changes = view.changes.any
    ? Math.max(
        1,
        (view.changes.cards ? countCardChanges(draft.base, draft.cards) : 0) +
          (view.changes.note ? 1 : 0),
      )
    : 0
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
  // why: moving snapshots the server copy, so edits still queued on this device would be lost.
  const hasQueuedEdits = [
    ...metadataWrites.pending.map((write) => write.deckId),
    ...metadataWrites.failures.map((failure) => failure.action.deckId),
    ...versionWrites.pending.map((write) => write.deckId),
    ...versionWrites.failures.map((failure) => failure.action.deckId),
  ].includes(deckId as Id<"decks">)
  useEffect(() => {
    if (!newListNotice) return
    const timeout = setTimeout(() => setNewListNotice(false), NEW_LIST_NOTICE_MS)
    return () => clearTimeout(timeout)
  }, [newListNotice])
  const lastWriteMotion = useRef(-1)
  const refreshVersionCache = versionCache.refresh
  useEffect(() => {
    if (lastWriteMotion.current === writeMotion) return
    lastWriteMotion.current = writeMotion
    refreshVersionCache()
  }, [refreshVersionCache, writeMotion])
  const focusedCard = (building ? cards : view.displayCards).find(
    (card) => printingKey(card) === focus.shown,
  )
  // why: a details sheet whose card vanished can't animate out, so its request goes with it.
  useEffect(() => {
    if (focus.shown && !focusedCard) setFocusedKey(undefined)
  }, [focus.shown, focusedCard])
  const { details, detailsError, detailsRetryAfterMs, retryDetails } = useCardDetails(
    focusedCard
      ? {
          ...focusedCard,
          detailKey: cardDetailsKey(focusedCard, detail?.deck.game ?? "mtg"),
          game: detail?.deck.game ?? focusedCard.game ?? "mtg",
          catalogCardId: focusedCard.cardId ?? focusedCard.printingId ?? focusedCard.providerCardId,
        }
      : undefined,
    picksCommander(game, deck?.format),
  )
  const currentCommander = building
    ? cards.find((card) => cardSection(card) === "commander")
    : undefined
  useCardDetails(
    currentCommander
      ? {
          ...currentCommander,
          detailKey: cardDetailsKey(currentCommander, game),
          game,
          catalogCardId:
            currentCommander.cardId ??
            currentCommander.printingId ??
            currentCommander.providerCardId,
        }
      : undefined,
    true,
  )

  const { displayCards } = view
  useEffect(() => {
    if (!draft.editing || !draft.fromCache || detail === undefined) return
    setDraft(reseedDeckDraft(latestDraft.current, displayCards))
  }, [detail, displayCards, draft.editing, draft.fromCache, latestDraft, setDraft])

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

  const ownerId = access?.ownerId
  const draftVersionId =
    pinnedVersionTarget.current?.versionId ?? selectedVersionId ?? view.version?._id
  const savedNote = deck?.note
  useEffect(() => {
    keepDraft(
      ownerId,
      deckId,
      { draft, versionId: draftVersionId, pinned: pinnedVersionTarget.current },
      savedNote,
    )
  }, [deckId, draft, draftVersionId, ownerId, savedNote])

  // why: /cards edits the draft while this screen is frozen, and the effect above waits until it shows again.
  function keepSearchEdit<Result>(result: Result) {
    keepDraft(
      ownerId,
      deckId,
      {
        draft: latestDraft.current,
        versionId: pinnedVersionTarget.current?.versionId ?? draftVersionId,
        pinned: pinnedVersionTarget.current,
      },
      savedNote,
    )
    return result
  }

  function fail(cause: unknown, fallback: string) {
    setError(convexErrorMessage(cause, fallback))
  }

  async function run(work: () => Promise<void>, fallback: string) {
    if (access && !access.ready) {
      setError(access.message ?? translate("account:cloud.reconnect"))
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
    setNewListNotice(false)
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

  function ensureDraft() {
    if (!latestDraft.current.editing) startEditing()
  }

  function discardEdits() {
    setDraft(closedDeckDraft)
    setError(undefined)
  }

  function changeMode(next: DeckMode) {
    if (next === "play" && latestDraft.current.editing && !view.changes.any) discardEdits()
    setMode(next)
  }

  function addCard(card: DeckCard): string | undefined {
    if (knownDeleted || !deck) return undefined
    ensureDraft()
    const alreadyInDraft = latestDraft.current.cards.some(
      (candidate) => printingKey(candidate) === printingKey(card),
    )
    // why: /cards calls this while the screen is frozen, so the rendered `offline` can be stale.
    const offlineNow = client ? !client.connectionState().isWebSocketConnected : offline
    if (!alreadyInDraft && offlineNow && !isCommanderPick(deck, card)) {
      const entry = offlineCardEntry(card)
      if (!entry) {
        const offlineError = translate("decks:detail.offlineCard")
        setError(offlineError)
        return offlineError
      }
      // The cached card carries the full server identity; the candidate may not.
      card = {
        ...entry.card,
        quantity: card.quantity,
        ...(card.section ? { section: card.section } : {}),
        ...(card.board ? { board: card.board } : {}),
      }
    }
    return edit({ type: "add", card }, { game, format: deck.format })
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
    if (knownDeleted || !deck) return
    ensureDraft()
    edit({ type: "remove", card }, { game, format: deck.format })
  }

  function focusCard(card: DeckCard) {
    setFocusedKey(printingKey(card))
  }

  function chooseCommander(color?: DeckCard["commanderColor"]) {
    if (!focusedCard || !deck || knownDeleted || cardsUnavailable || editableCached) return
    setFocusedKey(undefined)
    ensureDraft()
    setError(
      edit(
        { type: "chooseCommander", card: focusedCard, details, color },
        { game, format: deck.format },
      ),
    )
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
      fail(new Error("This deck was deleted."), translate("decks:detail.saveFailed"))
      return
    }
    const cardTarget = pinnedVersionTarget.current ?? versionTarget
    const noteRevision = draft.metadataRevision
    const plan = planDeckSave({
      changes: view.changes,
      canQueueCards: view.canQueueVersions && Boolean(cardTarget),
      canQueueNote: view.canQueueMetadata && noteRevision !== undefined,
    })
    const newList = plan.cards !== "none" && startsNewList(draft.base, draft.cards, game)
    const finish = () => {
      captureAnalytics("deck_used", { feature: "saved" })
      setNewListNotice(newList)
      const after = latestDraft.current
      if (after.cards === draft.cards && after.note === draft.note) {
        setDraft(closeDeckDraft(after))
        return
      }
      // why: /cards adds and note edits can land while the save is in flight; they stay as changes on top of what was saved.
      pinnedVersionTarget.current = undefined
      metadataSaveStarted.current = false
      // why: the note write just moved the deck's revision, so the old one would read as a conflict next save.
      const metadataRevision =
        plan.note === "queue" && noteRevision !== undefined
          ? noteRevision + 1
          : plan.note === "mutation"
            ? undefined
            : after.metadataRevision
      setDraft({ ...after, base: draft.cards, metadataRevision })
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
        fail(cause, translate("decks:detail.saveFailed"))
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
    }, translate("decks:detail.saveFailed"))
    if (!saved) metadataSaveStarted.current = false
  }

  async function bringVersion(versionId: Id<"deckVersions">) {
    setBringingPending(versionId)
    await run(async () => {
      await setBringingVersion({ deckId: deckId as Id<"decks">, versionId })
    }, translate("decks:play.bringFailed"))
    setBringingPending(undefined)
  }

  function chooseVersion(versionId: string) {
    setNewListNotice(false)
    setSelectedVersionId(versionId as Id<"deckVersions">)
  }

  function startNewVersion() {
    setError(undefined)
    if (!view.canAddVersion) {
      const limit = view.versionLimit
      setError(translate("decks:detail.versionLimit", { count: limit }))
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
        setError(translate("decks:detail.cardsNotSaved"))
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
        fail(cause, translate("decks:detail.createVersionFailed"))
      }
      return
    }
    if (!detail) {
      setError(translate("decks:detail.reconnectForVersions"))
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
    }, translate("decks:detail.createVersionFailed"))
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
        fail(cause, translate("decks:detail.updateVersionFailed"))
      }
      return
    }
    if (!version) return
    await run(async () => {
      await updateVersion({ versionId: version._id, name, note })
      setDialog("none")
    }, translate("decks:detail.updateVersionFailed"))
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
        fail(cause, translate("decks:detail.deleteVersionFailed"))
      }
      return
    }
    await run(async () => {
      if (!version) return
      await deleteVersion({ versionId: version._id })
      setSelectedVersionId(undefined)
      setDialog("none")
    }, translate("decks:detail.deleteVersionFailed"))
  }

  async function submitSettings({ name, format }: { name: string; format: string }) {
    if (knownDeleted) {
      settingsSaveStarted.current = false
      fail(new Error("This deck was deleted."), translate("decks:detail.updateFailed"))
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
        fail(cause, translate("decks:detail.updateFailed"))
      }
      return
    }
    await run(async () => {
      await updateDeck({ deckId: deckId as Id<"decks">, name, format })
      setDialog("none")
    }, translate("decks:detail.updateFailed"))
  }

  // why: these rows fall back to server calls, so offline they say why instead of failing on press.
  const needsConnection =
    (access && !access.ready) || offline
      ? (access?.message ?? translate("account:cloud.reconnect"))
      : undefined
  const queuedOrOnline = view.canQueueMetadata ? undefined : needsConnection
  const deckActions: DeckAction[] = [
    {
      id: "details",
      label: translate("decks:actions.nameAndFormat"),
      blocked: queuedOrOnline,
      onPress: () => {
        settingsSaveStarted.current = false
        setSettingsMetadataRevision(view.currentMetadataRevision)
        setDialog("settings")
      },
    },
    ...(onMovedToDevice
      ? [
          {
            id: "move",
            label: translate("decks:actions.moveToDevice"),
            blocked:
              needsConnection ??
              (hasQueuedEdits ? translate("decks:actions.editsSyncing") : undefined),
            onPress: () => setDialog("moveDeck"),
          },
        ]
      : []),
    ...(sideboard?.canSwap
      ? [
          {
            id: "sideboard",
            label: translate("decks:sideboard.open"),
            onPress: () => setDialog("sideboard"),
          },
        ]
      : []),
    {
      id: "share",
      label: translate("decks:actions.share"),
      blocked: needsConnection,
      onPress: () => {
        setDialog("none")
        void run(async () => {
          const { token } = await shareDeck({ deckId: deckId as Id<"decks"> })
          const config = readPublicCloudConfig()
          const url = config.configured ? shareUrl(config.value.inviteOrigin, token) : undefined
          if (!url) throw new Error(translate("decks:shared.shareFailed"))
          setLinkCopied(false)
          // why: browsers without a share sheet (desktop Firefox) reject Share.share, so the link is copied instead.
          if (Platform.OS === "web" && typeof navigator.share !== "function") {
            await Clipboard.setStringAsync(url)
            setLinkCopied(true)
            return
          }
          const name = deck?.name ?? ""
          await Share.share({
            message: translate("decks:shared.message", { name, url }),
            url,
          }).catch((cause: unknown) => {
            // why: closing the browser's share sheet rejects with AbortError, which is not a failure.
            if (!(cause instanceof Error && cause.name === "AbortError")) throw cause
          })
        }, translate("decks:shared.shareFailed"))
      },
    },
    ...(detail?.shared
      ? [
          {
            id: "unshare",
            label: translate("decks:actions.stopSharing"),
            blocked: needsConnection,
            onPress: () => {
              setDialog("none")
              setLinkCopied(false)
              void run(
                () => unshareDeck({ deckId: deckId as Id<"decks"> }),
                translate("decks:shared.stopFailed"),
              )
            },
          },
        ]
      : []),
    {
      id: "delete",
      label: translate("decks:actions.delete"),
      destructive: true,
      blocked: queuedOrOnline,
      onPress: () => setDialog("deleteDeck"),
    },
  ]

  async function keepOnDevice() {
    if (!onMovedToDevice) return
    await run(async () => {
      const localId = await moveToDevice(deckId as Id<"decks">)
      setDialog("none")
      onMovedToDevice(localId)
    }, translate("decks:deckLimit.moveFailed"))
  }

  async function deleteDeck() {
    if (view.canQueueMetadata) {
      try {
        setError(undefined)
        metadataWrites.remove(deckId)
        setDialog("none")
        onBack()
      } catch (cause) {
        fail(cause, translate("decks:detail.deleteFailed"))
      }
      return
    }
    await run(async () => {
      await archiveDeck({ deckId: deckId as Id<"decks"> })
      setDialog("none")
      onBack()
    }, translate("decks:detail.deleteFailed"))
  }

  if (!deck)
    return (
      <DeckDetailPlaceholder
        summary={summary}
        onBack={onBack}
        access={access}
        failure={knownDeleted ? { kind: "missing", retry: onBack } : undefined}
      />
    )

  const configuredSections = localizedDeckSections(deck.game, deck.format)
  const { accountMetadata, versionConflict, versionCardConflict, failureMessage } = view
  const copyFromVersion = activeVersionSummary ?? version
  const latestVersionNumber = Math.max(...view.versionRows.map((row) => row.versionNumber))
  const shelfDeck = synced.decks.find((candidate) => candidate._id === deckId)
  const savedBringingId = detail
    ? detail.deck.bringingVersionId
    : shelfDeck && "bringingVersionId" in shelfDeck
      ? shelfDeck.bringingVersionId
      : undefined
  const bringingId =
    bringingPending ??
    view.versionRows.find((row) => row._id === savedBringingId)?._id ??
    view.versionRows.find((row) => row.versionNumber === latestVersionNumber)?._id
  const playVersionId = matchVersionId && detail && bringingId ? bringingId : matchVersionId
  const syncError =
    failedEdit || failedCardEdit ? (
      <Button tx="decks:detail.reviewChanges" onPress={() => setDialog("syncConflict")} />
    ) : undefined

  return (
    <Screen
      preset="fixed"
      safeAreaEdges={["bottom"]}
      backgroundColor={theme.colors.surface}
      contentContainerStyle={themed($screen)}
    >
      <DeckView
        mode={mode}
        onModeChange={changeMode}
        name={deck.name}
        game={deck.game}
        format={deck.format}
        cards={cards}
        savedCards={view.displayCards}
        note={view.note}
        changes={changes}
        busy={busy}
        cardsUnavailable={cardsUnavailable}
        cardsLoading={detailQueryActive ? !offline || firstConnectionPending : access?.loading}
        cardsCached={editableCached}
        addUnavailable={
          offline && !detail && offlineCandidates.length === 0
            ? translate("decks:detail.noOfflineCards")
            : undefined
        }
        editingDisabled={knownDeleted}
        detailsDisabled={view.changes.any}
        saveStatus={view.saveStatus}
        version={
          !view.hasVersionRows
            ? undefined
            : activeVersionSummary
              ? {
                  label: versionTitle(activeVersionSummary, latestVersionNumber),
                  latest: activeVersionSummary.versionNumber >= latestVersionNumber,
                }
              : { label: translate("decks:detail.versions"), latest: true }
        }
        onVersions={() => {
          // why: a clean draft keeps the version it opened on pinned, so a version created, chosen, or deleted next would send the following save to the old one.
          if (latestDraft.current.editing) discardEdits()
          setDialog("versions")
        }}
        onBack={onBack}
        onSave={save}
        onDiscard={discardEdits}
        play={
          <DeckPlay
            versions={view.versionRows.map((row) => ({
              id: row._id,
              label: versionTitle(row, latestVersionNumber),
              detail: [
                "updatedAt" in row ? statsDate(row.updatedAt) : undefined,
                cardCountLabel(row.cardQuantity),
              ]
                .filter(Boolean)
                .join(" · "),
              record: row.record && allRecord(row.record),
            }))}
            bringingId={bringingId}
            bringDisabled={!detail || busy || knownDeleted}
            onBring={bringVersion}
            tracked={tracksResults(deck.game)}
            deckKey={statsDeckKey}
            ready={access?.ready ?? true}
            match={
              sideboard && {
                pool: sideboard.pool,
                swaps: sideboard.swaps,
                ...(sideboard.canSwap
                  ? {
                      onSideboard: () => setDialog("sideboard"),
                      onReset: () => sideboard.apply({ in: [], out: [] }),
                    }
                  : {}),
              }
            }
            onStats={() =>
              router.push({
                pathname: "/connected/decks/stats",
                params: {
                  deckKey: statsDeckKey,
                  deckName: deck.name,
                  game: deck.game,
                  format: deck.format,
                },
              })
            }
          />
        }
        onStartGame={
          knownDeleted
            ? undefined
            : () => router.push({ pathname: "/game/new", params: { deckId } })
        }
        onAddMatch={
          onAddMatch && playVersionId ? () => onAddMatch(playVersionId, deck.name) : undefined
        }
        onDetails={() => {
          if (knownDeleted) return
          setError(undefined)
          setDialog("actions")
        }}
        cardSearch={{
          deckId,
          offlineCandidates,
          onAdd: (card) => keepSearchEdit(addCard(card)),
          onRemove: (card) => keepSearchEdit(removeCard(card)),
          cards: () => (latestDraft.current.editing ? latestDraft.current.cards : displayCards),
          subscribe: subscribeDraft,
        }}
        canChooseCommander={view.singleCommander && !cardsUnavailable && !editableCached}
        commanderWarnings={view.commanderWarnings}
        onNoteChange={(note) => {
          ensureDraft()
          edit({ type: "note", note }, { game, format: deck.format })
        }}
        onFocus={focusCard}
        onIncrement={addCard}
        onDecrement={removeCard}
        onMove={(card) => {
          if (knownDeleted) return
          ensureDraft()
          setError(edit({ type: "move", card }, { game, format: deck.format }))
        }}
        undo={
          draft.undo
            ? {
                name: draft.undo.name,
                restore: () => edit({ type: "undo" }, { game, format: deck.format }),
              }
            : undefined
        }
        error={
          dialog === "none" && (error || syncError || newListNotice || linkCopied) ? (
            <View style={themed($syncFailure)}>
              {error ? <AlertNote text={error} /> : null}
              {linkCopied ? (
                <AlertNote tone="info" text={translate("decks:shared.linkCopied")} />
              ) : null}
              {newListNotice ? (
                <AlertNote tone="info" text={translate("decks:detail.newList")} />
              ) : null}
              {syncError}
            </View>
          ) : undefined
        }
      />
      {dialogs.shown === "syncConflict" && failedCardEdit && !failedEdit ? (
        <Sheet
          visible={dialogs.visible}
          onClose={() => setDialog("none")}
          onDismissed={dialogs.onDismissed}
          testID="version-sync-conflict"
        >
          <ScrollView style={$sheetScroll} contentContainerStyle={themed($syncFailure)}>
            <Text
              preset="subheading"
              tx={
                versionCardConflict ? "decks:conflict.keepWhichCards" : "decks:conflict.reviewCards"
              }
            />
            <Text
              size="sm"
              text={
                knownDeleted
                  ? translate("decks:conflict.deletedCards")
                  : versionCardConflict
                    ? translate("decks:conflict.changedCards")
                    : failureMessage
              }
            />
            <View style={themed($conflictVersion)}>
              <Text
                size="sm"
                tx="decks:conflict.cardsSummary"
                txOptions={{
                  cards: failedCardEdit.action.cards.reduce(
                    (total, card) => total + card.quantity,
                    0,
                  ),
                  entries: failedCardEdit.action.cards.length,
                }}
              />
              <Text
                size="sm"
                text={
                  failedCardEdit.action.cards
                    .slice(0, 3)
                    .map((card) => card.name)
                    .join(", ") || translate("decks:conflict.noCards")
                }
                numberOfLines={2}
              />
              {view.failedVersionSnapshot ? (
                <Text
                  size="sm"
                  tx="decks:conflict.accountCopy"
                  txOptions={{
                    cards: view.failedVersionSnapshot.cardQuantity,
                    entries: view.failedVersionSnapshot.cardCount,
                    revision: view.failedVersionSnapshot.revision,
                  }}
                />
              ) : null}
            </View>
            {error ? <AlertNote text={error} /> : null}
            <Button
              testID="reapply-version-cards"
              tx={versionCardConflict ? "decks:conflict.keepMine" : "decks:conflict.retrySync"}
              preset="primary"
              onPress={() => {
                try {
                  versionWrites.reapplyFailure(failedCardEdit.action.operationId)
                  setDialog("none")
                } catch (cause) {
                  fail(cause, translate("decks:conflict.saveCardsFailed"))
                }
              }}
            />
            <Button
              testID="discard-version-cards"
              tx={
                versionCardConflict ? "decks:conflict.keepAccount" : "decks:conflict.discardLocal"
              }
              onPress={() => {
                try {
                  versionWrites.discardFailure(failedCardEdit.action.operationId)
                  setDialog("none")
                } catch (cause) {
                  fail(cause, translate("decks:conflict.discardCardsFailed"))
                }
              }}
            />
            <Button tx="decks:conflict.later" onPress={() => setDialog("none")} />
          </ScrollView>
        </Sheet>
      ) : null}
      {dialogs.shown === "syncConflict" && failedEdit ? (
        <Sheet
          visible={dialogs.visible}
          onClose={() => setDialog("none")}
          onDismissed={dialogs.onDismissed}
          testID="deck-sync-conflict"
        >
          <ScrollView style={$sheetScroll} contentContainerStyle={themed($syncFailure)}>
            <Text
              preset="subheading"
              tx={
                versionConflict ? "decks:conflict.keepWhichVersion" : "decks:conflict.reviewLocal"
              }
            />
            {versionConflict && !knownDeleted && accountMetadata ? (
              <>
                <View style={themed($comparisonRow)}>
                  <Text
                    weight="bold"
                    size="sm"
                    tx="decks:conflict.thisDevice"
                    style={$comparisonCell}
                  />
                  <Text
                    weight="bold"
                    size="sm"
                    tx="decks:conflict.account"
                    style={$comparisonCell}
                  />
                </View>
                {view.comparedFields.map((field) => (
                  <View key={field.label} style={themed($conflictVersion)}>
                    <Text weight="medium" size="xs" text={field.label} />
                    <View style={themed($comparisonRow)}>
                      <Text
                        size="sm"
                        text={field.local || translate("decks:conflict.empty")}
                        accessibilityLabel={translate("decks:conflict.localValue", {
                          field: field.label,
                          value: field.local || translate("decks:conflict.empty"),
                        })}
                        style={$comparisonCell}
                      />
                      <Text
                        size="sm"
                        text={field.account || translate("decks:conflict.empty")}
                        accessibilityLabel={translate("decks:conflict.accountValue", {
                          field: field.label,
                          value: field.account || translate("decks:conflict.empty"),
                        })}
                        style={$comparisonCell}
                      />
                    </View>
                  </View>
                ))}
                {view.comparedFields.length === 0 ? (
                  <Text size="sm" tx="decks:conflict.bothMatch" />
                ) : null}
              </>
            ) : (
              <>
                <Text
                  size="sm"
                  text={knownDeleted ? translate("decks:conflict.deletedEdit") : failureMessage}
                />
                <View style={themed($conflictVersion)}>
                  <Text
                    size="sm"
                    tx="decks:conflict.nameLine"
                    txOptions={{ name: failedEdit.action.name }}
                  />
                  <Text
                    size="sm"
                    tx="decks:conflict.formatLine"
                    txOptions={{
                      format: deckFormatLabel(failedEdit.action.game, failedEdit.action.format),
                    }}
                  />
                  <Text
                    size="sm"
                    tx="decks:conflict.noteLine"
                    txOptions={{
                      note: failedEdit.action.note || translate("decks:conflict.noNote"),
                    }}
                  />
                </View>
              </>
            )}
            {error ? <AlertNote text={error} /> : null}
            <Button
              testID="reapply-deck-metadata"
              tx={versionConflict ? "decks:conflict.keepMine" : "decks:conflict.retrySync"}
              preset="primary"
              disabled={knownDeleted || !accountMetadata}
              onPress={() => {
                try {
                  metadataWrites.reapplyFailure(failedEdit.action.operationId)
                  setDialog("none")
                } catch (cause) {
                  fail(cause, translate("decks:conflict.saveFailed"))
                }
              }}
            />
            <Button
              testID="discard-deck-metadata"
              tx={
                versionConflict && !knownDeleted
                  ? "decks:conflict.keepAccount"
                  : "decks:conflict.discardLocal"
              }
              onPress={() => {
                try {
                  metadataWrites.discardFailure(failedEdit.action.operationId)
                  setDialog("none")
                } catch (cause) {
                  fail(cause, translate("decks:conflict.discardFailed"))
                }
              }}
            />
            <Button tx="decks:conflict.later" onPress={() => setDialog("none")} />
          </ScrollView>
        </Sheet>
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
            building &&
            view.singleCommander &&
            !cardsUnavailable &&
            !editableCached &&
            !knownDeleted
              ? chooseCommander
              : undefined
          }
          {...(building
            ? {
                onIncrement: isCommanderPick(deck, focusedCard)
                  ? undefined
                  : () => addCard(focusedCard),
                onDecrement: () => decrementFocusedCard(focusedCard),
              }
            : {})}
          visible={focus.visible}
          onClose={() => setFocusedKey(undefined)}
          onDismissed={focus.onDismissed}
        />
      ) : null}

      {dialogs.shown === "actions" ? (
        <DeckActionsSheet
          visible={dialogs.visible}
          actions={deckActions}
          onClose={() => setDialog("none")}
          onDismissed={dialogs.onDismissed}
        />
      ) : null}

      {dialogs.shown === "sideboard" && sideboard ? (
        <SideboardSwapSheet
          visible={dialogs.visible}
          onDismissed={dialogs.onDismissed}
          pool={sideboard.pool}
          swaps={sideboard.swaps}
          onApply={(swaps) => {
            sideboard.apply(swaps)
            setDialog("none")
          }}
          onClose={() => setDialog("none")}
        />
      ) : null}

      {dialogs.shown === "settings" ? (
        <DeckSettingsDialog
          visible={dialogs.visible}
          onDismissed={dialogs.onDismissed}
          game={deck.game}
          initial={{
            name: deck.name,
            format: deck.format,
          }}
          busy={busy}
          error={error}
          onSubmit={submitSettings}
          onClose={() => setDialog("none")}
        />
      ) : null}

      <DeckVersionsDialogs
        visible={dialogs.visible}
        onDismissed={dialogs.onDismissed}
        dialog={dialogs.shown ?? "none"}
        rows={view.versionRows.map((row) => {
          // Live records only; cached rows must not present unknown stats as fresh.
          const counts = row.record ? allRecord(row.record) : undefined
          return {
            id: row._id,
            label: deckVersionLabel(row, latestVersionNumber),
            note: row.note,
            record: counts?.games
              ? recordText(counts)
              : detail
                ? translate("decks:detail.unplayed")
                : undefined,
            cardQuantity: row.cardQuantity,
          }
        })}
        activeId={activeVersionId}
        busy={busy}
        error={error}
        chooseDisabled={view.changes.any}
        newDisabled={view.changes.any}
        copyFromLabel={
          copyFromVersion ? deckVersionLabel(copyFromVersion, latestVersionNumber) : undefined
        }
        rename={
          activeVersionSummary && {
            name: deckVersionLabel(activeVersionSummary, activeVersionSummary.versionNumber),
            note: activeVersionSummary.note ?? "",
            notesLocked: !view.premium,
          }
        }
        onChoose={(versionId) => {
          chooseVersion(versionId)
          setDialog("none")
        }}
        onNew={detail || view.canQueueVersions ? startNewVersion : undefined}
        onCreate={submitNewVersion}
        onManage={
          view.canManageVersion
            ? () => {
                if (!draft.editing) pinVersionTarget()
                setDialog("renameVersion")
              }
            : undefined
        }
        onRename={submitRenameVersion}
        onDelete={view.canDeleteVersion ? startDeleteVersion : undefined}
        onConfirmDelete={confirmDeleteVersion}
        onClose={() => setDialog("none")}
      />

      {dialogs.shown === "moveDeck" ? (
        <DialogCard
          visible
          onClose={() => setDialog("none")}
          closeDisabled={busy}
          backdropAccessibilityLabel={translate("common:cancel")}
          dialogTestID="move-deck-dialog"
          dialogAccessibilityRole="alert"
          accessibilityViewIsModal
        >
          <Text
            preset="subheading"
            tx="decks:deckLimit.confirmTitle"
            txOptions={{ name: deck.name }}
            style={themed($dialogText)}
          />
          <Text size="sm" tx="decks:deckLimit.moveBody" style={themed($dialogText)} />
          {error ? <AlertNote text={error} /> : null}
          <View style={themed($dialogActions)}>
            <Button
              tx="common:cancel"
              style={themed($dialogButton)}
              disabled={busy}
              onPress={() => setDialog("none")}
            />
            <Button
              tx={busy ? "decks:deckLimit.moving" : "decks:deckLimit.move"}
              testID="move-deck-confirm"
              preset="primary"
              style={themed($dialogButton)}
              disabled={busy}
              onPress={() => void keepOnDevice()}
            />
          </View>
        </DialogCard>
      ) : null}
      {dialogs.shown === "deleteDeck" ? (
        <DialogCard
          visible
          onClose={() => setDialog("none")}
          closeDisabled={busy}
          backdropTestID="delete-deck-backdrop"
          backdropAccessibilityLabel={translate("decks:detail.keepDeck")}
          dialogTestID="delete-deck-dialog"
          dialogAccessibilityRole="alert"
          accessibilityViewIsModal
        >
          <Text preset="subheading" tx="decks:detail.deleteDeckTitle" style={themed($dialogText)} />
          <Text size="sm" tx="decks:deleteDeck.body" style={themed($dialogText)} />
          {error ? <AlertNote text={error} /> : null}
          <View style={themed($dialogActions)}>
            <Button
              tx="common:cancel"
              style={themed($dialogButton)}
              disabled={busy}
              onPress={() => setDialog("none")}
            />
            <Button
              tx="common:delete"
              testID="delete-deck-confirm"
              preset="destructive"
              style={themed($dialogButton)}
              disabled={busy}
              onPress={deleteDeck}
            />
          </View>
        </DialogCard>
      ) : null}
    </Screen>
  )
}

const $screen: ThemedStyle<ViewStyle> = () => ({ flex: 1, width: "100%" })

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

const $syncFailure: ThemedStyle<ViewStyle> = ({ spacing }) => ({ gap: spacing.xs })

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
