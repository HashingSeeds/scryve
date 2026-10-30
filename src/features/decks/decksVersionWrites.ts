import { useEffect, useMemo } from "react"
import { randomUUID } from "expo-crypto"
import { useValue } from "@legendapp/state/react"
import { useConvex, type ConvexReactClient } from "convex/react"
import type { FunctionArgs, FunctionReturnType } from "convex/server"
import { ConvexError } from "convex/values"

import {
  type DurableFailedRecord,
  type DurableOutboxCodec,
  type DurablePendingRecord,
  type DurableStringStorage,
  type FieldName,
} from "@/features/sync/durableOutbox"
import { createOutbox, type Outbox, type OutboxSender } from "@/features/sync/outbox"
import { translate } from "@/i18n/translate"
import { convexErrorCode, convexErrorMessage, isArgumentValidationError } from "@/utils/convexError"
import { storage } from "@/utils/storage"

import { scopedOwnerId } from "./decksSync"
import {
  DECK_VERSION_CONFLICT_REASON,
  DECK_VERSION_DRAFT_UNSYNCED_REASON,
  DECK_VERSION_QUEUE_CONFLICT_REASON,
  DECK_VERSION_REJECTED_REASON,
} from "./deckSyncReasons"
import { DeckVersionCacheRepository } from "./deckVersionsCache"
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

export function newestPendingCardWrite(
  pending: readonly PendingVersionWrite[],
  versionId: string | undefined,
  mappedVersion: (versionId: string) => string,
) {
  const overlayIds = new Set<string>()
  if (versionId) {
    overlayIds.add(versionId)
    overlayIds.add(mappedVersion(versionId))
  }
  return pending
    .filter((write) => (write.op ?? "cards") === "cards")
    .filter(
      (write) => overlayIds.has(write.versionId) || overlayIds.has(mappedVersion(write.versionId)),
    )
    .reduce<PendingVersionWrite | undefined>(
      (newest, action) =>
        !newest || action.expectedRevision > newest.expectedRevision ? action : newest,
      undefined,
    )
}

// why: each card write is a full list; a 300-entry deck is ~190 KB, past the default budget.
const VERSION_OUTBOX_LIMITS = { maxPendingBytes: 512 * 1024, maxFailedBytes: 512 * 1024 }
export {
  DECK_VERSION_CONFLICT_REASON,
  DECK_VERSION_DRAFT_UNSYNCED_REASON,
  DECK_VERSION_QUEUE_CONFLICT_REASON,
  DECK_VERSION_REJECTED_REASON,
}
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value)
}

function isCard(value: unknown): value is VersionCardPayload {
  return isRecord(value) && typeof value.name === "string" && isCount(value.quantity)
}

/* why: queued cards can carry fields the server validator rejects (another build wrote them, or a
   contract release dropped one). `satisfies` breaks the build when the validator's fields change. */
const serverCardFields = new Set(
  Object.keys({
    game: true,
    identityNamespace: true,
    cardId: true,
    providerCardId: true,
    printingId: true,
    section: true,
    entryKind: true,
    originalReference: true,
    category: true,
    oracleId: true,
    scryfallId: true,
    name: true,
    imageUrl: true,
    smallImageUrl: true,
    quantity: true,
    board: true,
    commanderColor: true,
  } satisfies Record<keyof VersionCardPayload, true>),
)

