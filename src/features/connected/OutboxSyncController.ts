import type { ConnectionStatus } from "@/components/ConnectionBadge"
import {
  asActorId,
  asGameId,
  asOperationId,
  asPlayerId,
  createClientId,
} from "@/features/game/domain"
import type { DeviceId, LifeDelta } from "@/features/game/types"
import { emitTelemetry } from "@/utils/telemetry"

import type { DrainOutboxSnapshot, OutboxAcknowledgement } from "./drainOutbox"
import { drainConnectedOutbox } from "./drainOutbox"
import type {
  ConnectedDisplayProjection,
  ConnectedProjection,
  FailedLifeAction,
  PendingLifeAction,
} from "./model"
import { toConnectedProjection } from "./model"
import type { ConnectedGameRepository } from "./persistence"
import { mergeConfirmedProjection, oldestFirst, overlayPendingDeltas } from "./reconciliation"

export interface OutboxSyncEnvironment {
  isAuthenticated: boolean
  isLoading: boolean
  isWebSocketConnected: boolean
  remoteReady: boolean
}

export interface OutboxSyncSnapshot {
  projection: ConnectedDisplayProjection | null
  pending: PendingLifeAction[]
  failed: FailedLifeAction[]
  connectionStatus: ConnectionStatus
  changeError?: string
  finishError?: string
  finishing: boolean
}

export interface OutboxSyncControllerOptions {
  repository: ConnectedGameRepository
  publicId: string
  ownerId: string
  deviceId: DeviceId
  send: (action: PendingLifeAction) => Promise<OutboxAcknowledgement>
  finishGame: (result?: ConnectedGameResult) => Promise<unknown>
  now?: () => number
  setTimeoutFn?: (handler: () => void, delay: number) => ReturnType<typeof setTimeout>
  clearTimeoutFn?: (handle: ReturnType<typeof setTimeout>) => void
}

export type ConnectedGameResult =
  { kind: "win"; winnerPlayerIds: string[] } | { kind: "draw" } | { kind: "unknown" }

export function mergeDrainSnapshot(
  currentPending: readonly PendingLifeAction[],
  drainingOperationIds: ReadonlySet<string>,
  snapshotPending: readonly PendingLifeAction[],
  snapshotFailures: readonly FailedLifeAction[],
  dismissedFailureIds: ReadonlySet<string>,
): { pending: PendingLifeAction[]; failures: FailedLifeAction[] } {
  const newlyQueued = currentPending.filter(
    (action) => !drainingOperationIds.has(action.event.operationId),
  )
  return {
    pending: oldestFirst([...snapshotPending, ...newlyQueued]),
    failures: snapshotFailures.filter(
      (failure) => !dismissedFailureIds.has(failure.action.event.operationId),
    ),
  }
}

const mountedWhileDisconnected = (environment: OutboxSyncEnvironment) =>
  !environment.isWebSocketConnected

export class OutboxSyncController {
  private readonly options: OutboxSyncControllerOptions
  private readonly now: () => number
  private readonly setTimeoutFn: (
    handler: () => void,
    delay: number,
  ) => ReturnType<typeof setTimeout>
  private readonly clearTimeoutFn: (handle: ReturnType<typeof setTimeout>) => void

  private confirmed: ConnectedProjection | null
  private pending: PendingLifeAction[]
  private failed: FailedLifeAction[]
  private offline = false
  private changeError: string | undefined
  private finishError: string | undefined
  private finishing = false
  private environment: OutboxSyncEnvironment = {
    isAuthenticated: false,
    isLoading: true,
    isWebSocketConnected: false,
    remoteReady: false,
  }
  private reconnectPending = true
  private environmentInitialized = false
  private readonly inFlight = new Set<string>()
  private readonly dismissedFailureIds = new Set<string>()
  private draining = false
  private drainScheduled = false
  private drainEpoch = 0
  private retryTimer: ReturnType<typeof setTimeout> | undefined
  private stopped = false
  private readonly listeners = new Set<() => void>()
  private snapshot: OutboxSyncSnapshot

