import { useEffect, useMemo, useRef, useSyncExternalStore } from "react"
import { useConvexAuth, useConvexConnectionState, useMutation, useQuery } from "convex/react"

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

export function useConnectedGame(publicId: string, ownerId = "anonymous"): ConnectedGameRuntime {
  const { isAuthenticated, isLoading, isRefreshing } = useConvexAuth()
  const { isWebSocketConnected } = useConvexConnectionState()
  const repository = useMemo(() => new ConnectedGameRepository(undefined, ownerId), [ownerId])
  const deviceId = useRef(asDeviceId(new LocalGameRepository().getDeviceId())).current
  const changeLifeMutation = useMutation(api.games.changeLife)
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
  const remote = useQuery(api.games.lobbyProjection, {
    publicId,
    deviceId,
    includeRecentOperationIds: false,
    ...(head ? { operation: operationCheckFor(head) } : {}),
  })
  const remoteReady = toConnectedProjection(remote) !== null

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
    if (head && remote?.operationStatus?.operationId !== head.operationId) return
    controller.onRemoteProjection(remote, remote?.operationStatus)
  }, [controller, isWebSocketConnected, remote, head])

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
