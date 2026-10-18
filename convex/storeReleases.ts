import { v } from "convex/values"

import { internalMutation, query } from "./_generated/server"

const platform = v.union(v.literal("ios"), v.literal("android"))

export const live = query({
  args: { platform },
  handler: async (ctx, args) => {
    const release = await ctx.db
      .query("storeReleases")
      .withIndex("by_platform", (q) => q.eq("platform", args.platform))
      .unique()
    return release ? { version: release.version, runtimeVersion: release.runtimeVersion } : null
  },
})

export const setLive = internalMutation({
  args: { platform, version: v.string(), runtimeVersion: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("storeReleases")
      .withIndex("by_platform", (q) => q.eq("platform", args.platform))
      .unique()
    const value = { ...args, updatedAt: Date.now() }
    if (existing) await ctx.db.replace(existing._id, value)
    else await ctx.db.insert("storeReleases", value)
  },
})
