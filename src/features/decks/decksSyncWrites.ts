import { useEffect, useMemo } from "react"
import { randomUUID } from "expo-crypto"
import { useValue } from "@legendapp/state/react"
import { useConvex, type ConvexReactClient } from "convex/react"
import type { FunctionArgs } from "convex/server"
import { ConvexError } from "convex/values"

import { drainOutbox } from "@/features/sync/drainOutbox"
import {
  DurableOutbox,
  type DurableFailedRecord,
  type DurableOutboxCodec,
  type DurableOutboxKeys,
  type DurablePendingRecord,
  type DurableStringStorage,
} from "@/features/sync/durableOutbox"
import { createOutboxController, type OutboxController } from "@/features/sync/outboxController"
import { convexErrorCode, convexErrorMessage } from "@/utils/convexError"
import { storage } from "@/utils/storage"

import {
  DeckSyncRepository,
  getDeckSyncController,
  scopedOwnerId,
  type DeckSyncController,
  type SyncedDeck,
} from "./decksSync"
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

const SCOPE = "metadata"
const RETRY_DELAY_MS = 2_000
export const DECK_CONFLICT_REASON = "Deck changed on another device. Choose which version to keep."
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

function outboxKeys(deploymentUrl?: string): DurableOutboxKeys {
  return {
    pendingIndex: (_scope, owner) =>
      `scryve.decks.pending.v1.${scopedOwnerId(owner, deploymentUrl)}`,
    pendingRecord: (_scope, operationId, owner) =>
      `scryve.decks.pendingRecord.v1.${scopedOwnerId(owner, deploymentUrl)}.${operationId}`,
    failedIndex: (_scope, owner) => `scryve.decks.failed.v1.${scopedOwnerId(owner, deploymentUrl)}`,
    failedRecord: (_scope, operationId, owner) =>
      `scryve.decks.failedRecord.v1.${scopedOwnerId(owner, deploymentUrl)}.${operationId}`,
  }
}

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
    value.deleted !== false ||
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

const codec: DurableOutboxCodec<PendingDeckWrite, FailedDeckWrite> = {
  parsePending,
  parseFailed,
  createFailure: (action, reason, failedAt) => ({ schemaVersion: 1, action, reason, failedAt }),
  operationId: (action) => action.operationId,
  belongsToScope: (action, ownerId, scope) => action.ownerId === ownerId && scope === SCOPE,
  compare: (left, right) =>
    left.expectedRevision - right.expectedRevision ||
    left.queuedAt - right.queuedAt ||
    left.operationId.localeCompare(right.operationId),
}

export class DeckSyncWriteRepository {
  private readonly outbox: DurableOutbox<PendingDeckWrite, FailedDeckWrite>
  private readonly metadata: DeckSyncRepository

  constructor(
    readonly ownerId: string,
    local: DurableStringStorage = storage,
    deploymentUrl?: string,
  ) {
    this.outbox = new DurableOutbox(local, ownerId, outboxKeys(deploymentUrl), codec)
    this.metadata = new DeckSyncRepository(ownerId, local, deploymentUrl)
  }

  loadMetadata() {
    return this.metadata.loadMetadata()
  }

  mergeMetadata(decks: readonly SyncedDeck[]) {
    return this.metadata.mergeMetadata(decks)
  }

  enqueue(action: PendingDeckWrite, current?: readonly PendingDeckWrite[]) {
    return this.outbox.enqueue(action, SCOPE, current)
  }

  loadPending() {
    return this.outbox.loadPending(SCOPE)
  }

  updateAttempt(operationId: string, attemptedAt: number) {
    return this.outbox.updateAttempt(SCOPE, operationId, attemptedAt)
  }

  acknowledge(operationId: string) {
    this.outbox.acknowledge(SCOPE, operationId)
  }

  failAction(
    action: PendingDeckWrite,
    reason: string,
    failedAt: number,
    currentFailed: readonly FailedDeckWrite[],
    currentPending: readonly PendingDeckWrite[],
  ) {
    return this.outbox.failAction(action, SCOPE, reason, failedAt, currentFailed, currentPending)
  }

  loadFailed() {
    return this.outbox.loadFailed(SCOPE)
  }

