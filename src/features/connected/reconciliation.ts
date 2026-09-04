import {
  CONNECTED_RECENT_OPERATION_LIMIT,
  type ConnectedDisplayProjection,
  type ConnectedProjection,
  type PendingLifeAction,
} from "./model"

export function mergeConfirmedProjection(
  current: ConnectedProjection | null,
  incoming: ConnectedProjection,
): ConnectedProjection {
  if (!current || current.publicId !== incoming.publicId) return incoming
  if (incoming.eventSequence > current.eventSequence) return incoming
  if (
    incoming.eventSequence === current.eventSequence &&
    incoming.serverUpdatedAt >= current.serverUpdatedAt
  )
    return incoming
  return current
}

export function overlayPendingDeltas(
  confirmed: ConnectedProjection,
  pending: readonly PendingLifeAction[],
): ConnectedDisplayProjection {
  if (confirmed.status === "finished" || confirmed.status === "abandoned") {
    return {
      ...confirmed,
      players: confirmed.players.map((player) => ({ ...player, pendingDelta: 0 })),
    }
  }
  const confirmedOperations = new Set(confirmed.recentOperationIds)
  const deltas = new Map<string, number>()
  for (const action of pending) {
    if (action.event.gameId !== confirmed.publicId) continue
    if (confirmedOperations.has(action.event.operationId)) continue
    // Commander damage only moves life once the defender confirms it, so queued
    // claims and resolutions contribute no optimistic delta.
    if (action.event.type !== "life.changed") continue
    deltas.set(action.event.playerId, (deltas.get(action.event.playerId) ?? 0) + action.event.delta)
  }
  return {
    ...confirmed,
    players: confirmed.players.map((player) => {
      const pendingDelta = deltas.get(player.playerId) ?? 0
      return { ...player, currentLife: player.currentLife + pendingDelta, pendingDelta }
    }),
  }
}

export function oldestFirst(actions: readonly PendingLifeAction[]): PendingLifeAction[] {
  return [...actions].sort(
    (left, right) =>
      left.queuedAt - right.queuedAt ||
      left.event.clientCreatedAt - right.event.clientCreatedAt ||
      left.event.operationId.localeCompare(right.event.operationId),
  )
}

export function optimisticallyApplyLife<T extends ConnectedProjection>(
  projection: T,
  args: { publicId: string; playerId: string; operationId: string; delta: number },
): T & { __optimisticOperationIds: string[] } {
  if (projection.publicId !== args.publicId) return { ...projection, __optimisticOperationIds: [] }
  const alreadyConfirmed = projection.recentOperationIds.includes(args.operationId)
  return {
    ...projection,
    recentOperationIds: alreadyConfirmed
      ? projection.recentOperationIds
      : [args.operationId, ...projection.recentOperationIds].slice(
          0,
          CONNECTED_RECENT_OPERATION_LIMIT,
        ),
    players: projection.players.map((player) =>
      !alreadyConfirmed && player.playerId === args.playerId
        ? { ...player, currentLife: player.currentLife + args.delta }
        : player,
    ),
    __optimisticOperationIds: [args.operationId],
  }
}

export type WriteFailureKind = "retry" | "permanent"

export function classifyWriteFailure(cause: unknown): WriteFailureKind {
  const message = cause instanceof Error ? cause.message : String(cause)
  return /Seat-owner permission|Game membership required|Game is not active|Game not found|Operation identifier was reused|Invalid operation|Invalid device identifier|Invalid client timestamp|Life delta|ArgumentValidationError|Invalid argument|not a valid ID|acknowledgement did not match/.test(
    message,
  )
    ? "permanent"
    : "retry"
}
