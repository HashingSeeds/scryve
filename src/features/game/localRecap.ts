import { localOutReason, localTeams } from "./domain"
import type { LocalGame, PlayerId } from "./types"
import { buildRecap, recapOuts, type RecapChange } from "../../../convex/lib/gameRecap"

export function localGameRecap(game: LocalGame) {
  const seats = [...game.players].sort((left, right) => left.seat - right.seat)
  const seatIds = seats.map(({ id }) => id)
  const winners: readonly PlayerId[] =
    game.result?.kind === "win" ? game.result.winnerPlayerIds : []
  return buildRecap({
    seats: seats.map(({ id, startingLife, life }) => ({
      id,
      startingLife: startingLife ?? game.startingLife,
      life,
    })),
    changes: game.events.flatMap((event): RecapChange[] =>
      event.type === "life.changed"
        ? [
            {
              id: event.operationId,
              playerId: event.playerId,
              delta: event.delta,
              undoOf: event.compensatesOperationId,
            },
          ]
        : event.type === "commanderDamage.assigned"
          ? [
              {
                id: event.operationId,
                playerId: event.toPlayerId,
                delta: -event.delta,
                undoOf: event.compensatesOperationId,
              },
            ]
          : [],
    ),
    teams: localTeams(game),
    outs: recapOuts(
      seatIds,
      seatIds.filter((id) => !winners.includes(id)),
      (playerId) => localOutReason(game, playerId),
    ),
  })
}
