import { paginationOptsValidator } from "convex/server"
import { v } from "convex/values"

import type { Doc, Id } from "./_generated/dataModel"
import { query, type QueryCtx } from "./_generated/server"
import { maskSummaryPlayersForViewer } from "./games"
import { requireUser } from "./lib/auth"
import { DEFAULT_DECK_GAME } from "./lib/deckGames"
import { blockedUserIdsFor } from "./lib/moderation"
import { boundedPaginationOptions, CONNECTED_MEMBERSHIP_PAGE_MAX_ITEMS } from "./lib/pagination"
import { HISTORY_MIGRATION_VERSION } from "./lib/policy"

type ManualMatch = Extract<Doc<"matches">, { source: "manual" }>

// why: only the owner ever reads a manual match, so its free-text names need no masking.
function manualMatchView(match: ManualMatch) {
  return {
    matchId: match._id,
    publicId: match.publicId,
    bestOf: match.bestOf,
    system: match.system,
    format: match.format,
    eventName: match.eventName,
    roundNumber: match.roundNumber,
    finishedAt: match.finishedAt,
    seats: match.seats.map((seat) => ({
      seat: seat.seat,
      displayName: seat.displayName,
      deckName: seat.deckName,
      gamesWon: seat.gamesWon,
      gamesDrawn: seat.gamesDrawn,
      outcome: seat.outcome,
      mine: seat.userId !== undefined && seat.userId === match.ownerUserId,
    })),
  }
}

export type ManualMatchView = ReturnType<typeof manualMatchView>

type ScryveMatch = Extract<Doc<"matches">, { source: "connected" }>

// why: names come from the game rows, which are already masked for the viewer, so the summary carries only seats, scores, and outcomes.
function scryveMatchView(match: ScryveMatch, viewerId: Id<"users">) {
  const seats = match.seats.map((seat) => ({
    seat: seat.seat,
    gamesWon: seat.gamesWon,
    gamesDrawn: seat.gamesDrawn,
    outcome: seat.outcome,
    mine: seat.userId !== undefined && seat.userId === viewerId,
  }))
  return {
    publicId: match.publicId,
    bestOf: match.bestOf,
    status: match.status,
    finishedAt: match.finishedAt,
    outcome: seats.find((seat) => seat.mine)?.outcome,
    seats,
  }
}

export type ScryveMatchView = ReturnType<typeof scryveMatchView>

// why: every game of a match on the page shares one lookup, so reads stay bounded by the page size.
function scryveMatchLookup(ctx: QueryCtx, viewerId: Id<"users">) {
  const views = new Map<Id<"matches">, ScryveMatchView | null>()
  return async (matchId: Id<"matches">) => {
    const cached = views.get(matchId)
    if (cached !== undefined) return cached
    const match = await ctx.db.get(matchId)
    const view = match?.source === "connected" ? scryveMatchView(match, viewerId) : null
    views.set(matchId, view)
    return view
  }
}

// why: connectedHistory stays for installed clients, which cannot render manual match rows.
export const entries = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    const history = await ctx.db
      .query("gameHistoryEntries")
      .withIndex("by_user_and_finished_at", (q) => q.eq("userId", user._id))
      .order("desc")
      .paginate(boundedPaginationOptions(args.paginationOpts, CONNECTED_MEMBERSHIP_PAGE_MAX_ITEMS))
    const blocked = await blockedUserIdsFor(ctx, user._id)
    const scryveMatch = scryveMatchLookup(ctx, user._id)
    const page = []
    for (const entry of history.page) {
      if (entry.source === "manual") {
        const match = await ctx.db.get(entry.matchId)
        if (match?.source === "manual")
          page.push({ kind: "match" as const, outcome: entry.outcome, ...manualMatchView(match) })
        continue
      }
      const summary = await ctx.db.get(entry.summaryId)
      if (!summary) continue
      const match = entry.matchId ? await scryveMatch(entry.matchId) : null
      page.push({
        kind: "game" as const,
        source: entry.source,
        matchId: entry.matchId,
        ...(match ? { match } : {}),
        publicId: summary.publicId,
        startingLife: summary.startingLife,
        ruleset: summary.ruleset,
        eventCount: summary.eventCount,
        system: summary.system ?? summary.game ?? DEFAULT_DECK_GAME,
        format: summary.format ?? summary.ruleset,
        finishedAt: summary.finishedAt,
        outcome: entry.outcome,
        terminalStatus: summary.terminalStatus ?? "finished",
        terminalReason: summary.terminalReason,
        players: maskSummaryPlayersForViewer(summary.players, user._id, blocked, {
          localGame: entry.source === "local",
        }),
      })
    }
    return {
      ...history,
      page,
      migrationRequired: (user.historyMigrationVersion ?? 0) < HISTORY_MIGRATION_VERSION,
    }
  },
})

export const manualMatch = query({
  args: { publicId: v.string() },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    const match = await ctx.db
      .query("matches")
      .withIndex("by_public_id", (q) => q.eq("publicId", args.publicId))
      .unique()
    if (!match || match.source !== "manual" || match.ownerUserId !== user._id) return null
    return manualMatchView(match)
  },
})
