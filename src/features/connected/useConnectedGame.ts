import { useEffect, useMemo, useRef, useSyncExternalStore } from "react"
import type { OptimisticLocalStore } from "convex/browser"
import { useConvexAuth, useConvexConnectionState, useMutation, useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"

import type { ConnectionStatus } from "@/components/ConnectionBadge"
import { asDeviceId } from "@/features/game/domain"
import { LocalGameRepository } from "@/features/game/localPersistence"
import type { LifeDelta } from "@/features/game/types"

import type { ConnectedDisplayProjection, FailedLifeAction, PendingLifeAction } from "./model"
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
    { publicId: args.publicId, deviceId: args.deviceId },
    next,
  )
}

export function useConnectedGame(publicId: string, ownerId = "anonymous"): ConnectedGameRuntime {
  const { isAuthenticated, isLoading } = useConvexAuth()
  const { isWebSocketConnected } = useConvexConnectionState()
  const repository = useMemo(() => new ConnectedGameRepository(undefined, ownerId), [ownerId])
  const deviceId = useRef(asDeviceId(new LocalGameRepository().getDeviceId())).current
  const remote: unknown = useQuery(api.games.lobbyProjection, { publicId, deviceId })
  const remoteReady = toConnectedProjection(remote) !== null
  const changeLifeBase = useMutation(api.games.changeLife)
  const changeLifeMutation = useMemo(
    () => changeLifeBase.withOptimisticUpdate(connectedLifeOptimisticUpdater),
    [changeLifeBase],
  )
  const finishMutation = useMutation(api.games.finishGame)
  const abandonMutation = useMutation(api.games.abandonGame)
  const mutations = useRef({ changeLifeMutation, finishMutation, abandonMutation })
  mutations.current = { changeLifeMutation, finishMutation, abandonMutation }

  const controller = useMemo(
    () =>
      new OutboxSyncController({
        repository,
        publicId,
        ownerId,
        deviceId,
        send: (action) =>
          mutations.current.changeLifeMutation({
            publicId,
            playerId: action.event.playerId as unknown as Id<"gamePlayers">,
            operationId: action.event.operationId,
            delta: action.event.delta,
            deviceId: action.event.deviceId,
            clientCreatedAt: action.event.clientCreatedAt,
          }),
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
      }),
    [deviceId, ownerId, publicId, repository],
  )
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot)

  useEffect(() => {
    controller.setEnvironment({ isAuthenticated, isLoading, isWebSocketConnected, remoteReady })
  }, [controller, isAuthenticated, isLoading, isWebSocketConnected, remoteReady])

  useEffect(() => {
    controller.onRemoteProjection(remote)
  }, [controller, isWebSocketConnected, remote, snapshot.pending.length])

  useEffect(() => () => controller.dispose(), [controller])

  const runtime = {
    pending: snapshot.pending,
    failed: snapshot.failed,
    connectionStatus: snapshot.connectionStatus,
    changeError: snapshot.changeError,
    finishError: snapshot.finishError,
    finishing: snapshot.finishing,
    changeLife: controller.changeLife,
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
