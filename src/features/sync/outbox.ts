import {
  DurableOutbox,
  type DurableFailedRecord,
  type DurableOutboxOptions,
  type DurablePendingRecord,
} from "./durableOutbox"
import { createSnapshotStore, type SnapshotObservable } from "./snapshotStore"

type TimerHandle = ReturnType<typeof setTimeout>

export interface OutboxAcknowledgement {
  operationId: string
  status?: string
}

export interface OutboxState<Pending, Failed> {
  pending: Pending[]
  failures: Failed[]
  capacityBlocked: boolean
}

export interface OutboxDrainSummary {
  acknowledged: number
  failed: number
  outcome: "success" | "retry" | "blocked"
}

export interface OutboxSender<Pending> {
  send(action: Pending): Promise<OutboxAcknowledgement>
  rejectReason(cause: unknown): string | undefined
  retryAfterMs?(cause: unknown): number | undefined
  backoff?: { baseMs: number; maxMs: number }
  /** why: no retry timer runs while this is false, so the owner must call drain() once it turns true. */
  canDrain?(): boolean
  onDrained?(summary: OutboxDrainSummary): void
  now?(): number
  setTimeoutFn?(handler: () => void, delay: number): TimerHandle
  clearTimeoutFn?(handle: TimerHandle): void
}

export interface Outbox<Pending, Failed> {
  readonly state$: SnapshotObservable<OutboxState<Pending, Failed>>
  getState(): OutboxState<Pending, Failed>
  enqueue(action: Pending): boolean
  rewriteUnattempted(
    operationId: string,
    rewrite: (action: Pending) => Pending | null,
  ): Pending | null
  acknowledge(operationIds: Iterable<string>): void
  dismiss(operationId: string): void
  resume(): void
  clear(): void
  start(): () => void
  drain(): Promise<void>
}

const DEFAULT_BACKOFF = { baseMs: 2_000, maxMs: 60_000 }

export function createOutbox<
  Pending extends DurablePendingRecord,
  Failed extends DurableFailedRecord<Pending>,
