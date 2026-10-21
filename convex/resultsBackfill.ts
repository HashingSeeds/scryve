import { paginationOptsValidator } from "convex/server"
import { v } from "convex/values"

import { internal } from "./_generated/api"
import type { Doc } from "./_generated/dataModel"
import { internalMutation, internalQuery } from "./_generated/server"
import { addDeckResult, canonicalResultId, gameResultId } from "./lib/deckResults"
import {
  resultDeckKey,
  matchDeltas,
  outcomeTally,
  gameResultSource,
  isAbandonedSummary,
  removeGameResult,
} from "./lib/results"

// why: each row costs a summary lookup plus reads and writes on two stats tables, so a large page would hit transaction limits.
const MAX_BATCH = 100

/**
 * why: games abandoned before #350 still sit in deck results and counters. Filtering on the
 * summary keeps finished no-winner games, which are also "unknown", counting.
 * Deleted rows never match again, so a rerun or a restart from a null cursor is safe.
 */
export const removeAbandonedGameResults = internalMutation({
  args: {
    paginationOpts: paginationOptsValidator,
    dryRun: v.optional(v.boolean()),
    foundSoFar: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const paginationOpts = {
      ...args.paginationOpts,
      numItems: Math.min(args.paginationOpts.numItems, MAX_BATCH),
    }
    const page = await ctx.db.query("deckGameResults").paginate(paginationOpts)
    const now = Date.now()
    let found = 0
    for (const result of page.page) {
      const summary = await ctx.db
        .query("gameSummaries")
        .withIndex("by_game", (q) => q.eq("gameId", result.gameId))
        .unique()
      if (!summary || !isAbandonedSummary(summary)) continue
      found += 1
      if (!args.dryRun) await removeGameResult(ctx, result, now)
    }
    const foundSoFar = (args.foundSoFar ?? 0) + found
    console.log(
      `removeAbandonedGameResults ${args.dryRun ? "dry run " : ""}scanned=${page.page.length} found=${found} total=${foundSoFar} done=${page.isDone}`,
    )
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.resultsBackfill.removeAbandonedGameResults, {
        paginationOpts: { ...paginationOpts, cursor: page.continueCursor },
        ...(args.dryRun ? { dryRun: true } : {}),
        foundSoFar,
      })
    return {
      scanned: page.page.length,
      found,
      foundSoFar,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    }
  },
})

const batchArgs = { cursor: v.union(v.string(), v.null()), batchSize: v.number() }
function batchSize(size: number) {
  if (!Number.isSafeInteger(size) || size < 1 || size > 100)
    throw new Error("Batch size must be 1–100")
  return size
}

export const backfillDeckKeys = internalMutation({
  args: batchArgs,
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("decks")
      .paginate({ cursor: args.cursor, numItems: batchSize(args.batchSize) })
    for (const deck of page.page)
      if (!deck.deckKey) await ctx.db.patch(deck._id, { deckKey: deck.syncId ?? String(deck._id) })
    return { isDone: page.isDone, continueCursor: page.continueCursor }
  },
})

export const backfillGameResults = internalMutation({
  args: batchArgs,
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("deckGameResults")
      .paginate({ cursor: args.cursor, numItems: batchSize(args.batchSize) })
    for (const result of page.page) {
      const summary = await ctx.db
        .query("gameSummaries")
        .withIndex("by_game", (q) => q.eq("gameId", result.gameId))
        .unique()
      if (!summary || isAbandonedSummary(summary)) continue
      const player = summary.players.find((player) => player.playerId === result.playerId)
      if (!player || player.userId !== result.userId) continue
      await addDeckResult(ctx, {
        resultId: gameResultId(summary, player),
        userId: result.userId,
        deckKey: await resultDeckKey(ctx, {
          deckId: result.deckId,
          deckKey: player.deckKey,
          userId: result.userId,
        }),
        kind: "game",
        source: await gameResultSource(ctx, summary),
        outcome: result.outcome,
        finishedAt: result.finishedAt,
        summaryId: summary._id,
        matchId: summary.matchId,
        podSize: summary.players.length,
        deltas: { games: outcomeTally(result.outcome) },
        legacyDeckId: result.deckId,
        deckVersionId: result.deckVersionId,
      })
    }
    return { isDone: page.isDone, continueCursor: page.continueCursor }
  },
})