  dismissFailed(operationId: string) {
    this.outbox.dismissFailed(SCOPE, operationId)
  }
}

export class DeckMetadataWriteController {
  private readonly outbox: OutboxController<DeckSyncWriteSnapshot>
  private unsubscribeReads: (() => void) | undefined
  private stopReads: (() => void) | undefined

  constructor(
    private readonly client: Pick<ConvexReactClient, "mutation">,
    private readonly repository: DeckSyncWriteRepository,
    private readonly now: () => number = Date.now,
    private readonly reads?: DeckSyncController,
  ) {
    this.outbox = createOutboxController({
      snapshot: ({ capacityBlocked }) => this.buildSnapshot(capacityBlocked),
      drain: (shouldContinue) => this.drainOnce(shouldContinue),
      retryDelay: (result) =>
        Math.min(60_000, RETRY_DELAY_MS * 2 ** Math.min(result.pending[0]?.attempts ?? 0, 5)),
      onResult: () => this.outbox.publish(),
      onStart: () => {
        this.unsubscribeReads = this.reads?.subscribe(() => this.outbox.publish())
        this.stopReads = this.reads?.start()
      },
      onStop: () => {
        this.unsubscribeReads?.()
        this.stopReads?.()
        this.unsubscribeReads = undefined
        this.stopReads = undefined
      },
    })
  }

  get state$() {
    return this.outbox.state$
  }

  get subscribe() {
    return this.outbox.subscribe
  }

  get getSnapshot() {
    return this.outbox.getSnapshot
  }

  private get snapshot() {
    return this.outbox.getSnapshot()
  }

  start(): () => void {
    return this.outbox.start()
  }

  stop(): void {
    this.outbox.stop()
  }

  update(deckId: string, patch: DeckMetadataPatch, expectedRevision?: number): void {
    if (this.outbox.capacityBlocked)
      throw new Error("Sync paused. Resolve a saved local edit before making more changes.")
    if (this.snapshot.failures.some((failure) => failure.action.deckId === deckId))
      throw new Error("Resolve the saved local edit before making another change")
    this.enqueue(deckId, patch, expectedRevision)
    void this.drain()
  }

  private enqueue(
    deckId: string,
    patch: DeckMetadataPatch,
    expectedRevision?: number,
    supersedes?: string[],
  ): void {
    this.outbox.publish()
    const current = this.snapshot.metadata.find((deck) => deck.deckId === deckId && !deck.deleted)
    if (!current) throw new Error("Deck metadata is not available on this device")
    const now = this.now()
    const action: PendingDeckWrite = {
      schemaVersion: 1,
      ownerId: this.repository.ownerId,
      deckId: deckId as SyncedDeck["deckId"],
      id: current.id,
      operationId: randomUUID(),
      expectedRevision: expectedRevision ?? current.revision,
      name: assertDeckName(patch.name ?? current.name),
      format: assertDeckFormat(patch.format ?? current.format),
      game: current.game,
      note: assertDeckNote(patch.note ?? current.note),
      deleted: false,
      queuedAt: now,
      attempts: 0,
      ...(supersedes ? { supersedes } : {}),
    }
    const result = this.repository.enqueue(action, this.snapshot.pending)
    if (!result.accepted)
      throw new Error("The offline deck queue is full. Reconnect before making more changes.")
    this.outbox.publish()
  }

  discardFailure(operationId: string): void {
    const failure = this.snapshot.failures.find((entry) => entry.action.operationId === operationId)
    if (!failure) return
    for (const entry of this.snapshot.failures)
      if (entry.action.deckId === failure.action.deckId)
        this.repository.dismissFailed(entry.action.operationId)
    this.outbox.unblock()
    this.outbox.publish()
    void this.drain()
  }

  reapplyFailure(operationId: string): void {
    const failure = this.snapshot.failures.find((entry) => entry.action.operationId === operationId)
    if (!failure) return
    if (this.snapshot.pending.some((action) => action.deckId === failure.action.deckId))
      throw new Error("Wait for pending changes before resolving this edit")
    const related = this.snapshot.failures.filter(
      (entry) => entry.action.deckId === failure.action.deckId,
    )
    const latest = related.reduce((left, right) =>
      right.action.queuedAt > left.action.queuedAt ||
      (right.action.queuedAt === left.action.queuedAt &&
        right.action.expectedRevision > left.action.expectedRevision)
        ? right
        : left,
    )
    const { deckId, name, format, note } = latest.action
    this.enqueue(
      deckId,
      { name, format, note },
      undefined,
      related.map((entry) => entry.action.operationId),
    )
    this.discardFailure(operationId)
    void this.drain()
  }

