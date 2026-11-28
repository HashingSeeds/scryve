import { ConvexError, v } from "convex/values"

import type { Doc } from "./_generated/dataModel"
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server"
import { SCRYFALL_RATE_LIMIT_BLOCK_MS } from "./lib/scryfall"

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

const SCRYFALL_MAX_WAIT_MS = 10_000
const GLOBAL_SLOT_MS = 125
/** why: slot rows are reused each lap; one more lap than a wait window spans keeps a held slot from reading as free. */
const GLOBAL_SLOTS = SCRYFALL_MAX_WAIT_MS / GLOBAL_SLOT_MS + 2

/** why: requests leave on different servers after timers, so spacing exactly at Scryfall's per-endpoint limit drew a 429 under load. */
const SEND_JITTER_MARGIN_MS = 50

function scryfallEndpoint(path: string) {
  const endpoint = path.split("?")[0]
  if (["/cards/search", "/cards/named", "/cards/random", "/cards/collection"].includes(endpoint))
    return {
      name: endpoint,
      bucket: `scryfall:endpoint:${endpoint}`,
      intervalMs: 500 + SEND_JITTER_MARGIN_MS,
    }
  if (endpoint === "/cards/manifest")
    return {
      name: endpoint,
      bucket: `scryfall:endpoint:${endpoint}`,
      intervalMs: 6000 + SEND_JITTER_MARGIN_MS,
    }
  return {
    name: endpoint.replace(/^\/cards\/[^/]+/, "/cards/:id"),
    bucket: "scryfall:endpoint:default",
    intervalMs: 100,
  }
}

async function bucketRow(ctx: QueryCtx, bucket: string) {
  return await ctx.db
    .query("externalApiRateLimits")
    .withIndex("by_bucket", (q) => q.eq("bucket", bucket))
    .unique()
}

async function writeBucket(
  ctx: MutationCtx,
  existing: Doc<"externalApiRateLimits"> | null,
  value: { bucket: string; nextRequestAt: number },
) {
  if (existing) await ctx.db.replace(existing._id, value)
  else await ctx.db.insert("externalApiRateLimits", value)
}

const utcDay = (time: number) => new Date(time).toISOString().slice(0, 10)

async function countScryfallUsage(
  ctx: MutationCtx,
  path: string,
  counts: { requests: number; rateLimited: number },
  day = utcDay(Date.now()),
) {
  const endpoint = scryfallEndpoint(path).name
  const existing = await ctx.db
    .query("scryfallUsage")
    .withIndex("by_day_and_endpoint", (q) => q.eq("day", day).eq("endpoint", endpoint))
    .unique()
  if (!existing) await ctx.db.insert("scryfallUsage", { day, endpoint, ...counts })
  else
    await ctx.db.patch(existing._id, {
      requests: existing.requests + counts.requests,
      rateLimited: existing.rateLimited + counts.rateLimited,
    })
}

/** why: a query, so requests already holding a slot check for a 429 cooldown without write conflicts. */
export const scryfallCooldownUntil = internalQuery({
  args: {},
  handler: async (ctx) => (await bucketRow(ctx, "scryfall:cooldown"))?.nextRequestAt ?? 0,
})

/** why: reserving shared and endpoint quotas separately lets two searches fire 125 ms apart; one time must satisfy both. */
export const acquireScryfall = internalMutation({
  args: { path: v.string() },
  handler: async (ctx, { path }) => {
    const now = Date.now()
    const day = utcDay(now)
    const cooldownUntil = (await bucketRow(ctx, "scryfall:cooldown"))?.nextRequestAt ?? 0
    if (cooldownUntil > now) return { waitMs: cooldownUntil - now, blocked: true, day }

    const endpoint = scryfallEndpoint(path)
    const endpointRow = await bucketRow(ctx, endpoint.bucket)
    const earliest = Math.max(now, endpointRow?.nextRequestAt ?? now)
    for (let slot = Math.ceil(earliest / GLOBAL_SLOT_MS); ; slot += 1) {
      const requestAt = slot * GLOBAL_SLOT_MS
      if (requestAt - now > SCRYFALL_MAX_WAIT_MS)
        return { waitMs: requestAt - now, blocked: true, day }
      const slotBucket = `scryfall:slot:${slot % GLOBAL_SLOTS}`
      const slotRow = await bucketRow(ctx, slotBucket)
      if (slotRow?.nextRequestAt === requestAt) continue
      await writeBucket(ctx, slotRow, { bucket: slotBucket, nextRequestAt: requestAt })
      await writeBucket(ctx, endpointRow, {
        bucket: endpoint.bucket,
        nextRequestAt: requestAt + endpoint.intervalMs,
      })
      await countScryfallUsage(ctx, path, { requests: 1, rateLimited: 0 }, day)
      return { waitMs: requestAt - now, blocked: false, day }
    }
  },
})

export const cancelScryfallRequest = internalMutation({
  args: { path: v.string(), day: v.string() },
  handler: async (ctx, { path, day }) => {
    await countScryfallUsage(ctx, path, { requests: -1, rateLimited: 0 }, day)
    return null
  },
})

export const blockScryfall = internalMutation({
  args: { path: v.string() },
  handler: async (ctx, { path }) => {
    const existing = await bucketRow(ctx, "scryfall:cooldown")
    const nextRequestAt = Math.max(
      existing?.nextRequestAt ?? 0,
      Date.now() + SCRYFALL_RATE_LIMIT_BLOCK_MS,
    )
    await writeBucket(ctx, existing, { bucket: "scryfall:cooldown", nextRequestAt })
    await countScryfallUsage(ctx, path, { requests: 0, rateLimited: 1 })
    return null
  },
})
