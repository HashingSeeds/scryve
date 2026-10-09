import { cronJobs } from "convex/server"

import { internal } from "./_generated/api"
import { internalMutation } from "./_generated/server"

const DAY_MS = 24 * 60 * 60 * 1000

// why: client outboxes retry unsent operations with no age limit, so receipts outlive any realistic offline stretch.
export const RECEIPT_RETENTION_MS = 365 * DAY_MS
export const RECEIPT_PRUNE_BATCH_SIZE = 100

const RECEIPT_TABLES = [
  "gamePublishReceipts",
  "gameCompletionReceipts",
  "deckSyncReceipts",
  "deckVersionSyncReceipts",
  "revenueCatWebhookEvents",
] as const

/** why: deletes at most one batch per transaction, then reschedules itself until nothing old is left. */
export const pruneOldReceipts = internalMutation({
  args: {},
  handler: async (ctx) => {
    const cutoff = Date.now() - RECEIPT_RETENTION_MS
    let remaining = RECEIPT_PRUNE_BATCH_SIZE
    for (const table of RECEIPT_TABLES) {
      const expired = await ctx.db
        .query(table)
        .withIndex("by_creation_time", (q) => q.lt("_creationTime", cutoff))
        .take(remaining)
      for (const receipt of expired) await ctx.db.delete(receipt._id)
      remaining -= expired.length
      if (remaining === 0) break
    }
    const hasMore = remaining === 0
    if (hasMore) await ctx.scheduler.runAfter(0, internal.crons.pruneOldReceipts, {})
    return { deleted: RECEIPT_PRUNE_BATCH_SIZE - remaining, hasMore }
  },
})

const crons = cronJobs()

crons.hourly("abandon stale connected games", { minuteUTC: 17 }, internal.games.cleanupStaleGames)
crons.interval(
  "prune resolved preconstructed deck cache",
  { hours: 24 },
  internal.deckImports.pruneResolvedPreconstructedCache,
  {},
)
crons.interval(
  "purge expired moderation reports",
  { hours: 24 },
  internal.moderation.purgeExpiredReports,
  {},
)
crons.interval("prune old receipts", { hours: 24 }, internal.crons.pruneOldReceipts, {})

crons.interval("refresh deck catalogs", { hours: 6 }, internal.deckCatalogs.refreshScheduled, {})

export default crons