export const backfillMatchResults = internalMutation({
  args: batchArgs,
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("deckMatchResults")
      .paginate({ cursor: args.cursor, numItems: batchSize(args.batchSize) })
    for (const result of page.page) {
      const match = await ctx.db.get(result.matchId)
      if (!match) continue
      const seat = match.seats.find(
        (seat) => seat.userId === result.userId && seat.deckVersionId === result.deckVersionId,
      )
      if (!seat) continue
      await addDeckResult(ctx, {
        resultId: canonicalResultId({ kind: "match", publicId: match.publicId, seat: seat.seat }),
        userId: result.userId,
        deckKey: await resultDeckKey(ctx, seat),
        kind: "match",
        source: result.source,
        outcome: result.outcome,
        finishedAt: result.finishedAt,
        matchId: match._id,
        podSize: match.seats.length,
        deltas: matchDeltas(match, seat),
        legacyDeckId: result.deckId,
        deckVersionId: result.deckVersionId,
      })
    }
    return { isDone: page.isDone, continueCursor: page.continueCursor }
  },
})

const MAX_COMPARED_RESULTS = 10_000
type Tally = { total: number; wins: number; losses: number; draws: number; unknown: number }
type Deltas = Doc<"deckResults">["deltas"]

function sumDeltas(all: Deltas[]) {
  const add = (sum: Tally | undefined, delta: Tally | undefined) =>
    delta
      ? {
          total: (sum?.total ?? 0) + delta.total,
          wins: (sum?.wins ?? 0) + delta.wins,
          losses: (sum?.losses ?? 0) + delta.losses,
          draws: (sum?.draws ?? 0) + delta.draws,
          unknown: (sum?.unknown ?? 0) + delta.unknown,
        }
      : sum
  let games: Tally | undefined
  let manualMatches: Tally | undefined
  let manualGames: Tally | undefined
  let connectedMatches: Tally | undefined
  for (const deltas of all) {
    games = add(games, deltas.games)
    manualMatches = add(manualMatches, deltas.manualMatches)
    manualGames = add(manualGames, deltas.manualGames)
    connectedMatches = add(connectedMatches, deltas.connectedMatches)
  }
  return {
    games: games?.total ?? 0,
    wins: games?.wins ?? 0,
    losses: games?.losses ?? 0,
    draws: games?.draws ?? 0,
    unknown: games?.unknown ?? 0,
    manualMatches,
    manualGames,
    connectedMatches,
  }
}

export const compareDeckKeyStats = internalQuery({
  args: batchArgs,
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("decks")
      .paginate({ cursor: args.cursor, numItems: batchSize(args.batchSize) })
    const mismatches = []
    for (const deck of page.page) {
      const legacy = await ctx.db
        .query("deckStats")
        .withIndex("by_deck", (q) => q.eq("deckId", deck._id))
        .unique()
      const mirrored = await ctx.db
        .query("deckResults")
        .withIndex("by_legacy_deck_id", (q) => q.eq("legacyDeckId", deck._id))
        .take(MAX_COMPARED_RESULTS)
      const stats = sumDeltas(mirrored.map((result) => result.deltas))
      const fields = ["games", "wins", "losses", "draws", "unknown"] as const
      const lines = ["manualMatches", "manualGames", "connectedMatches"] as const
      const tallyFields = ["total", "wins", "losses", "draws", "unknown"] as const
      if (
        fields.some((field) => (legacy?.[field] ?? 0) !== (stats?.[field] ?? 0)) ||
        lines.some((line) =>
          tallyFields.some(
            (field) => (legacy?.[line]?.[field] ?? 0) !== (stats?.[line]?.[field] ?? 0),
          ),
        )
      )
        mismatches.push({ deckId: deck._id, legacy, stats })
    }
    return { mismatches, isDone: page.isDone, continueCursor: page.continueCursor }
  },
})
