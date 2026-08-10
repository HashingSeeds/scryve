import { v } from "convex/values"

import { internal } from "./_generated/api"
import type { Doc, Id } from "./_generated/dataModel"
import { env, internalMutation, internalQuery, mutation, query } from "./_generated/server"
import type { MutationCtx } from "./_generated/server"
import { terminalizeGameForAccountDeletion } from "./games"
import { requireIdentity } from "./lib/auth"

const DELETED_PLAYER_NAME = "Deleted player"
const MEMBERSHIP_BATCH_SIZE = 5
const EVENT_BATCH_SIZE = 50

async function requestByClerkUser(ctx: MutationCtx, clerkUserId: string) {
  return await ctx.db
    .query("accountDeletionRequests")
    .withIndex("by_clerk_user", (q) => q.eq("clerkUserId", clerkUserId))
    .unique()
}

async function restartRequest(ctx: MutationCtx, request: Doc<"accountDeletionRequests">) {
  const status = request.userId ? "processing" : "identity_pending"
  await ctx.db.patch(request._id, {
    status,
    attempts: 0,
    lastError: undefined,
    updatedAt: Date.now(),
  })
  if (request.userId)
    await ctx.scheduler.runAfter(0, internal.accountDeletion.processMemberships, {
      requestId: request._id,
    })
  else
    await ctx.scheduler.runAfter(0, internal.accountDeletionActions.deleteClerkIdentity, {
      requestId: request._id,
    })
  return status
}

export const requestCurrentAccountDeletion = mutation({
  args: { confirmation: v.literal("DELETE") },
  handler: async (ctx) => {
    if (!env.CLERK_SECRET_KEY) throw new Error("Account deletion is temporarily unavailable")
    const identity = await requireIdentity(ctx)
    const existing = await requestByClerkUser(ctx, identity.subject)
    if (existing) {
      const status =
        existing.status === "failed" ? await restartRequest(ctx, existing) : existing.status
      return { requestId: existing._id, status }
    }
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_user", (q) => q.eq("clerkUserId", identity.subject))
      .unique()
    const now = Date.now()
    const requestId = await ctx.db.insert("accountDeletionRequests", {
      clerkUserId: identity.subject,
      ...(user ? { userId: user._id } : {}),
      status: user ? "processing" : "identity_pending",
      attempts: 0,
      requestedAt: now,
      updatedAt: now,
    })
    if (user)
      await ctx.scheduler.runAfter(0, internal.accountDeletion.processMemberships, { requestId })
    else
      await ctx.scheduler.runAfter(0, internal.accountDeletionActions.deleteClerkIdentity, {
        requestId,
      })
    return { requestId, status: user ? ("processing" as const) : ("identity_pending" as const) }
  },
})

export const currentAccountDeletion = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity()
    if (!identity) return null
    const request = await ctx.db
      .query("accountDeletionRequests")
      .withIndex("by_clerk_user", (q) => q.eq("clerkUserId", identity.subject))
      .unique()
    if (!request) return null
    return {
      status: request.status,
      requestedAt: request.requestedAt,
      updatedAt: request.updatedAt,
      canRetry: request.status === "failed",
    }
  },
})

function anonymizedSummaryPlayers(
  summary: Doc<"gameSummaries">,
  playerId: Id<"gamePlayers">,
  deletedAt: number,
) {
  return summary.players.map((player) =>
    player.playerId === playerId
      ? { ...player, displayName: DELETED_PLAYER_NAME, deletedAt }
      : player,
  )
}

async function anonymizeMembership(
  ctx: MutationCtx,
  request: Doc<"accountDeletionRequests">,
  membership: Doc<"gamePlayers">,
  deletedAt: number,
) {
  const game = await ctx.db.get(membership.gameId)
  if (game) {
    await terminalizeGameForAccountDeletion(ctx, game)
    const summary = await ctx.db
      .query("gameSummaries")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .unique()
    if (summary)
      await ctx.db.patch(summary._id, {
        players: anonymizedSummaryPlayers(summary, membership._id, deletedAt),
        ...(summary.finishedByUserId === request.userId ? { finishedByUserId: undefined } : {}),
      })
    if (game.hostUserId === request.userId) await ctx.db.patch(game._id, { hostUserId: undefined })
  }
  await ctx.db.patch(membership._id, {
    userId: undefined,
    deviceId: undefined,
    displayName: DELETED_PLAYER_NAME,
    avatarUrl: undefined,
    deletedAt,
    resumable: false,
  })
}

