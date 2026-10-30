import {
  asActorId,
  asGameId,
  asOperationId,
  asPlayerId,
  createClientId,
  isCommanderDamageDelta,
  isLifeDelta,
  MAX_COMMANDER_DAMAGE,
} from "@/features/game/domain"
import { playTableRules } from "@/features/game/playSystems"
import {
  createTableActions,
  type TableActions,
  type TableSource,
} from "@/features/game/tableRuntime"
import type { DeviceId, LifeDelta } from "@/features/game/types"
import type { OutboxAcknowledgement } from "@/features/sync/outbox"
import { createSnapshotStore, type SnapshotStore } from "@/features/sync/snapshotStore"
import { translate } from "@/i18n/translate"
import { convexErrorMessage } from "@/utils/convexError"
import { emitTelemetry, type TelemetryWriteKind } from "@/utils/telemetry"

import type {
  ConnectionStatus,
  ConnectedCommanderDamageChange,
  ConnectedCommanderDamageClaim,
  ConnectedDisplayProjection,
  ConnectedProjection,
  FailedLifeAction,
  PendingLifeAction,
  ConnectedOperationStatus,
} from "./model"
import { toConnectedProjection } from "./model"
import type { ConnectedGameRepository, ConnectedOutbox } from "./persistence"
import {
  classifyWriteFailure,
  mergeConfirmedProjection,
  overlayPendingDeltas,
} from "./reconciliation"
import { SyncLatency } from "./syncLatency"
import { flooredLifeDelta } from "../../../convex/lib/systems"
import type { TableAction } from "../../../convex/lib/table"

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
  latency?: SyncLatency
  awaitProjectionBarrier?: boolean
  projectionBarrierTimeoutMs?: number
  now?: () => number
  setTimeoutFn?: (handler: () => void, delay: number) => ReturnType<typeof setTimeout>
  clearTimeoutFn?: (handle: ReturnType<typeof setTimeout>) => void
}

export type ConnectedGameResult =
  { kind: "win"; winnerPlayerIds: string[] } | { kind: "draw" } | { kind: "unknown" }

const WRITE_KINDS: Record<PendingLifeAction["event"]["type"], TelemetryWriteKind> = {
  "life.changed": "life",
  "table.action": "table",
  "commanderDamage.submitted": "commander.claim",
  "commanderDamage.resolved": "commander.resolve",
}

function rejectReason(cause: unknown): string | undefined {
  if (classifyWriteFailure(cause) !== "permanent") return undefined
  return convexErrorMessage(cause, cause instanceof Error ? cause.message : "Action was rejected")
}

