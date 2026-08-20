import { v } from "convex/values"

import { internalMutation, mutation } from "./_generated/server"
import { requireIdentity } from "./lib/auth"
import {
  assertAvatarUrl,
  assertDisplayName,
  assertUsername,
  HISTORY_MIGRATION_VERSION,
  MEMBERSHIP_MIGRATION_VERSION,
  normalizeUsername,
} from "./lib/policy"

export const syncFromClerk = internalMutation({
  args: {
    clerkUserId: v.string(),
    displayName: v.string(),
    username: v.string(),
    avatarUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const username = assertUsername(args.username)
    const usernameNormalized = normalizeUsername(username)
    const conflicting = await ctx.db
      .query("users")
      .withIndex("by_username_normalized", (q) => q.eq("usernameNormalized", usernameNormalized))
      .unique()
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_user", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique()
    if (conflicting && conflicting._id !== existing?._id)
      throw new Error("Clerk username conflicts with an existing Scryve account")
    const now = Date.now()
    const value = {
      displayName: assertDisplayName(args.displayName),
      username,
      usernameNormalized,
      avatarUrl: assertAvatarUrl(args.avatarUrl),
      updatedAt: now,
    }
    if (existing) {
      await ctx.db.patch(existing._id, value)
      return existing._id
    }
    return await ctx.db.insert("users", {
      clerkUserId: args.clerkUserId,
      ...value,
      membershipMigrationVersion: MEMBERSHIP_MIGRATION_VERSION,
      historyMigrationVersion: HISTORY_MIGRATION_VERSION,
      createdAt: now,
    })
  },
})

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
