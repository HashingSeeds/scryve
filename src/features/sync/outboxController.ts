import type { DrainOutboxResult } from "./drainOutbox"
import type { DurableFailedRecord, DurablePendingRecord } from "./durableOutbox"

type TimerHandle = ReturnType<typeof setTimeout>

export interface OutboxControllerOptions<
  Pending extends DurablePendingRecord,
  Failed extends DurableFailedRecord<Pending>,
  Snapshot,
> {
  snapshot: (state: { capacityBlocked: boolean }) => Snapshot
  drain: (shouldContinue: () => boolean) => Promise<DrainOutboxResult<Pending, Failed>>
  retryDelay: (result: DrainOutboxResult<Pending, Failed>) => number | undefined
  canDrain?: () => boolean
  hasPending?: () => boolean
  onStart?: () => void
  onStop?: () => void
  onResult?: (result: DrainOutboxResult<Pending, Failed>) => void
  setTimeoutFn?: (handler: () => void, delay: number) => TimerHandle
  clearTimeoutFn?: (handle: TimerHandle) => void
}

export type OutboxController<Snapshot> = ReturnType<
  typeof createOutboxController<
    DurablePendingRecord,
    DurableFailedRecord<DurablePendingRecord>,
    Snapshot
  >
>

/**
 * Shared lifecycle for durable outbox sync: ref-counted start/stop, single-flight drains that
 * coalesce concurrent requests, generation fencing so a stopped session stops sending, capped
 * retry backoff, failure-capacity pausing, and a snapshot for useSyncExternalStore.
 * Domains supply how to drain (send + failure classification) and what to publish.
 */
export function createOutboxController<
  Pending extends DurablePendingRecord,
  Failed extends DurableFailedRecord<Pending>,
  Snapshot,
>(options: OutboxControllerOptions<Pending, Failed, Snapshot>) {
  const setTimeoutFn = options.setTimeoutFn ?? ((handler, delay) => setTimeout(handler, delay))
  const clearTimeoutFn = options.clearTimeoutFn ?? ((handle) => clearTimeout(handle))
  const listeners = new Set<() => void>()
  let users = 0
  let generation = 0
  let draining = false
  let drainAgain = false
  let capacityBlocked = false
  let snapshot = options.snapshot({ capacityBlocked })
  let retryTimer: TimerHandle | undefined

  const active = () => users > 0

  const cancelRetry = () => {
    if (retryTimer) clearTimeoutFn(retryTimer)
    retryTimer = undefined
  }

  const publish = () => {
    snapshot = options.snapshot({ capacityBlocked })
    for (const listener of [...listeners]) listener()
  }

  const drain = async (): Promise<void> => {
    if (draining) {
      drainAgain = true
      return
    }
    if (!active() || capacityBlocked || !(options.canDrain?.() ?? true)) return
    const pass = generation
    const current = () => pass === generation && active()
    cancelRetry()
    draining = true
    let rerun = false
    try {
      const result = await options.drain(current)
      capacityBlocked = result.blockedByFailureCapacity
      options.onResult?.(result)
      if (!active()) return
      const delay = result.stoppedForRetry ? options.retryDelay(result) : undefined
      if (delay !== undefined)
        retryTimer = setTimeoutFn(() => {
          retryTimer = undefined
          void drain()
        }, delay)
      rerun =
        !result.stoppedForRetry &&
        !result.blockedByFailureCapacity &&
        (options.hasPending?.() ?? false)
    } finally {
      draining = false
      if ((drainAgain || rerun) && active()) {
        drainAgain = false
        void drain()
      }
    }
  }

  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    /* useSyncExternalStore loops forever unless repeated reads return the identical object, so
       the snapshot is rebuilt only in publish(). */
    getSnapshot: () => snapshot,
    publish,
    drain,
    cancelRetry,
    invalidate: () => {
      generation += 1
    },
    start: (): (() => void) => {
      users += 1
      if (users === 1) {
        generation += 1
        options.onStart?.()
        publish()
        void drain()
      }
      return stop
    },
    stop,
    get draining() {
      return draining
    },
    get capacityBlocked() {
      return capacityBlocked
    },
    unblock: () => {
      capacityBlocked = false
    },
  }

  function stop(): void {
    users = Math.max(0, users - 1)
    if (users > 0) return
    generation += 1
    cancelRetry()
    options.onStop?.()
  }
}
