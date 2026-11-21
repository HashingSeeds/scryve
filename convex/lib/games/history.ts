import { paginationOptsValidator } from "convex/server"
import { v } from "convex/values"

import type { Doc } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { requireMembership, requireUser } from "../auth"
import { DEFAULT_DECK_GAME } from "../deckGames"
import { deckStartingValue } from "../deckStartingValue"
import { hasFeature, PREMIUM_FEATURES } from "../entitlements"
import { connectedLogEvent } from "../gameLog"
import { commanderField } from "../gameRules"
import { blockedUserIdsFor } from "../moderation"
import {
  boundedPaginationOptions,
  CONNECTED_EVENT_PAGE_MAX_ITEMS,
  CONNECTED_MEMBERSHIP_PAGE_MAX_ITEMS,
} from "../pagination"
import { HISTORY_MIGRATION_VERSION, MEMBERSHIP_MIGRATION_VERSION } from "../policy"
import { mutationHandler, queryHandler } from "./handlers"
import { gameByPublicId, maskSummaryPlayersForViewer } from "./shared"

// eslint-disable-next-line self-explanatory-code/prefer-self-explanatory-code -- Installed clients still read `premium` and `hasLockedHistory`; history itself is free for everyone.
export const connectedHistory = queryHandler({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    const premium = await hasFeature(ctx, user, PREMIUM_FEATURES.fullHistory)
    const history = await ctx.db
      .query("gameHistoryEntries")
      .withIndex("by_user_and_finished_at", (q) => q.eq("userId", user._id))
      .order("desc")
      .paginate(boundedPaginationOptions(args.paginationOpts, CONNECTED_MEMBERSHIP_PAGE_MAX_ITEMS))
    const blocked = await blockedUserIdsFor(ctx, user._id)
    const page = []
    for (const entry of history.page) {
      // why: installed clients can only render games. Manual matches reach History in a new query.
      if (entry.source === "manual") continue
      const summary = await ctx.db.get(entry.summaryId)
      if (summary) {
        page.push({
          publicId: summary.publicId,
          startingLife: summary.startingLife,
          ruleset: summary.ruleset,
          eventCount: summary.eventCount,
          system: summary.system ?? summary.game ?? DEFAULT_DECK_GAME,
          format: summary.format ?? summary.ruleset,
          finishedAt: summary.finishedAt,
          outcome: entry.outcome,
          source: entry.source ?? "connected",
          terminalStatus: summary.terminalStatus ?? "finished",
          terminalReason: summary.terminalReason,
          players: maskSummaryPlayersForViewer(summary.players, user._id, blocked, {
            localGame: entry.source === "local",
          }),
        })
      }
    }
    return {
      ...history,
      page,
      premium,
      hasLockedHistory: false,
      migrationRequired: (user.historyMigrationVersion ?? 0) < HISTORY_MIGRATION_VERSION,
    }
  },
})

export const migrateMyHistoryEntries = mutationHandler({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    if ((user.historyMigrationVersion ?? 0) >= HISTORY_MIGRATION_VERSION)
      return { migratedCount: 0, isDone: true, continueCursor: "", alreadyComplete: true }
    const cursor = user.historyMigrationCursor ?? args.cursor
    const memberships = await ctx.db
      .query("gamePlayers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .paginate({ cursor, numItems: 25 })
    let migratedCount = 0
    for (const membership of memberships.page) {
      const existing = await ctx.db
        .query("gameHistoryEntries")
        .withIndex("by_user_and_game", (q) =>
          q.eq("userId", user._id).eq("gameId", membership.gameId),
        )
        .unique()
      if (existing) continue
      const summary = await ctx.db
        .query("gameSummaries")
        .withIndex("by_game", (q) => q.eq("gameId", membership.gameId))
        .unique()
      if (!summary) continue
      const summaryPlayer = summary.players.find((player) => player.playerId === membership._id)
      await ctx.db.insert("gameHistoryEntries", {
        userId: user._id,
        gameId: membership.gameId,
        summaryId: summary._id,
        finishedAt: summary.finishedAt,
        outcome: summaryPlayer?.outcome ?? "unknown",
      })
      migratedCount += 1
    }
    await ctx.db.patch(
      user._id,
      memberships.isDone
        ? { historyMigrationVersion: HISTORY_MIGRATION_VERSION, historyMigrationCursor: undefined }
        : { historyMigrationCursor: memberships.continueCursor },
    )
    return {
      migratedCount,
      isDone: memberships.isDone,
      continueCursor: memberships.continueCursor,
      alreadyComplete: false,
    }
  },
})

