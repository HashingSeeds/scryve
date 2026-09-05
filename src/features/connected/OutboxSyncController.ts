import type { ConnectionStatus } from "@/components/ConnectionBadge"
import {
  asActorId,
  asGameId,
  asOperationId,
  asPlayerId,
  createClientId,
  isCommanderDamageDelta,
  MAX_COMMANDER_DAMAGE,
} from "@/features/game/domain"
import type { DeviceId, LifeDelta } from "@/features/game/types"
import { emitTelemetry } from "@/utils/telemetry"

import type { DrainOutboxSnapshot, OutboxAcknowledgement } from "./drainOutbox"
import { drainConnectedOutbox } from "./drainOutbox"
import type {
  ConnectedCommanderDamageChange,
  ConnectedCommanderDamageClaim,
  ConnectedDisplayProjection,
  ConnectedProjection,
  FailedLifeAction,
  PendingLifeAction,
  ConnectedOperationStatus,
} from "./model"
import { toConnectedProjection } from "./model"
import type { ConnectedGameRepository } from "./persistence"
import { mergeConfirmedProjection, oldestFirst, overlayPendingDeltas } from "./reconciliation"

const DEFAULT_PROJECTION_BARRIER_TIMEOUT_MS = 5_000

export interface OutboxSyncEnvironment {
  isAuthenticated: boolean
  isLoading: boolean
  isRefreshing: boolean
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
  abandonGame: () => Promise<unknown>
  awaitProjectionBarrier?: boolean
  projectionBarrierTimeoutMs?: number
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
    isRefreshing: false,
    isWebSocketConnected: false,
    remoteReady: false,
  }
  private reconnectPending = true
  private environmentInitialized = false
  private readonly inFlight = new Set<string>()
  private readonly dismissedFailureIds = new Set<string>()
  private operationStatus: ConnectedOperationStatus | null = null
  private readonly projectionWaiters = new Map<
    string,
    {
      acknowledgement: OutboxAcknowledgement
      resolve: (acknowledgement: OutboxAcknowledgement) => void
      reject: (cause: unknown) => void
      timeout?: ReturnType<typeof setTimeout>
    }
  >()
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
      previous.isRefreshing !== environment.isRefreshing ||
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

  onRemoteProjection(remote: unknown, status?: ConnectedOperationStatus): void {
    let incoming = toConnectedProjection(remote)
    if (!incoming) return
    const optimistic = Array.isArray(
      (remote as { __optimisticOperationIds?: unknown } | null)?.__optimisticOperationIds,
    )
    if (!optimistic && status?.operationId === this.pending[0]?.event.operationId) {
      this.operationStatus = status ?? null
      if (status?.status === "acknowledged") {
        incoming = {
          ...incoming,
          recentOperationIds: [...incoming.recentOperationIds, status.operationId],
        }
      }
    }
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
    this.resolveProjectionWaiter()
  }

  onOperationStatus(status: ConnectedOperationStatus | null | undefined): void {
    const headOperationId = this.pending[0]?.event.operationId
    if (!headOperationId) {
      this.operationStatus = null
      return
    }
    if (status && status.operationId === headOperationId) this.operationStatus = status
    else if (status && status.operationId !== headOperationId) this.operationStatus = null
    this.resolveProjectionWaiter()
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

  submitCommanderDamage = (
    fromPlayerId: string,
    changes: readonly ConnectedCommanderDamageChange[],
  ): void => {
    if (!changes.every(({ delta }) => isCommanderDamageDelta(delta))) {
      this.changeError = `Commander damage changes have to be between 1 and ${MAX_COMMANDER_DAMAGE}.`
      this.publish()
      return
    }
    if (changes.some(({ toPlayerId }) => toPlayerId === fromPlayerId)) {
      this.changeError = "A commander cannot damage itself"
      this.publish()
      return
    }
    for (const { toPlayerId, delta } of changes) {
      const now = this.now()
      const action: PendingLifeAction = {
        schemaVersion: 1,
        event: {
          type: "commanderDamage.submitted",
          operationId: asOperationId(createClientId("commander", now)),
          gameId: asGameId(this.options.publicId),
          fromPlayerId: asPlayerId(fromPlayerId),
          toPlayerId: asPlayerId(toPlayerId),
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
        continue
      }
      this.pending = result.pending
      this.changeError = undefined
      this.publish()
    }
  }

  /**
   * Queues the defender's decision. Confirming offline is legitimate — the claim is
   * already on the server, so the resolution just replays when the socket returns.
   */
  resolveCommanderDamage = (claim: ConnectedCommanderDamageClaim, accepted: boolean): void => {
    const now = this.now()
    const action: PendingLifeAction = {
      schemaVersion: 1,
      event: {
        type: "commanderDamage.resolved",
        operationId: asOperationId(createClientId("commanderResolve", now)),
        claimOperationId: asOperationId(claim.operationId),
        gameId: asGameId(this.options.publicId),
        toPlayerId: asPlayerId(claim.toPlayerId),
        accepted,
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

  private endGame = async (
    verb: "finishing" | "abandoning",
    submit: () => Promise<unknown>,
  ): Promise<boolean> => {
    if (this.finishing) return false
    this.finishError = undefined
    if (!this.canSync()) {
      this.finishError = `Connect and sign in before ${verb} this game.`
      this.publish()
      return false
    }
    if (this.options.repository.loadOutbox(this.options.publicId).length > 0) {
      this.finishError = `Wait for pending life changes to sync before ${verb} this game.`
      this.publish()
      return false
    }
    if (this.failed.length > 0) {
      this.finishError = `Review failed life changes before ${verb} this game.`
      this.publish()
      return false
    }
    try {
      this.finishing = true
      this.publish()
      await submit()
      return true
    } catch (cause) {
      const fallback = verb === "finishing" ? "finish" : "abandon"
      this.finishError = cause instanceof Error ? cause.message : `Could not ${fallback} the game`
      return false
    } finally {
      this.finishing = false
      this.publish()
    }
  }

  finish = async (result?: ConnectedGameResult): Promise<boolean> =>
    this.endGame("finishing", () => this.options.finishGame(result))

  abandon = async (): Promise<boolean> =>
    this.endGame("abandoning", () => this.options.abandonGame())

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
    for (const waiter of this.projectionWaiters.values()) {
      if (waiter.timeout) this.clearTimeoutFn(waiter.timeout)
      waiter.reject(new Error("Connected game sync stopped"))
    }
    this.projectionWaiters.clear()
  }

  private canSync(): boolean {
    const { isAuthenticated, isLoading, isRefreshing, isWebSocketConnected, remoteReady } =
      this.environment
    return isAuthenticated && !isLoading && !isRefreshing && isWebSocketConnected && remoteReady
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
          send: (action) => this.sendAndAwaitProjection(action),
          onAttempt: (operationId) => this.inFlight.add(operationId),
          onSettled: (operationId) => {
            this.inFlight.delete(operationId)
            this.resolveProjectionWaiter()
          },
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
        } else if (!result.blockedByFailureCapacity && this.pending.length > 0 && this.canSync()) {
          rerunAfterDrain = true
        }
      } finally {
        this.draining = false
        this.resolveProjectionWaiter()
        if (rerunAfterDrain && !this.stopped) this.scheduleDrain()
      }
    })()
  }

  private async sendAndAwaitProjection(action: PendingLifeAction): Promise<OutboxAcknowledgement> {
    const acknowledgement = await this.options.send(action)
    if (!this.options.awaitProjectionBarrier) return acknowledgement

    const operationId = action.event.operationId
    if (this.stopped) throw new Error("Connected game sync stopped")
    if (acknowledgement.operationId !== operationId)
      throw new Error("Mutation acknowledgement did not match the queued operation")
    if (this.projectionBarrierReached(operationId)) return acknowledgement
    return await new Promise<OutboxAcknowledgement>((resolve, reject) => {
      const waiter: {
        acknowledgement: OutboxAcknowledgement
        resolve: (acknowledgement: OutboxAcknowledgement) => void
        reject: (cause: unknown) => void
        timeout?: ReturnType<typeof setTimeout>
      } = { acknowledgement, resolve, reject }
      this.projectionWaiters.set(operationId, waiter)
      waiter.timeout = this.setTimeoutFn(() => {
        if (this.projectionWaiters.get(operationId) !== waiter) return
        this.projectionWaiters.delete(operationId)
        reject(new Error("Timed out waiting for the connected game projection"))
      }, this.options.projectionBarrierTimeoutMs ?? DEFAULT_PROJECTION_BARRIER_TIMEOUT_MS)
      this.resolveProjectionWaiter()
    })
  }

  private projectionBarrierReached(operationId: string): boolean {
    if (!this.options.awaitProjectionBarrier) return true
    const status = this.operationStatus
    if (!status || status.operationId !== operationId) return false
    if (status.status === "conflict") throw new Error(status.reason)
    if (status.status === "not_found") return false
    return this.confirmed !== null && this.confirmed.eventSequence >= status.projectionEventSequence
  }

  private resolveProjectionWaiter(): void {
    for (const [operationId, waiter] of this.projectionWaiters) {
      try {
        if (!this.projectionBarrierReached(operationId)) continue
        this.projectionWaiters.delete(operationId)
        if (waiter.timeout) this.clearTimeoutFn(waiter.timeout)
        waiter.resolve(waiter.acknowledgement)
      } catch (cause) {
        this.projectionWaiters.delete(operationId)
        if (waiter.timeout) this.clearTimeoutFn(waiter.timeout)
        waiter.reject(cause)
      }
    }
  }
}
