import { useEffect, useMemo, useSyncExternalStore } from "react"
import { randomUUID } from "expo-crypto"
import { useConvex, type ConvexReactClient } from "convex/react"
import type { FunctionArgs, FunctionReturnType } from "convex/server"
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

import { scopedOwnerId } from "./decksSync"
import { DeckVersionCacheRepository, type CachedVersion } from "./deckVersionsCache"
import { api } from "../../../convex/_generated/api"

type VersionWriteArgs = FunctionArgs<typeof api.decks.syncVersionWrite>
type VersionWriteResult = FunctionReturnType<typeof api.decks.syncVersionWrite>
export type VersionCardPayload = NonNullable<VersionWriteArgs["cards"]>[number]

export interface PendingVersionWrite extends DurablePendingRecord {
  schemaVersion: 1
  ownerId: string
  deckId: VersionWriteArgs["deckId"]
  versionId: VersionWriteArgs["versionId"]
  operationId: string
  expectedRevision: number
  cards: VersionCardPayload[]
}

export interface FailedVersionWrite extends DurableFailedRecord<PendingVersionWrite> {
  schemaVersion: 1
}

export interface DeckVersionWriteSnapshot {
  pending: PendingVersionWrite[]
  failures: FailedVersionWrite[]
  capacityBlocked: boolean
}

const SCOPE = "versionCards"
const RETRY_DELAY_MS = 2_000
export const DECK_VERSION_CONFLICT_REASON =
  "Deck cards changed on another device. Choose which card list to keep."
export const DECK_VERSION_QUEUE_CONFLICT_REASON =
  "An earlier card edit conflicted. Choose which card list to keep."
const permanentErrors = new Set([
  "sync_conflict",
  "sync_operation_mismatch",
  "deck_not_found",
  "deck_archived",
  "deck_version_not_found",
  "invalid_operation_id",
  "invalid_revision",
  "capability_unavailable",
  "deck_too_large",
  "invalid_deck_section",
  "invalid_card_name",
  "invalid_card_quantity",
  "invalid_card",
  "deck_system_mismatch",
])

function outboxKeys(deploymentUrl?: string): DurableOutboxKeys {
  return {
    pendingIndex: (_scope, owner) =>
      `scryve.decks.pendingVersion.v1.${scopedOwnerId(owner, deploymentUrl)}`,
    pendingRecord: (_scope, operationId, owner) =>
      `scryve.decks.pendingVersionRecord.v1.${scopedOwnerId(owner, deploymentUrl)}.${operationId}`,
    failedIndex: (_scope, owner) =>
      `scryve.decks.failedVersion.v1.${scopedOwnerId(owner, deploymentUrl)}`,
    failedRecord: (_scope, operationId, owner) =>
      `scryve.decks.failedVersionRecord.v1.${scopedOwnerId(owner, deploymentUrl)}.${operationId}`,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value)
}

function isCard(value: unknown): value is VersionCardPayload {
  return isRecord(value) && typeof value.name === "string" && isCount(value.quantity)
}

function parsePending(value: unknown): PendingVersionWrite | null {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    typeof value.ownerId !== "string" ||
    typeof value.deckId !== "string" ||
    typeof value.versionId !== "string" ||
    typeof value.operationId !== "string" ||
    !isCount(value.expectedRevision) ||
    !Array.isArray(value.cards) ||
    !value.cards.every(isCard) ||
    typeof value.queuedAt !== "number" ||
    !isCount(value.attempts) ||
    (value.lastAttemptAt !== undefined && typeof value.lastAttemptAt !== "number")
  )
    return null
  return value as unknown as PendingVersionWrite
}

function parseFailed(value: unknown): FailedVersionWrite | null {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    typeof value.reason !== "string" ||
    typeof value.failedAt !== "number"
  )
    return null
  const reason =
    value.reason === "Deck version changed on another device"
      ? DECK_VERSION_CONFLICT_REASON
      : value.reason === "An earlier edit conflicted. Choose which version to keep."
        ? DECK_VERSION_QUEUE_CONFLICT_REASON
        : value.reason
  const action = parsePending(value.action)
  return action ? { schemaVersion: 1, action, reason, failedAt: value.failedAt } : null
}

const codec: DurableOutboxCodec<PendingVersionWrite, FailedVersionWrite> = {
  parsePending,
  parseFailed,
  createFailure: (action, reason, failedAt) => ({ schemaVersion: 1, action, reason, failedAt }),
  operationId: (action) => action.operationId,
  belongsToScope: (action, ownerId, scope) => action.ownerId === ownerId && scope === SCOPE,
  compare: (left, right) => compareActions(left, right),
}

