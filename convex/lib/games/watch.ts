import { v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { shownMarkShape } from "../appearance"
import { requireUser } from "../auth"
import { DEFAULT_DECK_GAME } from "../deckGames"
import { commanderField } from "../gameRules"
import { outReason, type OutState } from "../outReason"
import { systemDefinition, variantCounter } from "../systems"
import { isTeamVariant } from "../teamVariants"
import { teamTableRules } from "../twoHeadedGiant"
import { newWatchCode, normalizeWatchCode } from "../watchCode"
import { mutationHandler, queryHandler } from "./handlers"
import {
  displayNameForViewer,
  gameCommanderLethal,
  gameTableRules,
  gameUnavailable,
  matchProjection,
} from "./projection"
import {
  MAX_COMMANDER_DAMAGE_ROWS,
  appearanceOf,
  assertPublicId,
  findGameByPublicId,
  gameByPublicId,
  isUntouchedRematch,
  playersForGame,
  seatLabelFor,
} from "./shared"

/** why: a rematch chain longer than a long night at one table stops here rather than reading without bound. */
const MAX_REMATCH_HOPS = 32

// why: a rematch reuses its table's code, so a TV left on the Watch screen and a link already shared keep following the table.
export const watchCode = mutationHandler({
  args: { publicId: v.string() },
  handler: async (ctx, args) => {
    assertPublicId(args.publicId)
    const user = await requireUser(ctx)
    const game = await gameByPublicId(ctx, args.publicId)
    if (game.hostUserId !== user._id || game.mode !== "connected" || game.status === "abandoned")
      throw gameUnavailable()
    let earlier: Doc<"games"> | null = game
    let first = game
    for (let hop = 0; earlier && hop <= MAX_REMATCH_HOPS; hop++) {
      first = earlier
      const gameId: Id<"games"> = earlier._id
      const watch = await ctx.db
        .query("gameWatches")
        .withIndex("by_game", (q) => q.eq("gameId", gameId))
        .first()
      if (watch) return watch.code
      earlier = earlier.rematchOfGameId ? await ctx.db.get(earlier.rematchOfGameId) : null
    }
    const code = newWatchCode()
    const taken = await ctx.db
      .query("gameWatches")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first()
    if (taken) throw new Error("Watch code collision; retry")
    // why: an untouched rematch can be abandoned, so the code sits on the table's first game and the board walks forward from it.
    await ctx.db.insert("gameWatches", { gameId: first._id, code, createdAt: Date.now() })
    return code
  },
})

export const watchBoard = queryHandler({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const code = normalizeWatchCode(args.code)
    if (!code) return null
    const watch = await ctx.db
      .query("gameWatches")
      .withIndex("by_code", (q) => q.eq("code", code))
      .first()
    let game = watch ? await ctx.db.get(watch.gameId) : null
    let previous: Doc<"games"> | undefined
    for (let hop = 0; game?.rematchPublicId && hop < MAX_REMATCH_HOPS; hop++) {
      const next = await findGameByPublicId(ctx, game.rematchPublicId)
      if (!next) break
      previous = game
      game = next
    }
    if (!game) return null
    const players = await playersForGame(ctx, game._id)
    // why: finishing a game always opens its rematch, so the room keeps the result until the next game's first change.
    if (previous && game.status !== "finished" && isUntouchedRematch(game, players))
      return await spectatorBoard(ctx, previous, await playersForGame(ctx, previous._id))
    if (game.status === "abandoned") return { status: game.status }
    return await spectatorBoard(ctx, game, players)
  },
})

async function spectatorBoard(ctx: QueryCtx, game: Doc<"games">, seats: Doc<"gamePlayers">[]) {
  const players = [...seats].sort((a, b) => a.seat - b.seat)
  const system = game.system ?? game.game ?? DEFAULT_DECK_GAME
  const lethal = gameCommanderLethal(game)
  const commanderDamage =
    lethal === undefined
      ? []
      : (
          await ctx.db
            .query("gameCommanderDamage")
            .withIndex("by_game", (q) => q.eq("gameId", game._id))
            .take(MAX_COMMANDER_DAMAGE_ROWS)
        )
          .filter((row) => row.total > 0)
          .map((row) => ({
            fromPlayerId: row.fromPlayerId,
            toPlayerId: row.toPlayerId,
            ...commanderField(row.commander),
            total: row.total,
          }))
  const teams = isTeamVariant(game.variant)
  const rules = gameTableRules(game)
  const outState: OutState = {
    ...(teams ? { sharedFate: true as const } : {}),
    counter: variantCounter(systemDefinition(system)?.counter, system, game.variant),
    tableRules: teams ? teamTableRules(rules) : rules,
    table: {
      designations: game.designations ?? {},
      players: Object.fromEntries(
        players.map((player) => [player._id, { counters: player.counters ?? {} }]),
      ),
    },
    lives: players.map((player) => ({ playerId: player._id, life: player.currentLife })),
    ...(lethal === undefined ? {} : { commanderDamage: { lethal, totals: commanderDamage } }),
    ...(game.turnGroups ? { groups: game.turnGroups } : {}),
  }
  const names = await Promise.all(
    players.map(async (player) => {
      const user = player.userId ? await ctx.db.get(player.userId) : null
      return displayNameForViewer(player, user, { blocked: false, viewerIsHost: false })
    }),
  )
  const turn = liveTurn(game)
  return {
    status: game.status,
    system,
    format: game.format ?? game.ruleset,
    ...(game.matchBestOf
      ? { match: await matchProjection(ctx, game, { isHost: false, eventCount: 0 }) }
      : {}),
    players: players.map((player, index) => ({
      playerId: player._id,
      seat: player.seat,
      name: names[index] ?? seatLabelFor(player),
      color: player.color,
      shape: shownMarkShape(player) ?? appearanceOf(player).shape,
      life: player.currentLife,
      ...(outReason(outState, player._id) ? { out: true } : {}),
      ...(player.counters && Object.keys(player.counters).length > 0
        ? { counters: player.counters }
        : {}),
      ...(player.customCounters?.length ? { customCounters: player.customCounters } : {}),
      // why: a hidden role stays hidden from the room until its seat reveals it or the game ends.
      ...(player.role !== undefined && (player.roleRevealed || game.status === "finished")
        ? { role: player.role }
        : {}),
    })),
    ...(commanderDamage.length > 0 ? { commanderDamage } : {}),
    ...(game.designations && Object.keys(game.designations).length > 0
      ? { designations: game.designations }
      : {}),
    ...(turn ? { turn } : {}),
    ...(game.turnGroups ? { turnGroups: game.turnGroups } : {}),
  }
}

function liveTurn(game: Doc<"games">) {
  if (game.status !== "active" || !game.turn) return undefined
  const { previous: _previous, ...turn } = game.turn
  return turn
}
