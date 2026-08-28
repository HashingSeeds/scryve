import { v } from "convex/values"

import { internalMutation } from "./_generated/server"

const platformValidator = v.union(v.literal("web"), v.literal("ios"), v.literal("android"))

export const submit = internalMutation({
  args: {
    email: v.string(),
    platforms: v.array(platformValidator),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("waitlistSubmissions")
      .withIndex("by_email", (query) => query.eq("email", args.email))
      .unique()
    const now = Date.now()

    if (existing) {
      await ctx.db.patch(existing._id, { platforms: args.platforms, updatedAt: now })
      return { alreadyJoined: true }
    }

    await ctx.db.insert("waitlistSubmissions", {
      email: args.email,
      platforms: args.platforms,
      status: "waiting",
      createdAt: now,
      updatedAt: now,
    })
    return { alreadyJoined: false }
  },
})
