import { playCommanderLethal, playSystemRules, playTableRules } from "@/features/game/playSystems"

import type {
  ConnectedDisplayProjection,
  ConnectedPlayerProjection,
  ConnectedProjection,
} from "./model"
import { commanderOutState, lastStanding, type OutState } from "../../../convex/lib/outReason"

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

export function connectedOutState(
  { system, format, table, commanderDamage }: ConnectedOutGame,
  lives: OutState["lives"],
): OutState {
  return {
    counter: playSystemRules(system).counter,
    tableRules: playTableRules(system, format),
    table,
    lives,
    commanderDamage: commanderOutState(
      playCommanderLethal(system, format),
      commanderDamage?.totals,
    ),
  }
}

export type ConnectedOutGame = Pick<
  ConnectedProjection,
  "system" | "format" | "table" | "commanderDamage"
>

export function projectionOutState(projection: ConnectedProjection) {
  return connectedOutState(
    projection,
    projection.players.map(({ playerId, currentLife }) => ({ playerId, life: currentLife })),
  )
}

export function connectedLastStanding(projection: ConnectedDisplayProjection): string | undefined {
  return lastStanding(projectionOutState(projection))
}
