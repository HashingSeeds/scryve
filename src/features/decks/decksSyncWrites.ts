import { useEffect, useMemo } from "react"
import { randomUUID } from "expo-crypto"
import { useValue } from "@legendapp/state/react"
import { useConvex, type ConvexReactClient } from "convex/react"
import type { FunctionArgs } from "convex/server"
import { ConvexError } from "convex/values"

import {
  type DurableFailedRecord,
  type DurableOutboxCodec,
  type DurablePendingRecord,
  type DurableStringStorage,
  type FieldName,
} from "@/features/sync/durableOutbox"
import { createOutbox, type Outbox, type OutboxSender } from "@/features/sync/outbox"
import { createSnapshotStore, type SnapshotStore } from "@/features/sync/snapshotStore"
import { translate } from "@/i18n/translate"
import { convexErrorCode, convexErrorMessage, isArgumentValidationError } from "@/utils/convexError"
import { storage } from "@/utils/storage"

import {
  DeckSyncRepository,
  getDeckSyncController,
  scopedOwnerId,
  type DeckSyncController,
  type SyncedDeck,
} from "./decksSync"
import { DECK_CONFLICT_REASON, DECK_REJECTED_REASON } from "./deckSyncReasons"
import { api } from "../../../convex/_generated/api"
import { assertDeckName, assertDeckFormat, assertDeckNote } from "../../../convex/lib/policy"

type SyncWriteArgs = FunctionArgs<typeof api.decks.syncWrite>

export interface DeckMetadataPatch {
  name?: string
  format?: string
  note?: string
}

export interface PendingDeckWrite extends DurablePendingRecord, SyncWriteArgs {
  schemaVersion: 1
  ownerId: string
  deckId: SyncedDeck["deckId"]
  supersedes?: string[]
}

export interface FailedDeckWrite extends DurableFailedRecord<PendingDeckWrite> {
  schemaVersion: 1
}

export interface DeckSyncWriteSnapshot {
  metadata: SyncedDeck[]
  pending: PendingDeckWrite[]
  failures: FailedDeckWrite[]
  capacityBlocked: boolean
}

export { DECK_CONFLICT_REASON, DECK_REJECTED_REASON }

const permanentErrors = new Set([
  "sync_conflict",
  "sync_operation_mismatch",
  "deck_not_found",
  "deck_archived",
  "deck_already_archived",
  "invalid_operation_id",
  "invalid_revision",
  "invalid_sync_id",
  "deck_game_immutable",
  "unknown_game",
  "game_unavailable",
  "unknown_format",
  "capability_unavailable",
  "deck_limit_reached",
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function parsePending(value: unknown): PendingDeckWrite | null {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    typeof value.ownerId !== "string" ||
    typeof value.deckId !== "string" ||
    typeof value.id !== "string" ||
    typeof value.operationId !== "string" ||
    !Number.isSafeInteger(value.expectedRevision) ||
    typeof value.name !== "string" ||
    typeof value.format !== "string" ||
    typeof value.game !== "string" ||
    typeof value.note !== "string" ||
    typeof value.deleted !== "boolean" ||
    typeof value.queuedAt !== "number" ||
    !Number.isSafeInteger(value.attempts) ||
    (value.lastAttemptAt !== undefined && typeof value.lastAttemptAt !== "number") ||
    (value.supersedes !== undefined &&
      (!Array.isArray(value.supersedes) || !value.supersedes.every((id) => typeof id === "string")))
  )
    return null
  return value as unknown as PendingDeckWrite
}

function parseFailed(value: unknown): FailedDeckWrite | null {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    typeof value.reason !== "string" ||
    typeof value.failedAt !== "number"
  )
    return null
  const action = parsePending(value.action)
  const reason =
    value.reason === "Deck changed on another device" ||
    value.reason === "An earlier edit conflicted. Choose which version to keep."
      ? DECK_CONFLICT_REASON
      : value.reason
  return action ? { schemaVersion: 1, action, reason, failedAt: value.failedAt } : null
}

const fieldNames: Record<FieldName<PendingDeckWrite>, true> = {
  schemaVersion: true,
  queuedAt: true,
  attempts: true,
  lastAttemptAt: true,
  ownerId: true,
  deckId: true,
  supersedes: true,
  id: true,
  operationId: true,
  expectedOwnerId: true,
  returnConflict: true,
  expectedRevision: true,
  name: true,
  format: true,
  game: true,
  note: true,
  deleted: true,
  deckKey: true,
}

const codec: DurableOutboxCodec<PendingDeckWrite, FailedDeckWrite> = {
  knownKeys: Object.keys(fieldNames),
  parsePending,
  parseFailed,
  createFailure: (action, reason, failedAt) => ({ schemaVersion: 1, action, reason, failedAt }),
  operationId: (action) => action.operationId,
  compare: (left, right) =>
    left.expectedRevision - right.expectedRevision ||
    left.queuedAt - right.queuedAt ||
    left.operationId.localeCompare(right.operationId),
}

