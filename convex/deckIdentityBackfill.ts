import { v } from "convex/values"

import { internalMutation } from "./_generated/server"
import { refreshDeckIdentity } from "./lib/deckIdentity"

/**
 * why: each deck is recomputed from its cards and patched only when the result differs, so a
 * rerun, a restart from a null cursor, or a later pass after the card catalog fills in is safe.
 */
export const backfillDeckIdentity = internalMutation({
  args: { cursor: v.union(v.string(), v.null()), batchSize: v.number() },
  handler: async (ctx, args) => {
    if (!Number.isSafeInteger(args.batchSize) || args.batchSize < 1 || args.batchSize > 10)
      throw new Error("Batch size must be 1–10")
    const page = await ctx.db
      .query("decks")
      .paginate({ cursor: args.cursor, numItems: args.batchSize })
    let patched = 0
    for (const deck of page.page) if (await refreshDeckIdentity(ctx, deck._id)) patched += 1
    return { patched, isDone: page.isDone, continueCursor: page.continueCursor }
  },
})
