import { paginationOptsValidator } from "convex/server"
import { v } from "convex/values"

import { internal } from "./_generated/api"
import { internalMutation } from "./_generated/server"
import { isAbandonedSummary, removeGameResult } from "./lib/results"

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
