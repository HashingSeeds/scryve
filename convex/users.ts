import { v } from "convex/values"

import { mutation } from "./_generated/server"
import { requireIdentity } from "./lib/auth"
import { assertAvatarUrl, assertDisplayName, MEMBERSHIP_MIGRATION_VERSION } from "./lib/policy"

export const syncCurrent = mutation({
  args: { displayName: v.string(), avatarUrl: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    const deletionRequest = await ctx.db
      .query("accountDeletionRequests")
      .withIndex("by_clerk_user", (q) => q.eq("clerkUserId", identity.subject))
      .unique()
    if (deletionRequest) throw new Error("Account deletion is in progress")
    const displayName = assertDisplayName(args.displayName)
    const avatarUrl = assertAvatarUrl(args.avatarUrl)
    const now = Date.now()
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_user", (q) => q.eq("clerkUserId", identity.subject))
      .unique()
    if (existing) {
      await ctx.db.patch(existing._id, { displayName, avatarUrl, updatedAt: now })
      return existing._id
    }
    return ctx.db.insert("users", {
      clerkUserId: identity.subject,
      displayName,
      avatarUrl,
      membershipMigrationVersion: MEMBERSHIP_MIGRATION_VERSION,
      createdAt: now,
      updatedAt: now,
    })
  },
})
