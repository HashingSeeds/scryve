import { ConvexError, v } from "convex/values"

import { internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import {
  env,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server"
import type { MutationCtx } from "./_generated/server"
import { requireIdentity, requireUser } from "./lib/auth"
import {
  placeUsernameOnHold,
  publicUsernameFor,
  releaseUsernameHold as releaseUsernameHoldFor,
} from "./lib/moderation"
import {
  describeUsernameMatches,
  usernameFailsGate,
  usernameFailsReportThreshold,
} from "./lib/nameFilter"

export const AUTO_HOLD_REPORT_THRESHOLD = 2
const HISTORY_RENAME_BATCH_SIZE = 25
const MAX_NOTE_LENGTH = 500
const OPEN_REPORT_PAGE_SIZE = 50

export const reportReasonValidator = v.union(
  v.literal("offensive_username"),
  v.literal("harassment"),
  v.literal("impersonation"),
  v.literal("other"),
)

async function blockUser(ctx: MutationCtx, blockerUserId: Id<"users">, blockedUserId: Id<"users">) {
  const existing = await ctx.db
    .query("userBlocks")
    .withIndex("by_blocker_and_blocked", (q) =>
      q.eq("blockerUserId", blockerUserId).eq("blockedUserId", blockedUserId),
    )
    .unique()
  if (existing) return existing._id
  return await ctx.db.insert("userBlocks", {
    blockerUserId,
    blockedUserId,
    createdAt: Date.now(),
  })
}

async function requirePlayerActionTarget(
  ctx: MutationCtx,
  publicId: string,
  playerId: Id<"gamePlayers">,
) {
  const reporter = await requireUser(ctx)
  const game = await ctx.db
    .query("games")
    .withIndex("by_public_id", (q) => q.eq("publicId", publicId))
    .unique()
  if (!game) throw new ConvexError({ code: "not_found", message: "Game unavailable" })
  const reporterSeat = await ctx.db
    .query("gamePlayers")
    .withIndex("by_game_user", (q) => q.eq("gameId", game._id).eq("userId", reporter._id))
    .first()
  if (!reporterSeat) throw new ConvexError({ code: "forbidden", message: "Game unavailable" })
  const reportedSeat = await ctx.db.get(playerId)
  if (!reportedSeat || reportedSeat.gameId !== game._id)
    throw new ConvexError({ code: "not_found", message: "That player is not in this game" })
  if (!reportedSeat.userId)
    throw new ConvexError({ code: "invalid", message: "That seat has no account to report" })
  if (reportedSeat.userId === reporter._id)
    throw new ConvexError({ code: "invalid", message: "You cannot report your own seat" })
  const reported = await ctx.db.get(reportedSeat.userId)
  if (!reported) throw new ConvexError({ code: "not_found", message: "That player is unavailable" })
  return { reporter, reported, game, reportedSeat }
}

export const reportPlayer = mutation({
  args: {
    publicId: v.string(),
    playerId: v.id("gamePlayers"),
    reason: reportReasonValidator,
    note: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { reporter, reported, game, reportedSeat } = await requirePlayerActionTarget(
      ctx,
      args.publicId,
      args.playerId,
    )
    const note = args.note?.trim().slice(0, MAX_NOTE_LENGTH)
    const reportedUsername =
      publicUsernameFor(reported) ?? reportedSeat.usernameAtJoin ?? "(no username)"

    await blockUser(ctx, reporter._id, reported._id)

    const priorReports = await ctx.db
      .query("moderationReports")
      .withIndex("by_reported_user", (q) => q.eq("reportedUserId", reported._id))
      .take(100)
    const alreadyReported = priorReports.some(
      (report) => report.reporterUserId === reporter._id && report.status === "open",
    )
    if (alreadyReported) return { blocked: true, held: Boolean(reported.moderationHold) }

    const distinctReporters = new Set(
      priorReports
        .filter((report) => report.status === "open")
        .map((report) => report.reporterUserId),
    )
    distinctReporters.add(reporter._id)
    const heldUsername = reported.moderationHold?.heldUsername ?? reported.username ?? ""
    const matchedTerms = describeUsernameMatches(heldUsername)
    const failsThreshold = usernameFailsReportThreshold(heldUsername)
    const autoAction = failsThreshold
      ? ("held_on_filter" as const)
      : distinctReporters.size >= AUTO_HOLD_REPORT_THRESHOLD
        ? ("held_on_reports" as const)
        : undefined

    const reportId = await ctx.db.insert("moderationReports", {
      reporterUserId: reporter._id,
      reportedUserId: reported._id,
      gameId: game._id,
      reportedUsername,
      reason: args.reason,
      ...(note ? { note } : {}),
      status: "open",
      ...(autoAction ? { autoAction } : {}),
      ...(matchedTerms.length ? { matchedTerms } : {}),
      createdAt: Date.now(),
    })
    if (autoAction) await placeUsernameOnHold(ctx, reported, failsThreshold ? "filter" : "reports")
    await ctx.scheduler.runAfter(0, internal.moderation.sendReportAlert, { reportId })
    return { blocked: true, held: Boolean(autoAction) }
  },
})

export const blockPlayer = mutation({
  args: { publicId: v.string(), playerId: v.id("gamePlayers") },
  handler: async (ctx, args) => {
    const { reporter, reported } = await requirePlayerActionTarget(
      ctx,
      args.publicId,
      args.playerId,
    )
    await blockUser(ctx, reporter._id, reported._id)
    return { blocked: true }
  },
})

export const unblockPlayer = mutation({
  args: { blockedUserId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    const existing = await ctx.db
      .query("userBlocks")
      .withIndex("by_blocker_and_blocked", (q) =>
        q.eq("blockerUserId", user._id).eq("blockedUserId", args.blockedUserId),
      )
      .unique()
    if (existing) await ctx.db.delete(existing._id)
    return { blocked: false }
  },
})

export const myBlocks = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx)
    const blocks = await ctx.db
      .query("userBlocks")
      .withIndex("by_blocker", (q) => q.eq("blockerUserId", user._id))
      .take(100)
    const entries = []
    for (const block of blocks) {
      const blocked = await ctx.db.get(block.blockedUserId)
      entries.push({
        blockedUserId: block.blockedUserId,
        username: blocked ? (publicUsernameFor(blocked) ?? "(no username)") : "(deleted account)",
        createdAt: block.createdAt,
      })
    }
    return entries
  },
})