function compareActions(left: PendingVersionWrite, right: PendingVersionWrite) {
  return (
    left.expectedRevision - right.expectedRevision ||
    left.queuedAt - right.queuedAt ||
    left.operationId.localeCompare(right.operationId)
  )
}

export class DeckVersionWriteRepository {
  private readonly outbox: DurableOutbox<PendingVersionWrite, FailedVersionWrite>
  private readonly keys: DurableOutboxKeys
  private readonly local: DurableStringStorage
  private readonly deploymentUrl?: string

  constructor(
    readonly ownerId: string,
    local: DurableStringStorage = storage,
    deploymentUrl?: string,
  ) {
    this.local = local
    this.deploymentUrl = deploymentUrl
    this.keys = outboxKeys(deploymentUrl)
    this.outbox = new DurableOutbox(local, ownerId, this.keys, codec)
  }

  get cache() {
    return new DeckVersionCacheRepository(this.ownerId, this.local, this.deploymentUrl)
  }

  enqueue(action: PendingVersionWrite, current?: readonly PendingVersionWrite[]) {
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
    action: PendingVersionWrite,
    reason: string,
    failedAt: number,
    currentFailed: readonly FailedVersionWrite[],
    currentPending: readonly PendingVersionWrite[],
  ) {
    return this.outbox.failAction(action, SCOPE, reason, failedAt, currentFailed, currentPending)
  }

  loadFailed() {
    return this.outbox.loadFailed(SCOPE)
  }

  dismissFailed(operationId: string) {
    this.outbox.dismissFailed(SCOPE, operationId)
  }

  recordConflict(deckId: string, version: CachedVersion) {
    this.cache.mergeVersions(deckId, [version])
  }

  rebasePending(versionId: string, ackRevision: number) {
    for (const [offset, tail] of this.loadPending()
      .filter((action) => action.versionId === versionId && action.attempts === 0)
      .entries())
      if (tail.expectedRevision !== ackRevision + offset)
        this.local.set(
          this.keys.pendingRecord(SCOPE, tail.operationId, this.ownerId),
          JSON.stringify({ ...tail, expectedRevision: ackRevision + offset }),
        )
  }
}

export class DeckVersionWriteController {
  private readonly listeners = new Set<() => void>()
  private snapshot: DeckVersionWriteSnapshot
  private users = 0
  private capacityBlocked = false
  private draining = false
  private drainAgain = false
  private generation = 0
  private retryTimer: ReturnType<typeof setTimeout> | undefined

