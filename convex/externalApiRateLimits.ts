import { RateLimiter } from "@convex-dev/rate-limiter"
import { ConvexError, v } from "convex/values"

import { components } from "./_generated/api"
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

const scryfallLimiter = new RateLimiter(components.rateLimiter, {
  scryfallGlobal: { kind: "token bucket", rate: 1, period: 125, capacity: 1 },
})

export const acquireScryfall = internalMutation({
  args: { path: v.string() },
  handler: async (ctx, { path }) => {
    const cooldown = await ctx.db
      .query("externalApiRateLimits")
      .withIndex("by_bucket", (q) => q.eq("bucket", "scryfall:cooldown"))
      .unique()
    const cooldownMs = Math.max(0, (cooldown?.nextRequestAt ?? 0) - Date.now())
    if (cooldownMs > 0) return { waitMs: cooldownMs, blocked: true }

    const endpoint = path.split("?")[0]
    const period = ["/cards/search", "/cards/named", "/cards/random", "/cards/collection"].includes(
      endpoint,
    )
      ? 500
      : endpoint === "/cards/manifest"
        ? 6000
        : 100
    const options = {
      key: period === 100 ? "default" : endpoint,
      config: { kind: "token bucket" as const, rate: 1, period, capacity: 1 },
    }
    const global = await scryfallLimiter.check(ctx, "scryfallGlobal")
    const specific = await scryfallLimiter.check(ctx, "scryfallEndpoint", options)
    const waitMs = Math.max(
      global.ok ? 0 : global.retryAfter,
      specific.ok ? 0 : specific.retryAfter,
    )
    if (waitMs > 0) return { waitMs, blocked: false }
    await scryfallLimiter.limit(ctx, "scryfallGlobal")
    await scryfallLimiter.limit(ctx, "scryfallEndpoint", options)
    return { waitMs: 0, blocked: false }
  },
})
