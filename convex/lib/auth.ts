import type { Doc, Id } from "../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../_generated/server"

type Ctx = QueryCtx | MutationCtx

export async function requireIdentity(ctx: Ctx) {
  const identity = await ctx.auth.getUserIdentity()
  if (!identity) throw new Error("Authentication required")
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
