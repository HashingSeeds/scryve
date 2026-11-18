import { playTableRules } from "@/features/game/playSystems"
import { convexErrorCode } from "@/utils/convexError"

import type {
  ConnectedCommanderDamageTotal,
  ConnectedDisplayProjection,
  ConnectedProjection,
  PendingLifeAction,
} from "./model"
import { compareQueued } from "./model"
import { PERMANENT_GAME_WRITE_CODES } from "../../../convex/lib/gameWriteErrors"
import { applyTableAction, EMPTY_TABLE } from "../../../convex/lib/table"
import { isTeamVariant } from "../../../convex/lib/teamVariants"
import { turnGroupOf } from "../../../convex/lib/turns"
import { teamTableRules } from "../../../convex/lib/twoHeadedGiant"

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
  let table = confirmed.table ?? EMPTY_TABLE
  const teams = isTeamVariant(confirmed.variant) ? table.turnGroups : undefined
  const addDelta = (playerId: string, delta: number) => {
    for (const id of turnGroupOf(teams, playerId)) deltas.set(id, (deltas.get(id) ?? 0) + delta)
  }
  const seatRules = playTableRules(confirmed.system, confirmed.format)
  const rules = teams ? teamTableRules(seatRules) : seatRules
  const commanderHits: {
    fromPlayerId: string
    toPlayerId: string
    commander?: 1
    delta: number
  }[] = []
  for (const action of pending) {
    const { event } = action
    if (event.gameId !== confirmed.publicId) continue
    if (confirmedOperations.has(event.operationId)) continue
    if (event.type === "life.changed") addDelta(event.playerId, event.delta)
    if (event.type === "table.action") {
      const change = applyTableAction(table, event.action, {
        rules,
        operationId: event.operationId,
        now: event.clientCreatedAt,
        lifeOf: (playerId) => {
          const player = confirmed.players.find((candidate) => candidate.playerId === playerId)
          return player && player.currentLife + (deltas.get(playerId) ?? 0)
        },
      })
      if (!change) continue
      table = change.table
      for (const life of change.life) addDelta(life.playerId, life.delta)
    }
    if (event.type === "commanderDamage.submitted") {
      addDelta(event.toPlayerId, -event.delta)
      commanderHits.push(event)
    }
  }
  const { commanderDamage } = confirmed
  return {
    ...confirmed,
    ...(commanderDamage && commanderHits.length > 0
      ? {
          commanderDamage: {
            ...commanderDamage,
            totals: withCommanderHits(commanderDamage.totals, commanderHits),
          },
        }
      : {}),
    table,
    players: confirmed.players.map((player) => {
      const pendingDelta = deltas.get(player.playerId) ?? 0
      return { ...player, currentLife: player.currentLife + pendingDelta, pendingDelta }
    }),
  }
}

function withCommanderHits(
  totals: readonly ConnectedCommanderDamageTotal[],
  hits: readonly { fromPlayerId: string; toPlayerId: string; commander?: 1; delta: number }[],
): ConnectedCommanderDamageTotal[] {
  const next = totals.map((total) => ({ ...total }))
  for (const hit of hits) {
    const total = next.find(
      (candidate) =>
        candidate.fromPlayerId === hit.fromPlayerId &&
        candidate.toPlayerId === hit.toPlayerId &&
        candidate.commander === hit.commander,
    )
    if (total) total.total += hit.delta
    else
      next.push({
        fromPlayerId: hit.fromPlayerId,
        toPlayerId: hit.toPlayerId,
        ...(hit.commander ? { commander: hit.commander } : {}),
        total: hit.delta,
      })
  }
  return next
}

export function oldestFirst(actions: readonly PendingLifeAction[]): PendingLifeAction[] {
  return [...actions].sort(compareQueued)
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
