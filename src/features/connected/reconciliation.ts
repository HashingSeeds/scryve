import { playTableRules } from "@/features/game/playSystems"
import { convexErrorCode } from "@/utils/convexError"

import type { ConnectedDisplayProjection, ConnectedProjection, PendingLifeAction } from "./model"
import { PERMANENT_GAME_WRITE_CODES } from "../../../convex/lib/gameWriteErrors"
import { applyTableAction, EMPTY_TABLE } from "../../../convex/lib/table"

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
      table: confirmed.table ?? EMPTY_TABLE,
      players: confirmed.players.map((player) => ({ ...player, pendingDelta: 0 })),
    }
  }
  const confirmedOperations = new Set(confirmed.recentOperationIds)
  const deltas = new Map<string, number>()
  const addDelta = (playerId: string, delta: number) =>
    deltas.set(playerId, (deltas.get(playerId) ?? 0) + delta)
  const rules = playTableRules(confirmed.system, confirmed.format)
  let table = confirmed.table ?? EMPTY_TABLE
  for (const action of pending) {
    const { event } = action
    if (event.gameId !== confirmed.publicId) continue
    if (confirmedOperations.has(event.operationId)) continue
    if (event.type === "life.changed") addDelta(event.playerId, event.delta)
    // why: table actions replay through the shared reducer, so a queued knockout also shows the prizes it takes.
    if (event.type === "table.action") {
      const change = applyTableAction(table, event.action, {
        rules,
        operationId: event.operationId,
        lifeOf: (playerId) => {
          const player = confirmed.players.find((candidate) => candidate.playerId === playerId)
          return player && player.currentLife + (deltas.get(playerId) ?? 0)
        },
      })
      if (!change) continue
      table = change.table
      for (const life of change.life) addDelta(life.playerId, life.delta)
    }
    // Commander damage only moves life once the defender confirms it, so queued
    // claims and resolutions contribute no optimistic delta.
  }
  return {
    ...confirmed,
    table,
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

export type WriteFailureKind = "retry" | "permanent"

const permanentWriteCodes = new Set<string>(PERMANENT_GAME_WRITE_CODES)

export function classifyWriteFailure(cause: unknown): WriteFailureKind {
  const code = convexErrorCode(cause)
  if (code !== undefined) return permanentWriteCodes.has(code) ? "permanent" : "retry"
  const message = cause instanceof Error ? cause.message : String(cause)
  return /Seat-owner permission|Game membership required|Game is not active|Game not found|Operation identifier was reused|Invalid operation|Invalid device identifier|Invalid client timestamp|Life delta|ArgumentValidationError|Invalid argument|not a valid ID|acknowledgement did not match/.test(
    message,
  )
    ? "permanent"
    : "retry"
}
