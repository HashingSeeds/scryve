import { MINUTE, RateLimiter } from "@convex-dev/rate-limiter"
import { v } from "convex/values"

import { components, internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { env, internalAction, internalMutation, mutation } from "./_generated/server"
import type { MutationCtx } from "./_generated/server"
import { hasAccountDeletion, requireIdentity } from "./lib/auth"
import { placeUsernameOnHold, releaseUsernameHold } from "./lib/moderation"
import { nameFailsGate } from "./lib/nameFilter"
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
  if (nameFailsGate(username)) {
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
  username: string,
  clerkUserId: string,
): Promise<UsernameSync> {
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

const usernameRefreshLimiter = new RateLimiter(components.rateLimiter, {
  usernameRefresh: { kind: "token bucket", rate: 2, period: MINUTE, capacity: 2 },
})

export const syncCurrent = mutation({
  args: {
    displayName: v.string(),
    avatarUrl: v.optional(v.string()),
    /** why: never stored, since clients can send any name. A mismatch only triggers a Clerk refresh. */
    username: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx)
    if (await hasAccountDeletion(ctx, identity.subject))
      throw new Error("Account deletion is in progress")
    const displayName = assertDisplayName(args.displayName)
    const avatarUrl = assertAvatarUrl(args.avatarUrl)
    const now = Date.now()
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_user", (q) => q.eq("clerkUserId", identity.subject))
      .unique()
    if (args.username !== undefined && args.username !== (existing?.username ?? "")) {
      const refresh = await usernameRefreshLimiter.limit(ctx, "usernameRefresh", {
        key: identity.tokenIdentifier,
      })
      if (refresh.ok)
        await ctx.scheduler.runAfter(0, internal.users.refreshUsernameFromClerk, {
          clerkUserId: identity.subject,
        })
    }
    if (existing) {
      await ctx.db.patch(existing._id, { displayName, avatarUrl, updatedAt: now })
      await applyStoredRevenueCatState(ctx, existing)
      return existing._id
    }
    const userId = await ctx.db.insert("users", {
      clerkUserId: identity.subject,
      displayName,
      avatarUrl,
      membershipMigrationVersion: MEMBERSHIP_MIGRATION_VERSION,
      createdAt: now,
      updatedAt: now,
    })
    const user = await ctx.db.get(userId)
    if (user) await applyStoredRevenueCatState(ctx, user)
    return userId
  },
})

export const refreshUsernameFromClerk = internalAction({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }) => {
    if (!env.CLERK_SECRET_KEY) return null
    const response = await fetch(
      `https://api.clerk.com/v1/users/${encodeURIComponent(clerkUserId)}`,
      { headers: { Authorization: `Bearer ${env.CLERK_SECRET_KEY}` } },
    )
    if (!response.ok) {
      console.error(`Clerk username refresh failed with status ${response.status}`)
      return null
    }
    const clerkUser: unknown = await response.json()
    const username =
      clerkUser &&
      typeof clerkUser === "object" &&
      "username" in clerkUser &&
      typeof clerkUser.username === "string"
        ? clerkUser.username
        : ""
    await ctx.runMutation(internal.users.applyClerkUsername, { clerkUserId, username })
    return null
  },
})

export const applyClerkUsername = internalMutation({
  args: { clerkUserId: v.string(), username: v.string() },
  handler: async (ctx, args) => {
    if (await hasAccountDeletion(ctx, args.clerkUserId)) return null
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_user", (q) => q.eq("clerkUserId", args.clerkUserId))
      .unique()
    if (!user) return null
    const sync = await usernameForSync(ctx, args.username, args.clerkUserId)
    if (sync.action === "keep") return null
    if (sync.action === "clear") {
      await ctx.db.patch(user._id, {
        username: undefined,
        usernameNormalized: undefined,
        updatedAt: Date.now(),
      })
      return null
    }
    await ctx.db.patch(user._id, {
      username: sync.username,
      usernameNormalized: normalizeUsername(sync.username),
      updatedAt: Date.now(),
    })
    await enforceUsernameFilter(ctx, user._id, sync.username)
    return null
  },
})
