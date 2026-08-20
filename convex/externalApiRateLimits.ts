import { ConvexError, v } from "convex/values"

import { internalMutation } from "./_generated/server"

const MAX_INTERVAL_MS = 60_000

function validInterval(intervalMs: number) {
  return Number.isInteger(intervalMs) && intervalMs > 0 && intervalMs <= MAX_INTERVAL_MS
}

export const reserve = internalMutation({
  args: { bucket: v.string(), intervalMs: v.number() },
  handler: async (ctx, args) => {
    if (!validInterval(args.intervalMs))
      throw new ConvexError({ code: "invalid_rate_limit", message: "Invalid request interval" })
    const existing = await ctx.db
      .query("externalApiRateLimits")
      .withIndex("by_bucket", (query) => query.eq("bucket", args.bucket))
      .unique()
    const now = Date.now()
    const requestAt = Math.max(now, existing?.nextRequestAt ?? now)
    const value = { bucket: args.bucket, nextRequestAt: requestAt + args.intervalMs }
    if (existing) await ctx.db.replace(existing._id, value)
    else await ctx.db.insert("externalApiRateLimits", value)
    return requestAt - now
  },
})

export const block = internalMutation({
  args: { bucket: v.string(), durationMs: v.number() },
  handler: async (ctx, args) => {
    if (!validInterval(args.durationMs))
      throw new ConvexError({ code: "invalid_rate_limit", message: "Invalid block duration" })
    const existing = await ctx.db
      .query("externalApiRateLimits")
      .withIndex("by_bucket", (query) => query.eq("bucket", args.bucket))
      .unique()
    const nextRequestAt = Math.max(existing?.nextRequestAt ?? 0, Date.now() + args.durationMs)
    const value = { bucket: args.bucket, nextRequestAt }
    if (existing) await ctx.db.replace(existing._id, value)
    else await ctx.db.insert("externalApiRateLimits", value)
    return null
  },
})