export type DeckWriteOutbox = Outbox<PendingDeckWrite, FailedDeckWrite>

export function deckWriteOutbox(
  ownerId: string,
  local: DurableStringStorage = storage,
  deploymentUrl?: string,
  sender?: OutboxSender<PendingDeckWrite>,
): DeckWriteOutbox {
  const owner = scopedOwnerId(ownerId, deploymentUrl)
  return createOutbox({
    storage: local,
    keys: {
      pendingIndex: `scryve.decks.pending.v1.${owner}`,
      pendingRecordPrefix: `scryve.decks.pendingRecord.v1.${owner}.`,
      failedIndex: `scryve.decks.failed.v1.${owner}`,
      failedRecordPrefix: `scryve.decks.failedRecord.v1.${owner}.`,
    },
    codec,
    owns: (action) => action.ownerId === ownerId,
    sender,
  })
}

export interface DeckWriteOptions {
  storage?: DurableStringStorage
  deploymentUrl?: string
  now?: () => number
  reads?: DeckSyncController
}

function rejectReason(cause: unknown): string | undefined {
  const code = convexErrorCode(cause)
  if (code === "sync_conflict") return DECK_CONFLICT_REASON
  if (isArgumentValidationError(cause)) return DECK_REJECTED_REASON
  return code && permanentErrors.has(code)
    ? convexErrorMessage(cause, translate("decks:sync.editFailed"))
    : undefined
}

export class DeckMetadataWriteController {
  private readonly outbox: DeckWriteOutbox
  private readonly cache: DeckSyncRepository
  private readonly store: SnapshotStore<DeckSyncWriteSnapshot>
  private readonly now: () => number
  private readonly reads?: DeckSyncController

  constructor(
    private readonly client: Pick<ConvexReactClient, "mutation">,
    readonly ownerId: string,
    { storage: local = storage, deploymentUrl, now = Date.now, reads }: DeckWriteOptions = {},
  ) {
    this.now = now
    this.reads = reads
    this.cache = new DeckSyncRepository(ownerId, local, deploymentUrl)
    this.outbox = deckWriteOutbox(ownerId, local, deploymentUrl, {
      send: (action) => this.send(action),
      rejectReason,
    })
    this.store = createSnapshotStore(this.buildSnapshot())
    this.outbox.state$.onChange(() => this.publish())
    reads?.subscribe(() => this.publish())
  }

  get state$() {
    return this.store.state$
  }

  getSnapshot(): DeckSyncWriteSnapshot {
    return this.store.getSnapshot()
  }

  start(): () => void {
    const stopReads = this.reads?.start()
    this.publish()
    const stopOutbox = this.outbox.start()
    return () => {
      stopOutbox()
      stopReads?.()
    }
  }

  update(deckId: string, patch: DeckMetadataPatch, expectedRevision?: number): void {
    this.assertWritable(deckId)
    this.enqueue(deckId, patch, expectedRevision)
  }

  remove(deckId: string): void {
    this.assertWritable(deckId)
    this.enqueue(deckId, { deleted: true })
  }

  private assertWritable(deckId: string) {
    const { capacityBlocked, failures } = this.outbox.getState()
    if (capacityBlocked)
      throw new Error("Sync paused. Resolve a saved local edit before making more changes.")
    if (failures.some((failure) => failure.action.deckId === deckId))
      throw new Error("Resolve the saved local edit before making another change")
  }

  private enqueue(
    deckId: string,
    patch: DeckMetadataPatch & { deleted?: boolean },
    expectedRevision?: number,
    supersedes?: string[],
  ): void {
    this.publish()
    const current = this.getSnapshot().metadata.find(
      (deck) => deck.deckId === deckId && !deck.deleted,
    )
    if (!current) throw new Error("Deck metadata is not available on this device")
    const now = this.now()
    const action: PendingDeckWrite = {
      schemaVersion: 1,
      ownerId: this.ownerId,
      deckId: deckId as SyncedDeck["deckId"],
      id: current.id,
      operationId: randomUUID(),
      expectedRevision: expectedRevision ?? current.revision,
      name: assertDeckName(patch.name ?? current.name),
      format: assertDeckFormat(patch.format ?? current.format),
      game: current.game,
      note: assertDeckNote(patch.note ?? current.note),
      deleted: patch.deleted ?? false,
      queuedAt: now,
      attempts: 0,
      ...(supersedes ? { supersedes } : {}),
    }
    if (!this.outbox.enqueue(action))
      throw new Error("The offline deck queue is full. Reconnect before making more changes.")
  }

  discardFailure(operationId: string): void {
    const { failures } = this.getSnapshot()
    const failure = failures.find((entry) => entry.action.operationId === operationId)
    if (!failure) return
    for (const entry of failures)
      if (entry.action.deckId === failure.action.deckId)
        this.outbox.dismiss(entry.action.operationId)
  }

