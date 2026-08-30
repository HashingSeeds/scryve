import { v } from "convex/values"

import { internalMutation, query } from "./_generated/server"
import { requireIdentity } from "./lib/auth"

const statusValidator = v.union(
  v.literal("healthy"),
  v.literal("degraded"),
  v.literal("unavailable"),
)

export const record = internalMutation({
  args: {
    game: v.string(),
    provider: v.string(),
    operation: v.string(),
    status: statusValidator,
    lastAttemptAt: v.number(),
    lastSuccessAt: v.optional(v.number()),
    responseMs: v.optional(v.number()),
    httpStatus: v.optional(v.number()),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("providerHealth")
      .withIndex("by_game_and_provider_and_operation", (query) =>
        query.eq("game", args.game).eq("provider", args.provider).eq("operation", args.operation),
      )
      .unique()
    const { lastSuccessAt, responseMs, httpStatus, ...required } = args
    const preservedLastSuccessAt = lastSuccessAt ?? existing?.lastSuccessAt
    const value = {
      ...required,
      ...(preservedLastSuccessAt === undefined ? {} : { lastSuccessAt: preservedLastSuccessAt }),
      ...(responseMs === undefined ? {} : { responseMs }),
      ...(httpStatus === undefined ? {} : { httpStatus }),
      updatedAt: Date.now(),
    }
    if (existing) {
      await ctx.db.replace(existing._id, value)
      return existing._id
    }
    return await ctx.db.insert("providerHealth", value)
  },
})

export const current = query({
  args: { game: v.string(), provider: v.string(), operation: v.string() },
  handler: async (ctx, args) => {
    await requireIdentity(ctx)
    return await ctx.db
      .query("providerHealth")
      .withIndex("by_game_and_provider_and_operation", (query) =>
        query.eq("game", args.game).eq("provider", args.provider).eq("operation", args.operation),
      )
      .unique()
  },
})
