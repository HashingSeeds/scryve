import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { buildRecap, recapOuts, type RecapChange } from "../gameRecap"
import { commanderField, commanderLethalDamage } from "../gameRules"
import { commanderOutState, outReason, type OutState } from "../outReason"
import { MAX_PLAYERS } from "../policy"
import { systemDefinition, tableRules, variantCounter } from "../systems"
import { seatTable } from "../table"
import { isTeamVariant } from "../teamVariants"
import { teamTableRules } from "../twoHeadedGiant"

const MAX_RECAP_EVENTS = 2_000

type GameEvent = Doc<"gameEvents">

function lifeChanges(events: readonly GameEvent[]): RecapChange[] {
  const claimUndoes = new Map(
    events.flatMap((event) =>
      event.kind === "commanderDamage.claimed" && event.undoOfOperationId
        ? [[event.operationId, event.undoOfOperationId] as const]
        : [],
    ),
  )
  return events.flatMap((event): RecapChange[] => {
    const { delta, toPlayerId } = event
    if (delta === undefined) return []
    if (event.kind === "life.changed")
      return [
        {
          id: event.operationId,
          playerId: event.playerId,
          delta,
          undoOf: event.undoOfOperationId,
        },
      ]
    if (event.kind === "commanderDamage.confirmed")
      return toPlayerId && event.claimOperationId
        ? [
            {
              id: event.claimOperationId,
              playerId: toPlayerId,
              delta: -delta,
              undoOf: claimUndoes.get(event.claimOperationId),
            },
          ]
        : []
    // why: a table action writes both `toPlayerId` and `delta` only when it moved that seat's life.
    if (event.kind.startsWith("commanderDamage.") || !toPlayerId) return []
    return [{ id: event.operationId, playerId: toPlayerId, delta, undoOf: event.undoOfOperationId }]
  })
}

export async function connectedRecap(
  ctx: QueryCtx,
  game: Doc<"games">,
  players: readonly Doc<"gamePlayers">[],
  winnerIds: ReadonlySet<Id<"gamePlayers">>,
) {
  const seats = [...players].sort((left, right) => left.seat - right.seat)
  const events = await ctx.db
    .query("gameEvents")
    .withIndex("by_game_server_time", (q) => q.eq("gameId", game._id))
    .take(MAX_RECAP_EVENTS + 1)
  const totals = await ctx.db
    .query("gameCommanderDamage")
    .withIndex("by_game", (q) => q.eq("gameId", game._id))
    .take(MAX_PLAYERS * (MAX_PLAYERS - 1) * 2)
  const system = game.system ?? game.game
  const teams = isTeamVariant(game.variant) ? game.turnGroups : undefined
  const rules = tableRules(system, game.format)
  const state: OutState<Id<"gamePlayers">> = {
    ...(teams ? { sharedFate: true as const } : {}),
    counter: variantCounter(systemDefinition(system)?.counter, system, game.variant),
    tableRules: teams ? teamTableRules(rules) : rules,
    table: {
      designations: game.designations ?? {},
      players: Object.fromEntries(seats.map((seat) => [seat._id, seatTable(seat)])),
    },
    lives: seats.map(({ _id, currentLife }) => ({ playerId: _id, life: currentLife })),
    commanderDamage: commanderOutState(
      commanderLethalDamage(system, game.format),
      totals.map(({ fromPlayerId, toPlayerId, commander, total }) => ({
        fromPlayerId,
        toPlayerId,
        ...commanderField(commander),
        total,
      })),
    ),
    ...(game.turnGroups ? { groups: game.turnGroups } : {}),
  }
  const seatIds = seats.map(({ _id }) => _id)
  return buildRecap({
    seats: seats.map((seat) => ({
      id: seat._id,
      startingLife: seat.startingLife ?? game.startingLife,
      life: seat.currentLife,
    })),
    changes: events.length > MAX_RECAP_EVENTS ? [] : lifeChanges(events),
    teams,
    outs: recapOuts(
      seatIds,
      seatIds.filter((id) => !winnerIds.has(id)),
      (playerId) => outReason(state, playerId),
    ),
  })
}
