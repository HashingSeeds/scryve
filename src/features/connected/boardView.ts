import { playSystemRules, playTableRules } from "@/features/game/playSystems"

import type {
  ConnectedDisplayProjection,
  ConnectedPlayerProjection,
  ConnectedProjection,
} from "./model"
import { isCounterOut } from "../../../convex/lib/systems"
import { isOutByTableCounters } from "../../../convex/lib/table"

export type ConnectedBoardSeat = Omit<ConnectedPlayerProjection, "currentLife">

export interface ConnectedBoardView extends Omit<
  ConnectedProjection,
  "players" | "eventSequence" | "serverUpdatedAt" | "recentOperationIds"
> {
  players: ConnectedBoardSeat[]
  finalEventSequence?: number
}

export function connectedBoardView(projection: ConnectedDisplayProjection): ConnectedBoardView {
  const {
    players,
    eventSequence,
    serverUpdatedAt: _serverUpdatedAt,
    recentOperationIds: _recentOperationIds,
    ...game
  } = projection
  return {
    ...game,
    players: players.map(
      ({ currentLife: _currentLife, pendingDelta: _pendingDelta, ...seat }) => seat,
    ),
    ...(projection.status === "finished" ? { finalEventSequence: eventSequence } : {}),
  }
}

export function connectedLives(
  projection: ConnectedDisplayProjection,
): Readonly<Record<string, number>> {
  return Object.fromEntries(
    projection.players.map((player) => [player.playerId, player.currentLife]),
  )
}

export function connectedPlayerIsOut(
  { players, system, format, table }: ConnectedProjection,
  player: ConnectedPlayerProjection,
) {
  return (
    isCounterOut(
      playSystemRules(system).counter,
      player.currentLife,
      players.filter((other) => other !== player).map((other) => other.currentLife),
    ) ||
    player.eliminatedByCommanderDamage === true ||
    (table !== undefined &&
      isOutByTableCounters(table, player.playerId, playTableRules(system, format)))
  )
}

export function connectedLastStanding(projection: ConnectedDisplayProjection): string | undefined {
  const standing = projection.players.filter((player) => !connectedPlayerIsOut(projection, player))
  return standing.length === 1 ? standing[0].playerId : undefined
}
