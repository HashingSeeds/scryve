import {
  drainOutbox,
  type DrainOutboxResult as DurableDrainOutboxResult,
  type DrainOutboxSnapshot as DurableDrainOutboxSnapshot,
  type OutboxAcknowledgement,
} from "@/features/sync/drainOutbox"
import { emitTelemetry } from "@/utils/telemetry"

import type { FailedLifeAction, PendingLifeAction } from "./model"
import type { ConnectedGameRepository } from "./persistence"
import { classifyWriteFailure } from "./reconciliation"

export type { OutboxAcknowledgement }
export type DrainOutboxResult = DurableDrainOutboxResult<PendingLifeAction, FailedLifeAction>
export type DrainOutboxSnapshot = DurableDrainOutboxSnapshot<PendingLifeAction, FailedLifeAction>

export async function drainConnectedOutbox(options: {
  repository: ConnectedGameRepository
  publicId: string
  send: (action: PendingLifeAction) => Promise<OutboxAcknowledgement>
  now?: () => number
  failed?: readonly FailedLifeAction[]
  currentFailures?: () => readonly FailedLifeAction[]
  onAttempt?: (operationId: string) => void
  onSettled?: (operationId: string) => void
  onChange?: (snapshot: DrainOutboxSnapshot) => void
  shouldContinue?: () => boolean
}): Promise<DrainOutboxResult> {
  const now = options.now ?? Date.now
  const result = await drainOutbox<PendingLifeAction, FailedLifeAction>({
    repository: {
      loadPending: () => options.repository.loadOutbox(options.publicId),
      updateAttempt: (operationId, attemptedAt) =>
        options.repository.updateAttempt(options.publicId, operationId, attemptedAt),
      acknowledge: (operationId) => options.repository.acknowledge(options.publicId, operationId),
      failAction: (action, reason, failedAt, currentFailed, currentPending) =>
        options.repository.failAction(action, reason, failedAt, currentFailed, currentPending),
    },
    send: options.send,
    operationId: (action) => action.event.operationId,
    classifyFailure: (cause) =>
      classifyWriteFailure(cause) === "permanent"
        ? { kind: "reject", reason: cause instanceof Error ? cause.message : "Action was rejected" }
        : { kind: "retry" },
    now,
    failed: options.failed ?? options.repository.loadFailed(options.publicId),
    currentFailures: options.currentFailures,
    onAttempt: options.onAttempt,
    onAcknowledged: (action) =>
      emitTelemetry("mutation.ack", {
        durationMs: Math.max(0, now() - action.queuedAt),
        attemptCount: action.attempts,
        outcome: "success",
      }),
    onSettled: options.onSettled,
    onChange: options.onChange,
    shouldContinue: options.shouldContinue,
  })
  emitTelemetry("outbox.drain", {
    acknowledgedCount: result.acknowledged.length,
    failedCount: result.failed.length,
    outcome: result.blockedByFailureCapacity
      ? "blocked"
      : result.stoppedForRetry
        ? "retry"
        : "success",
  })
  return result
}
