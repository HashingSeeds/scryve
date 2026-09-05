import { v } from "convex/values"

import { internal } from "./_generated/api"
import type { Doc, Id } from "./_generated/dataModel"
import { env, internalMutation, internalQuery, mutation, query } from "./_generated/server"
import type { MutationCtx } from "./_generated/server"
import { terminalizeGameForAccountDeletion } from "./games"
import { requireIdentity } from "./lib/auth"
import { moderationRetentionExpiresAt } from "./lib/moderationRetention"

const DELETED_PLAYER_NAME = "Deleted player"
const MEMBERSHIP_BATCH_SIZE = 5
const EVENT_BATCH_SIZE = 50
const USER_DATA_BATCH_SIZE = 50
const MODERATION_BATCH_SIZE = 50
const DELETED_ACCOUNT_LABEL = "(deleted account)"

type AccountDeletionStatus = Doc<"accountDeletionRequests">["status"]

function createReceiptToken() {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
}

async function createReceipt(ctx: MutationCtx, status: AccountDeletionStatus, requestedAt: number) {
  const token = createReceiptToken()
  const receiptId = await ctx.db.insert("accountDeletionReceipts", {
    token,
    status,
    requestedAt,
    updatedAt: requestedAt,
  })
  return { receiptId, receiptToken: token }
}

async function updateReceipt(
  ctx: MutationCtx,
  request: Doc<"accountDeletionRequests">,
  status: AccountDeletionStatus | "completed",
  updatedAt: number,
) {
  if (!request.receiptId) return
  const receipt = await ctx.db.get(request.receiptId)
  if (receipt) await ctx.db.patch(receipt._id, { status, updatedAt })
}

async function recordFailure(
  ctx: MutationCtx,
  request: Doc<"accountDeletionRequests">,
  message: string,
) {
  const updatedAt = Date.now()
  await ctx.db.patch(request._id, { status: "failed", lastError: message, updatedAt })
  await updateReceipt(ctx, request, "failed", updatedAt)
}

async function touchRequest(ctx: MutationCtx, request: Doc<"accountDeletionRequests">) {
  const updatedAt = Date.now()
  await ctx.db.patch(request._id, { updatedAt })
  await updateReceipt(ctx, request, request.status, updatedAt)
}

async function requestByClerkUser(ctx: MutationCtx, clerkUserId: string) {
  return await ctx.db
    .query("accountDeletionRequests")
    .withIndex("by_clerk_user", (q) => q.eq("clerkUserId", clerkUserId))
    .unique()
}

async function restartRequest(ctx: MutationCtx, request: Doc<"accountDeletionRequests">) {
  const status = request.userId ? "processing" : "identity_pending"
  const updatedAt = Date.now()
  await ctx.db.patch(request._id, {
    status,
    attempts: 0,
    lastError: undefined,
    updatedAt,
  })
  await updateReceipt(ctx, request, status, updatedAt)
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
      const receipt = existing.receiptId ? await ctx.db.get(existing.receiptId) : null
      if (receipt) return { requestId: existing._id, receiptToken: receipt.token, status }

      const created = await createReceipt(ctx, status, existing.requestedAt)
      await ctx.db.patch(existing._id, { receiptId: created.receiptId })
      return { requestId: existing._id, receiptToken: created.receiptToken, status }
    }
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_user", (q) => q.eq("clerkUserId", identity.subject))
      .unique()
    const now = Date.now()
    const status = user ? ("processing" as const) : ("identity_pending" as const)
    const receipt = await createReceipt(ctx, status, now)
    const requestId = await ctx.db.insert("accountDeletionRequests", {
      clerkUserId: identity.subject,
      ...(user ? { userId: user._id } : {}),
      receiptId: receipt.receiptId,
      status,
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
    return { requestId, receiptToken: receipt.receiptToken, status }
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
    const receipt = request.receiptId ? await ctx.db.get(request.receiptId) : null
    return {
      status: request.status,
      requestedAt: request.requestedAt,
      updatedAt: request.updatedAt,
      canRetry: request.status === "failed",
      receiptToken: receipt?.token,
    }
  },
})