export const usernameIsAcceptable = query({
  args: { username: v.string() },
  handler: async (ctx, args) => {
    // Deliberately `requireIdentity`, not `requireUser`: the gate asks this before the user row
    // exists, since a username has to be chosen before the profile can sync.
    await requireIdentity(ctx)
    return { acceptable: !usernameFailsGate(args.username.trim()) }
  },
})

export const renameHeldUserInHistory = internalMutation({
  args: { userId: v.id("users"), cursor: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId)
    if (!user) return null
    const name = publicUsernameFor(user)
    const page = await ctx.db
      .query("gameHistoryEntries")
      .withIndex("by_user_and_finished_at", (q) => q.eq("userId", args.userId))
      .paginate({ numItems: HISTORY_RENAME_BATCH_SIZE, cursor: args.cursor ?? null })
    for (const entry of page.page) {
      const summary = await ctx.db.get(entry.summaryId)
      if (!summary) continue
      let changed = false
      const players = summary.players.map((player) => {
        if (player.userId !== args.userId || player.usernameAtFinish === name) return player
        changed = true
        return { ...player, ...(name ? { usernameAtFinish: name } : {}) }
      })
      if (changed) await ctx.db.patch(summary._id, { players })
    }
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.moderation.renameHeldUserInHistory, {
        userId: args.userId,
        cursor: page.continueCursor,
      })
    return null
  },
})

export const openReports = internalQuery({
  args: {},
  handler: async (ctx) => {
    const reports = await ctx.db
      .query("moderationReports")
      .withIndex("by_status_and_created_at", (q) => q.eq("status", "open"))
      .order("asc")
      .take(OPEN_REPORT_PAGE_SIZE)
    const rows = []
    for (const report of reports) {
      const reported = await ctx.db.get(report.reportedUserId)
      rows.push({
        reportId: report._id,
        reportedUserId: report.reportedUserId,
        reportedUsername: report.reportedUsername,
        currentUsername: reported ? (reported.username ?? null) : null,
        heldAs: reported?.moderationHold?.placeholderUsername ?? null,
        reason: report.reason,
        note: report.note ?? null,
        autoAction: report.autoAction ?? null,
        matchedTerms: report.matchedTerms ?? [],
        createdAt: report.createdAt,
      })
    }
    return rows
  },
})

export const upholdReport = internalMutation({
  args: { reportId: v.id("moderationReports"), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const report = await ctx.db.get(args.reportId)
    if (!report) throw new Error("Report not found")
    const reported = await ctx.db.get(report.reportedUserId)
    if (reported) await placeUsernameOnHold(ctx, reported, "operator")
    await ctx.db.patch(report._id, {
      status: "upheld",
      resolvedAt: Date.now(),
      ...(args.note ? { resolutionNote: args.note } : {}),
    })
    return { held: true }
  },
})

