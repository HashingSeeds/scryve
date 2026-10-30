import { useEffect, useMemo } from "react"
import { useConvex, type ConvexReactClient } from "convex/react"
import { ConvexError } from "convex/values"

import { scopedOwnerId } from "@/features/decks/decksSync"
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
import { translate } from "@/i18n/translate"
import { convexErrorCode, convexErrorMessage, convexRetryAfterMs } from "@/utils/convexError"
import { storage } from "@/utils/storage"

import type { RecordManualMatchArgs } from "./manualMatchForm"
import { api } from "../../../convex/_generated/api"

export interface PendingManualMatch extends DurablePendingRecord {
  schemaVersion: 1
  ownerId: string
  args: RecordManualMatchArgs
}

export interface FailedManualMatch extends DurableFailedRecord<PendingManualMatch> {
  schemaVersion: 1
}

export interface ManualMatchOutboxSnapshot {
  pending: PendingManualMatch[]
  failures: FailedManualMatch[]
  capacityBlocked: boolean
}

const SCOPE = "manual"
const RETRY_DELAY_MS = 2_000

function outboxKeys(deploymentUrl?: string): DurableOutboxKeys {
  const owner = (ownerId: string) => scopedOwnerId(ownerId, deploymentUrl)
  return {
    pendingIndex: (_scope, ownerId) => `scryve.matches.pending.v1.${owner(ownerId)}`,
    pendingRecord: (_scope, publicId, ownerId) =>
      `scryve.matches.pendingRecord.v1.${owner(ownerId)}.${publicId}`,
    failedIndex: (_scope, ownerId) => `scryve.matches.failed.v1.${owner(ownerId)}`,
    failedRecord: (_scope, publicId, ownerId) =>
      `scryve.matches.failedRecord.v1.${owner(ownerId)}.${publicId}`,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

// why: only the envelope is checked here; the server validates the match itself, so a corrupt one fails once and moves to failures.
function parsePending(value: unknown): PendingManualMatch | null {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    typeof value.ownerId !== "string" ||
    !isRecord(value.args) ||
    typeof value.args.publicId !== "string" ||
    typeof value.queuedAt !== "number" ||
    !Number.isSafeInteger(value.attempts) ||
    (value.lastAttemptAt !== undefined && typeof value.lastAttemptAt !== "number")
  )
    return null
  return value as unknown as PendingManualMatch
}

function parseFailed(value: unknown): FailedManualMatch | null {
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

const codec: DurableOutboxCodec<PendingManualMatch, FailedManualMatch> = {
  knownKeys: ["ownerId", "args", "publicId"],
  parsePending,
  parseFailed,
  createFailure: (action, reason, failedAt) => ({ schemaVersion: 1, action, reason, failedAt }),
  operationId: (action) => action.args.publicId,
  belongsToScope: (action, ownerId, scope) => action.ownerId === ownerId && scope === SCOPE,
}

const RECOVERABLE_CODES = new Set(["unauthenticated", "user_not_synced", "rate_limited"])

// why: the Convex client holds a mutation through disconnects, so a rejection came from the server. Only auth and throttling recover on their own.
function isPermanentRejection(cause: unknown) {
  if (cause instanceof ConvexError) return !RECOVERABLE_CODES.has(convexErrorCode(cause) ?? "")
  return (
    cause instanceof Error &&
    /Server Error|ArgumentValidationError|Validator error/.test(cause.message)
  )
}

export class ManualMatchRepository {
  private readonly outbox: DurableOutbox<PendingManualMatch, FailedManualMatch>

  constructor(
    readonly ownerId: string,
    local: DurableStringStorage = storage,
    deploymentUrl?: string,
  ) {
    this.outbox = new DurableOutbox(local, ownerId, outboxKeys(deploymentUrl), codec)
  }

  enqueue(action: PendingManualMatch) {
    return this.outbox.enqueue(action, SCOPE)
  }

  loadPending() {
    return this.outbox.loadPending(SCOPE)
  }

  loadFailed() {
    return this.outbox.loadFailed(SCOPE)
  }

  updateAttempt(publicId: string, attemptedAt: number) {
    return this.outbox.updateAttempt(SCOPE, publicId, attemptedAt)
  }

  acknowledge(publicId: string) {
    this.outbox.acknowledge(SCOPE, publicId)
  }

  failAction(
    action: PendingManualMatch,
    reason: string,
    failedAt: number,
    currentFailed: readonly FailedManualMatch[],
    currentPending: readonly PendingManualMatch[],
  ) {
    return this.outbox.failAction(action, SCOPE, reason, failedAt, currentFailed, currentPending)
  }
}

export class ManualMatchController {
  private readonly outbox: OutboxController<ManualMatchOutboxSnapshot>
  private retryAfterMs = 0

  constructor(
    private readonly client: Pick<ConvexReactClient, "mutation">,
    private readonly repository: ManualMatchRepository,
    private readonly now: () => number = Date.now,
  ) {
    this.outbox = createOutboxController({
      snapshot: ({ capacityBlocked }) => ({
        pending: this.repository.loadPending(),
        failures: this.repository.loadFailed(),
        capacityBlocked,
      }),
      drain: (shouldContinue) => this.drainOnce(shouldContinue),
      retryDelay: (result) =>
        Math.max(
          this.retryAfterMs,
          Math.min(60_000, RETRY_DELAY_MS * 2 ** Math.min(result.pending[0]?.attempts ?? 0, 5)),
        ),
      onResult: () => this.outbox.publish(),
    })
  }

  get state$() {
    return this.outbox.state$
  }

  get getSnapshot() {
    return this.outbox.getSnapshot
  }

  start(): () => void {
    return this.outbox.start()
  }

  drain(): Promise<void> {
    return this.outbox.drain()
  }

  record(args: RecordManualMatchArgs): void {
    const result = this.repository.enqueue({
      schemaVersion: 1,
      ownerId: this.repository.ownerId,
      args,
      queuedAt: this.now(),
      attempts: 0,
    })
    if (!result.accepted) throw new Error(translate("play:recordMatch.queueFull"))
    this.outbox.publish()
    void this.drain()
  }

  private async send(args: RecordManualMatchArgs) {
    try {
      return await this.client.mutation(api.matches.recordManualMatch, args)
    } catch (cause) {
      // why: the deck was deleted or moved while the match waited. The result still counts in history without it.
      if (convexErrorCode(cause) !== "deck_not_found" || !args.me.deckVersionId) throw cause
      const { deckVersionId: _, ...me } = args.me
      return await this.client.mutation(api.matches.recordManualMatch, { ...args, me })
    }
  }

  private drainOnce(shouldContinue: () => boolean) {
    this.retryAfterMs = 0
    return drainOutbox({
      repository: this.repository,
      currentFailures: () => this.repository.loadFailed(),
      operationId: (action) => action.args.publicId,
      now: this.now,
      classifyFailure: (cause) => {
        if (isPermanentRejection(cause))
          return {
            kind: "reject" as const,
            reason: convexErrorMessage(cause, translate("play:recordMatch.saveFailed")),
          }
        this.retryAfterMs = convexRetryAfterMs(cause) ?? 0
        return { kind: "retry" as const }
      },
      send: async (action) => {
        await this.send(action.args)
        return { operationId: action.args.publicId }
      },
      shouldContinue,
      onChange: () => this.outbox.publish(),
    })
  }
}

const controllers = new WeakMap<object, Map<string, ManualMatchController>>()

export function getManualMatchController(
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
  const controller = new ManualMatchController(
    client,
    new ManualMatchRepository(ownerId, storage, client.url),
  )
  byOwner.set(ownerId, controller)
  return controller
}

export function useManualMatchOutbox(ownerId: string | undefined, ready: boolean) {
  const client = useConvex()
  const controller = useMemo(
    () => (ownerId ? getManualMatchController(client, ownerId) : undefined),
    [client, ownerId],
  )
  useEffect(() => (ready ? controller?.start() : undefined), [controller, ready])
}
