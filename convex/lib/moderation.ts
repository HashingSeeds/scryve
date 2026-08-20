import { suggestUsername } from "./usernameSuggestions"
import { internal } from "../_generated/api"
import type { Doc, Id } from "../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../_generated/server"

const MAX_BLOCKS_READ = 500
const PLACEHOLDER_ATTEMPTS = 20

export function publicUsernameFor(user: Doc<"users">) {
  return user.moderationHold?.placeholderUsername ?? user.username
}

export async function isBlockedBetween(
  ctx: QueryCtx,
  a: Id<"users">,
  b: Id<"users">,
): Promise<boolean> {
  for (const [blocker, blocked] of [
    [a, b],
    [b, a],
  ] as const) {
    const existing = await ctx.db
      .query("userBlocks")
      .withIndex("by_blocker_and_blocked", (q) =>
        q.eq("blockerUserId", blocker).eq("blockedUserId", blocked),
      )
      .unique()
    if (existing) return true
  }
  return false
}

export async function blockedUserIdsFor(ctx: QueryCtx, blockerUserId: Id<"users">) {
  const blocks = await ctx.db
    .query("userBlocks")
    .withIndex("by_blocker", (q) => q.eq("blockerUserId", blockerUserId))
    .take(MAX_BLOCKS_READ)
  return new Set(blocks.map((block) => block.blockedUserId))
}

async function usernameIsTaken(ctx: MutationCtx, candidate: string) {
  const existing = await ctx.db
    .query("users")
    .withIndex("by_username_normalized", (q) => q.eq("usernameNormalized", candidate.toLowerCase()))
    .unique()
  return existing !== null
}

async function allocatePlaceholderUsername(ctx: MutationCtx, random: () => number = Math.random) {
  for (let attempt = 0; attempt < PLACEHOLDER_ATTEMPTS; attempt += 1) {
    const candidate = suggestUsername(random)
    if (!(await usernameIsTaken(ctx, candidate))) return candidate
  }
  return `${suggestUsername(random)}-${Date.now().toString(36).slice(-4)}`
}

export async function placeUsernameOnHold(
  ctx: MutationCtx,
  user: Doc<"users">,
  reason: "filter" | "reports" | "operator",
) {
  if (user.moderationHold) {
    const heldUsername = user.username ?? ""
    const holdReason = reason === "operator" ? "operator" : user.moderationHold.reason
    if (
      heldUsername !== user.moderationHold.heldUsername ||
      holdReason !== user.moderationHold.reason
    ) {
      await ctx.db.patch(user._id, {
        moderationHold: { ...user.moderationHold, heldUsername, reason: holdReason },
        updatedAt: Date.now(),
      })
    }
    return user.moderationHold.placeholderUsername
  }

  const placeholderUsername = await allocatePlaceholderUsername(ctx)
  await ctx.db.patch(user._id, {
    moderationHold: {
      placeholderUsername,
      heldUsername: user.username ?? "",
      reason,
      createdAt: Date.now(),
    },
    updatedAt: Date.now(),
  })
  await ctx.scheduler.runAfter(0, internal.moderation.renameHeldUserInHistory, {
    userId: user._id,
  })
  return placeholderUsername
}

export async function releaseUsernameHold(ctx: MutationCtx, user: Doc<"users">) {
  if (!user.moderationHold) return
  await ctx.db.patch(user._id, { moderationHold: undefined, updatedAt: Date.now() })
  await ctx.scheduler.runAfter(0, internal.moderation.renameHeldUserInHistory, { userId: user._id })
}