export const processMemberships = internalMutation({
  args: { requestId: v.id("accountDeletionRequests") },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId)
    if (!request || request.status !== "processing" || !request.userId) return null
    try {
      const memberships = await ctx.db
        .query("gamePlayers")
        .withIndex("by_user", (q) => q.eq("userId", request.userId))
        .take(MEMBERSHIP_BATCH_SIZE)
      if (memberships.length === 0) {
        await ctx.scheduler.runAfter(0, internal.accountDeletion.processEvents, {
          requestId: request._id,
        })
        return null
      }
      const now = Date.now()
      for (const membership of memberships) await anonymizeMembership(ctx, request, membership, now)
      await ctx.db.patch(request._id, { updatedAt: now })
      await ctx.scheduler.runAfter(0, internal.accountDeletion.processMemberships, {
        requestId: request._id,
      })
    } catch (cause) {
      await ctx.db.patch(request._id, {
        status: "failed",
        lastError: cause instanceof Error ? cause.message : "Could not anonymize memberships",
        updatedAt: Date.now(),
      })
    }
    return null
  },
})

export const processEvents = internalMutation({
  args: { requestId: v.id("accountDeletionRequests") },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId)
    if (!request || request.status !== "processing" || !request.userId) return null
    try {
      const events = await ctx.db
        .query("gameEvents")
        .withIndex("by_actor_user", (q) => q.eq("actorUserId", request.userId))
        .take(EVENT_BATCH_SIZE)
      if (events.length === 0) {
        await ctx.scheduler.runAfter(0, internal.accountDeletion.finalizeAppData, {
          requestId: request._id,
        })
        return null
      }
      const now = Date.now()
      for (const event of events)
        await ctx.db.patch(event._id, { actorUserId: undefined, deviceId: undefined })
      await ctx.db.patch(request._id, { updatedAt: now })
      await ctx.scheduler.runAfter(0, internal.accountDeletion.processEvents, {
        requestId: request._id,
      })
    } catch (cause) {
      await ctx.db.patch(request._id, {
        status: "failed",
        lastError: cause instanceof Error ? cause.message : "Could not anonymize game events",
        updatedAt: Date.now(),
      })
    }
    return null
  },
})

export const finalizeAppData = internalMutation({
  args: { requestId: v.id("accountDeletionRequests") },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId)
    if (!request || request.status !== "processing" || !request.userId) return null
    const attemptRecord = await ctx.db
      .query("joinAttempts")
      .withIndex("by_clerk_user", (q) => q.eq("clerkUserId", request.clerkUserId))
      .unique()
    if (attemptRecord) await ctx.db.delete(attemptRecord._id)
    const user = await ctx.db.get(request.userId)
    if (user) await ctx.db.delete(user._id)
    await ctx.db.patch(request._id, {
      userId: undefined,
      status: "identity_pending",
      attempts: 0,
      lastError: undefined,
      updatedAt: Date.now(),
    })
    await ctx.scheduler.runAfter(0, internal.accountDeletionActions.deleteClerkIdentity, {
      requestId: request._id,
    })
    return null
  },
})

export const identityTarget = internalQuery({
  args: { requestId: v.id("accountDeletionRequests") },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId)
    if (!request || (request.status !== "identity_pending" && request.status !== "failed"))
      return null
    return { clerkUserId: request.clerkUserId, attempts: request.attempts }
  },
})

export const recordIdentityFailure = internalMutation({
  args: { requestId: v.id("accountDeletionRequests"), message: v.string() },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId)
    if (!request) return null
    const attempts = request.attempts + 1
    const shouldRetry = attempts < 8
    await ctx.db.patch(request._id, {
      attempts,
      status: shouldRetry ? "identity_pending" : "failed",
      lastError: args.message.slice(0, 500),
      updatedAt: Date.now(),
    })
    return { attempts, shouldRetry }
  },
})

export const complete = internalMutation({
  args: { requestId: v.id("accountDeletionRequests") },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId)
    if (request) await ctx.db.delete(request._id)
    return null
  },
})
