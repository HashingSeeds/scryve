import { v } from "convex/values"

import { internalMutation } from "./_generated/server"
import { canonicalResultId, gameResultId } from "./lib/deckResults"
import { resultOpponents, summarySeats } from "./lib/opponentDecks"

const batchArgs = { cursor: v.union(v.string(), v.null()), batchSize: v.number() }
function batchSize(size: number) {
  if (!Number.isSafeInteger(size) || size < 1 || size > 100)
    throw new Error("Batch size must be 1–100")
  return size
}

/**
 * why: identity cards stay out, because versions are edited in place and today's commander may
 * not be the one played. Rows that already have opponents are skipped, so a rerun or a restart
 * from a null cursor is safe.
 */
export const backfillResultOpponents = internalMutation({
  args: batchArgs,
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("deckResults")
      .paginate({ cursor: args.cursor, numItems: batchSize(args.batchSize) })
    let patched = 0
    for (const result of page.page) {
      if (result.opponents) continue
      const summary = result.summaryId ? await ctx.db.get(result.summaryId) : null
      const player = summary?.players.find(
        (player) =>
          player.userId === result.userId && gameResultId(summary, player) === result.resultId,
      )
      const match = !summary && result.matchId ? await ctx.db.get(result.matchId) : null
      const seat = match?.seats.find(
        (seat) =>
          seat.userId === result.userId &&
          canonicalResultId({ kind: "match", publicId: match.publicId, seat: seat.seat }) ===
            result.resultId,
      )
      const opponents =
        summary && player
          ? resultOpponents(summarySeats(summary.players), {
              userId: result.userId,
              seat: player.seat,
            })
          : match && seat
            ? resultOpponents(match.seats, { userId: result.userId, seat: seat.seat })
            : undefined
      if (!opponents) continue
      await ctx.db.patch(result._id, { opponents })
      patched += 1
    }
    return { patched, isDone: page.isDone, continueCursor: page.continueCursor }
  },
})
