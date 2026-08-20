import { v } from "convex/values"

import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { internalMutation, mutation } from "./_generated/server"
import type { MutationCtx } from "./_generated/server"
import { requireIdentity } from "./lib/auth"
import { placeUsernameOnHold, releaseUsernameHold } from "./lib/moderation"
import { usernameFailsGate } from "./lib/nameFilter"
import {
  assertAvatarUrl,
  assertDisplayName,
  assertUsername,
  HISTORY_MIGRATION_VERSION,
  MEMBERSHIP_MIGRATION_VERSION,
  normalizeUsername,
} from "./lib/policy"

/**
 * The username that reaches Convex comes from Clerk, so the filter has to run here rather than in
 * the signup form. A failing name is held rather than rejected: throwing would break the webhook
 * and leave the account unusable instead of merely renamed.
 */
async function enforceUsernameFilter(ctx: MutationCtx, userId: Id<"users">, username: string) {
  const user = await ctx.db.get(userId)
  if (!user) return
  if (usernameFailsGate(username)) {
    const wasHeld = Boolean(user.moderationHold)
    await placeUsernameOnHold(ctx, user, "filter")
    if (!wasHeld) await ctx.scheduler.runAfter(0, internal.moderation.sendHoldAlert, { userId })
    return
  }
  if (user.moderationHold?.reason === "filter") {
    await releaseUsernameHold(ctx, user)
    return
  }
  if (user.moderationHold) await placeUsernameOnHold(ctx, user, user.moderationHold.reason)
}

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
      // Re-checked on every sync, not just at signup: a rename in Clerk's own UI arrives here.
      await enforceUsernameFilter(ctx, existing._id, username)
      return existing._id
    }
    const userId = await ctx.db.insert("users", {
      clerkUserId: args.clerkUserId,
      ...value,
      membershipMigrationVersion: MEMBERSHIP_MIGRATION_VERSION,
      historyMigrationVersion: HISTORY_MIGRATION_VERSION,
      createdAt: now,
    })
    await enforceUsernameFilter(ctx, userId, username)
    return userId
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
