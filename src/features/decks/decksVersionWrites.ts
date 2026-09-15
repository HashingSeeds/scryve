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
import { MAX_DECK_NOTE_LENGTH, assertVersionName } from "../../../convex/lib/policy"

type VersionWriteArgs = FunctionArgs<typeof api.decks.syncVersionWrite>
type VersionUpdateArgs = FunctionArgs<typeof api.decks.syncUpdateVersion>
type VersionDeleteArgs = FunctionArgs<typeof api.decks.syncDeleteVersion>
type VersionWriteResult = FunctionReturnType<typeof api.decks.syncVersionWrite>
export type VersionCardPayload = NonNullable<VersionWriteArgs["cards"]>[number]
export type VersionLifecycleOp = "cards" | "create" | "rename" | "delete"

export interface PendingVersionWrite extends DurablePendingRecord {
  schemaVersion: 1
  ownerId: string
  deckId: VersionWriteArgs["deckId"]
  versionId: VersionWriteArgs["versionId"]
  operationId: string
  expectedRevision: number
  cards: VersionCardPayload[]
  /** Legacy card writes carry no op and behave as "cards". */
  op?: VersionLifecycleOp
  name?: string
  note?: string
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
export const DECK_VERSION_DRAFT_UNSYNCED_REASON =
  "This offline draft was never synced. Discard it and create the version again."
export const DECK_VERSION_LAST_REASON = "A deck must keep at least one version."
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
  "version_limit_reached",
  "last_version",
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

const lifecycleOps = new Set<VersionLifecycleOp>(["cards", "create", "rename", "delete"])

function isLifecycleOp(value: unknown): value is VersionLifecycleOp {
  return typeof value === "string" && lifecycleOps.has(value as VersionLifecycleOp)
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
    (value.lastAttemptAt !== undefined && typeof value.lastAttemptAt !== "number") ||
    (value.op !== undefined && !isLifecycleOp(value.op)) ||
    (value.name !== undefined && typeof value.name !== "string") ||
    (value.note !== undefined && typeof value.note !== "string")
  )
    return null
  const op = value.op ?? "cards"
  if (op === "create" && typeof value.name !== "string") return null
  if (op === "rename" && value.name === undefined && value.note === undefined) return null
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

/** Builds the replay set for a failed chain. Card writes replace the whole list,
 *  so only the newest survives; metadata ops are separate intents and all replay. */
function replayChain(actions: readonly PendingVersionWrite[]): PendingVersionWrite[] {
  const lastCardIndex = actions.reduce(
    (last, action, index) => ((action.op ?? "cards") === "cards" ? index : last),
    -1,
  )
  return actions.filter(
    (action, index) => (action.op ?? "cards") !== "cards" || index === lastCardIndex,
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
    extra?: { op?: VersionLifecycleOp; name?: string; note?: string },
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
      ...(extra?.op ? { op: extra.op } : {}),
      ...(extra?.name !== undefined ? { name: extra.name } : {}),
      ...(extra?.note !== undefined ? { note: extra.note } : {}),
    }
    const result = this.repository.enqueue(action, this.snapshot.pending)
    if (!result.accepted)
      throw new Error("The offline card queue is full. Reconnect before making more changes.")
    this.publish()
  }