  drain(): Promise<void> {
    return this.outbox.drain()
  }

  private drainOnce(shouldContinue: () => boolean) {
    return drainOutbox({
      repository: this.repository,
      currentFailures: () => this.repository.loadFailed(),
      operationId: (action) => action.operationId,
      classifyFailure: (cause) => {
        const code = convexErrorCode(cause)
        if (code === "sync_conflict")
          return { kind: "reject" as const, reason: DECK_CONFLICT_REASON }
        return code && permanentErrors.has(code)
          ? {
              kind: "reject" as const,
              reason: convexErrorMessage(cause, "Could not sync this edit"),
            }
          : { kind: "retry" as const }
      },
      send: async (action) => {
        for (const id of action.supersedes ?? []) this.repository.dismissFailed(id)
        if (this.repository.loadFailed().some((failure) => failure.action.deckId === action.deckId))
          throw new ConvexError({
            code: "sync_conflict",
            message: DECK_CONFLICT_REASON,
          })
        const result = await this.client.mutation(api.decks.syncWrite, {
          id: action.id,
          operationId: action.operationId,
          expectedOwnerId: this.repository.ownerId,
          returnConflict: true,
          expectedRevision: action.expectedRevision,
          name: action.name,
          format: action.format,
          game: action.game,
          note: action.note,
          deleted: false,
        })
        const deck = "status" in result ? result.deck : result
        if (this.reads) this.reads.acceptMetadata([deck])
        else this.repository.mergeMetadata([deck])
        if ("status" in result)
          throw new ConvexError({
            code: "sync_conflict",
            message: DECK_CONFLICT_REASON,
          })
        return { operationId: action.operationId }
      },
      shouldContinue,
      onChange: () => this.outbox.publish(),
    })
  }

  private buildSnapshot(capacityBlocked: boolean): DeckSyncWriteSnapshot {
    const pending = this.repository.loadPending()
    const byId = new Map<string, SyncedDeck>(
      this.repository.loadMetadata().map((deck) => [deck.deckId, deck]),
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
    return {
      metadata: [...byId.values()],
      pending,
      failures: this.repository.loadFailed(),
      capacityBlocked,
    }
  }
}

const controllers = new WeakMap<object, Map<string, DeckMetadataWriteController>>()

export function getDeckMetadataWriteController(
  client: Pick<ConvexReactClient, "mutation" | "query" | "watchQuery" | "url">,
  ownerId: string,
  repository = new DeckSyncWriteRepository(ownerId, storage, client.url),
) {
  let byOwner = controllers.get(client)
  if (!byOwner) {
    byOwner = new Map()
    controllers.set(client, byOwner)
  }
  const existing = byOwner.get(ownerId)
  if (existing) return existing
  const controller = new DeckMetadataWriteController(
    client,
    repository,
    Date.now,
    getDeckSyncController(client, ownerId),
  )
  byOwner.set(ownerId, controller)
  return controller
}

const emptySnapshot: DeckSyncWriteSnapshot = {
  metadata: [],
  pending: [],
  failures: [],
  capacityBlocked: false,
}

export function useDeckMetadataWrites(enabled: boolean, ownerId?: string) {
  const client = useConvex()
  const controller = useMemo(
    () => (enabled && ownerId ? getDeckMetadataWriteController(client, ownerId) : undefined),
    [client, enabled, ownerId],
  )
  useEffect(() => controller?.start(), [controller])
  const snapshot = useValue(() => controller?.state$.get() ?? emptySnapshot)
  return {
    ...snapshot,
    update: (deckId: string, patch: DeckMetadataPatch, expectedRevision?: number) =>
      controller?.update(deckId, patch, expectedRevision),
    discardFailure: (operationId: string) => controller?.discardFailure(operationId),
    reapplyFailure: (operationId: string) => controller?.reapplyFailure(operationId),
  }
}
