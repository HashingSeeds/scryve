import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useConvexAuth, useConvexConnectionState, useMutation, useQuery } from "convex/react"

import type { ConnectionStatus } from "@/components/ConnectionBadge"
import {
  asActorId,
  asDeviceId,
  asGameId,
  asOperationId,
  asPlayerId,
  createClientId,
} from "@/features/game/domain"
import { LocalGameRepository } from "@/features/game/localPersistence"
import type { LifeDelta } from "@/features/game/types"
import { emitTelemetry } from "@/utils/telemetry"

import { drainConnectedOutbox } from "./drainOutbox"
import type {
  ConnectedDisplayProjection,
  ConnectedProjection,
  FailedLifeAction,
  PendingLifeAction,
} from "./model"
import { toConnectedProjection } from "./model"
import { ConnectedGameRepository } from "./persistence"
import {
  mergeConfirmedProjection,
  oldestFirst,
  optimisticallyApplyLife,
  overlayPendingDeltas,
} from "./reconciliation"
import { api } from "../../../convex/_generated/api"

export interface ConnectedGameRuntime {
  projection: ConnectedDisplayProjection | null
  pending: PendingLifeAction[]
  failed: FailedLifeAction[]
  connectionStatus: ConnectionStatus
  changeLife: (playerId: string, delta: LifeDelta) => void
  finish: () => Promise<void>
  dismissFailed: (operationId: string) => void
  changeError?: string
  finishError?: string
  finishing: boolean
}

export function connectedLifeOptimisticUpdater(store: any, args: any): void {
  const current = store.getQuery(api.games.lobbyProjection, { publicId: args.publicId })
  if (!current) return
  const optimistic = optimisticallyApplyLife(current, args)
  store.setQuery(api.games.lobbyProjection, { publicId: args.publicId }, {
    ...optimistic,
    __optimisticOperationIds: [
      ...((current as any).__optimisticOperationIds ?? []),
      args.operationId,
    ],
  } as any)
}

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