export const dismissReport = internalMutation({
  args: { reportId: v.id("moderationReports"), note: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const report = await ctx.db.get(args.reportId)
    if (!report) throw new Error("Report not found")
    await ctx.db.patch(report._id, {
      status: "dismissed",
      resolvedAt: Date.now(),
      ...(args.note ? { resolutionNote: args.note } : {}),
    })
    const remaining = await ctx.db
      .query("moderationReports")
      .withIndex("by_reported_user", (q) => q.eq("reportedUserId", report.reportedUserId))
      .take(100)
    const stillOpen = remaining.some(
      (candidate) => candidate.status === "open" && candidate._id !== report._id,
    )
    const reported = await ctx.db.get(report.reportedUserId)
    const hold = reported?.moderationHold
    // Only an automatic hold is lifted here; one an operator placed deliberately stays. A name the
    // filter still objects to also stays held: dismissing "they harassed me" as unfounded says
    // nothing about the username, and releasing it here would put an offensive name back in play.
    const release = Boolean(
      reported &&
      hold &&
      !stillOpen &&
      hold.reason !== "operator" &&
      !usernameFailsReportThreshold(hold.heldUsername),
    )
    if (reported && release) await releaseUsernameHoldFor(ctx, reported)
    return { released: release }
  },
})

export const releaseUsernameHold = internalMutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId)
    if (!user) throw new Error("User not found")
    await releaseUsernameHoldFor(ctx, user)
    return { released: true }
  },
})

/**
 * Alerts are best effort. The report is already filed and any hold already applied before this
 * runs, so a missing key or a Resend outage must never undo moderation that has taken effect.
 */
async function sendModerationEmail({
  subject,
  text,
  fallbackLog,
}: {
  subject: string
  text: string
  fallbackLog: string
}) {
  const apiKey = env.RESEND_API_KEY
  const to = env.MODERATION_ALERT_TO
  const from = env.MODERATION_ALERT_FROM
  if (!apiKey || !to || !from) {
    console.warn(fallbackLog)
    return
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, text }),
  })
  if (!response.ok)
    console.error(`moderation alert email failed: ${response.status} ${await response.text()}`)
}

export const sendReportAlert = internalAction({
  args: { reportId: v.id("moderationReports") },
  handler: async (ctx, args) => {
    const report = await ctx.runQuery(internal.moderation.reportForAlert, {
      reportId: args.reportId,
    })
    if (!report) return null
    const lines = [
      `Reported username: ${report.reportedUsername}`,
      `Reporter: ${report.reporterUsername}`,
      `Game: ${report.gamePublicId}`,
      `Reason: ${report.reason}`,
      report.note ? `Reporter note: ${report.note}` : null,
      report.autoAction
        ? `Automatic action: username held (${report.autoAction}) as ${report.heldAs}`
        : "Automatic action: none — the name is still visible.",
      report.matchedTerms.length ? `Filter matched: ${report.matchedTerms.join(", ")}` : null,
      "",
      "Respond within 24 hours: run moderation:upholdReport or moderation:dismissReport in the",
      `Convex dashboard with reportId ${report.reportId}.`,
    ].filter((line): line is string => line !== null)
    await sendModerationEmail({
      subject: `Player report: ${report.reportedUsername}`,
      text: lines.join("\n"),
      fallbackLog: `moderation report ${args.reportId} filed; alert email is not configured`,
    })
    return null
  },
})

export const sendHoldAlert = internalAction({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(internal.moderation.heldUserForAlert, { userId: args.userId })
    if (!user?.heldUsername) return null
    await sendModerationEmail({
      subject: `Username held by filter: ${user.heldUsername}`,
      text: [
        `The username filter held "${user.heldUsername}" on sync from Clerk.`,
        `That account now appears to other players as "${user.placeholderUsername}".`,
        user.matchedTerms.length ? `Filter matched: ${user.matchedTerms.join(", ")}` : "",
        "",
        `To release it, run moderation:releaseUsernameHold with userId ${args.userId}.`,
      ]
        .filter(Boolean)
        .join("\n"),
      fallbackLog: `username held by filter for user ${args.userId}; alert email is not configured`,
    })
    return null
  },
})

export const heldUserForAlert = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId)
    if (!user?.moderationHold) return null
    return {
      heldUsername: user.moderationHold.heldUsername,
      placeholderUsername: user.moderationHold.placeholderUsername,
      matchedTerms: describeUsernameMatches(user.moderationHold.heldUsername),
    }
  },
})

export const reportForAlert = internalQuery({
  args: { reportId: v.id("moderationReports") },
  handler: async (ctx, args) => {
    const report = await ctx.db.get(args.reportId)
    if (!report) return null
    const reported = await ctx.db.get(report.reportedUserId)
    const reporter = await ctx.db.get(report.reporterUserId)
    const game = report.gameId ? await ctx.db.get(report.gameId) : null
    return {
      reportId: report._id,
      reportedUsername: report.reportedUsername,
      reporterUsername: reporter
        ? (publicUsernameFor(reporter) ?? "(no username)")
        : "(deleted account)",
      gamePublicId: game?.publicId ?? "(unknown game)",
      reason: report.reason,
      note: report.note ?? null,
      autoAction: report.autoAction ?? null,
      heldAs: reported?.moderationHold?.placeholderUsername ?? null,
      matchedTerms: report.matchedTerms ?? [],
    }
  },
})
