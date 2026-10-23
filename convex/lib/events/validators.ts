import { v } from "convex/values"

export const eventTableResult = v.union(
  v.object({ kind: v.literal("match"), gamesWon: v.array(v.number()), gamesDrawn: v.number() }),
  v.object({ kind: v.literal("pod"), winnerSeat: v.union(v.number(), v.null()) }),
  v.object({ kind: v.literal("doubleLoss") }),
  v.object({ kind: v.literal("bye") }),
)

export const eventPoints = v.object({ win: v.number(), draw: v.number(), loss: v.number() })

export const eventClock = v.object({
  startedAt: v.number(),
  durationMs: v.number(),
  pausedAt: v.optional(v.number()),
})