export function useConnectedGame(publicId: string, ownerId = "anonymous"): ConnectedGameRuntime {
  const { isAuthenticated, isLoading } = useConvexAuth()
  const { isWebSocketConnected } = useConvexConnectionState()
  const repository = useMemo(() => new ConnectedGameRepository(undefined, ownerId), [ownerId])
  const deviceId = useRef(asDeviceId(new LocalGameRepository().getDeviceId())).current
  const remote = useQuery(api.games.lobbyProjection, { publicId }) as any
  const remoteReady = Boolean(remote)
  const changeLifeBase = useMutation(api.games.changeLife)
  const changeLifeMutation = useMemo(
    () => changeLifeBase.withOptimisticUpdate(connectedLifeOptimisticUpdater),
    [changeLifeBase],
  )
  const finishMutation = useMutation(api.games.finishGame)
  const [confirmed, setConfirmed] = useState<ConnectedProjection | null>(() =>
    repository.loadProjection(publicId),
  )
  const [pending, setPending] = useState<PendingLifeAction[]>(() => repository.loadOutbox(publicId))
  const [failed, setFailed] = useState<FailedLifeAction[]>(() => repository.loadFailed(publicId))
  const [offline, setOffline] = useState(false)
  const [changeError, setChangeError] = useState<string>()
  const [finishError, setFinishError] = useState<string>()
  const [finishing, setFinishing] = useState(false)
  const [drainGeneration, setDrainGeneration] = useState(0)
  const inFlight = useRef(new Set<string>())
  const pendingRef = useRef(pending)
  const failedRef = useRef(failed)
  const dismissedFailureIds = useRef(new Set<string>())
  const draining = useRef(false)
  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const mounted = useRef(true)
  const reconnectPending = useRef(!isWebSocketConnected)
  const drainEpoch = useRef(0)

  useEffect(() => {
    drainEpoch.current += 1
  }, [isAuthenticated, isLoading, isWebSocketConnected, ownerId, publicId, remoteReady])

  useEffect(() => {
    if (!isWebSocketConnected) reconnectPending.current = true
  }, [isWebSocketConnected])

  useEffect(
    () => () => {
      mounted.current = false
      if (retryTimer.current) clearTimeout(retryTimer.current)
    },
    [],
  )

  useEffect(() => {
    if ((!isAuthenticated || isLoading || !isWebSocketConnected || !remote) && retryTimer.current) {
      clearTimeout(retryTimer.current)
      retryTimer.current = undefined
    }
  }, [isAuthenticated, isLoading, isWebSocketConnected, remote])

  useEffect(() => {
    const incoming = toConnectedProjection(remote)
    if (!incoming) return
    const optimistic = Array.isArray(remote?.__optimisticOperationIds)
    setConfirmed((current) => {
      const merged = mergeConfirmedProjection(current, incoming)
      if (!optimistic) repository.saveProjection(merged)
      return merged
    })
    if (!optimistic) {
      const observed = new Set(incoming.recentOperationIds)
      const remaining: PendingLifeAction[] = []
      for (const action of pendingRef.current) {
        const operationId = action.event.operationId
        if (observed.has(operationId) && !inFlight.current.has(operationId))
          repository.acknowledge(publicId, operationId)
        else remaining.push(action)
      }
      pendingRef.current = remaining
      setPending(remaining)
      setOffline(false)
      if (isWebSocketConnected && reconnectPending.current) {
        reconnectPending.current = false
        emitTelemetry("reconnect.ready", { outcome: "success", pendingCount: pending.length })
      }
    }
  }, [isWebSocketConnected, pending.length, publicId, remote, repository])

  useEffect(() => {
    if (confirmed) repository.cleanupTerminalGame(confirmed, pending, failed)
  }, [confirmed, failed, pending, repository])

  useEffect(() => {
    if (
      !isAuthenticated ||
      isLoading ||
      !isWebSocketConnected ||
      !remote ||
      pendingRef.current.length === 0 ||
      draining.current
    )
      return
    draining.current = true
    const epoch = drainEpoch.current
    const drainStartPending = [...pendingRef.current]
    const drainingOperationIds = new Set(
      drainStartPending.map((action) => action.event.operationId),
    )
    const applyDrainSnapshot = (snapshot: {
      pending: PendingLifeAction[]
      failures: FailedLifeAction[]
    }) => {
      if (!mounted.current) return
      const next = mergeDrainSnapshot(
        pendingRef.current,
        drainingOperationIds,
        snapshot.pending,
        snapshot.failures,
        dismissedFailureIds.current,
      )
      pendingRef.current = next.pending
      failedRef.current = next.failures
      setPending(next.pending)
      setFailed(next.failures)
    }
    let rerunAfterDrain = false
    void (async () => {
      try {
        const result = await drainConnectedOutbox({
          repository,
          publicId,
          failed: failedRef.current,
          currentFailures: () => failedRef.current,
          send: (queued) =>
            changeLifeMutation({
              publicId,
              playerId: queued.event.playerId,
              operationId: queued.event.operationId,
              delta: queued.event.delta,
              deviceId: queued.event.deviceId,
              clientCreatedAt: queued.event.clientCreatedAt,
            }),
          onAttempt: (operationId) => inFlight.current.add(operationId),
          onSettled: (operationId) => inFlight.current.delete(operationId),
          onChange: applyDrainSnapshot,
          shouldContinue: () => mounted.current && drainEpoch.current === epoch,
        })
        if (!mounted.current) return
        const settledIds = new Set([...result.acknowledged, ...result.failed])
        applyDrainSnapshot({
          pending:
            result.pending ??
            drainStartPending.filter((action) => !settledIds.has(action.event.operationId)),
          failures: result.failures ?? failedRef.current,
        })
        setOffline(result.stoppedForRetry)
        if (result.blockedByFailureCapacity)
          setChangeError(
            "Failed changes need review before more rejected changes can be retained. Dismiss reviewed failures, then retry syncing.",
          )
        if (result.stoppedForRetry && isWebSocketConnected && mounted.current) {
          const attempts = pendingRef.current[0]?.attempts ?? 0
          const delay = Math.min(250 * 2 ** Math.min(attempts, 5), 8_000)
          if (retryTimer.current) clearTimeout(retryTimer.current)
          retryTimer.current = setTimeout(() => {
            if (!mounted.current) return
            retryTimer.current = undefined
            setDrainGeneration((generation) => generation + 1)
          }, delay)
        } else if (
          !result.blockedByFailureCapacity &&
          drainEpoch.current === epoch &&
          pendingRef.current.length > 0
        ) {
          rerunAfterDrain = true
        }
      } finally {
        draining.current = false
        if (rerunAfterDrain && mounted.current) setDrainGeneration((generation) => generation + 1)
      }
    })()
  }, [
    changeLifeMutation,
    drainGeneration,
    isAuthenticated,
    isLoading,
    isWebSocketConnected,
    publicId,
    remote,
    repository,
    pending.length,
  ])

  const changeLife = useCallback(
    (playerId: string, delta: LifeDelta) => {
      const now = Date.now()
      const action: PendingLifeAction = {
        schemaVersion: 1,
        event: {
          type: "life.changed",
          operationId: asOperationId(createClientId("operation", now)),
          gameId: asGameId(publicId),
          playerId: asPlayerId(playerId),
          delta,
          actorId: asActorId(ownerId),
          deviceId,
          clientCreatedAt: now,
        },
        queuedAt: now,
        attempts: 0,
      }
      const result = repository.enqueue(action, pendingRef.current)
      if (!result.accepted) {
        setChangeError(
          "The offline queue for pending changes is full. Reconnect and sync before making more changes.",
        )
        return
      }
      pendingRef.current = result.pending
      setPending(result.pending)
      setChangeError(undefined)
    },
    [deviceId, ownerId, publicId, repository],
  )

  const finish = useCallback(async () => {
    setFinishError(undefined)
    if (!isAuthenticated || isLoading || !isWebSocketConnected || !remote) {
      setFinishError("Connect and sign in before finishing this game.")
      return
    }
    if (repository.loadOutbox(publicId).length > 0) {
      setFinishError("Wait for pending life changes to sync before finishing.")
      return
    }
    try {
      setFinishing(true)
      await finishMutation({ publicId })
    } catch (cause) {
      setFinishError(cause instanceof Error ? cause.message : "Could not finish the game")
    } finally {
      setFinishing(false)
    }
  }, [
    finishMutation,
    isAuthenticated,
    isLoading,
    isWebSocketConnected,
    publicId,
    remote,
    repository,
  ])

  const dismissFailed = useCallback(
    (operationId: string) => {
      dismissedFailureIds.current.add(operationId)
      repository.dismissFailed(publicId, operationId)
      const remaining = failedRef.current.filter(
        (failure) => failure.action.event.operationId !== operationId,
      )
      failedRef.current = remaining
      setFailed(remaining)
      setChangeError(undefined)
      setDrainGeneration((generation) => generation + 1)
    },
    [publicId, repository],
  )

  const projection = useMemo(
    () => (confirmed ? overlayPendingDeltas(confirmed, pending) : null),
    [confirmed, pending],
  )
  const connectionStatus: ConnectionStatus =
    offline || !isAuthenticated || !isWebSocketConnected
      ? "offline"
      : pending.length > 0 || isLoading
        ? "syncing"
        : "connected"

  return {
    projection,
    pending,
    failed,
    connectionStatus,
    changeLife,
    finish,
    dismissFailed,
    changeError,
    finishError,
    finishing,
  }
}