export const deletionReceipt = query({
  args: { receiptToken: v.string() },
  handler: async (ctx, args) => {
    if (!/^[0-9a-f]{64}$/.test(args.receiptToken)) return null
    const receipt = await ctx.db
      .query("accountDeletionReceipts")
      .withIndex("by_token", (q) => q.eq("token", args.receiptToken))
      .unique()
    if (!receipt) return null
    return {
      status: receipt.status,
      requestedAt: receipt.requestedAt,
      updatedAt: receipt.updatedAt,
      canRetry: receipt.status === "failed",
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
      ? {
          ...player,
          displayName: DELETED_PLAYER_NAME,
          userId: undefined,
          usernameAtFinish: undefined,
          deckId: undefined,
          deckVersionId: undefined,
          deckNameAtFinish: undefined,
          deckVersionNumber: undefined,
          deletedAt,
        }
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
    usernameAtJoin: undefined,
    deckVersionId: undefined,
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
      await updateReceipt(ctx, request, request.status, now)
      await ctx.scheduler.runAfter(0, internal.accountDeletion.processMemberships, {
        requestId: request._id,
      })
    } catch (cause) {
      await recordFailure(
        ctx,
        request,
        cause instanceof Error ? cause.message : "Could not anonymize memberships",
      )
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
        await ctx.scheduler.runAfter(0, internal.accountDeletion.processModerationData, {
          requestId: request._id,
        })
        return null
      }
      const now = Date.now()
      for (const event of events)
        await ctx.db.patch(event._id, { actorUserId: undefined, deviceId: undefined })
      await ctx.db.patch(request._id, { updatedAt: now })
      await updateReceipt(ctx, request, request.status, now)
      await ctx.scheduler.runAfter(0, internal.accountDeletion.processEvents, {
        requestId: request._id,
      })
    } catch (cause) {
      await recordFailure(
        ctx,
        request,
        cause instanceof Error ? cause.message : "Could not anonymize game events",
      )
    }
    return null
  },
})

function shouldClearDismissedReportEvidence(report: Doc<"moderationReports">, now: number) {
  return (
    report.status === "dismissed" &&
    (report.legalHoldUntil === undefined || report.legalHoldUntil <= now)
  )
}

async function continueModerationData(ctx: MutationCtx, request: Doc<"accountDeletionRequests">) {
  await touchRequest(ctx, request)
  await ctx.scheduler.runAfter(0, internal.accountDeletion.processModerationData, {
    requestId: request._id,
  })
}