function addToLifeChange(action: PendingLifeAction, delta: number): PendingLifeAction | null {
  const { event } = action
  if (event.type !== "life.changed" || event.compensatesOperationId) return null
  const sum = event.delta + delta
  if (Math.sign(event.delta) !== Math.sign(delta) || !isLifeDelta(sum)) return null
  return { ...action, event: { ...event, delta: sum } }
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

  private readonly observeResumeProjection: (projection: ConnectedProjection) => void
  private confirmed: ConnectedProjection | null
  private overlay: {
    confirmed: ConnectedProjection
    pending: PendingLifeAction[]
    projection: ConnectedDisplayProjection
  } | null = null
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
  private timingLive = false
  private environmentInitialized = false
  private lastQueuedLifeChange: { playerId: string; operationId: string } | undefined
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
  private stopped = false
  private readonly outbox: ConnectedOutbox
  private readonly store: SnapshotStore<OutboxSyncSnapshot>
  private readonly stopOutbox: () => void
  private readonly unsubscribeOutbox: () => void
  readonly table: TableActions
  readonly latency: SyncLatency

  constructor(options: OutboxSyncControllerOptions) {
    this.options = options
    this.observeResumeProjection = options.repository.createResumeObserver()
    this.now = options.now ?? Date.now
    this.setTimeoutFn = options.setTimeoutFn ?? ((handler, delay) => setTimeout(handler, delay))
    this.clearTimeoutFn = options.clearTimeoutFn ?? ((handle) => clearTimeout(handle))
    this.latency = options.latency ?? new SyncLatency({ transport: "cloud" }, this.now)
    this.confirmed = options.repository.loadProjection(options.publicId)
    this.outbox = options.repository.outbox(options.publicId, {
      send: (action) => this.timedSend(action),
      rejectReason,
      backoff: { baseMs: 250, maxMs: 8_000 },
      canDrain: () => this.canSync() && this.pending.length > 0,
      onDrained: ({ acknowledged, failed, outcome }) =>
        emitTelemetry("outbox.drain", {
          acknowledgedCount: acknowledged,
          failedCount: failed,
          outcome,
        }),
      now: this.now,
      setTimeoutFn: this.setTimeoutFn,
      clearTimeoutFn: this.clearTimeoutFn,
    })
    this.store = createSnapshotStore(this.buildSnapshot())
    this.unsubscribeOutbox = this.outbox.state$.onChange(() => {
      this.publish()
      this.resolveProjectionWaiter()
    })
    this.stopOutbox = this.outbox.start()
    this.table = createTableActions(
      () => this.tableSource(),
      (action, operationId) => this.enqueueTableAction(action, operationId),
    )
  }

  get state$() {
    return this.store.state$
  }

  get subscribe() {
    return this.store.subscribe
  }

  get getSnapshot() {
    return this.store.getSnapshot
  }

  private get pending(): PendingLifeAction[] {
    return this.outbox.getState().pending
  }

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
    if (!environment.isWebSocketConnected) {
      this.reconnectPending = true
      this.timingLive = false
    }
    this.publish()
    if (!changed || !this.canSync()) return
    this.outbox.resume()
    void this.outbox.drain()
  }

  onRemoteProjection(remote: unknown, status?: ConnectedOperationStatus): void {
    let incoming = toConnectedProjection(remote)
    if (!incoming) return
    const { pending } = this
    const head = pending[0]?.event
    if (status?.operationId === head?.operationId) {
      this.operationStatus = status ?? null
      if (status?.status === "acknowledged") {
        // why: one event past what this device last confirmed can only be its own write, so serverUpdatedAt is that write's server time; any more and it may be someone else's.
        if (
          this.options.awaitProjectionBarrier &&
          head?.type === "life.changed" &&
          this.confirmed &&
          incoming.eventSequence === this.confirmed.eventSequence + 1
        )
          this.latency.ownWrite(status.operationId, { authorityAt: incoming.serverUpdatedAt })
        incoming = {
          ...incoming,
          recentOperationIds: [...incoming.recentOperationIds, status.operationId],
        }
      }
    }
    const fresh =
      !this.confirmed ||
      incoming.eventSequence > this.confirmed.eventSequence ||
      incoming.serverUpdatedAt > this.confirmed.serverUpdatedAt
    // why: the first fresh projection after mounting or reconnecting is a catch-up that measures time away (a replay of the cached one is not fresh), and one carrying this device's own write was painted before it was sent.
    if (
      this.timingLive &&
      pending.length === 0 &&
      this.confirmed &&
      incoming.eventSequence > this.confirmed.eventSequence
    )
      this.latency.remoteChange(incoming.serverUpdatedAt, incoming.eventSequence)
    if (fresh && this.environment.isWebSocketConnected) this.timingLive = true
    const merged = mergeConfirmedProjection(this.confirmed, incoming)
    this.options.repository.saveProjection(merged)
    this.confirmed = merged
    this.observeResumeProjection(merged)
    if (this.environment.isWebSocketConnected && this.reconnectPending) {
      this.reconnectPending = false
      emitTelemetry("reconnect.ready", { outcome: "success", pendingCount: pending.length })
    }
    this.outbox.acknowledge(incoming.recentOperationIds)
    this.outbox.resume()
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

  changeLife = (playerId: string, requested: LifeDelta): void => {
    const projection = this.displayProjection()
    const life = projection?.players.find((player) => player.playerId === playerId)?.currentLife
    const delta =
      projection && life !== undefined
        ? flooredLifeDelta(projection.system, life, requested)
        : requested
    if (!isLifeDelta(delta)) return
    if (this.addToLastQueuedLifeChange(playerId, delta)) return
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
    if (!this.outbox.enqueue(action)) {
      this.changeError = translate("connected:outbox.queueFull")
      this.publish()
      return
    }
    this.lastQueuedLifeChange = { playerId, operationId: action.event.operationId }
    this.changeError = undefined
    this.publish()
  }

  private addToLastQueuedLifeChange(playerId: string, delta: LifeDelta): boolean {
    const last = this.lastQueuedLifeChange
    if (last?.playerId !== playerId) return false
    const merged = this.outbox.rewriteUnattempted(last.operationId, (action) =>
      addToLifeChange(action, delta),
    )
    if (!merged) return false
    this.changeError = undefined
    this.publish()
    return true
  }

  submitCommanderDamage = (
    fromPlayerId: string,
    changes: readonly ConnectedCommanderDamageChange[],
  ): void => {
    if (!changes.every(({ delta }) => isCommanderDamageDelta(delta))) {
      this.changeError = translate("connected:outbox.commanderDamageRange", {
        max: MAX_COMMANDER_DAMAGE,
      })
      this.publish()
      return
    }
    if (changes.some(({ toPlayerId }) => toPlayerId === fromPlayerId)) {
      this.changeError = translate("connected:outbox.commanderSelfDamage")
      this.publish()
      return
    }
    for (const { toPlayerId, commander, delta } of changes) {
      const now = this.now()
      const action: PendingLifeAction = {
        schemaVersion: 1,
        event: {
          type: "commanderDamage.submitted",
          operationId: asOperationId(createClientId("commander", now)),
          gameId: asGameId(this.options.publicId),
          fromPlayerId: asPlayerId(fromPlayerId),
          toPlayerId: asPlayerId(toPlayerId),
          ...(commander ? { commander } : {}),
          delta,
          actorId: asActorId(this.options.ownerId),
          deviceId: this.options.deviceId,
          clientCreatedAt: now,
        },
        queuedAt: now,
        attempts: 0,
      }
      if (!this.outbox.enqueue(action)) {
        this.changeError = translate("connected:outbox.queueFull")
        this.publish()
        continue
      }
      this.lastQueuedLifeChange = undefined
      this.changeError = undefined
      this.publish()
    }
  }

  /**
   * Queues the defender's decision. Confirming offline is legitimate — the claim is
   * already on the server, so the resolution just replays when the socket returns.
   */
  resolveCommanderDamage = (claim: ConnectedCommanderDamageClaim, accepted: boolean): void => {
    // why: the server keeps one resolution per claim, so a second tap before the banner hides would fail with sync_operation_mismatch.
    if (
      this.pending.some(
        ({ event }) =>
          event.type === "commanderDamage.resolved" && event.claimOperationId === claim.operationId,
      )
    )
      return
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
    if (!this.outbox.enqueue(action)) {
      this.changeError = translate("connected:outbox.queueFull")
      this.publish()
      return
    }
    this.lastQueuedLifeChange = undefined
    this.changeError = undefined
    this.publish()
  }

  private tableSource(): TableSource | null {
    const projection = this.displayProjection()
    if (projection?.status !== "active") return null
    const playerOf = (playerId: string) =>
      projection.players.find((player) => player.playerId === playerId)
    return {
      table: projection.table,
      rules: playTableRules(projection.system, projection.format),
      playerIds: projection.players.map((player) => player.playerId),
      lifeOf: (playerId) => playerOf(playerId)?.currentLife,
      canAct: (playerId) => playerOf(playerId)?.controlledByMe === true,
    }
  }

  private enqueueTableAction(action: TableAction, operationId: string): boolean {
    const now = this.now()
    const accepted = this.outbox.enqueue({
      schemaVersion: 1,
      event: {
        type: "table.action",
        operationId: asOperationId(operationId),
        gameId: asGameId(this.options.publicId),
        action,
        actorId: asActorId(this.options.ownerId),
        deviceId: this.options.deviceId,
        clientCreatedAt: now,
      },
      queuedAt: now,
      attempts: 0,
    })
    if (!accepted) {
      this.changeError = translate("connected:outbox.queueFull")
      this.publish()
      return false
    }
    this.lastQueuedLifeChange = undefined
    this.changeError = undefined
    this.publish()
    return true
  }

  private endGame = async (
    action: "finish" | "abandon",
    submit: () => Promise<unknown>,
  ): Promise<boolean> => {
    if (this.finishing) return false
    this.finishError = undefined
    if (!this.canSync()) {
      this.finishError = translate(`connected:outbox.${action}.signIn`)
      this.publish()
      return false
    }
    if (this.pending.length > 0) {
      this.finishError = translate(`connected:outbox.${action}.pendingChanges`)
      this.publish()
      return false
    }
    if (this.outbox.getState().failures.length > 0) {
      this.finishError = translate(`connected:outbox.${action}.failedChanges`)
      this.publish()
      return false
    }
    try {
      this.finishing = true
      this.publish()
      await submit()
      return true
    } catch (cause) {
      this.finishError = convexErrorMessage(
        cause,
        cause instanceof Error ? cause.message : translate(`connected:outbox.${action}.failed`),
      )
      return false
    } finally {
      this.finishing = false
      this.publish()
    }
  }

  finish = async (result?: ConnectedGameResult): Promise<boolean> =>
    this.endGame("finish", () => this.options.finishGame(result))

  abandon = async (): Promise<boolean> => this.endGame("abandon", () => this.options.abandonGame())

  dismissFailed = (operationId: string): void => {
    this.outbox.dismiss(operationId)
    this.changeError = undefined
    this.publish()
  }

  dispose(): void {
    this.stopped = true
    this.unsubscribeOutbox()
    this.stopOutbox()
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

  /** why: keeps the board's projection identity while its inputs are unchanged, so environment and sync-status publishes do not re-render every seat. */
  private displayProjection(): ConnectedDisplayProjection | null {
    const { confirmed, pending } = this
    if (!confirmed) return null
    if (this.overlay?.confirmed !== confirmed || this.overlay.pending !== pending)
      this.overlay = { confirmed, pending, projection: overlayPendingDeltas(confirmed, pending) }
    return this.overlay.projection
  }

  private buildSnapshot(): OutboxSyncSnapshot {
    const { isAuthenticated, isLoading, isWebSocketConnected } = this.environment
    const { pending, failures, capacityBlocked } = this.outbox.getState()
    return {
      projection: this.displayProjection(),
      pending,
      failed: failures,
      connectionStatus:
        !isAuthenticated || !isWebSocketConnected
          ? "offline"
          : pending.length > 0 || isLoading
            ? "syncing"
            : "connected",
      changeError:
        this.changeError ??
        (capacityBlocked ? translate("connected:outbox.failureCapacity") : undefined),
      finishError: this.finishError,
      finishing: this.finishing,
    }
  }

  private publish(): void {
    if (this.confirmed) this.options.repository.cleanupTerminalGame(this.confirmed, this.outbox)
    this.store.set(this.buildSnapshot())
  }

  private async timedSend(action: PendingLifeAction): Promise<OutboxAcknowledgement> {
    const sentAt = this.now()
    const acknowledgement = await this.sendAndAwaitProjection(action, sentAt)
    this.latency.acknowledged(this.now() - sentAt)
    if (acknowledgement.operationId === action.event.operationId)
      emitTelemetry("mutation.ack", {
        durationMs: Math.max(0, this.now() - action.queuedAt),
        attemptCount: action.attempts,
        outcome: "success",
        writeKind: WRITE_KINDS[action.event.type],
      })
    return acknowledgement
  }

  private async sendAndAwaitProjection(
    action: PendingLifeAction,
    sentAt: number,
  ): Promise<OutboxAcknowledgement> {
    const acknowledgement = await this.options.send(action)
    // why: a retry of a write whose reply was lost pairs this send's timing with the first send's server time.
    if (
      this.options.awaitProjectionBarrier &&
      action.event.type === "life.changed" &&
      action.attempts === 1
    )
      this.latency.ownWrite(action.event.operationId, { sentAt, returnedAt: this.now() })
    if (action.event.type === "commanderDamage.submitted" && acknowledgement.status === "declined")
      this.claimDeclined(action.event.toPlayerId, action.event.delta)
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

  private claimDeclined(toPlayerId: string, delta: number): void {
    const name =
      this.confirmed?.players.find((player) => player.playerId === toPlayerId)?.displayName ??
      translate("connected:board.anotherSeat")
    this.changeError = translate("connected:outbox.commanderClaimDeclined", { name, delta })
    this.publish()
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