  reapplyFailure(operationId: string): void {
    const { failures, pending } = this.getSnapshot()
    const failure = failures.find((entry) => entry.action.operationId === operationId)
    if (!failure) return
    if (pending.some((action) => action.deckId === failure.action.deckId))
      throw new Error("Wait for pending changes before resolving this edit")
    const related = failures.filter((entry) => entry.action.deckId === failure.action.deckId)
    const latest = related.reduce((left, right) =>
      right.action.queuedAt > left.action.queuedAt ||
      (right.action.queuedAt === left.action.queuedAt &&
        right.action.expectedRevision > left.action.expectedRevision)
        ? right
        : left,
    )
    const { deckId, name, format, note, deleted } = latest.action
    this.enqueue(
      deckId,
      { name, format, note, deleted },
      undefined,
      related.map((entry) => entry.action.operationId),
    )
    this.discardFailure(operationId)
  }

  drain(): Promise<void> {
    return this.outbox.drain()
  }

  private async send(action: PendingDeckWrite) {
    for (const id of action.supersedes ?? []) this.outbox.dismiss(id)
    const failed = this.outbox
      .getState()
      .failures.filter((failure) => failure.action.deckId === action.deckId)
    if (action.deleted)
      for (const failure of failed) this.outbox.dismiss(failure.action.operationId)
    else if (failed.length)
      throw new ConvexError({
        code: "sync_conflict",
        message: DECK_CONFLICT_REASON,
      })
    const write = {
      id: action.id,
      operationId: action.operationId,
      expectedOwnerId: this.ownerId,
      returnConflict: true,
      expectedRevision: action.expectedRevision,
      name: action.name,
      format: action.format,
      game: action.game,
      note: action.note,
      deleted: action.deleted,
    }
    let result = await this.client.mutation(api.decks.syncWrite, write)
    if (action.deleted && "status" in result && !result.deck.deleted)
      result = await this.client.mutation(api.decks.syncWrite, {
        ...write,
        operationId: randomUUID(),
        expectedRevision: result.deck.revision,
      })
    const deck = "status" in result ? result.deck : result
    if (this.reads) this.reads.acceptMetadata([deck])
    else this.cache.mergeMetadata([deck])
    if ("status" in result && !(action.deleted && deck.deleted))
      throw new ConvexError({
        code: "sync_conflict",
        message: DECK_CONFLICT_REASON,
      })
    return { operationId: action.operationId }
  }

  private publish(): void {
    this.store.set(this.buildSnapshot())
  }

  private buildSnapshot(): DeckSyncWriteSnapshot {
    const { pending, failures, capacityBlocked } = this.outbox.getState()
    const byId = new Map<string, SyncedDeck>(
      this.cache.loadMetadata().map((deck) => [deck.deckId, deck]),
    )
    for (const action of pending) {
      const current = byId.get(action.deckId)
      if (!current || action.expectedRevision < current.revision) continue
      byId.set(action.deckId, {
        id: action.id,
        deckId: action.deckId as SyncedDeck["deckId"],
        revision: action.expectedRevision + 1,
        name: action.name,
        format: action.format,
        game: action.game,
        note: action.note,
        deleted: action.deleted,
        createdAt: current.createdAt,
        updatedAt: action.queuedAt,
      })
    }
    return { metadata: [...byId.values()], pending, failures, capacityBlocked }
  }
}

const controllers = new WeakMap<object, Map<string, DeckMetadataWriteController>>()

export function getDeckMetadataWriteController(
  client: Pick<ConvexReactClient, "mutation" | "query" | "watchQuery" | "url">,
  ownerId: string,
) {
  let byOwner = controllers.get(client)
  if (!byOwner) {
    byOwner = new Map()
    controllers.set(client, byOwner)
  }
  const existing = byOwner.get(ownerId)
  if (existing) return existing
  const controller = new DeckMetadataWriteController(client, ownerId, {
    deploymentUrl: client.url,
    reads: getDeckSyncController(client, ownerId),
  })
  byOwner.set(ownerId, controller)
  return controller
}

const emptySnapshot: DeckSyncWriteSnapshot = {
  metadata: [],
  pending: [],
  failures: [],
  capacityBlocked: false,
}

export function useDeckMetadataWrites(
  enabled: boolean,
  ownerId: string | undefined,
  ready: boolean,
) {
  const client = useConvex()
  const controller = useMemo(
    () => (enabled && ownerId ? getDeckMetadataWriteController(client, ownerId) : undefined),
    [client, enabled, ownerId],
  )
  useEffect(() => (ready ? controller?.start() : undefined), [controller, ready])
  const snapshot = useValue(() => controller?.state$.get() ?? emptySnapshot)
  return {
    ...snapshot,
    update: (deckId: string, patch: DeckMetadataPatch, expectedRevision?: number) =>
      controller?.update(deckId, patch, expectedRevision),
    discardFailure: (operationId: string) => controller?.discardFailure(operationId),
    reapplyFailure: (operationId: string) => controller?.reapplyFailure(operationId),
    remove: (deckId: string) => controller?.remove(deckId),
  }
}
