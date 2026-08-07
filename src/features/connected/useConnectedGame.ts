import { useEffect, useMemo, useRef, useSyncExternalStore } from "react"
import type { OptimisticLocalStore } from "convex/browser"
import { useConvexAuth, useConvexConnectionState, useMutation, useQuery } from "convex/react"
import type { FunctionReturnType } from "convex/server"

import type { ConnectionStatus } from "@/components/ConnectionBadge"
import { asDeviceId } from "@/features/game/domain"
import { LocalGameRepository } from "@/features/game/localPersistence"
import type { LifeDelta } from "@/features/game/types"

import type { ConnectedDisplayProjection, FailedLifeAction, PendingLifeAction } from "./model"
import { OutboxSyncController } from "./OutboxSyncController"
import { ConnectedGameRepository } from "./persistence"
import { optimisticallyApplyLife } from "./reconciliation"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"

export { mergeDrainSnapshot } from "./OutboxSyncController"

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
  const next: OptimisticLobbyProjection = {
    ...optimisticallyApplyLife(current, args),
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
  const remoteReady = Boolean(remote)
  const changeLifeBase = useMutation(api.games.changeLife)
  const changeLifeMutation = useMemo(
    () => changeLifeBase.withOptimisticUpdate(connectedLifeOptimisticUpdater),
    [changeLifeBase],
  )
  const finishMutation = useMutation(api.games.finishGame)
  const mutations = useRef({ changeLifeMutation, finishMutation })
  mutations.current = { changeLifeMutation, finishMutation }

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
        finishGame: () => mutations.current.finishMutation({ publicId }),
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

  return {
    ...snapshot,
    changeLife: controller.changeLife,
    finish: controller.finish,
    dismissFailed: controller.dismissFailed,
  }
}
