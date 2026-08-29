import { v } from "convex/values"

import { internalMutation, query } from "./_generated/server"

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
    const value = { ...args, updatedAt: Date.now() }
    if (existing) {
      await ctx.db.replace(existing._id, value)
      return existing._id
    }
    return await ctx.db.insert("providerHealth", value)
  },
})

export const current = query({
  args: { game: v.string(), provider: v.string(), operation: v.string() },
  handler: async (ctx, args) =>
    await ctx.db
      .query("providerHealth")
      .withIndex("by_game_and_provider_and_operation", (query) =>
        query.eq("game", args.game).eq("provider", args.provider).eq("operation", args.operation),
      )
      .unique(),
})
