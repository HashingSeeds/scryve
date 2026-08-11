import { v } from "convex/values"

import { internalMutation, query } from "./_generated/server"
import { requireUser } from "./lib/auth"
import { hasFeature, PREMIUM_FEATURES } from "./lib/entitlements"

export const current = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx)
    const [fullHistory, unlimitedDecks, deckAnalytics] = await Promise.all([
      hasFeature(ctx, user, PREMIUM_FEATURES.fullHistory),
      hasFeature(ctx, user, PREMIUM_FEATURES.unlimitedDecks),
      hasFeature(ctx, user, PREMIUM_FEATURES.deckAnalytics),
    ])
    return { fullHistory, unlimitedDecks, deckAnalytics }
  },
})

export const setUserFeature = internalMutation({
  args: {
    clerkUserId: v.string(),
    feature: v.string(),
    enabled: v.boolean(),
    source: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_user", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique()
    if (!user) return null
    const existing = await ctx.db
      .query("userEntitlements")
      .withIndex("by_user_and_feature", (q) => q.eq("userId", user._id).eq("feature", args.feature))
      .unique()
    const value = {
      feature: args.feature,
      enabled: args.enabled,
      source: args.source,
      updatedAt: Date.now(),
    }
    if (existing) {
      await ctx.db.patch(existing._id, value)
      return existing._id
    }
    return await ctx.db.insert("userEntitlements", { userId: user._id, ...value })
  },
})
