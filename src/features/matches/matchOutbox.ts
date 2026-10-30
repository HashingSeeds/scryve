import { useEffect, useMemo } from "react"
import { useConvex, type ConvexReactClient } from "convex/react"
import { ConvexError } from "convex/values"

import { scopedOwnerId } from "@/features/decks/decksSync"
import {
  type DurableFailedRecord,
  type DurableOutboxCodec,
  type DurablePendingRecord,
  type DurableStringStorage,
} from "@/features/sync/durableOutbox"
import { createOutbox, type Outbox, type OutboxSender } from "@/features/sync/outbox"
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

export type ManualMatchOutbox = Outbox<PendingManualMatch, FailedManualMatch>

export function manualMatchOutbox(
  ownerId: string,
  local: DurableStringStorage = storage,
  deploymentUrl?: string,
  sender?: OutboxSender<PendingManualMatch>,
): ManualMatchOutbox {
  const owner = scopedOwnerId(ownerId, deploymentUrl)
  return createOutbox({
    storage: local,
    keys: {
      pendingIndex: `scryve.matches.pending.v1.${owner}`,
      pendingRecordPrefix: `scryve.matches.pendingRecord.v1.${owner}.`,
      failedIndex: `scryve.matches.failed.v1.${owner}`,
      failedRecordPrefix: `scryve.matches.failedRecord.v1.${owner}.`,
    },
    codec,
    owns: (action) => action.ownerId === ownerId,
    sender,
  })
}

export class ManualMatchController {
  private readonly outbox: ManualMatchOutbox
  private readonly now: () => number

  constructor(
    private readonly client: Pick<ConvexReactClient, "mutation">,
    readonly ownerId: string,
    {
      storage: local = storage,
      deploymentUrl,
      now = Date.now,
    }: { storage?: DurableStringStorage; deploymentUrl?: string; now?: () => number } = {},
  ) {
    this.now = now
    this.outbox = manualMatchOutbox(ownerId, local, deploymentUrl, {
      send: async (action) => {
        await this.send(action.args)
        return { operationId: action.args.publicId }
      },
      rejectReason: (cause) =>
        isPermanentRejection(cause)
          ? convexErrorMessage(cause, translate("play:recordMatch.saveFailed"))
          : undefined,
      retryAfterMs: convexRetryAfterMs,
      now,
    })
  }

  get state$() {
    return this.outbox.state$
  }

  getSnapshot(): ManualMatchOutboxSnapshot {
    return this.outbox.getState()
  }

  start(): () => void {
    return this.outbox.start()
  }

  drain(): Promise<void> {
    return this.outbox.drain()
  }

  record(args: RecordManualMatchArgs): void {
    const accepted = this.outbox.enqueue({
      schemaVersion: 1,
      ownerId: this.ownerId,
      args,
      queuedAt: this.now(),
      attempts: 0,
    })
    if (!accepted) throw new Error(translate("play:recordMatch.queueFull"))
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
  const controller = new ManualMatchController(client, ownerId, { deploymentUrl: client.url })
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
