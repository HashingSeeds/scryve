import { useEffect, useMemo, useRef, useState } from "react"
import { useValue } from "@legendapp/state/react"
import { useConvexAuth, useMutation, useQuery } from "convex/react"
import type { FunctionArgs } from "convex/server"

import { asDeviceId } from "@/features/game/domain"
import { LocalGameRepository } from "@/features/game/localPersistence"
import { playTableRules } from "@/features/game/playSystems"
import type { TableRuntime } from "@/features/game/tableRuntime"
import type { LifeDelta } from "@/features/game/types"
import type { OutboxAcknowledgement } from "@/features/sync/drainOutbox"
import { captureGame } from "@/utils/analytics"
import { recordReviewCompletion } from "@/utils/storeReview"

import { createLobbyIdentifiers } from "./identifiers"
import type {
  ConnectionStatus,
  ConnectedActionEvent,
  ConnectedCommanderDamageChange,
  ConnectedCommanderDamageClaim,
  ConnectedDisplayProjection,
  FailedLifeAction,
  PendingLifeAction,
} from "./model"
import { OutboxSyncController } from "./OutboxSyncController"
import type { ConnectedGameResult } from "./OutboxSyncController"
import { connectedDeploymentScope, ConnectedGameRepository } from "./persistence"
import { useConvexOnline } from "./useConvexOnline"
import { useRemoteReady } from "./useRemoteReady"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { EMPTY_TABLE } from "../../../convex/lib/table"

export { mergeDrainSnapshot } from "./OutboxSyncController"

interface ConnectedGameRuntimeBase extends TableRuntime {
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
    | { status: "unavailable"; message: string; projection: null }
    | {
        status: "ready"
        source: "cache" | "remote"
        projection: ConnectedDisplayProjection
      }
  )

