import { ConvexError } from "convex/values"

import type { Doc, Id } from "../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../_generated/server"

type Ctx = QueryCtx | MutationCtx

export async function deletedIdentityHash(clerkUserId: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(clerkUserId))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("")
}

export async function hasAccountDeletion(ctx: Ctx, clerkUserId: string) {
  const pending = await ctx.db
    .query("accountDeletionRequests")
    .withIndex("by_clerk_user", (q) => q.eq("clerkUserId", clerkUserId))
    .unique()
  if (pending) return true
  const hash = await deletedIdentityHash(clerkUserId)
  return Boolean(
    await ctx.db
      .query("accountDeletionReceipts")
      .withIndex("by_deleted_identity_hash", (q) => q.eq("deletedIdentityHash", hash))
      .first(),
  )
}

export async function requireIdentity(ctx: Ctx) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity)
    throw new ConvexError({ code: "unauthenticated", message: "Authentication required" })
  return identity
}

export async function requireUser(ctx: Ctx): Promise<Doc<"users">> {
  const identity = await requireIdentity(ctx)
  const deletionRequest = await ctx.db
    .query("accountDeletionRequests")
    .withIndex("by_clerk_user", (q) => q.eq("clerkUserId", identity.subject))
    .unique()
  if (deletionRequest) throw new Error("Account deletion is in progress")
  const user = await ctx.db
    .query("users")
    .withIndex("by_clerk_user", (q) => q.eq("clerkUserId", identity.subject))
    .unique()
  if (!user) throw new Error("User projection is missing; sync the signed-in user first")
  return user
}

export async function requireMembership(ctx: Ctx, gameId: Id<"games">) {
  const user = await requireUser(ctx)
  const player = await ctx.db
    .query("gamePlayers")
    .withIndex("by_game_user", (q) => q.eq("gameId", gameId).eq("userId", user._id))
    .first()
  if (!player) throw new Error("Game membership required")
  return { user, player }
}

export async function requireHost(ctx: Ctx, game: Doc<"games">) {
  const user = await requireUser(ctx)
  if (game.hostUserId !== user._id) throw new Error("Host permission required")
  return user
}

export async function requireSeatOwner(ctx: Ctx, gameId: Id<"games">, seat: number) {
  const { user, player } = await requireMembership(ctx, gameId)
  if (player.seat !== seat || player.userId !== user._id)
    throw new Error("Seat-owner permission required")
  return { user, player }
}
