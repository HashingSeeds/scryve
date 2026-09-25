import { v } from "convex/values"

import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { internalMutation, mutation } from "./_generated/server"
import type { MutationCtx } from "./_generated/server"
import { hasAccountDeletion, requireIdentity } from "./lib/auth"
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
import { applyStoredRevenueCatState } from "./lib/revenueCat"

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
    if (await hasAccountDeletion(ctx, args.clerkUserId)) return null
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
      await applyStoredRevenueCatState(ctx, existing)
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
    const user = await ctx.db.get(userId)
    if (user) await applyStoredRevenueCatState(ctx, user)
    return userId
  },
})

type UsernameSync = { action: "store"; username: string } | { action: "clear" } | { action: "keep" }

async function usernameForSync(
  ctx: MutationCtx,
  username: string | undefined,
  clerkUserId: string,
): Promise<UsernameSync> {
  if (username === undefined) return { action: "keep" }
  if (username === "") return { action: "clear" }
  let value: string
  try {
    value = assertUsername(username)
  } catch {
    return { action: "keep" }
  }
  const conflicting = await ctx.db
    .query("users")
    .withIndex("by_username_normalized", (q) =>
      q.eq("usernameNormalized", normalizeUsername(value)),
    )
    .unique()
  if (conflicting && conflicting.clerkUserId !== clerkUserId) return { action: "keep" }
  return { action: "store", username: value }
}

export const syncCurrent = mutation({
  args: {
    displayName: v.string(),
    avatarUrl: v.optional(v.string()),
    username: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    if (await hasAccountDeletion(ctx, identity.subject))
      throw new Error("Account deletion is in progress")
    const displayName = assertDisplayName(args.displayName)
    const avatarUrl = assertAvatarUrl(args.avatarUrl)
    const usernameSync = await usernameForSync(ctx, args.username, identity.subject)
    const usernamePatch =
      usernameSync.action === "store"
        ? {
            username: usernameSync.username,
            usernameNormalized: normalizeUsername(usernameSync.username),
          }
        : usernameSync.action === "clear"
          ? { username: undefined, usernameNormalized: undefined }
          : {}
    const now = Date.now()
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_user", (q) => q.eq("clerkUserId", identity.subject))
      .unique()
    if (existing) {
      await ctx.db.patch(existing._id, {
        displayName,
        avatarUrl,
        ...usernamePatch,
        updatedAt: now,
      })
      await applyStoredRevenueCatState(ctx, existing)
      return existing._id
    }
    const userId = await ctx.db.insert("users", {
      clerkUserId: identity.subject,
      displayName,
      avatarUrl,
      ...usernamePatch,
      membershipMigrationVersion: MEMBERSHIP_MIGRATION_VERSION,
      createdAt: now,
      updatedAt: now,
    })
    const user = await ctx.db.get(userId)
    if (user) await applyStoredRevenueCatState(ctx, user)
    return userId
  },
})