>(
  options: DurableOutboxOptions<Pending, Failed> & { sender?: OutboxSender<Pending> },
): Outbox<Pending, Failed> {
  const store = new DurableOutbox(options)
  const { sender } = options
  const idOf = options.codec.operationId
  const now = sender?.now ?? Date.now
  const setTimeoutFn = sender?.setTimeoutFn ?? ((handler, delay) => setTimeout(handler, delay))
  const clearTimeoutFn = sender?.clearTimeoutFn ?? ((handle) => clearTimeout(handle))
  const state = createSnapshotStore<OutboxState<Pending, Failed>>({
    ...store.load(),
    capacityBlocked: false,
  })
  const current = state.getSnapshot
  const update = (next: Partial<OutboxState<Pending, Failed>>) =>
    state.set({ ...current(), ...next })
  const pendingWithout = (operationId: string) =>
    current().pending.filter((action) => idOf(action) !== operationId)
  let users = 0
  let generation = 0
  let draining = false
  let drainAgain = false
  let drainRequested = false
  let sending: string | undefined
  let retryTimer: TimerHandle | undefined

  const canDrain = () => users > 0 && (sender?.canDrain?.() ?? true)

  const cancelRetry = () => {
    if (retryTimer) clearTimeoutFn(retryTimer)
    retryTimer = undefined
  }

  // why: callers queue or dismiss several writes in one turn (a deck's sibling failures); a drain started after the first would send before the rest settle. A running pass already reads new writes.
  const requestDrain = () => {
    if (drainRequested) return
    drainRequested = true
    void Promise.resolve().then(() => {
      drainRequested = false
      if (!draining) void drain()
    })
  }

  // why: a change to the queue may let the write that hit the failure cap through, so it lifts the pause.
  const queueChanged = (next: Partial<OutboxState<Pending, Failed>>) => {
    update({ ...next, ...(canDrain() ? { capacityBlocked: false } : {}) })
    requestDrain()
  }

  async function drain(): Promise<void> {
    if (!sender) return
    if (draining) {
      drainAgain = true
      return
    }
    if (current().capacityBlocked || !canDrain()) return
    const pass = generation
    const live = () => pass === generation && canDrain()
    cancelRetry()
    draining = true
    try {
      const summary: OutboxDrainSummary = { acknowledged: 0, failed: 0, outcome: "success" }
      let retryDelay: number | undefined
      update(store.load())
      for (let action = current().pending[0]; action && live(); action = current().pending[0]) {
        const operationId = idOf(action)
        const attempted = store.updateAttempt(operationId, now())
        // why: no stored record means another tab already acked or settled it; sending again would revive a dismissed failure.
        if (!attempted) {
          update({ pending: pendingWithout(operationId) })
          continue
        }
        sending = operationId
        update({
          pending: current().pending.map((queued) =>
            idOf(queued) === operationId ? attempted : queued,
          ),
        })
        try {
          const acknowledgement = await sender.send(attempted)
          if (acknowledgement.operationId !== operationId)
            throw new Error("Mutation acknowledgement did not match the queued operation")
          store.acknowledge(operationId)
          update({ pending: pendingWithout(operationId) })
          summary.acknowledged += 1
        } catch (cause) {
          const reason = sender.rejectReason(cause)
          if (reason === undefined) {
            const { baseMs, maxMs } = sender.backoff ?? DEFAULT_BACKOFF
            summary.outcome = "retry"
            retryDelay = Math.max(
              sender.retryAfterMs?.(cause) ?? 0,
              Math.min(maxMs, baseMs * 2 ** Math.min(attempted.attempts, 5)),
            )
            break
          }
          const result = store.failAction(
            attempted,
            reason,
            now(),
            store.loadFailed(),
            current().pending,
          )
          if (!result.accepted) {
            summary.outcome = "blocked"
            update({ capacityBlocked: true })
            break
          }
          update({ pending: result.pending, failures: result.failed })
          summary.failed += 1
        } finally {
          sending = undefined
        }
      }
      sender.onDrained?.(summary)
      if (retryDelay !== undefined && canDrain())
        retryTimer = setTimeoutFn(() => {
          retryTimer = undefined
          void drain()
        }, retryDelay)
    } finally {
      draining = false
      if (drainAgain && users > 0) {
        drainAgain = false
        void drain()
      }
    }
  }

  return {
    state$: state.state$,
    getState: current,
    drain,
    enqueue: (action) => {
      const result = store.enqueue(action, current().pending)
      if (!result.accepted) return false
      queueChanged({ pending: result.pending })
      return true
    },
    rewriteUnattempted: (operationId, rewrite) => {
      const rewritten = store.rewriteUnattempted(operationId, rewrite)
      if (rewritten)
        queueChanged({
          pending: store.order(
            current().pending.map((queued) => (idOf(queued) === operationId ? rewritten : queued)),
          ),
        })
      return rewritten
    },
    acknowledge: (operationIds) => {
      const settled = new Set(operationIds)
      // why: the write being sent settles when its send does; dropping it here would move the head a projection barrier is still waiting on.
      if (sending) settled.delete(sending)
      const { pending } = current()
      const remaining = pending.filter((action) => !settled.has(idOf(action)))
      if (remaining.length === pending.length) return
      for (const action of pending) if (settled.has(idOf(action))) store.acknowledge(idOf(action))
      queueChanged({ pending: remaining })
    },
    dismiss: (operationId) => {
      store.dismissFailed(operationId)
      queueChanged({
        failures: current().failures.filter((failure) => idOf(failure.action) !== operationId),
      })
    },
    resume: () => {
      if (current().capacityBlocked && canDrain()) queueChanged({})
    },
    clear: () => {
      store.clear()
      const { pending, failures, capacityBlocked } = current()
      if (pending.length || failures.length || capacityBlocked)
        update({ pending: [], failures: [], capacityBlocked: false })
    },
    start: () => {
      users += 1
      if (users === 1) {
        generation += 1
        void drain()
      }
      let started = true
      return () => {
        if (!started) return
        started = false
        users -= 1
        if (users > 0) return
        generation += 1
        cancelRetry()
      }
    },
  }
}