export const migrateMyGameMemberships = mutationHandler({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    if ((user.membershipMigrationVersion ?? 0) >= MEMBERSHIP_MIGRATION_VERSION)
      return { migratedCount: 0, isDone: true, continueCursor: "", alreadyComplete: true }
    const cursor = user.membershipMigrationCursor ?? args.cursor
    const memberships = await ctx.db
      .query("gamePlayers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .paginate({ cursor, numItems: 50 })
    let migratedCount = 0
    for (const membership of memberships.page) {
      if (membership.resumable !== undefined) continue
      const game = await ctx.db.get(membership.gameId)
      await ctx.db.patch(membership._id, {
        resumable: Boolean(game && (game.status === "lobby" || game.status === "active")),
      })
      migratedCount += 1
    }
    await ctx.db.patch(
      user._id,
      memberships.isDone
        ? {
            membershipMigrationVersion: MEMBERSHIP_MIGRATION_VERSION,
            membershipMigrationCursor: undefined,
          }
        : { membershipMigrationCursor: memberships.continueCursor },
    )
    return {
      migratedCount,
      isDone: memberships.isDone,
      continueCursor: memberships.continueCursor,
      alreadyComplete: false,
    }
  },
})

// why: a published local game with no seat of the owner's has no membership row, only a host.
async function requireSummaryAccess(ctx: QueryCtx, game: Doc<"games">) {
  const user = await requireUser(ctx)
  if (game.mode === "local" && game.hostUserId === user._id) return
  await requireMembership(ctx, game._id)
}

export const connectedSummary = queryHandler({
  args: { publicId: v.string() },
  handler: async (ctx, args) => {
    const game = await gameByPublicId(ctx, args.publicId)
    await requireSummaryAccess(ctx, game)
    if (game.status !== "finished" && game.status !== "abandoned") return null
    const summary = await ctx.db
      .query("gameSummaries")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .unique()
    if (!summary) return null
    const viewer = await requireUser(ctx)
    const blocked = await blockedUserIdsFor(ctx, viewer._id)
    const system = summary.system ?? summary.game ?? DEFAULT_DECK_GAME
    const format = summary.format ?? summary.ruleset
    const players = maskSummaryPlayersForViewer(summary.players, viewer._id, blocked, {
      localGame: game.mode === "local",
    })
    return {
      ...summary,
      game: summary.game ?? DEFAULT_DECK_GAME,
      system,
      format,
      players: await Promise.all(
        players.map(async (player) => {
          const startingLife =
            (await ctx.db.get(player.playerId))?.startingLife ??
            (player.deckVersionId &&
              (await deckStartingValue(ctx, player.deckVersionId, system, format)))
          return { ...player, ...(startingLife ? { startingLife } : {}) }
        }),
      ),
      viewerPlayerIds: summary.players
        .filter((player) => player.userId === viewer._id)
        .map((player) => player.playerId),
    }
  },
})

export const connectedEvents = queryHandler({
  args: { publicId: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const game = await gameByPublicId(ctx, args.publicId)
    await requireSummaryAccess(ctx, game)
    const viewer = await requireUser(ctx)
    const result = await ctx.db
      .query("gameEvents")
      .withIndex("by_game_server_time", (q) => q.eq("gameId", game._id))
      .order("desc")
      .paginate(boundedPaginationOptions(args.paginationOpts, CONNECTED_EVENT_PAGE_MAX_ITEMS))
    return {
      ...result,
      page: result.page.map((event) => ({
        ...connectedLogEvent(event, viewer._id),
        operationId: event.operationId,
        playerId: event.playerId,
        kind: event.kind,
        delta: event.delta,
        fromPlayerId: event.fromPlayerId,
        toPlayerId: event.toPlayerId,
        ...commanderField(event.commander),
        claimOperationId: event.claimOperationId,
        clientCreatedAt: event.clientCreatedAt,
        serverCreatedAt: event.serverCreatedAt,
        eventId: event._id,
        sequence: event.sequence ?? null,
      })),
    }
  },
})
