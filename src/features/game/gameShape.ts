import { localOutReason } from "./domain"
import type { LocalGame } from "./types"

/** why: how a local game went, without names or ids, so analytics can tell short games from stalled ones and see undo and tool use that no server ever sees. */
export function gameShape(game: LocalGame) {
  const plays = game.events.filter(
    (event) => event.type === "life.changed" || event.type === "commanderDamage.assigned",
  )
  const endedAt = game.finishedAt ?? game.updatedAt
  const startedAt = plays[0]?.clientCreatedAt ?? game.createdAt
  const lastPlayAt = plays.at(-1)?.clientCreatedAt ?? startedAt
  const lowest = Math.min(
    ...game.players.flatMap((player) => {
      const starting = player.startingLife ?? game.startingLife
      return starting > 0 ? [player.life / starting] : []
    }),
  )
  return {
    duration_ms: Math.max(0, endedAt - startedAt),
    idle_ms: Math.max(0, endedAt - lastPlayAt),
    result: game.result?.kind ?? "none",
    change_count: plays.filter((event) => !event.compensatesOperationId).length,
    undo_count: plays.filter((event) => event.compensatesOperationId).length,
    // why: Math.min of no seats is Infinity, which clamps to 100 like a board nobody has touched.
    lowest_life_pct: Math.min(100, Math.max(0, lowest * 100)),
    seat_out: game.players.some((player) => localOutReason(game, player.id) !== undefined),
    commander_damage_used: plays.some((event) => event.type === "commanderDamage.assigned"),
    counters_used: Object.values(game.table?.players ?? {}).some(({ counters }) =>
      Object.values(counters ?? {}).some((value) => value !== 0),
    ),
    clock_used: game.clock !== undefined,
  } as const
}

export type GameShape = ReturnType<typeof gameShape>