  /** Queues an offline version create and registers its provisional local row.
   *  Returns the provisional version id callers keep using until the create is mapped. */
  createVersion(
    deckId: string,
    name: string,
    note: string,
    cards: readonly VersionCardPayload[],
  ): string {
    if (this.capacityBlocked)
      throw new Error("Sync paused. Resolve a saved local edit before making more changes.")
    // Local policy parity keeps permanently invalid payloads out of the retry loop.
    const versionName = assertVersionName(name)
    if (note.trim().length > MAX_DECK_NOTE_LENGTH)
      throw new Error(`Notes must be at most ${MAX_DECK_NOTE_LENGTH} characters`)
    const provisionalId = randomUUID()
    const activeVersions = this.repository.cache
      .loadVersions(deckId)
      .filter((version) => !version.deleted)
    const versionNumber =
      activeVersions.reduce((highest, v) => Math.max(highest, v.versionNumber), 0) + 1
    const now = this.now()
    this.repository.cache.saveDraft(deckId, {
      deckId: deckId as VersionWriteArgs["deckId"],
      versionId: provisionalId as VersionWriteArgs["versionId"],
      revision: 0,
      versionNumber,
      name: versionName,
      note,
      fingerprint: "local",
      cardCount: cards.length,
      cardQuantity: cards.reduce((total, card) => total + card.quantity, 0),
      deleted: false,
      updatedAt: now,
      local: true,
    })
    this.repository.cache.saveCards(provisionalId, 0, cards)
    this.publish()
    this.enqueue(deckId, provisionalId, cards, 0, {
      op: "create",
      name: versionName,
      ...(note ? { note } : {}),
    })
    void this.drain()
    return provisionalId
  }

  renameVersion(
    deckId: string,
    versionId: string,
    patch: { name?: string; note?: string },
    expectedRevision: number,
  ): void {
    if (this.capacityBlocked)
      throw new Error("Sync paused. Resolve a saved local edit before making more changes.")
    const name = patch.name !== undefined ? assertVersionName(patch.name) : undefined
    if (patch.note !== undefined && patch.note.trim().length > MAX_DECK_NOTE_LENGTH)
      throw new Error(`Notes must be at most ${MAX_DECK_NOTE_LENGTH} characters`)
    if (this.snapshot.failures.some((failure) => failure.action.versionId === versionId))
      throw new Error("Resolve the saved version change before making another change")
    this.publish()
    this.enqueue(deckId, versionId, [], expectedRevision, {
      op: "rename",
      ...(name !== undefined ? { name } : {}),
      ...(patch.note !== undefined ? { note: patch.note } : {}),
    })
    void this.drain()
  }

  deleteVersion(deckId: string, versionId: string, expectedRevision: number): void {
    if (this.capacityBlocked)
      throw new Error("Sync paused. Resolve a saved local edit before making more changes.")
    if (this.snapshot.failures.some((failure) => failure.action.versionId === versionId))
      throw new Error("Resolve the saved version change before making another change")
    this.publish()
    const remaining = this.repository.cache
      .loadVersions(deckId)
      .filter((version) => !version.deleted && version.versionId !== versionId).length
    const pendingCreates = this.snapshot.pending.filter(
      (action) =>
        action.deckId === deckId && action.op === "create" && action.versionId !== versionId,
    ).length
    if (remaining + pendingCreates === 0) throw new Error(DECK_VERSION_LAST_REASON)
    this.enqueue(deckId, versionId, [], expectedRevision, { op: "delete" })
    void this.drain()
  }

  discardFailure(operationId: string): void {
    const failure = this.snapshot.failures.find((entry) => entry.action.operationId === operationId)
    if (!failure) return
    for (const entry of this.snapshot.failures)
      if (entry.action.versionId === failure.action.versionId)
        this.repository.dismissFailed(entry.action.operationId)
    if (failure.action.op === "create")
      this.repository.cache.discardDraft(failure.action.deckId, failure.action.versionId)
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
    if (latest.action.op === "create") {
      this.enqueue(latest.action.deckId, latest.action.versionId, latest.action.cards, 0, {
        op: "create",
        name: latest.action.name ?? "",
        ...(latest.action.note ? { note: latest.action.note } : {}),
      })
      for (const entry of related) this.repository.dismissFailed(entry.action.operationId)
      this.capacityBlocked = false
      this.publish()
      void this.drain()
      return
    }
    if (conflictRevision === undefined)
      throw new Error("This card edit cannot be replayed. Discard it and edit again.")
    // Replay the whole guarded chain so a mixed card→rename→delete intent survives:
    // only same-op card replaces dedupe (full-list semantics), and metadata ops keep their op kind.
    const replayed = replayChain(related.map((entry) => entry.action).sort(compareActions))
    for (const [index, action] of replayed.entries()) {
      this.enqueue(
        action.deckId,
        action.versionId,
        action.cards,
        index === 0 ? conflictRevision : action.expectedRevision,
        {
          ...(action.op ? { op: action.op } : {}),
          ...(action.name !== undefined ? { name: action.name } : {}),
          ...(action.note !== undefined ? { note: action.note } : {}),
        },
      )
    }
    for (const entry of related) this.repository.dismissFailed(entry.action.operationId)
    this.capacityBlocked = false
    this.publish()
    void this.drain()
  }

