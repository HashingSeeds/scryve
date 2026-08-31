import type { DurableFailResult, DurableFailedRecord, DurablePendingRecord } from "./durableOutbox"

export interface OutboxAcknowledgement {
  operationId: string
}

export interface DurableOutboxRepository<
  Pending extends DurablePendingRecord,
  Failed extends DurableFailedRecord<Pending>,
> {
  loadPending(): Pending[]
  updateAttempt(operationId: string, attemptedAt: number): Pending | null
  acknowledge(operationId: string): void
  failAction(
    action: Pending,
    reason: string,
    failedAt: number,
    currentFailed: readonly Failed[],
    currentPending: readonly Pending[],
  ): DurableFailResult<Pending, Failed>
}

export type OutboxFailure = { kind: "retry" } | { kind: "reject"; reason: string }

export interface DrainOutboxSnapshot<Pending, Failed> {
  pending: Pending[]
  failures: Failed[]
}

export interface DrainOutboxResult<Pending, Failed> {
  acknowledged: string[]
  failed: string[]
  stoppedForRetry: boolean
  blockedByFailureCapacity: boolean
  pending: Pending[]
  failures: Failed[]
}

export async function drainOutbox<
  Pending extends DurablePendingRecord,
  Failed extends DurableFailedRecord<Pending>,
>(options: {
  repository: DurableOutboxRepository<Pending, Failed>
  send: (action: Pending) => Promise<OutboxAcknowledgement>
  operationId: (action: Pending) => string
  classifyFailure: (cause: unknown) => OutboxFailure
  now?: () => number
  failed?: readonly Failed[]
  currentFailures?: () => readonly Failed[]
  onAttempt?: (operationId: string) => void
  onAcknowledged?: (action: Pending) => void
  onSettled?: (operationId: string) => void
  onChange?: (snapshot: DrainOutboxSnapshot<Pending, Failed>) => void
  shouldContinue?: () => boolean
}): Promise<DrainOutboxResult<Pending, Failed>> {
  const acknowledged: string[] = []
  const failed: string[] = []
  const now = options.now ?? Date.now
  const queue = [...options.repository.loadPending()]
  let failures = [...(options.failed ?? [])]
  const result = (
    stoppedForRetry: boolean,
    blockedByFailureCapacity = false,
  ): DrainOutboxResult<Pending, Failed> => ({
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
    const operationId = options.operationId(action)
    const attempted = options.repository.updateAttempt(operationId, now()) ?? action
    queue[0] = attempted
    options.onAttempt?.(operationId)
    changed()
    try {
      const acknowledgement = await options.send(attempted)
      if (acknowledgement.operationId !== operationId)
        throw new Error("Mutation acknowledgement did not match the queued operation")
      options.repository.acknowledge(operationId)
      queue.shift()
      acknowledged.push(operationId)
      options.onAcknowledged?.(attempted)
    } catch (cause) {
      const classification = options.classifyFailure(cause)
      if (classification.kind === "reject") {
        failures = [...(options.currentFailures?.() ?? failures)]
        const failureResult = options.repository.failAction(
          attempted,
          classification.reason,
          now(),
          failures,
          queue,
        )
        if (!failureResult.accepted) {
          options.onSettled?.(operationId)
          changed()
          return result(false, true)
        }
        failures = failureResult.failed
        queue.splice(0, queue.length, ...failureResult.pending)
        failed.push(operationId)
      } else {
        options.onSettled?.(operationId)
        changed()
        return result(true)
      }
    }
    options.onSettled?.(operationId)
    changed()
  }
  return result(false)
}
