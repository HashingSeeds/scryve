import { useEffect, useMemo, useSyncExternalStore } from "react"
import { randomUUID } from "expo-crypto"
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
import { convexErrorCode, convexErrorMessage } from "@/utils/convexError"
import { storage } from "@/utils/storage"

import {
  DeckSyncRepository,
  getDeckSyncController,
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
}

const SCOPE = "metadata"
const RETRY_DELAY_MS = 2_000
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

const keys: DurableOutboxKeys = {
  pendingIndex: (_scope, owner) => `scryve.decks.pending.v1.${owner}`,
  pendingRecord: (_scope, operationId, owner) =>
    `scryve.decks.pendingRecord.v1.${owner}.${operationId}`,
  failedIndex: (_scope, owner) => `scryve.decks.failed.v1.${owner}`,
  failedRecord: (_scope, operationId, owner) =>
    `scryve.decks.failedRecord.v1.${owner}.${operationId}`,
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
  return action
    ? { schemaVersion: 1, action, reason: value.reason, failedAt: value.failedAt }
    : null
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
  ) {
    this.outbox = new DurableOutbox(local, ownerId, keys, codec)
    this.metadata = new DeckSyncRepository(ownerId, local)
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
  private readonly listeners = new Set<() => void>()
  private snapshot: DeckSyncWriteSnapshot
  private users = 0
  private draining = false
  private drainAgain = false
  private generation = 0
  private stopReads: (() => void) | undefined
  private unsubscribeReads: (() => void) | undefined
  private retryTimer: ReturnType<typeof setTimeout> | undefined

  constructor(
    private readonly client: Pick<ConvexReactClient, "mutation">,
    private readonly repository: DeckSyncWriteRepository,
    private readonly now: () => number = Date.now,
    private readonly reads?: DeckSyncController,
  ) {
    this.snapshot = this.buildSnapshot()
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getSnapshot = () => this.snapshot

  start(): () => void {
    this.users += 1
    if (this.users === 1) {
      this.generation += 1
      this.unsubscribeReads = this.reads?.subscribe(() => this.publish())
      this.stopReads = this.reads?.start()
      this.publish()
      void this.drain()
    }
    return () => this.stop()
  }

  stop(): void {
    this.users = Math.max(0, this.users - 1)
    if (this.users > 0) return
    this.generation += 1
    this.unsubscribeReads?.()
    this.stopReads?.()
    this.unsubscribeReads = undefined
    this.stopReads = undefined
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = undefined
  }

  update(deckId: string, patch: DeckMetadataPatch, expectedRevision?: number): void {
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
    this.publish()
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
    this.publish()
  }

  discardFailure(operationId: string): void {
    const failure = this.snapshot.failures.find((entry) => entry.action.operationId === operationId)
    if (!failure) return
    for (const entry of this.snapshot.failures)
      if (entry.action.deckId === failure.action.deckId)
        this.repository.dismissFailed(entry.action.operationId)
    this.publish()
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

  async drain(): Promise<void> {
    if (this.draining) {
      this.drainAgain = true
      return
    }
    if (this.users === 0) return
    const generation = this.generation
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = undefined
    this.draining = true
    try {
      const result = await drainOutbox({
        repository: this.repository,
        currentFailures: () => this.repository.loadFailed(),
        operationId: (action) => action.operationId,
        classifyFailure: (cause) => {
          const code = convexErrorCode(cause)
          return code && permanentErrors.has(code)
            ? {
                kind: "reject" as const,
                reason: convexErrorMessage(cause, "Could not sync this edit"),
              }
            : { kind: "retry" as const }
        },
        send: async (action) => {
          for (const id of action.supersedes ?? []) this.repository.dismissFailed(id)
          if (
            this.repository.loadFailed().some((failure) => failure.action.deckId === action.deckId)
          )
            throw new ConvexError({
              code: "sync_conflict",
              message: "An earlier edit conflicted. Choose which version to keep.",
            })
          const deck = await this.client.mutation(api.decks.syncWrite, {
            id: action.id,
            operationId: action.operationId,
            expectedOwnerId: this.repository.ownerId,
            expectedRevision: action.expectedRevision,
            name: action.name,
            format: action.format,
            game: action.game,
            note: action.note,
            deleted: false,
          })
          if (this.reads) this.reads.acceptMetadata([deck])
          else this.repository.mergeMetadata([deck])
          return { operationId: action.operationId }
        },
        shouldContinue: () => generation === this.generation && this.users > 0,
        onChange: () => this.publish(),
      })
      if (result.stoppedForRetry && generation === this.generation && this.users > 0)
        this.retryTimer = setTimeout(
          () => {
            this.retryTimer = undefined
            void this.drain()
          },
          Math.min(60_000, RETRY_DELAY_MS * 2 ** Math.min(result.pending[0]?.attempts ?? 0, 5)),
        )
    } finally {
      this.draining = false
      if (this.drainAgain && this.users > 0) {
        this.drainAgain = false
        void this.drain()
      }
    }
  }

  private buildSnapshot(): DeckSyncWriteSnapshot {
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
    return { metadata: [...byId.values()], pending, failures: this.repository.loadFailed() }
  }

  private publish(): void {
    this.snapshot = this.buildSnapshot()
    for (const listener of this.listeners) listener()
  }
}

const controllers = new WeakMap<object, Map<string, DeckMetadataWriteController>>()

export function getDeckMetadataWriteController(
  client: Pick<ConvexReactClient, "mutation" | "query" | "watchQuery">,
  ownerId: string,
  repository = new DeckSyncWriteRepository(ownerId),
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

const emptySnapshot: DeckSyncWriteSnapshot = { metadata: [], pending: [], failures: [] }

export function useDeckMetadataWrites(enabled: boolean, ownerId?: string) {
  const client = useConvex()
  const controller = useMemo(
    () => (enabled && ownerId ? getDeckMetadataWriteController(client, ownerId) : undefined),
    [client, enabled, ownerId],
  )
  useEffect(() => controller?.start(), [controller])
  const snapshot = useSyncExternalStore(
    controller?.subscribe ?? (() => () => undefined),
    controller?.getSnapshot ?? (() => emptySnapshot),
    controller?.getSnapshot ?? (() => emptySnapshot),
  )
  return {
    ...snapshot,
    update: (deckId: string, patch: DeckMetadataPatch, expectedRevision?: number) =>
      controller?.update(deckId, patch, expectedRevision),
    discardFailure: (operationId: string) => controller?.discardFailure(operationId),
    reapplyFailure: (operationId: string) => controller?.reapplyFailure(operationId),
  }
}
