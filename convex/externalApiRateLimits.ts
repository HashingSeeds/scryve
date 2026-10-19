import { ConvexError, v } from "convex/values"

import type { Doc } from "./_generated/dataModel"
import {
  internalMutation,
  internalQuery,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server"

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

/** why: a request may queue at most this long; later slots are refused instead of held. */
const SCRYFALL_MAX_WAIT_MS = 10_000
const GLOBAL_SLOT_MS = 125
/** why: slot rows are reused each lap; one more lap than a wait window spans keeps a held slot from reading as free. */
const GLOBAL_SLOTS = SCRYFALL_MAX_WAIT_MS / GLOBAL_SLOT_MS + 2

function scryfallEndpoint(path: string) {
  const endpoint = path.split("?")[0]
  if (["/cards/search", "/cards/named", "/cards/random", "/cards/collection"].includes(endpoint))
    return { bucket: `scryfall:endpoint:${endpoint}`, intervalMs: 500 }
  if (endpoint === "/cards/manifest")
    return { bucket: `scryfall:endpoint:${endpoint}`, intervalMs: 6000 }
  return { bucket: "scryfall:endpoint:default", intervalMs: 100 }
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

/** why: a query, so requests already holding a slot check for a 429 cooldown without write conflicts. */
export const scryfallCooldownUntil = internalQuery({
  args: {},
  handler: async (ctx) => (await bucketRow(ctx, "scryfall:cooldown"))?.nextRequestAt ?? 0,
})

/**
 * why: one request time must satisfy both the shared and the endpoint quota. Reserving each
 * separately and waiting for the later one lets two searches fire 125 ms apart.
 */
export const acquireScryfall = internalMutation({
  args: { path: v.string() },
  handler: async (ctx, { path }) => {
    const now = Date.now()
    const cooldownUntil = (await bucketRow(ctx, "scryfall:cooldown"))?.nextRequestAt ?? 0
    if (cooldownUntil > now) return { waitMs: cooldownUntil - now, blocked: true }

    const endpoint = scryfallEndpoint(path)
    const endpointRow = await bucketRow(ctx, endpoint.bucket)
    const earliest = Math.max(now, endpointRow?.nextRequestAt ?? now)
    for (let slot = Math.floor(earliest / GLOBAL_SLOT_MS); ; slot += 1) {
      const slotStart = slot * GLOBAL_SLOT_MS
      const requestAt = Math.max(earliest, slotStart)
      if (requestAt - now > SCRYFALL_MAX_WAIT_MS) return { waitMs: requestAt - now, blocked: true }
      const slotBucket = `scryfall:slot:${slot % GLOBAL_SLOTS}`
      const slotRow = await bucketRow(ctx, slotBucket)
      if (slotRow?.nextRequestAt === slotStart) continue
      await writeBucket(ctx, slotRow, { bucket: slotBucket, nextRequestAt: slotStart })
      await writeBucket(ctx, endpointRow, {
        bucket: endpoint.bucket,
        nextRequestAt: requestAt + endpoint.intervalMs,
      })
      return { waitMs: requestAt - now, blocked: false }
    }
  },
})
