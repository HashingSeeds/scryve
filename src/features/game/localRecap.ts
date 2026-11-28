import { localLogPositions, localOutReason, localTeams } from "./domain"
import type { LocalGame, PlayerId } from "./types"
import { buildRecap, recapOuts, type RecapChange } from "../../../convex/lib/gameRecap"

export function localGameRecap(game: LocalGame) {
  const seats = [...game.players].sort((left, right) => left.seat - right.seat)
  const seatIds = seats.map(({ id }) => id)
  const winners: readonly PlayerId[] =
    game.result?.kind === "win" ? game.result.winnerPlayerIds : []
  // why: picking a first player logs turn 1 even when nobody passes, which would stamp every change T1.
  const turns = game.turnLog?.some(({ number }) => number > 1) ? game.turnLog : []
  const position = localLogPositions(game)
  const turnOf = (operationId: string) => {
    const at = position(operationId)
    const turn =
      at === undefined
        ? undefined
        : turns.findLast((entry) => (position(entry.operationId) ?? Infinity) < at)?.number
    return turn === undefined ? {} : { turn }
  }
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
              ...turnOf(event.operationId),
            },
          ]
        : event.type === "commanderDamage.assigned"
          ? [
              {
                id: event.operationId,
                playerId: event.toPlayerId,
                delta: -event.delta,
                undoOf: event.compensatesOperationId,
                from: event.fromPlayerId,
                ...turnOf(event.operationId),
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
    finishTurn: turns.at(-1)?.number,
  })
}
