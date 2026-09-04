import { useEffect, useMemo, useRef, useSyncExternalStore } from "react"
import type { OptimisticLocalStore } from "convex/browser"
import { useConvexAuth, useConvexConnectionState, useMutation, useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"

import type { ConnectionStatus } from "@/components/ConnectionBadge"
import { asDeviceId } from "@/features/game/domain"
import { LocalGameRepository } from "@/features/game/localPersistence"
import type { LifeDelta } from "@/features/game/types"
import type { OutboxAcknowledgement } from "@/features/sync/drainOutbox"

import type {
  ConnectedActionEvent,
  ConnectedCommanderDamageChange,
  ConnectedCommanderDamageClaim,
  ConnectedDisplayProjection,
  FailedLifeAction,
  PendingLifeAction,
} from "./model"
import { toConnectedProjection } from "./model"
import { OutboxSyncController } from "./OutboxSyncController"
import type { ConnectedGameResult } from "./OutboxSyncController"
import { ConnectedGameRepository } from "./persistence"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"

export { mergeDrainSnapshot } from "./OutboxSyncController"

interface ConnectedGameRuntimeBase {
  pending: PendingLifeAction[]
  failed: FailedLifeAction[]
  connectionStatus: ConnectionStatus
  changeLife: (playerId: string, delta: LifeDelta) => void
  submitCommanderDamage: (
    fromPlayerId: string,
    changes: readonly ConnectedCommanderDamageChange[],
  ) => void
  resolveCommanderDamageClaim: (claim: ConnectedCommanderDamageClaim, accepted: boolean) => void
  finish: (result?: ConnectedGameResult) => Promise<boolean>
  abandon: () => Promise<boolean>
  dismissFailed: (operationId: string) => void
  changeError?: string
  finishError?: string
  finishing: boolean
}

export type ConnectedGameRuntime = ConnectedGameRuntimeBase &
  (
    | { status: "loading"; projection: null }
    | {
        status: "ready"
        source: "cache" | "remote"
        projection: ConnectedDisplayProjection
      }
  )

type LobbyProjection = FunctionReturnType<typeof api.games.lobbyProjection>
type OptimisticLobbyProjection = LobbyProjection & { __optimisticOperationIds?: string[] }

function operationCheckFor(event: ConnectedActionEvent) {
  if (event.type === "life.changed")
    return {
      kind: event.type,
      operationId: event.operationId,
      playerId: event.playerId as unknown as Id<"gamePlayers">,
      delta: event.delta,
      deviceId: event.deviceId,
      clientCreatedAt: event.clientCreatedAt,
    } as const
  if (event.type === "commanderDamage.submitted")
    return {
      kind: event.type,
      operationId: event.operationId,
      fromPlayerId: event.fromPlayerId as unknown as Id<"gamePlayers">,
      toPlayerId: event.toPlayerId as unknown as Id<"gamePlayers">,
      delta: event.delta,
      deviceId: event.deviceId,
      clientCreatedAt: event.clientCreatedAt,
    } as const
  return {
    kind: event.type,
    operationId: event.operationId,
    claimOperationId: event.claimOperationId,
    toPlayerId: event.toPlayerId as unknown as Id<"gamePlayers">,
    accepted: event.accepted,
    deviceId: event.deviceId,
    clientCreatedAt: event.clientCreatedAt,
  } as const
}

function acknowledgementForQueuedResolution(
  claimAcknowledgement: OutboxAcknowledgement,
  queuedResolutionOperationId: string,
): OutboxAcknowledgement {
  return { ...claimAcknowledgement, operationId: queuedResolutionOperationId }
}

export function connectedLifeOptimisticUpdater(
  store: OptimisticLocalStore,
  args: {
    publicId: string
    deviceId?: string
    playerId: string
    operationId: string
    delta: number
  },
): void {
  const current = store.getQuery(api.games.lobbyProjection, {
    publicId: args.publicId,
    deviceId: args.deviceId,
    includeRecentOperationIds: false,
  }) as OptimisticLobbyProjection | undefined
  if (!current) return
  const alreadyConfirmed = current.recentOperationIds.includes(args.operationId)
  const next: OptimisticLobbyProjection = {
    ...current,
    recentOperationIds: alreadyConfirmed
      ? current.recentOperationIds
      : [args.operationId, ...current.recentOperationIds].slice(0, 100),
    players: current.players.map((player) =>
      !alreadyConfirmed && player.playerId === args.playerId
        ? { ...player, currentLife: player.currentLife + args.delta }
        : player,
    ),
    __optimisticOperationIds: [...(current.__optimisticOperationIds ?? []), args.operationId],
  }
  store.setQuery(
    api.games.lobbyProjection,
    { publicId: args.publicId, deviceId: args.deviceId, includeRecentOperationIds: false },
    next,
  )
}

export function useConnectedGame(publicId: string, ownerId = "anonymous"): ConnectedGameRuntime {
  const { isAuthenticated, isLoading, isRefreshing } = useConvexAuth()
  const { isWebSocketConnected } = useConvexConnectionState()
  const repository = useMemo(() => new ConnectedGameRepository(undefined, ownerId), [ownerId])
  const deviceId = useRef(asDeviceId(new LocalGameRepository().getDeviceId())).current
  const remote: unknown = useQuery(api.games.lobbyProjection, {
    publicId,
    deviceId,
    includeRecentOperationIds: false,
  })
  const remoteReady = toConnectedProjection(remote) !== null
  const changeLifeBase = useMutation(api.games.changeLife)
  const changeLifeMutation = useMemo(
    () => changeLifeBase.withOptimisticUpdate(connectedLifeOptimisticUpdater),
    [changeLifeBase],
  )
  const finishMutation = useMutation(api.games.finishGame)
  const abandonMutation = useMutation(api.games.abandonGame)
  const submitCommanderDamageMutation = useMutation(api.games.submitCommanderDamage)
  const confirmCommanderDamageMutation = useMutation(api.games.confirmCommanderDamage)
  const declineCommanderDamageMutation = useMutation(api.games.declineCommanderDamage)
  const mutations = useRef({
    changeLifeMutation,
    submitCommanderDamageMutation,
    confirmCommanderDamageMutation,
    declineCommanderDamageMutation,
    finishMutation,
    abandonMutation,
  })
  mutations.current = {
    changeLifeMutation,
    submitCommanderDamageMutation,
    confirmCommanderDamageMutation,
    declineCommanderDamageMutation,
    finishMutation,
    abandonMutation,
  }

  const controller = useMemo(
    () =>
      new OutboxSyncController({
        repository,
        publicId,
        ownerId,
        deviceId,
        send: (action) => {
          const { event } = action
          if (event.type === "life.changed")
            return mutations.current.changeLifeMutation({
              publicId,
              playerId: event.playerId as unknown as Id<"gamePlayers">,
              operationId: event.operationId,
              delta: event.delta,
              deviceId: event.deviceId,
              clientCreatedAt: event.clientCreatedAt,
            })
          if (event.type === "commanderDamage.submitted")
            return mutations.current.submitCommanderDamageMutation({
              publicId,
              fromPlayerId: event.fromPlayerId as unknown as Id<"gamePlayers">,
              toPlayerId: event.toPlayerId as unknown as Id<"gamePlayers">,
              operationId: event.operationId,
              delta: event.delta,
              deviceId: event.deviceId,
              clientCreatedAt: event.clientCreatedAt,
            })
          const resolve = event.accepted
            ? mutations.current.confirmCommanderDamageMutation
            : mutations.current.declineCommanderDamageMutation
          return resolve({
            publicId,
            operationId: event.claimOperationId,
            resolutionOperationId: event.operationId,
            deviceId: event.deviceId,
            clientCreatedAt: event.clientCreatedAt,
          }).then((claimAcknowledgement) =>
            acknowledgementForQueuedResolution(claimAcknowledgement, event.operationId),
          )
        },
        finishGame: (result) =>
          mutations.current.finishMutation({
            publicId,
            ...(result
              ? {
                  result:
                    result.kind === "win"
                      ? {
                          kind: "win" as const,
                          winnerPlayerIds: result.winnerPlayerIds as Id<"gamePlayers">[],
                        }
                      : result,
                }
              : {}),
          }),
        abandonGame: () => mutations.current.abandonMutation({ publicId }),
        awaitProjectionBarrier: true,
      }),
    [deviceId, ownerId, publicId, repository],
  )
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  const head = snapshot.pending[0]?.event
  const operationStatus = useQuery(
    api.games.connectedOperationStatus,
    head
      ? {
          publicId,
          operation: operationCheckFor(head),
        }
      : "skip",
  )

  useEffect(() => {
    controller.setEnvironment({
      isAuthenticated,
      isLoading,
      isRefreshing,
      isWebSocketConnected,
      remoteReady,
    })
  }, [controller, isAuthenticated, isLoading, isRefreshing, isWebSocketConnected, remoteReady])

  useEffect(() => {
    controller.onRemoteProjection(remote)
  }, [controller, isWebSocketConnected, remote, snapshot.pending.length])

  useEffect(() => {
    controller.onOperationStatus(operationStatus)
  }, [controller, operationStatus])

  useEffect(() => () => controller.dispose(), [controller])

  const runtime = {
    pending: snapshot.pending,
    failed: snapshot.failed,
    connectionStatus: snapshot.connectionStatus,
    changeError: snapshot.changeError,
    finishError: snapshot.finishError,
    finishing: snapshot.finishing,
    changeLife: controller.changeLife,
    submitCommanderDamage: controller.submitCommanderDamage,
    resolveCommanderDamageClaim: controller.resolveCommanderDamage,
    finish: controller.finish,
    abandon: controller.abandon,
    dismissFailed: controller.dismissFailed,
  }
  return snapshot.projection
    ? {
        ...runtime,
        status: "ready",
        source: remoteReady ? "remote" : "cache",
        projection: snapshot.projection,
      }
    : { ...runtime, status: "loading", projection: null }
}