  private async send(action: PendingVersionWrite): Promise<VersionWriteResult> {
    if (action.op === "create")
      return this.client.mutation(api.decks.syncCreateVersion, {
        deckId: action.deckId,
        operationId: action.operationId,
        name: action.name ?? "",
        ...(action.note ? { note: action.note } : {}),
        cards: action.cards,
      })
    const draftRow = this.repository.cache
      .loadVersions(action.deckId)
      .find((version) => version.versionId === action.versionId)
    if (draftRow?.local && !this.repository.cache.mappedVersionId(action.versionId))
      throw new ConvexError({
        code: "deck_version_not_found",
        message: DECK_VERSION_DRAFT_UNSYNCED_REASON,
      })
    const serverVersionId = this.mappedVersion(action.versionId)
    if (action.op === "rename")
      return this.client.mutation(api.decks.syncUpdateVersion, {
        versionId: serverVersionId as VersionUpdateArgs["versionId"],
        operationId: action.operationId,
        expectedRevision: action.expectedRevision,
        ...(action.name !== undefined ? { name: action.name } : {}),
        ...(action.note !== undefined ? { note: action.note } : {}),
        returnConflict: true,
      })
    if (action.op === "delete")
      return this.client.mutation(api.decks.syncDeleteVersion, {
        versionId: serverVersionId as VersionDeleteArgs["versionId"],
        operationId: action.operationId,
        expectedRevision: action.expectedRevision,
        returnConflict: true,
      })
    return this.client.mutation(api.decks.syncVersionWrite, {
      deckId: action.deckId,
      versionId: serverVersionId as VersionWriteArgs["versionId"],
      operationId: action.operationId,
      expectedRevision: action.expectedRevision,
      cards: action.cards,
      returnConflict: true,
    })
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
          const result = await this.send(action)
          if ("status" in result) {
            this.repository.recordConflict(action.deckId, result.version)
            throw new ConvexError({
              code: "sync_conflict",
              message: DECK_VERSION_CONFLICT_REASON,
            })
          }
          if (action.op === "create") {
            this.repository.cache.recordMapping(action.versionId, result.versionId)
            this.repository.cache.saveCards(result.versionId, result.revision, action.cards)
            this.repository.cache.confirmDraft(action.deckId, action.versionId, result)
            this.repository.rebasePending(action.versionId, result.revision)
          }
          if (action.op === "rename" || action.op === "delete") {
            this.repository.cache.mergeVersions(action.deckId, [result])
            this.repository.rebasePending(action.versionId, result.revision)
          }
          if (action.op === "cards" || action.op === undefined) {
            this.repository.cache.saveCards(action.versionId, result.revision, action.cards)
            this.repository.cache.bumpVersion(action.deckId, action.versionId, result.revision)
            this.repository.rebasePending(action.versionId, result.revision)
          }
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

  /** Version id of a queued write once a pending create got its server identity. */
  mappedVersion(versionId: string): string {
    return this.repository.cache.mappedVersionId(versionId) ?? versionId
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
    createVersion: (
      deckId: string,
      name: string,
      note: string,
      cards: readonly VersionCardPayload[],
    ) => controller?.createVersion(deckId, name, note, cards),
    renameVersion: (
      deckId: string,
      versionId: string,
      patch: { name?: string; note?: string },
      expectedRevision: number,
    ) => controller?.renameVersion(deckId, versionId, patch, expectedRevision),
    deleteVersion: (deckId: string, versionId: string, expectedRevision: number) =>
      controller?.deleteVersion(deckId, versionId, expectedRevision),
    mappedVersion: (versionId: string) => controller?.mappedVersion(versionId) ?? versionId,
  }
}
