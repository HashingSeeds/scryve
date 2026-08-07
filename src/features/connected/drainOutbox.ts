import { emitTelemetry } from "@/utils/telemetry"

import type { FailedLifeAction, PendingLifeAction } from "./model"
import { ConnectedGameRepository } from "./persistence"
import { classifyWriteFailure, oldestFirst } from "./reconciliation"

export interface OutboxAcknowledgement {
  operationId: string
}

export interface DrainOutboxResult {
  acknowledged: string[]
  failed: string[]
  stoppedForRetry: boolean
  blockedByFailureCapacity: boolean
  pending: PendingLifeAction[]
  failures: FailedLifeAction[]
}

export interface DrainOutboxSnapshot {
  pending: PendingLifeAction[]
  failures: FailedLifeAction[]
}

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
  const acknowledged: string[] = []
  const failed: string[] = []
  const now = options.now ?? Date.now
  const queue = oldestFirst(options.repository.loadOutbox(options.publicId))
  let failures = [...(options.failed ?? options.repository.loadFailed(options.publicId))]
  const result = (
    stoppedForRetry: boolean,
    blockedByFailureCapacity = false,
  ): DrainOutboxResult => ({
    acknowledged,
    failed,
    stoppedForRetry,
    blockedByFailureCapacity,
    pending: [...queue],
    failures: [...failures],
  })
  const changed = () => options.onChange?.({ pending: [...queue], failures: [...failures] })

  while (queue.length > 0) {
    if (options.shouldContinue && !options.shouldContinue()) return result(false)
    const action = queue[0]
    const operationId = action.event.operationId
    const attempted =
      options.repository.updateAttempt(options.publicId, operationId, now()) ?? action
    queue[0] = attempted
    options.onAttempt?.(operationId)
    changed()
    try {
      const acknowledgement = await options.send(attempted)
      if (acknowledgement.operationId !== operationId)
        throw new Error("Mutation acknowledgement did not match the queued operation")
      options.repository.acknowledge(options.publicId, operationId)
      queue.shift()
      acknowledged.push(operationId)
      emitTelemetry("mutation.ack", {
        durationMs: Math.max(0, now() - attempted.queuedAt),
        attemptCount: attempted.attempts,
        outcome: "success",
      })
    } catch (cause) {
      if (classifyWriteFailure(cause) === "permanent") {
        const reason = cause instanceof Error ? cause.message : "Action was rejected"
        failures = [...(options.currentFailures?.() ?? failures)]
        const failureResult = options.repository.failAction(
          attempted,
          reason,
          now(),
          failures,
          queue,
        )
        if (!failureResult.accepted) {
          options.onSettled?.(operationId)
          changed()
          emitTelemetry("outbox.drain", {
            acknowledgedCount: acknowledged.length,
            failedCount: failed.length,
            outcome: "blocked",
          })
          return result(false, true)
        }
        failures = failureResult.failed
        queue.splice(0, queue.length, ...failureResult.pending)
        failed.push(operationId)
      } else {
        options.onSettled?.(operationId)
        changed()
        emitTelemetry("outbox.drain", {
          acknowledgedCount: acknowledged.length,
          failedCount: failed.length,
          outcome: "retry",
        })
        return result(true)
      }
    }
    options.onSettled?.(operationId)
    changed()
  }
  emitTelemetry("outbox.drain", {
    acknowledgedCount: acknowledged.length,
    failedCount: failed.length,
    outcome: "success",
  })
  return result(false)
}
