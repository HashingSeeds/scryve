import { useMemo } from "react"
import { useConvexAuth, useMutation, useQuery } from "convex/react"
import type { FunctionArgs } from "convex/server"

import type { OutboxAcknowledgement } from "@/features/sync/outbox"

import { createLobbyIdentifiers } from "./identifiers"
import type { ConnectedActionEvent, PendingLifeAction } from "./model"
import { connectedDeploymentScope } from "./persistence"
import {
  useConnectedRuntime,
  useConnectedSession,
  type ConnectedWrites,
} from "./useConnectedRuntime"
import { useConvexOnline } from "./useConvexOnline"
import { useRemoteReady } from "./useRemoteReady"
import { api } from "../../../convex/_generated/api"
import type { Id } from "../../../convex/_generated/dataModel"
import { TABLE_VERSION } from "../../../convex/lib/table"

export { CONNECTED_GAME_UNAVAILABLE_MS, type ConnectedGameRuntime } from "./useConnectedRuntime"

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
      ...(event.commander ? { commander: event.commander } : {}),
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
      ...(event.commander ? { commander: event.commander } : {}),
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

export function useConnectedGame(publicId: string, ownerId = "anonymous") {
  const { isAuthenticated, isLoading, isRefreshing } = useConvexAuth()
  const isWebSocketConnected = useConvexOnline()
  const scope = useMemo(() => connectedDeploymentScope(), [])
  const changeLife = useMutation(api.games.changeLife)
  const tableAction = useMutation(api.games.tableAction)
  const submitCommanderDamage = useMutation(api.games.submitCommanderDamage)
  const confirmCommanderDamage = useMutation(api.games.confirmCommanderDamage)
  const declineCommanderDamage = useMutation(api.games.declineCommanderDamage)
  const finishMutation = useMutation(api.games.finishGame)
  const abandonMutation = useMutation(api.games.abandonGame)
  const writes: ConnectedWrites = {
    send: (action) =>
      sendQueuedAction(
        {
          changeLife,
          tableAction,
          submitCommanderDamage,
          confirmCommanderDamage,
          declineCommanderDamage,
        },
        publicId,
        action,
      ),
    finish: async (result) =>
      finishMutation({
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
    abandon: () => abandonMutation({ publicId }),
  }
  const session = useConnectedSession({
    publicId,
    ownerId,
    scope,
    writes,
    awaitProjectionBarrier: true,
  })
  const { head, deviceId } = session
  const remote = useQuery(
    api.games.lobbyProjection,
    isAuthenticated
      ? {
          publicId,
          deviceId,
          includeRecentOperationIds: false,
          tableVersion: TABLE_VERSION,
          ...(head ? { operation: operationCheckFor(head) } : {}),
        }
      : "skip",
  )
  const remoteReady = useRemoteReady(publicId, isAuthenticated, remote)
  return useConnectedRuntime(session, {
    remote,
    operationStatus: remote?.operationStatus,
    environment: { isAuthenticated, isLoading, isRefreshing, isWebSocketConnected, remoteReady },
  })
}
