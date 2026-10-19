import { RateLimiter } from "@convex-dev/rate-limiter"
import { ConvexError, v } from "convex/values"

import { components } from "./_generated/api"
import { internalMutation, internalQuery, type QueryCtx } from "./_generated/server"

const MAX_INTERVAL_MS = 60_000

function validInterval(intervalMs: number) {
  return Number.isInteger(intervalMs) && intervalMs > 0 && intervalMs <= MAX_INTERVAL_MS
}

export const reserve = internalMutation({
  args: { bucket: v.string(), intervalMs: v.number(), maxWaitMs: v.optional(v.number()) },
  handler: async (ctx, args) => {
    if (!validInterval(args.intervalMs))
      throw new ConvexError({ code: "invalid_rate_limit", message: "Invalid request interval" })
    const existing = await ctx.db
      .query("externalApiRateLimits")
      .withIndex("by_bucket", (query) => query.eq("bucket", args.bucket))
      .unique()
    const now = Date.now()
    const requestAt = Math.max(now, existing?.nextRequestAt ?? now)
    if (args.maxWaitMs !== undefined && requestAt - now > args.maxWaitMs)
      throw new ConvexError({
        code: "rate_limited",
        message: `Try importing again in ${Math.ceil((requestAt - now) / 1000)} seconds.`,
        retryAfterMs: requestAt - now,
      })
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

/** why: a request may queue at most this long; reservations past it are refused instead of held. */
const SCRYFALL_MAX_WAIT_MS = 10_000
const GLOBAL_PERIOD_MS = 125

const scryfallLimiter = new RateLimiter(components.rateLimiter, {
  scryfallGlobal: {
    kind: "token bucket",
    rate: 1,
    period: GLOBAL_PERIOD_MS,
    capacity: 1,
    maxReserved: SCRYFALL_MAX_WAIT_MS / GLOBAL_PERIOD_MS,
  },
})

async function scryfallCooldown(ctx: QueryCtx) {
  return await ctx.db
    .query("externalApiRateLimits")
    .withIndex("by_bucket", (q) => q.eq("bucket", "scryfall:cooldown"))
    .unique()
}

/** why: a query, so requests already holding a slot check for a 429 cooldown without write conflicts. */
export const scryfallCooldownUntil = internalQuery({
  args: {},
  handler: async (ctx) => (await scryfallCooldown(ctx))?.nextRequestAt ?? 0,
})

export const acquireScryfall = internalMutation({
  args: { path: v.string() },
  handler: async (ctx, { path }) => {
    const cooldownMs = Math.max(0, ((await scryfallCooldown(ctx))?.nextRequestAt ?? 0) - Date.now())
    if (cooldownMs > 0) return { waitMs: cooldownMs, blocked: true }

    const endpoint = path.split("?")[0]
    const period = ["/cards/search", "/cards/named", "/cards/random", "/cards/collection"].includes(
      endpoint,
    )
      ? 500
      : endpoint === "/cards/manifest"
        ? 6000
        : 100
    const specificOptions = {
      key: period === 100 ? "default" : endpoint,
      config: {
        kind: "token bucket" as const,
        rate: 1,
        period,
        capacity: 1,
        maxReserved: Math.floor(SCRYFALL_MAX_WAIT_MS / period),
      },
      reserve: true,
    }
    const global = await scryfallLimiter.check(ctx, "scryfallGlobal", { reserve: true })
    const specific = await scryfallLimiter.check(ctx, "scryfallEndpoint", specificOptions)
    if (!global.ok || !specific.ok)
      return {
        waitMs: Math.max(global.retryAfter ?? 0, specific.retryAfter ?? 0),
        blocked: true,
      }
    const reserved = [
      await scryfallLimiter.limit(ctx, "scryfallGlobal", { reserve: true }),
      await scryfallLimiter.limit(ctx, "scryfallEndpoint", specificOptions),
    ]
    return { waitMs: Math.max(...reserved.map((slot) => slot.retryAfter ?? 0)), blocked: false }
  },
})