function serverCards(cards: readonly VersionCardPayload[]): VersionCardPayload[] {
  return cards.map(
    (card) =>
      Object.fromEntries(
        Object.entries(card).filter(([field]) => serverCardFields.has(field)),
      ) as VersionCardPayload,
  )
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

const fieldNames: Record<FieldName<PendingVersionWrite | VersionCardPayload>, true> = {
  schemaVersion: true,
  queuedAt: true,
  attempts: true,
  lastAttemptAt: true,
  ownerId: true,
  deckId: true,
  versionId: true,
  operationId: true,
  expectedRevision: true,
  cards: true,
  op: true,
  name: true,
  note: true,
  game: true,
  identityNamespace: true,
  cardId: true,
  providerCardId: true,
  printingId: true,
  section: true,
  entryKind: true,
  originalReference: true,
  category: true,
  oracleId: true,
  scryfallId: true,
  imageUrl: true,
  smallImageUrl: true,
  quantity: true,
  board: true,
  commanderColor: true,
}

const codec: DurableOutboxCodec<PendingVersionWrite, FailedVersionWrite> = {
  parsePending,
  parseFailed,
  createFailure: (action, reason, failedAt) => ({ schemaVersion: 1, action, reason, failedAt }),
  operationId: (action) => action.operationId,
  compare: (left, right) => compareActions(left, right),
  operationTypes: [...lifecycleOps],
  knownKeys: Object.keys(fieldNames),
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

export type VersionWriteOutbox = Outbox<PendingVersionWrite, FailedVersionWrite>

export function versionWriteOutbox(
  ownerId: string,
  local: DurableStringStorage = storage,
  deploymentUrl?: string,
  sender?: OutboxSender<PendingVersionWrite>,
): VersionWriteOutbox {
  const owner = scopedOwnerId(ownerId, deploymentUrl)
  return createOutbox({
    storage: local,
    keys: {
      pendingIndex: `scryve.decks.pendingVersion.v1.${owner}`,
      pendingRecordPrefix: `scryve.decks.pendingVersionRecord.v1.${owner}.`,
      failedIndex: `scryve.decks.failedVersion.v1.${owner}`,
      failedRecordPrefix: `scryve.decks.failedVersionRecord.v1.${owner}.`,
    },
    codec,
    owns: (action) => action.ownerId === ownerId,
    limits: VERSION_OUTBOX_LIMITS,
    sender,
  })
}

export interface VersionWriteOptions {
  storage?: DurableStringStorage
  deploymentUrl?: string
  now?: () => number
}

function rejectReason(cause: unknown): string | undefined {
  const code = convexErrorCode(cause)
  if (code === "sync_conflict")
    return /earlier edit conflicted/.test(convexErrorMessage(cause, ""))
      ? DECK_VERSION_QUEUE_CONFLICT_REASON
      : DECK_VERSION_CONFLICT_REASON
  if (isArgumentValidationError(cause)) return DECK_VERSION_REJECTED_REASON
  return code && permanentErrors.has(code)
    ? convexErrorMessage(cause, translate("decks:sync.cardChangesFailed"))
    : undefined
}

export class DeckVersionWriteController {
  private readonly outbox: VersionWriteOutbox
  private readonly cache: DeckVersionCacheRepository
  private readonly now: () => number

  constructor(
    private readonly client: Pick<ConvexReactClient, "mutation">,
    readonly ownerId: string,
    { storage: local = storage, deploymentUrl, now = Date.now }: VersionWriteOptions = {},
  ) {
    this.now = now
    this.cache = new DeckVersionCacheRepository(ownerId, local, deploymentUrl)
    this.outbox = versionWriteOutbox(ownerId, local, deploymentUrl, {
      send: (action) => this.sendQueued(action),
      rejectReason,
    })
  }

  get state$() {
    return this.outbox.state$
  }

  getSnapshot(): DeckVersionWriteSnapshot {
    return this.outbox.getState()
  }

  start(): () => void {
    return this.outbox.start()
  }

  update(
    deckId: string,
    versionId: string,
    cards: readonly VersionCardPayload[],
    expectedRevision: number,
  ): void {
    this.assertWritable()
    if (this.getSnapshot().failures.some((failure) => failure.action.versionId === versionId))
      throw new Error("Resolve the saved card edit before making another change")
    this.enqueue(deckId, versionId, cards, expectedRevision)
  }

  private assertWritable(): void {
    if (this.getSnapshot().capacityBlocked)
      throw new Error("Sync paused. Resolve a saved local edit before making more changes.")
  }

  private enqueue(
    deckId: string,
    versionId: string,
    cards: readonly VersionCardPayload[],
    expectedRevision: number,
    extra?: { op?: VersionLifecycleOp; name?: string; note?: string },
  ): void {
    const queuedForVersion = this.getSnapshot().pending.filter(
      (action) => action.versionId === versionId,
    )
    const baseRevision = queuedForVersion.reduce(
      (base, action) => Math.max(base, action.expectedRevision),
      expectedRevision - 1,
    )
    const action: PendingVersionWrite = {
      schemaVersion: 1,
      ownerId: this.ownerId,
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
    if (!this.outbox.enqueue(action))
      throw new Error("The offline card queue is full. Reconnect before making more changes.")
  }

  /** Queues an offline version create and registers its provisional local row.
   *  Returns the provisional version id callers keep using until the create is mapped. */
  createVersion(
    deckId: string,
    name: string,
    note: string,
    cards: readonly VersionCardPayload[],
  ): string {
    this.assertWritable()
    // Local policy parity keeps permanently invalid payloads out of the retry loop.
    const versionName = assertVersionName(name)
    if (note.trim().length > MAX_DECK_NOTE_LENGTH)
      throw new Error(`Notes must be at most ${MAX_DECK_NOTE_LENGTH} characters`)
    const provisionalId = randomUUID()
    const activeVersions = this.cache.loadVersions(deckId).filter((version) => !version.deleted)
    const versionNumber =
      activeVersions.reduce((highest, v) => Math.max(highest, v.versionNumber), 0) + 1
    const now = this.now()
    this.enqueue(deckId, provisionalId, cards, 0, {
      op: "create",
      name: versionName,
      ...(note ? { note } : {}),
    })
    this.cache.saveDraft(deckId, {
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
    this.cache.saveCards(provisionalId, 0, cards)
    return provisionalId
  }

  renameVersion(
    deckId: string,
    versionId: string,
    patch: { name?: string; note?: string },
    expectedRevision: number,
  ): void {
    this.assertWritable()
    const name = patch.name !== undefined ? assertVersionName(patch.name) : undefined
    if (patch.note !== undefined && patch.note.trim().length > MAX_DECK_NOTE_LENGTH)
      throw new Error(`Notes must be at most ${MAX_DECK_NOTE_LENGTH} characters`)
    if (this.getSnapshot().failures.some((failure) => failure.action.versionId === versionId))
      throw new Error("Resolve the saved version change before making another change")
    this.enqueue(deckId, versionId, [], expectedRevision, {
      op: "rename",
      ...(name !== undefined ? { name } : {}),
      ...(patch.note !== undefined ? { note: patch.note } : {}),
    })
  }

  deleteVersion(deckId: string, versionId: string, expectedRevision: number): void {
    this.assertWritable()
    const { failures, pending } = this.getSnapshot()
    if (failures.some((failure) => failure.action.versionId === versionId))
      throw new Error("Resolve the saved version change before making another change")
    const remaining = this.cache
      .loadVersions(deckId)
      .filter((version) => !version.deleted && version.versionId !== versionId).length
    const pendingCreates = pending.filter(
      (action) =>
        action.deckId === deckId && action.op === "create" && action.versionId !== versionId,
    ).length
    if (remaining + pendingCreates === 0) throw new Error(DECK_VERSION_LAST_REASON)
    this.enqueue(deckId, versionId, [], expectedRevision, { op: "delete" })
  }

  discardFailure(operationId: string): void {
    const { failures } = this.getSnapshot()
    const failure = failures.find((entry) => entry.action.operationId === operationId)
    if (!failure) return
    for (const entry of failures)
      if (entry.action.versionId === failure.action.versionId)
        this.outbox.dismiss(entry.action.operationId)
    if (failure.action.op === "create")
      this.cache.discardDraft(failure.action.deckId, failure.action.versionId)
  }

  reapplyFailure(operationId: string): void {
    const { failures, pending } = this.getSnapshot()
    const failure = failures.find((entry) => entry.action.operationId === operationId)
    if (!failure) return
    if (pending.some((action) => action.versionId === failure.action.versionId))
      throw new Error("Wait for pending changes before resolving this edit")
    const related = failures.filter((entry) => entry.action.versionId === failure.action.versionId)
    const latest = related.reduce((left, right) =>
      compareActions(right.action, left.action) > 0 ? right : left,
    )
    const lookupVersionId =
      this.cache.mappedVersionId(failure.action.versionId) ?? failure.action.versionId
    const conflictRevision = this.cache
      .loadVersions(latest.action.deckId)
      .find((version) => version.versionId === lookupVersionId)?.revision
    if (latest.action.op === "create") {
      this.enqueue(latest.action.deckId, latest.action.versionId, latest.action.cards, 0, {
        op: "create",
        name: latest.action.name ?? "",
        ...(latest.action.note ? { note: latest.action.note } : {}),
      })
      for (const entry of related) this.outbox.dismiss(entry.action.operationId)
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
    for (const entry of related) this.outbox.dismiss(entry.action.operationId)
  }

  private async send(action: PendingVersionWrite): Promise<VersionWriteResult> {
    if (action.op === "create")
      return this.client.mutation(api.decks.syncCreateVersion, {
        deckId: action.deckId,
        operationId: action.operationId,
        name: action.name ?? "",
        ...(action.note ? { note: action.note } : {}),
        cards: serverCards(action.cards),
      })
    const draftRow = this.cache
      .loadVersions(action.deckId)
      .find((version) => version.versionId === action.versionId)
    if (draftRow?.local && !this.cache.mappedVersionId(action.versionId))
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
      cards: serverCards(action.cards),
      returnConflict: true,
    })
  }

  drain(): Promise<void> {
    return this.outbox.drain()
  }

  private async sendQueued(action: PendingVersionWrite) {
    if (
      this.getSnapshot().failures.some((failure) => failure.action.versionId === action.versionId)
    )
      throw new ConvexError({
        code: "sync_conflict",
        message: "An earlier edit conflicted. Choose which version to keep.",
      })
    const result = await this.send(action)
    if ("status" in result) {
      this.cache.mergeVersions(action.deckId, [result.version])
      throw new ConvexError({
        code: "sync_conflict",
        message: DECK_VERSION_CONFLICT_REASON,
      })
    }
    if (action.op === "create") {
      this.cache.recordMapping(action.versionId, result.versionId)
      this.cache.saveCards(result.versionId, result.revision, action.cards)
      this.cache.confirmDraft(action.deckId, action.versionId, result)
      this.rebasePending(action.versionId, result.revision)
    }
    if (action.op === "rename" || action.op === "delete") {
      this.cache.mergeVersions(action.deckId, [result])
      this.rebasePending(action.versionId, result.revision)
    }
    if (action.op === "cards" || action.op === undefined) {
      const ackedVersionId = this.mappedVersion(action.versionId)
      this.cache.saveCards(ackedVersionId, result.revision, action.cards)
      this.cache.bumpVersion(action.deckId, ackedVersionId, result.revision)
      this.rebasePending(action.versionId, result.revision)
    }
    return { operationId: action.operationId }
  }

  private rebasePending(versionId: string, ackRevision: number): void {
    const tail = this.getSnapshot().pending.filter(
      (action) => action.versionId === versionId && action.attempts === 0,
    )
    for (const [offset, queued] of tail.entries())
      this.outbox.rewriteUnattempted(queued.operationId, (action) =>
        action.expectedRevision === ackRevision + offset
          ? null
          : { ...action, expectedRevision: ackRevision + offset },
      )
  }

  /** Version id of a queued write once a pending create got its server identity. */
  mappedVersion(versionId: string): string {
    return this.cache.mappedVersionId(versionId) ?? versionId
  }
}

const controllers = new WeakMap<object, Map<string, DeckVersionWriteController>>()

export function getDeckVersionWriteController(
  client: Pick<ConvexReactClient, "mutation" | "url">,
  ownerId: string,
) {
  let byOwner = controllers.get(client)
  if (!byOwner) {
    byOwner = new Map()
    controllers.set(client, byOwner)
  }
  const existing = byOwner.get(ownerId)
  if (existing) return existing
  const controller = new DeckVersionWriteController(client, ownerId, { deploymentUrl: client.url })
  byOwner.set(ownerId, controller)
  return controller
}

const emptySnapshot: DeckVersionWriteSnapshot = {
  pending: [],
  failures: [],
  capacityBlocked: false,
}

export function useDeckVersionWrites(
  enabled: boolean,
  ownerId: string | undefined,
  ready: boolean,
) {
  const client = useConvex()
  const controller = useMemo(
    () => (enabled && ownerId ? getDeckVersionWriteController(client, ownerId) : undefined),
    [client, enabled, ownerId],
  )
  useEffect(() => (ready ? controller?.start() : undefined), [controller, ready])
  const snapshot = useValue(() => controller?.state$.get() ?? emptySnapshot)
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