export const processModerationData = internalMutation({
  args: { requestId: v.id("accountDeletionRequests") },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId)
    if (!request || request.status !== "processing" || !request.userId) return null
    const userId = request.userId
    try {
      const reportsAsReporter = await ctx.db
        .query("moderationReports")
        .withIndex("by_reporter_and_reported", (q) => q.eq("reporterUserId", userId))
        .take(MODERATION_BATCH_SIZE)
      if (reportsAsReporter.length) {
        const now = Date.now()
        for (const report of reportsAsReporter) {
          await ctx.db.patch(report._id, {
            reporterUserId: undefined,
            ...(report.status !== "open" && report.retentionExpiresAt === undefined
              ? {
                  retentionExpiresAt: moderationRetentionExpiresAt(
                    report.status,
                    report.resolvedAt,
                    report.createdAt,
                  ),
                }
              : {}),
            ...(shouldClearDismissedReportEvidence(report, now)
              ? {
                  note: undefined,
                  matchedTerms: undefined,
                  resolutionNote: undefined,
                  gameId: undefined,
                  autoAction: undefined,
                }
              : {}),
          })
        }
        await continueModerationData(ctx, request)
        return null
      }

      const reportsAsTarget = await ctx.db
        .query("moderationReports")
        .withIndex("by_reported_user", (q) => q.eq("reportedUserId", userId))
        .take(MODERATION_BATCH_SIZE)
      if (reportsAsTarget.length) {
        const now = Date.now()
        for (const report of reportsAsTarget) {
          await ctx.db.patch(report._id, {
            reportedUserId: undefined,
            reportedUsername: DELETED_ACCOUNT_LABEL,
            ...(report.status !== "open" && report.retentionExpiresAt === undefined
              ? {
                  retentionExpiresAt: moderationRetentionExpiresAt(
                    report.status,
                    report.resolvedAt,
                    report.createdAt,
                  ),
                }
              : {}),
            ...(shouldClearDismissedReportEvidence(report, now)
              ? {
                  note: undefined,
                  matchedTerms: undefined,
                  resolutionNote: undefined,
                  gameId: undefined,
                  autoAction: undefined,
                }
              : {}),
          })
        }
        await continueModerationData(ctx, request)
        return null
      }

      const blocksAsBlocker = await ctx.db
        .query("userBlocks")
        .withIndex("by_blocker", (q) => q.eq("blockerUserId", userId))
        .take(MODERATION_BATCH_SIZE)
      if (blocksAsBlocker.length) {
        for (const block of blocksAsBlocker) await ctx.db.delete(block._id)
        await continueModerationData(ctx, request)
        return null
      }

      const blocksAsBlocked = await ctx.db
        .query("userBlocks")
        .withIndex("by_blocked", (q) => q.eq("blockedUserId", userId))
        .take(MODERATION_BATCH_SIZE)
      if (blocksAsBlocked.length) {
        for (const block of blocksAsBlocked) await ctx.db.delete(block._id)
        await continueModerationData(ctx, request)
        return null
      }

      const claimsAsActor = await ctx.db
        .query("gameCommanderClaims")
        .withIndex("by_actor_user", (q) => q.eq("actorUserId", userId))
        .take(MODERATION_BATCH_SIZE)
      if (claimsAsActor.length) {
        for (const claim of claimsAsActor)
          await ctx.db.patch(claim._id, { actorUserId: undefined, deviceId: undefined })
        await continueModerationData(ctx, request)
        return null
      }

      const claimsAsResolver = await ctx.db
        .query("gameCommanderClaims")
        .withIndex("by_resolved_by_user", (q) => q.eq("resolvedByUserId", userId))
        .take(MODERATION_BATCH_SIZE)
      if (claimsAsResolver.length) {
        for (const claim of claimsAsResolver)
          await ctx.db.patch(claim._id, { resolvedByUserId: undefined })
        await continueModerationData(ctx, request)
        return null
      }

      await ctx.scheduler.runAfter(0, internal.accountDeletion.processUserLinkedData, {
        requestId: request._id,
      })
    } catch (cause) {
      await recordFailure(
        ctx,
        request,
        cause instanceof Error ? cause.message : "Could not anonymize moderation data",
      )
    }
    return null
  },
})