  constructor(options: OutboxSyncControllerOptions) {
    this.options = options
    this.now = options.now ?? Date.now
    this.setTimeoutFn = options.setTimeoutFn ?? ((handler, delay) => setTimeout(handler, delay))
    this.clearTimeoutFn = options.clearTimeoutFn ?? ((handle) => clearTimeout(handle))
    this.confirmed = options.repository.loadProjection(options.publicId)
    this.pending = options.repository.loadOutbox(options.publicId)
    this.failed = options.repository.loadFailed(options.publicId)
    this.snapshot = this.buildSnapshot()
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /* useSyncExternalStore loops forever unless repeated reads return the identical object, so the
     snapshot is rebuilt only in publish(). */
  getSnapshot = (): OutboxSyncSnapshot => this.snapshot

  setEnvironment(environment: OutboxSyncEnvironment): void {
    if (!this.environmentInitialized) {
      this.environmentInitialized = true
      this.reconnectPending = mountedWhileDisconnected(environment)
    }
    const previous = this.environment
    const changed =
      previous.isAuthenticated !== environment.isAuthenticated ||
      previous.isLoading !== environment.isLoading ||
      previous.isWebSocketConnected !== environment.isWebSocketConnected ||
      previous.remoteReady !== environment.remoteReady
    this.environment = environment
    if (changed) this.drainEpoch += 1
    if (!environment.isWebSocketConnected) this.reconnectPending = true
    if (!this.canSync() && this.retryTimer) {
      this.clearTimeoutFn(this.retryTimer)
      this.retryTimer = undefined
    }
    this.publish()
  }

  onRemoteProjection(remote: unknown): void {
    const incoming = toConnectedProjection(remote)
    if (!incoming) return
    const optimistic = Array.isArray(
      (remote as { __optimisticOperationIds?: unknown } | null)?.__optimisticOperationIds,
    )
    const merged = mergeConfirmedProjection(this.confirmed, incoming)
    if (!optimistic) this.options.repository.saveProjection(merged)
    this.confirmed = merged
    if (!optimistic) {
      const observed = new Set(incoming.recentOperationIds)
      const remaining: PendingLifeAction[] = []
      for (const action of this.pending) {
        const operationId = action.event.operationId
        if (observed.has(operationId) && !this.inFlight.has(operationId))
          this.options.repository.acknowledge(this.options.publicId, operationId)
        else remaining.push(action)
      }
      this.offline = false
      if (this.environment.isWebSocketConnected && this.reconnectPending) {
        this.reconnectPending = false
        emitTelemetry("reconnect.ready", { outcome: "success", pendingCount: this.pending.length })
      }
      this.pending = remaining
    }
    this.publish()
  }

  changeLife = (playerId: string, delta: LifeDelta): void => {
    const now = this.now()
    const action: PendingLifeAction = {
      schemaVersion: 1,
      event: {
        type: "life.changed",
        operationId: asOperationId(createClientId("operation", now)),
        gameId: asGameId(this.options.publicId),
        playerId: asPlayerId(playerId),
        delta,
        actorId: asActorId(this.options.ownerId),
        deviceId: this.options.deviceId,
        clientCreatedAt: now,
      },
      queuedAt: now,
      attempts: 0,
    }
    const result = this.options.repository.enqueue(action, this.pending)
    if (!result.accepted) {
      this.changeError =
        "The offline queue for pending changes is full. Reconnect and sync before making more changes."
      this.publish()
      return
    }
    this.pending = result.pending
    this.changeError = undefined
    this.publish()
  }

  finish = async (result?: ConnectedGameResult): Promise<void> => {
    this.finishError = undefined
    if (!this.canSync()) {
      this.finishError = "Connect and sign in before finishing this game."
      this.publish()
      return
    }
    if (this.options.repository.loadOutbox(this.options.publicId).length > 0) {
      this.finishError = "Wait for pending life changes to sync before finishing."
      this.publish()
      return
    }
    try {
      this.finishing = true
      this.publish()
      await this.options.finishGame(result)
    } catch (cause) {
      this.finishError = cause instanceof Error ? cause.message : "Could not finish the game"
    } finally {
      this.finishing = false
      this.publish()
    }
  }

  dismissFailed = (operationId: string): void => {
    this.dismissedFailureIds.add(operationId)
    this.options.repository.dismissFailed(this.options.publicId, operationId)
    this.failed = this.failed.filter((failure) => failure.action.event.operationId !== operationId)
    this.changeError = undefined
    this.publish()
  }

  dispose(): void {
    this.stopped = true
    if (this.retryTimer) {
      this.clearTimeoutFn(this.retryTimer)
      this.retryTimer = undefined
    }
  }

  private canSync(): boolean {
    const { isAuthenticated, isLoading, isWebSocketConnected, remoteReady } = this.environment
    return isAuthenticated && !isLoading && isWebSocketConnected && remoteReady
  }

  private buildSnapshot(): OutboxSyncSnapshot {
    const { isAuthenticated, isLoading, isWebSocketConnected } = this.environment
    return {
      projection: this.confirmed ? overlayPendingDeltas(this.confirmed, this.pending) : null,
      pending: this.pending,
      failed: this.failed,
      connectionStatus:
        this.offline || !isAuthenticated || !isWebSocketConnected
          ? "offline"
          : this.pending.length > 0 || isLoading
            ? "syncing"
            : "connected",
      changeError: this.changeError,
      finishError: this.finishError,
      finishing: this.finishing,
    }
  }

  private publish(): void {
    if (this.confirmed)
      this.options.repository.cleanupTerminalGame(this.confirmed, this.pending, this.failed)
    this.snapshot = this.buildSnapshot()
    for (const listener of [...this.listeners]) listener()
    this.scheduleDrain()
  }

  private scheduleDrain(): void {
    if (this.stopped || this.drainScheduled || this.draining) return
    if (!this.canSync() || this.pending.length === 0) return
    this.drainScheduled = true
    void Promise.resolve().then(() => {
      this.drainScheduled = false
      this.runDrain()
    })
  }

  private runDrain(): void {
    if (this.stopped || this.draining) return
    if (!this.canSync() || this.pending.length === 0) return
    this.draining = true
    const epoch = this.drainEpoch
    const drainStartPending = [...this.pending]
    const drainingOperationIds = new Set(
      drainStartPending.map((action) => action.event.operationId),
    )
    const applyDrainSnapshot = (snapshot: DrainOutboxSnapshot) => {
      if (this.stopped) return
      const next = mergeDrainSnapshot(
        this.pending,
        drainingOperationIds,
        snapshot.pending,
        snapshot.failures,
        this.dismissedFailureIds,
      )
      this.pending = next.pending
      this.failed = next.failures
      this.publish()
    }
    let rerunAfterDrain = false
    void (async () => {
      try {
        const result = await drainConnectedOutbox({
          repository: this.options.repository,
          publicId: this.options.publicId,
          failed: this.failed,
          currentFailures: () => this.failed,
          send: this.options.send,
          onAttempt: (operationId) => this.inFlight.add(operationId),
          onSettled: (operationId) => this.inFlight.delete(operationId),
          onChange: applyDrainSnapshot,
          shouldContinue: () => !this.stopped && this.drainEpoch === epoch,
        })
        if (this.stopped) return
        const settledIds = new Set([...result.acknowledged, ...result.failed])
        applyDrainSnapshot({
          pending:
            result.pending ??
            drainStartPending.filter((action) => !settledIds.has(action.event.operationId)),
          failures: result.failures ?? this.failed,
        })
        this.offline = result.stoppedForRetry
        if (result.blockedByFailureCapacity)
          this.changeError =
            "Failed changes need review before more rejected changes can be retained. Dismiss reviewed failures, then retry syncing."
        this.publish()
        if (result.stoppedForRetry && this.environment.isWebSocketConnected && !this.stopped) {
          const attempts = this.pending[0]?.attempts ?? 0
          const delay = Math.min(250 * 2 ** Math.min(attempts, 5), 8_000)
          if (this.retryTimer) this.clearTimeoutFn(this.retryTimer)
          this.retryTimer = this.setTimeoutFn(() => {
            if (this.stopped) return
            this.retryTimer = undefined
            this.scheduleDrain()
          }, delay)
        } else if (
          !result.blockedByFailureCapacity &&
          this.drainEpoch === epoch &&
          this.pending.length > 0
        ) {
          rerunAfterDrain = true
        }
      } finally {
        this.draining = false
        if (rerunAfterDrain && !this.stopped) this.scheduleDrain()
      }
    })()
  }
}