export const CONNECTED_GAME_UNAVAILABLE_MS = 1_500

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
  if (event.type === "table.action")
    return {
      kind: event.type,
      operationId: event.operationId,
      action: event.action,
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

type QueuedActionMutations = {
  [
    Name in
      | "changeLife"
      | "tableAction"
      | "submitCommanderDamage"
      | "confirmCommanderDamage"
      | "declineCommanderDamage"
  ]: (args: FunctionArgs<(typeof api.games)[Name]>) => Promise<OutboxAcknowledgement>
}

/** why: sends a queued action by picking each mutation arg from its event so nothing else stored with it reaches a strict validator. */
export function sendQueuedAction(
  mutations: QueuedActionMutations,
  publicId: string,
  { event }: PendingLifeAction,
): Promise<OutboxAcknowledgement> {
  if (event.type === "life.changed")
    return mutations.changeLife({
      publicId,
      playerId: event.playerId as unknown as Id<"gamePlayers">,
      operationId: event.operationId,
      delta: event.delta,
      deviceId: event.deviceId,
      clientCreatedAt: event.clientCreatedAt,
    })
  if (event.type === "table.action")
    return mutations.tableAction({
      publicId,
      operationId: event.operationId,
      deviceId: event.deviceId,
      clientCreatedAt: event.clientCreatedAt,
      action: event.action,
    })
  if (event.type === "commanderDamage.submitted")
    return mutations.submitCommanderDamage({
      publicId,
      fromPlayerId: event.fromPlayerId as unknown as Id<"gamePlayers">,
      toPlayerId: event.toPlayerId as unknown as Id<"gamePlayers">,
      operationId: event.operationId,
      delta: event.delta,
      deviceId: event.deviceId,
      clientCreatedAt: event.clientCreatedAt,
    })
  const resolve = event.accepted
    ? mutations.confirmCommanderDamage
    : mutations.declineCommanderDamage
  return resolve({
    publicId,
    operationId: event.claimOperationId,
    resolutionOperationId: event.operationId,
    deviceId: event.deviceId,
    clientCreatedAt: event.clientCreatedAt,
  }).then((claimAcknowledgement) =>
    acknowledgementForQueuedResolution(claimAcknowledgement, event.operationId),
  )
}

export function useConnectedGame(publicId: string, ownerId = "anonymous"): ConnectedGameRuntime {
  const { isAuthenticated, isLoading, isRefreshing } = useConvexAuth()
  const isWebSocketConnected = useConvexOnline()
  const deployment = useMemo(() => connectedDeploymentScope(), [])
  const repository = useMemo(
    () => new ConnectedGameRepository(undefined, ownerId, {}, deployment),
    [ownerId, deployment],
  )
  const deviceId = useRef(asDeviceId(new LocalGameRepository().getDeviceId())).current
  const changeLifeMutation = useMutation(api.games.changeLife)
  const finishMutation = useMutation(api.games.finishGame)
  const abandonMutation = useMutation(api.games.abandonGame)
  const submitCommanderDamageMutation = useMutation(api.games.submitCommanderDamage)
  const confirmCommanderDamageMutation = useMutation(api.games.confirmCommanderDamage)
  const declineCommanderDamageMutation = useMutation(api.games.declineCommanderDamage)
  const tableActionMutation = useMutation(api.games.tableAction)
  const mutations = useRef({
    changeLifeMutation,
    submitCommanderDamageMutation,
    confirmCommanderDamageMutation,
    declineCommanderDamageMutation,
    tableActionMutation,
    finishMutation,
    abandonMutation,
  })
  mutations.current = {
    changeLifeMutation,
    submitCommanderDamageMutation,
    confirmCommanderDamageMutation,
    declineCommanderDamageMutation,
    tableActionMutation,
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
        send: (action) =>
          sendQueuedAction(
            {
              changeLife: mutations.current.changeLifeMutation,
              tableAction: mutations.current.tableActionMutation,
              submitCommanderDamage: mutations.current.submitCommanderDamageMutation,
              confirmCommanderDamage: mutations.current.confirmCommanderDamageMutation,
              declineCommanderDamage: mutations.current.declineCommanderDamageMutation,
            },
            publicId,
            action,
          ),
        finishGame: async (result) =>
          mutations.current.finishMutation({
            publicId,
            rematch: await createLobbyIdentifiers(),
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
  const snapshot = useValue(() => controller.state$.get())
  const head = snapshot.pending[0]?.event
  const projectionArgsWhileSignedIn = isAuthenticated
    ? {
        publicId,
        deviceId,
        includeRecentOperationIds: false,
        ...(head ? { operation: operationCheckFor(head) } : {}),
      }
    : "skip"
  const remote = useQuery(api.games.lobbyProjection, projectionArgsWhileSignedIn)
  const remoteReady = useRemoteReady(publicId, isAuthenticated, remote)
  const unreachableWithoutCache =
    !snapshot.projection && !remoteReady && !isWebSocketConnected && !isLoading && !isRefreshing
  const [unreachableTimedOut, setUnreachableTimedOut] = useState(false)
  useEffect(() => {
    if (!unreachableWithoutCache) {
      setUnreachableTimedOut(false)
      return
    }
    const timer = setTimeout(() => setUnreachableTimedOut(true), CONNECTED_GAME_UNAVAILABLE_MS)
    return () => clearTimeout(timer)
  }, [unreachableWithoutCache])
  const observedGame = useRef<{ id: string; status: string } | undefined>(undefined)
  useEffect(() => {
    const projection = snapshot.projection
    if (!projection) return
    const previous = observedGame.current
    if (
      previous?.id === projection.publicId &&
      previous.status === "active" &&
      projection.status === "finished"
    ) {
      recordReviewCompletion(`connected:${projection.publicId}`)
      captureGame(
        "game_completed",
        {
          id: projection.publicId,
          system: projection.system,
          format: projection.format,
          playerCount: projection.playerCount,
        },
        "connected",
      )
    }
    observedGame.current = { id: projection.publicId, status: projection.status }
  }, [snapshot.projection])

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

  // why: the projection query re-renders this hook on every resubscribe, so the board only sees a new runtime when the snapshot or readiness changed.
  return useMemo((): ConnectedGameRuntime => {
    const projection = snapshot.projection
    const runtime = {
      ...controller.table,
      table: projection?.table ?? EMPTY_TABLE,
      tableRules: playTableRules(projection?.system, projection?.format),
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
    return projection
      ? {
          ...runtime,
          status: "ready",
          source: remoteReady ? "remote" : "cache",
          projection,
        }
      : unreachableTimedOut
        ? {
            ...runtime,
            status: "unavailable",
            message:
              "This board is not saved on this device. Reconnect so the game can be loaded here.",
            projection: null,
          }
        : { ...runtime, status: "loading", projection: null }
  }, [controller, remoteReady, snapshot, unreachableTimedOut])
}