export const processUserLinkedData = internalMutation({
  args: { requestId: v.id("accountDeletionRequests") },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId)
    if (!request || request.status !== "processing" || !request.userId) return null
    try {
      await touchRequest(ctx, request)
      const history = await ctx.db
        .query("gameHistoryEntries")
        .withIndex("by_user_and_finished_at", (q) => q.eq("userId", request.userId!))
        .take(USER_DATA_BATCH_SIZE)
      if (history.length) {
        for (const entry of history) await ctx.db.delete(entry._id)
        await ctx.scheduler.runAfter(0, internal.accountDeletion.processUserLinkedData, args)
        return null
      }
      const results = await ctx.db
        .query("deckGameResults")
        .withIndex("by_user", (q) => q.eq("userId", request.userId!))
        .take(USER_DATA_BATCH_SIZE)
      if (results.length) {
        for (const result of results) await ctx.db.delete(result._id)
        await ctx.scheduler.runAfter(0, internal.accountDeletion.processUserLinkedData, args)
        return null
      }
      const entitlements = await ctx.db
        .query("userEntitlements")
        .withIndex("by_user", (q) => q.eq("userId", request.userId!))
        .take(USER_DATA_BATCH_SIZE)
      if (entitlements.length) {
        for (const entitlement of entitlements) await ctx.db.delete(entitlement._id)
        await ctx.scheduler.runAfter(0, internal.accountDeletion.processUserLinkedData, args)
        return null
      }
      const acceptances = await ctx.db
        .query("legalAcceptances")
        .withIndex("by_clerk_user", (q) => q.eq("clerkUserId", request.clerkUserId))
        .take(USER_DATA_BATCH_SIZE)
      if (acceptances.length) {
        for (const acceptance of acceptances) await ctx.db.delete(acceptance._id)
        await ctx.scheduler.runAfter(0, internal.accountDeletion.processUserLinkedData, args)
        return null
      }
      await ctx.scheduler.runAfter(0, internal.accountDeletion.processDecks, args)
    } catch (cause) {
      await recordFailure(
        ctx,
        request,
        cause instanceof Error ? cause.message : "Could not delete user-linked data",
      )
    }
    return null
  },
})

export const processDecks = internalMutation({
  args: { requestId: v.id("accountDeletionRequests") },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId)
    if (!request || request.status !== "processing" || !request.userId) return null
    try {
      await touchRequest(ctx, request)
      const deck = await ctx.db
        .query("decks")
        .withIndex("by_owner_and_updated_at", (q) => q.eq("ownerUserId", request.userId!))
        .first()
      if (!deck) {
        await ctx.scheduler.runAfter(0, internal.accountDeletion.finalizeAppData, args)
        return null
      }
      const version = await ctx.db
        .query("deckVersions")
        .withIndex("by_deck_and_version_number", (q) => q.eq("deckId", deck._id))
        .first()
      if (version) {
        const cards = await ctx.db
          .query("deckCards")
          .withIndex("by_deck_version", (q) => q.eq("deckVersionId", version._id))
          .take(USER_DATA_BATCH_SIZE)
        if (cards.length) for (const card of cards) await ctx.db.delete(card._id)
        else {
          const versionStats = await ctx.db
            .query("deckVersionStats")
            .withIndex("by_version", (q) => q.eq("deckVersionId", version._id))
            .unique()
          if (versionStats) await ctx.db.delete(versionStats._id)
          await ctx.db.delete(version._id)
        }
        await ctx.scheduler.runAfter(0, internal.accountDeletion.processDecks, args)
        return null
      }
      const stats = await ctx.db
        .query("deckStats")
        .withIndex("by_deck", (q) => q.eq("deckId", deck._id))
        .unique()
      if (stats) await ctx.db.delete(stats._id)
      await ctx.db.delete(deck._id)
      await ctx.scheduler.runAfter(0, internal.accountDeletion.processDecks, args)
    } catch (cause) {
      await recordFailure(
        ctx,
        request,
        cause instanceof Error ? cause.message : "Could not delete decks",
      )
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
    const updatedAt = Date.now()
    await ctx.db.patch(request._id, {
      userId: undefined,
      status: "identity_pending",
      attempts: 0,
      lastError: undefined,
      updatedAt,
    })
    await updateReceipt(ctx, request, "identity_pending", updatedAt)
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
    const updatedAt = Date.now()
    const status = shouldRetry ? "identity_pending" : "failed"
    await ctx.db.patch(request._id, {
      attempts,
      status,
      lastError: args.message.slice(0, 500),
      updatedAt,
    })
    await updateReceipt(ctx, request, status, updatedAt)
    return { attempts, shouldRetry }
  },
})

export const complete = internalMutation({
  args: { requestId: v.id("accountDeletionRequests") },
  handler: async (ctx, args) => {
    const request = await ctx.db.get(args.requestId)
    if (request) {
      await updateReceipt(ctx, request, "completed", Date.now())
      await ctx.db.delete(request._id)
    }
    return null
  },
})