  constructor(
    private readonly client: Pick<ConvexReactClient, "mutation">,
    private readonly repository: DeckVersionWriteRepository,
    private readonly now: () => number = Date.now,
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
      this.publish()
      void this.drain()
    }
    return () => this.stop()
  }

  stop(): void {
    this.users = Math.max(0, this.users - 1)
    if (this.users > 0) return
    this.generation += 1
    if (this.retryTimer) clearTimeout(this.retryTimer)
    this.retryTimer = undefined
  }

  update(
    deckId: string,
    versionId: string,
    cards: readonly VersionCardPayload[],
    expectedRevision: number,
  ): void {
    if (this.capacityBlocked)
      throw new Error("Sync paused. Resolve a saved local edit before making more changes.")
    if (this.snapshot.failures.some((failure) => failure.action.versionId === versionId))
      throw new Error("Resolve the saved card edit before making another change")
    this.enqueue(deckId, versionId, cards, expectedRevision)
    void this.drain()
  }

  private enqueue(
    deckId: string,
    versionId: string,
    cards: readonly VersionCardPayload[],
    expectedRevision: number,
  ): void {
    const queuedForVersion = this.snapshot.pending.filter(
      (action) => action.versionId === versionId,
    )
    const baseRevision = queuedForVersion.reduce(
      (base, action) => Math.max(base, action.expectedRevision),
      expectedRevision - 1,
    )
    const action: PendingVersionWrite = {
      schemaVersion: 1,
      ownerId: this.repository.ownerId,
      deckId: deckId as VersionWriteArgs["deckId"],
      versionId: versionId as VersionWriteArgs["versionId"],
      operationId: randomUUID(),
      expectedRevision: baseRevision + 1,
      cards: [...cards] as VersionCardPayload[],
      queuedAt: this.now(),
      attempts: 0,
    }
    const result = this.repository.enqueue(action, this.snapshot.pending)
    if (!result.accepted)
      throw new Error("The offline card queue is full. Reconnect before making more changes.")
    this.publish()
  }

  discardFailure(operationId: string): void {
    const failure = this.snapshot.failures.find((entry) => entry.action.operationId === operationId)
    if (!failure) return
    for (const entry of this.snapshot.failures)
      if (entry.action.versionId === failure.action.versionId)
        this.repository.dismissFailed(entry.action.operationId)
    this.capacityBlocked = false
    this.publish()
    void this.drain()
  }

  reapplyFailure(operationId: string): void {
    const failure = this.snapshot.failures.find((entry) => entry.action.operationId === operationId)
    if (!failure) return
    if (this.snapshot.pending.some((action) => action.versionId === failure.action.versionId))
      throw new Error("Wait for pending changes before resolving this edit")
    const related = this.snapshot.failures.filter(
      (entry) => entry.action.versionId === failure.action.versionId,
    )
    const latest = related.reduce((left, right) =>
      compareActions(right.action, left.action) > 0 ? right : left,
    )
    const conflictRevision = this.repository.cache
      .loadVersions(latest.action.deckId)
      .find((version) => version.versionId === failure.action.versionId)?.revision
    if (conflictRevision === undefined)
      throw new Error("This card edit cannot be replayed. Discard it and edit again.")
    this.enqueue(
      latest.action.deckId,
      latest.action.versionId,
      latest.action.cards,
      conflictRevision,
    )
    for (const entry of related) this.repository.dismissFailed(entry.action.operationId)
    this.capacityBlocked = false
    this.publish()
    void this.drain()
  }

  async drain(): Promise<void> {
    if (this.draining) {
      this.drainAgain = true
      return
    }
    if (this.users === 0 || this.capacityBlocked) return
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
          if (code === "sync_conflict")
            return {
              kind: "reject" as const,
              reason: /earlier edit conflicted/.test(convexErrorMessage(cause, ""))
                ? DECK_VERSION_QUEUE_CONFLICT_REASON
                : DECK_VERSION_CONFLICT_REASON,
            }
          return code && permanentErrors.has(code)
            ? {
                kind: "reject" as const,
                reason: convexErrorMessage(cause, "Could not sync these card changes"),
              }
            : { kind: "retry" as const }
        },
        send: async (action) => {
          if (
            this.repository
              .loadFailed()
              .some((failure) => failure.action.versionId === action.versionId)
          )
            throw new ConvexError({
              code: "sync_conflict",
              message: "An earlier edit conflicted. Choose which version to keep.",
            })
          const result: VersionWriteResult = await this.client.mutation(
            api.decks.syncVersionWrite,
            {
              deckId: action.deckId,
              versionId: action.versionId,
              operationId: action.operationId,
              expectedRevision: action.expectedRevision,
              cards: action.cards,
              returnConflict: true,
            },
          )
          if ("status" in result) {
            this.repository.recordConflict(action.deckId, result.version)
            throw new ConvexError({
              code: "sync_conflict",
              message: DECK_VERSION_CONFLICT_REASON,
            })
          }
          this.repository.cache.saveCards(action.versionId, result.revision, action.cards)
          this.repository.cache.bumpVersion(action.deckId, action.versionId, result.revision)
          this.repository.rebasePending(action.versionId, result.revision)
          return { operationId: action.operationId }
        },
        shouldContinue: () => generation === this.generation && this.users > 0,
        onChange: () => this.publish(),
      })
      this.capacityBlocked = result.blockedByFailureCapacity
      this.publish()
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

  private buildSnapshot(): DeckVersionWriteSnapshot {
    return {
      pending: this.repository.loadPending(),
      failures: this.repository.loadFailed(),
      capacityBlocked: this.capacityBlocked,
    }
  }

  private publish(): void {
    this.snapshot = this.buildSnapshot()
    for (const listener of this.listeners) listener()
  }
}

const controllers = new WeakMap<object, Map<string, DeckVersionWriteController>>()

export function getDeckVersionWriteController(
  client: Pick<ConvexReactClient, "mutation" | "url">,
  ownerId: string,
  repository = new DeckVersionWriteRepository(ownerId, storage, client.url),
) {
  let byOwner = controllers.get(client)
  if (!byOwner) {
    byOwner = new Map()
    controllers.set(client, byOwner)
  }
  const existing = byOwner.get(ownerId)
  if (existing) return existing
  const controller = new DeckVersionWriteController(client, repository)
  byOwner.set(ownerId, controller)
  return controller
}

const emptySnapshot: DeckVersionWriteSnapshot = {
  pending: [],
  failures: [],
  capacityBlocked: false,
}

export function useDeckVersionWrites(enabled: boolean, ownerId?: string) {
  const client = useConvex()
  const controller = useMemo(
    () => (enabled && ownerId ? getDeckVersionWriteController(client, ownerId) : undefined),
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
    update: (
      deckId: string,
      versionId: string,
      cards: readonly VersionCardPayload[],
      expectedRevision: number,
    ) => controller?.update(deckId, versionId, cards, expectedRevision),
    discardFailure: (operationId: string) => controller?.discardFailure(operationId),
    reapplyFailure: (operationId: string) => controller?.reapplyFailure(operationId),
  }
}
