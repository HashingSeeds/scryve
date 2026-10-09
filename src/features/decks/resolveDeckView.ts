import type { FunctionReturnType } from "convex/server"

import { getCommanderWarnings, type CommanderSelectionDetails } from "./commanderSelection"
import { cardDetailsKey, printingKey, type DeckCard } from "./deckCards"
import { canChooseCommander, draftChanges, type DeckDraft } from "./deckDraft"
import type { SyncedDeck } from "./decksSync"
import type { DeckSyncWriteSnapshot } from "./decksSyncWrites"
import type { DeckVersionWriteSnapshot, PendingVersionWrite } from "./decksVersionWrites"
import {
  DECK_CONFLICT_REASON,
  DECK_VERSION_CONFLICT_REASON,
  DECK_VERSION_QUEUE_CONFLICT_REASON,
} from "./deckSyncReasons"
import type { DeckVersionCacheSnapshot, StoredVersion } from "./deckVersionsCache"
import type { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { deckFormatLabel } from "../../../convex/lib/deckGames"

type DeckDetail = FunctionReturnType<typeof api.decks.detail>
type StoredCardRow = { _id?: unknown; _creationTime?: unknown; deckVersionId?: unknown }

export type DeckViewInput = {
  deckId: string
  detail: DeckDetail | undefined
  draft: DeckDraft
  sync: { enabled: boolean; ownerId?: string }
  syncedMetadata: readonly SyncedDeck[]
  metadataWrites: DeckSyncWriteSnapshot
  versionWrites: DeckVersionWriteSnapshot & { mappedVersion: (versionId: string) => string }
  versionCache: DeckVersionCacheSnapshot
  selectedVersionId: string | undefined
  // why: card details live in device storage, so they are read only when commander warnings need them.
  loadCardDetails: () => Record<string, CommanderSelectionDetails>
}

const UNSAFE_FAILURE_REASON = /\[CONVEX|Server Error|ArgumentValidationError|\n/i

export function mergedPrintings(cards: readonly DeckCard[]) {
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

function deckCardsFromRows(rows: readonly (DeckCard & StoredCardRow)[]) {
  return mergedPrintings(
    rows.map(({ _id: _, _creationTime: __, deckVersionId: ___, ...card }) => card),
  )
}

export function isDeckKnownDeleted(
  deckId: string,
  ...lists: readonly (readonly { deckId: string; deleted?: boolean }[])[]
) {
  return lists.some((list) => list.some((deck) => deck.deckId === deckId && deck.deleted))
}

/** why: a provisional offline version has no server row yet, so the query reads the default until it is acknowledged. */
export function deckQueryVersionId(
  selectedVersionId: string | undefined,
  mappedSelection: string | undefined,
  cachedVersions: readonly StoredVersion[],
) {
  const provisional =
    selectedVersionId !== undefined &&
    mappedSelection === selectedVersionId &&
    cachedVersions.some((candidate) => candidate.versionId === selectedVersionId && candidate.local)
  return mappedSelection === undefined || provisional
    ? undefined
    : (mappedSelection as Id<"deckVersions">)
}

function newestPendingCardWrite(
  input: DeckViewInput,
  overlayVersionId: string | undefined,
): PendingVersionWrite | undefined {
  const { versionWrites, deckId } = input
  const overlayIds = new Set<string>()
  if (overlayVersionId) {
    overlayIds.add(overlayVersionId)
    overlayIds.add(versionWrites.mappedVersion(overlayVersionId))
  }
  return versionWrites.pending
    .filter((write) => write.deckId === deckId && (write.op ?? "cards") === "cards")
    .filter(
      (write) =>
        overlayIds.has(write.versionId) ||
        overlayIds.has(versionWrites.mappedVersion(write.versionId)),
    )
    .reduce<PendingVersionWrite | undefined>(
      (newest, action) =>
        !newest || action.expectedRevision > newest.expectedRevision ? action : newest,
      undefined,
    )
}

/** why: cards resolve as the open draft, then the newest pending write, then the live server list, then the device cache. */
export function resolveDeckView(input: DeckViewInput) {
  const { deckId, detail, draft, sync, metadataWrites, versionWrites, versionCache } = input
  const { selectedVersionId } = input
  const knownDeleted = isDeckKnownDeleted(deckId, input.syncedMetadata, metadataWrites.metadata)
  const mappedSelection =
    selectedVersionId !== undefined ? versionWrites.mappedVersion(selectedVersionId) : undefined

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
  const localMetadata = metadataWrites.metadata.find(
    (deck) => deck.deckId === deckId && !deck.deleted,
  )
  const optimisticMetadata = pendingMetadata.length ? localMetadata : undefined
  const cachedMetadata = sync.enabled
    ? (optimisticMetadata ??
      input.syncedMetadata.find((deck) => deck.deckId === deckId && !deck.deleted) ??
      localMetadata)
    : undefined
  const deck = optimisticMetadata ?? detail?.deck ?? cachedMetadata ?? failedEdit?.action
  const accountMetadata = localMetadata ?? cachedMetadata ?? detail?.deck
  const canQueueMetadata = Boolean(
    sync.enabled && sync.ownerId && metadataWrites.metadata.some((item) => item.deckId === deckId),
  )
  // why: card and version lifecycle writes queue for any signed-in device with sync on.
  const canQueueVersions = sync.enabled && Boolean(sync.ownerId)

  const cachedVersion = versionCache.version
  const staleSelection = selectedVersionId !== undefined && detail?.version?._id !== mappedSelection
  const version = staleSelection ? undefined : (detail?.version ?? undefined)
  const activeVersionId = version?._id ?? cachedVersion?.versionId
  const storedCards = version ? deckCardsFromRows(detail?.cards ?? []) : []
  const cachedCards =
    (detail === undefined || staleSelection) && versionCache.cards !== undefined
      ? deckCardsFromRows(versionCache.cards)
      : undefined
  const versionTarget = version
    ? { versionId: version._id, expectedRevision: version.syncRevision ?? 0 }
    : cachedVersion && versionCache.cards !== undefined
      ? {
          versionId: cachedVersion.versionId as Id<"deckVersions">,
          expectedRevision: cachedVersion.revision,
        }
      : undefined
  const pendingCardWrite = newestPendingCardWrite(input, selectedVersionId ?? activeVersionId)
  const displayCards = pendingCardWrite
    ? mergedPrintings(pendingCardWrite.cards as DeckCard[])
    : storedCards.length > 0
      ? storedCards
      : (cachedCards ?? storedCards)
  const cardsUnavailable = !detail && cachedCards === undefined && !pendingCardWrite
  const cards = draft.editing ? draft.cards : displayCards
  const cardsCached = draft.editing
    ? versionTarget
      ? false
      : draft.fromCache
    : cachedCards !== undefined
  const game = deck?.game ?? "mtg"
  const commanderWarnings = draft.commanderSelected
    ? getCommanderWarnings(cards, (card) => input.loadCardDetails()[cardDetailsKey(card, game)])
    : []

  const versionSummary = detail?.versions.find((candidate) => candidate._id === version?._id)
  const activeVersionSummary =
    versionSummary ??
    versionCache.versions.find((candidate) => candidate.versionId === activeVersionId)
  const liveCachedVersions = versionCache.versions.filter((candidate) => !candidate.deleted)
  const cachedVersionRows = liveCachedVersions.map((candidate) => ({
    _id: candidate.versionId as Id<"deckVersions">,
    versionNumber: candidate.versionNumber,
    name: candidate.name,
    note: candidate.note,
    cardCount: candidate.cardCount,
    cardQuantity: candidate.cardQuantity,
    record: undefined,
  }))

  const versionConflict = failedEdit?.reason === DECK_CONFLICT_REASON
  const versionCardConflict =
    failedCardEdit?.reason === DECK_VERSION_CONFLICT_REASON ||
    failedCardEdit?.reason === DECK_VERSION_QUEUE_CONFLICT_REASON
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
    (failedCardEdit && !UNSAFE_FAILURE_REASON.test(failedCardEdit.reason)
      ? failedCardEdit.reason
      : failedEdit && !UNSAFE_FAILURE_REASON.test(failedEdit.reason)
        ? failedEdit.reason
        : undefined) ?? "This edit could not be synced. Try again or discard it."
  const saveStatus =
    sync.enabled && sync.ownerId
      ? failedEdit || failedCardEdit
        ? "Local edit not synced"
        : metadataWrites.capacityBlocked || versionWrites.capacityBlocked
          ? "Sync paused. Resolve a saved local edit to continue."
          : pendingMetadata.length || pendingCards.length
            ? "Saved locally · Pending sync"
            : "Synced"
      : undefined

  return {
    deck,
    knownDeleted,
    accountMetadata,
    currentMetadataRevision: localMetadata?.revision,
    canQueueMetadata,
    canQueueVersions,
    version,
    activeVersionId,
    versionTarget,
    displayCards,
    cards,
    cardsUnavailable,
    cardsCached,
    // why: a new version copies what this device shows, so it is absent until some card list is known.
    versionCapture:
      pendingCardWrite || storedCards.length > 0 || cachedCards !== undefined
        ? displayCards
        : undefined,
    changes: draftChanges(draft, deck?.note),
    note: draft.editing ? draft.note : (deck?.note ?? ""),
    singleCommander: deck ? canChooseCommander(deck, cards) : false,
    commanderWarnings,
    activeVersionSummary,
    versionRows: detail?.versions ?? cachedVersionRows,
    hasVersionRows: Boolean(detail) || cachedVersionRows.length > 0,
    canAddVersion:
      detail?.capacity.canCreate === true ||
      (detail === undefined &&
        canQueueVersions &&
        liveCachedVersions.length < (versionCache.capacity?.limit ?? 0)),
    versionLimit: detail?.capacity.limit ?? versionCache.capacity?.limit ?? 0,
    canDeleteVersion: detail
      ? detail.versions.length > 1
      : canQueueVersions && liveCachedVersions.length > 1,
    canManageVersion: Boolean(detail) || (canQueueVersions && activeVersionSummary !== undefined),
    premium: detail?.capacity.premium === true || versionCache.capacity?.premium === true,
    saveStatus,
    failedEdit,
    failedCardEdit,
    failedVersionSnapshot: failedCardEdit
      ? versionCache.versions.find(
          (snapshot) => snapshot.versionId === failedCardEdit.action.versionId,
        )
      : undefined,
    versionConflict,
    versionCardConflict,
    comparedFields,
    failureMessage,
  }
}

export type DeckViewModel = ReturnType<typeof resolveDeckView>
