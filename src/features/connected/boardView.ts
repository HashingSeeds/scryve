import { playCommanderLethal, playSystemRules, playTableRules } from "@/features/game/playSystems"

import type {
  ConnectedDisplayProjection,
  ConnectedPlayerProjection,
  ConnectedProjection,
} from "./model"
import {
  commanderOutState,
  outReason,
  standingWinners,
  type OutState,
} from "../../../convex/lib/outReason"
import { variantCounter } from "../../../convex/lib/systems"
import { isTeamVariant } from "../../../convex/lib/teamVariants"
import type { Turn } from "../../../convex/lib/turns"
import { teamTableRules } from "../../../convex/lib/twoHeadedGiant"

export type ConnectedBoardSeat = Omit<ConnectedPlayerProjection, "currentLife">

export interface ConnectedBoardView extends Omit<
  ConnectedProjection,
  "players" | "eventSequence" | "serverUpdatedAt" | "recentOperationIds"
> {
  players: ConnectedBoardSeat[]
  finalEventSequence?: number
  played: boolean
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
    played: eventSequence > turnSetupWrites(game.table?.turn),
  }
}

/** why: starting turn 1 on the first player is one write before anyone plays, and it must not end the mulligans. */
const turnSetupWrites = (turn: Turn | undefined) =>
  turn?.number === 1 && turn.waiting === true ? 1 : 0

export function connectedLives(
  projection: ConnectedDisplayProjection,
): Readonly<Record<string, number>> {
  return Object.fromEntries(
    projection.players.map((player) => [player.playerId, player.currentLife]),
  )
}

export function connectedOutState(
  { system, format, table, commanderDamage, variant }: ConnectedOutGame,
  lives: OutState["lives"],
): OutState {
  const rules = playTableRules(system, format)
  const teams = isTeamVariant(variant)
  return {
    ...(teams ? { sharedFate: true as const } : {}),
    counter: variantCounter(playSystemRules(system).counter, system, variant),
    tableRules: teams ? teamTableRules(rules) : rules,
    table,
    lives,
    commanderDamage: commanderOutState(
      playCommanderLethal(system, format),
      commanderDamage?.totals,
    ),
    ...(table?.turnGroups ? { groups: table.turnGroups } : {}),
  }
}

export type ConnectedOutGame = Pick<
  ConnectedProjection,
  "system" | "format" | "table" | "commanderDamage" | "variant"
>

export const connectedTeams = ({
  variant,
  table,
}: Pick<ConnectedProjection, "variant" | "table">) =>
  isTeamVariant(variant) ? table?.turnGroups : undefined

export function projectionOutState(projection: ConnectedProjection) {
  return connectedOutState(
    projection,
    projection.players.map(({ playerId, currentLife }) => ({ playerId, life: currentLife })),
  )
}

export function outPlayerIds(projection: ConnectedProjection): string[] {
  const state = projectionOutState(projection)
  return projection.players.flatMap(({ playerId }) =>
    outReason(state, playerId) === undefined ? [] : [playerId],
  )
}

export function connectedStandingWinners(
  projection: ConnectedDisplayProjection,
): string[] | undefined {
  return standingWinners(projectionOutState(projection))
}
