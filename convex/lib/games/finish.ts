import { ConvexError, v, type Infer } from "convex/values"

import { internal } from "../../_generated/api"
import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx } from "../../_generated/server"
import { isProMarkShape } from "../appearance"
import { requireHost, requireUser } from "../auth"
import { pinnedDeck } from "../deckKeys"
import { deckStartingValue } from "../deckStartingValue"
import { mutationHandler } from "./handlers"
import { gameSetupOf, insertGame } from "./setup"
import {
  continueHostedMatch,
  endHostedMatch,
  hostedMatchIsFull,
  openHostedMatch,
} from "../../matches"
import { gameWriteError } from "../gameWriteErrors"
import { isBlockedBetween } from "../moderation"
import {
  assertInviteToken,
  assertManualCodeCandidates,
  INVITE_LIFETIME_MS,
  STALE_GAME_CLEANUP_BATCH_SIZE,
  STALE_GAME_INACTIVITY_MS,
  UNTOUCHED_REMATCH_LIFETIME_MS,
} from "../policy"
import { attachesDecks } from "../systems"
import { modeGameFields, startModes } from "../tableModes"
import { isTeamVariant } from "../teamVariants"
import { pairedTeams } from "../twoHeadedGiant"
import {
  MAX_PLAYERS_PER_GAME_READ,
  NO_SEAT_DECK,
  allocateInvite,
  assertDeviceId,
  assertOperationId,
  assertPublicId,
  deckSelectionIsPlayable,
  gameByPublicId,
  gameDeckRules,
  isUntouchedRematch,
  lifeEditingFor,
  playersForGame,
  proMarkFor,
  rolesFor,
  sharedSeatKey,
  terminalizeGame,
  totalEventCount,
} from "./shared"

async function rematchProMark(ctx: MutationCtx, player: Doc<"gamePlayers">) {
  const user = player.userId ? await ctx.db.get(player.userId) : null
  return user && isProMarkShape(player.proShape)
    ? ((await proMarkFor(ctx, user, player.proShape)) ?? {})
    : {}
}

const rematchRequest = v.object({
  publicId: v.string(),
  inviteToken: v.string(),
  manualCodeCandidates: v.array(v.string()),
})

async function startRematch(
  ctx: MutationCtx,
  finished: Doc<"games">,
  hostUserId: Id<"users">,
  request: Infer<typeof rematchRequest>,
  loserSeat?: number,
) {
  assertPublicId(request.publicId)
  assertInviteToken(request.inviteToken)
  assertManualCodeCandidates(request.manualCodeCandidates)
  const players = await playersForGame(ctx, finished._id)
  if (players.some((player) => player.deletedAt !== undefined)) return null
  if (await hostedMatchIsFull(ctx, finished)) return null
  const userIds = [...new Set(players.flatMap((player) => player.userId ?? []))]
  for (const [index, userId] of userIds.entries()) {
    for (const otherUserId of userIds.slice(index + 1)) {
      if (await isBlockedBetween(ctx, userId, otherUserId)) return null
    }
  }
  for (const status of ["lobby", "active"] as const) {
    const hosted = await ctx.db
      .query("games")
      .withIndex("by_host_status", (q) => q.eq("hostUserId", hostUserId).eq("status", status))
      .first()
    if (hosted) return null
  }
  if (
    await ctx.db
      .query("games")
      .withIndex("by_public_id", (q) => q.eq("publicId", request.publicId))
      .unique()
  )
    throw new Error("Game identifier collision; retry")
  const now = Date.now()
  const gameId = await insertGame(
    ctx,
    { ...gameSetupOf(finished), lifeEditing: lifeEditingFor(players).lifeEditing },
    {
      publicId: request.publicId,
      hostUserId,
      mode: "connected",
      status: "active",
      playerCount: players.length,
      rematchOfGameId: finished._id,
      createdAt: now,
      startedAt: now,
      updatedAt: now,
      eventSequence: 0,
    },
  )
  const game = (await ctx.db.get(gameId))!
  const roles = rolesFor(game, players.length)
  const decks = attachesDecks(gameDeckRules(game)[0])
  const seatIds: Id<"gamePlayers">[] = []
  for (const [index, player] of players
    .sort((left, right) => left.seat - right.seat)
    .map((seat) => (decks ? seat : { ...seat, ...NO_SEAT_DECK }))
    .entries()) {
    const deckVersionId =
      player.deckVersionId && (await deckSelectionIsPlayable(ctx, player.deckVersionId, game))
        ? player.deckVersionId
        : undefined
    const deckLife = isTeamVariant(game.variant)
      ? undefined
      : ((deckVersionId
          ? await deckStartingValue(ctx, deckVersionId, ...gameDeckRules(game))
          : undefined) ?? player.startingLife)
    const seatId = await ctx.db.insert("gamePlayers", {
      gameId,
      seat: player.seat,
      ...(player.userId ? { userId: player.userId } : {}),
      ...(player.deviceId ? { deviceId: player.deviceId } : {}),
      displayName: player.displayName,
      ...(player.avatarUrl ? { avatarUrl: player.avatarUrl } : {}),
      ...(player.usernameAtJoin ? { usernameAtJoin: player.usernameAtJoin } : {}),
      ...(deckVersionId ? { deckVersionId, ...(await pinnedDeck(ctx, deckVersionId)) } : {}),
      ...(sharedSeatKey(player)
        ? { deckKey: player.deckKey, deckFingerprint: player.deckFingerprint }
        : {}),
      ...(player.deckLabel ? { deckLabel: player.deckLabel } : {}),
      color: player.color,
      ...(player.shape ? { shape: player.shape } : {}),
      ...(await rematchProMark(ctx, player)),
      ...(deckLife === undefined ? {} : { startingLife: deckLife }),
      currentLife: deckLife ?? finished.startingLife,
      eventCount: 0,
      resumable: true,
      joinedAt: now,
      ...(player.editsAnySeat ? { editsAnySeat: true } : {}),
      ...roles?.[index],
    })
    seatIds.push(seatId)
    if (finished.firstPlayerMode && player.seat === loserSeat)
      await ctx.db.patch(gameId, { firstChooser: { playerId: seatId, reason: "loss" } })
  }
  if (finished.modeSetup) {
    const archenemySeat = players.find(
      (player) => player._id === finished.modes?.archenemy?.playerId,
    )?.seat
    const started = startModes(
      finished.modeSetup.archenemy && archenemySeat !== undefined
        ? {
            ...finished.modeSetup,
            archenemy: { ...finished.modeSetup.archenemy, seat: archenemySeat },
          }
        : finished.modeSetup,
      seatIds,
    )
    await ctx.db.patch(gameId, {
      ...modeGameFields(started, now, `archenemy_${request.publicId}`),
    })
  }
  if (isTeamVariant(game.variant)) {
    // why: a connected local game can team seats that are not neighbors, and a rematch keeps the same teammates.
    const nextIdOf = new Map<string, Id<"gamePlayers">>(
      [...players]
        .sort((left, right) => left.seat - right.seat)
        .map((player, index) => [player._id, seatIds[index]]),
    )
    const kept = finished.turnGroups?.map((group) => group.flatMap((id) => nextIdOf.get(id) ?? []))
    await ctx.db.patch(gameId, {
      turnGroups: kept && kept.flat().length === seatIds.length ? kept : pairedTeams(seatIds),
    })
  }
  if (finished.matchBestOf && !(await continueHostedMatch(ctx, finished, game)))
    await openHostedMatch(ctx, game, players, finished.matchBestOf)
  if (players.some((player) => player.userId === undefined)) {
    const manualCode = await allocateInvite(ctx, request.inviteToken, request.manualCodeCandidates)
    const invitationId = await ctx.db.insert("invitations", {
      gameId,
      token: request.inviteToken,
      manualCode,
      expiresAt: now + INVITE_LIFETIME_MS,
      createdAt: now,
    })
    await ctx.db.patch(gameId, { currentInvitationId: invitationId })
  }
  await ctx.db.patch(finished._id, { rematchPublicId: request.publicId })
  await ctx.scheduler.runAfter(
    UNTOUCHED_REMATCH_LIFETIME_MS,
    internal.games.discardUntouchedRematch,
    { gameId },
  )
  return request.publicId
}

export const discardUntouchedRematch = mutationHandler({
  args: { gameId: v.id("games") },
  handler: async (ctx, args) => {
    const game = await ctx.db.get(args.gameId)
    if (game?.status !== "active" || !isUntouchedRematch(game, await playersForGame(ctx, game._id)))
      return
    await terminalizeGame(ctx, game, "abandoned", "stale_inactivity")
  },
})

export const finishGame = mutationHandler({
  args: {
    publicId: v.string(),
    result: v.optional(
      v.union(
        v.object({ kind: v.literal("win"), winnerPlayerIds: v.array(v.id("gamePlayers")) }),
        v.object({ kind: v.literal("draw") }),
        v.object({ kind: v.literal("unknown") }),
      ),
    ),
    rematch: v.optional(rematchRequest),
  },
  handler: async (ctx, args) => {
    const game = await gameByPublicId(ctx, args.publicId)
    const user = await requireHost(ctx, game)
    if (game.status !== "active")
      throw gameWriteError("game_not_active", "Only an active game can be finished")
    const result = args.result ?? { kind: "unknown" as const }
    const summary = await terminalizeGame(ctx, game, "finished", "host_finished", user._id, result)
    const losers =
      result.kind === "win"
        ? summary.players.filter((player) => !result.winnerPlayerIds.includes(player.playerId))
        : []
    const rematchPublicId = args.rematch
      ? await startRematch(
          ctx,
          game,
          user._id,
          args.rematch,
          losers.length === 1 ? losers[0].seat : undefined,
        )
      : null
    return {
      publicId: game.publicId,
      summaryId: summary._id,
      finishedAt: summary.finishedAt,
      ...(rematchPublicId ? { rematchPublicId } : {}),
    }
  },
})

export const endMatch = mutationHandler({
  args: {
    publicId: v.string(),
    seats: v.array(
      v.object({
        seat: v.number(),
        outcome: v.union(v.literal("win"), v.literal("loss"), v.literal("draw")),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const game = await gameByPublicId(ctx, args.publicId)
    await requireHost(ctx, game)
    const match = game.mode === "connected" && game.matchId ? await ctx.db.get(game.matchId) : null
    if (match?.source !== "connected")
      throw new ConvexError({ code: "match_not_found", message: "Match not found" })
    if (match.gameIds.at(-1) !== game._id)
      throw new ConvexError({
        code: "match_moved_on",
        message: "End the match from its latest game",
      })
    if (game.status !== "active") {
      await endHostedMatch(ctx, match._id, args.seats)
      return { publicId: game.publicId }
    }
    const players = await playersForGame(ctx, game._id)
    if (totalEventCount(game, players) > 0)
      throw new ConvexError({
        code: "match_game_in_progress",
        message: "Finish this game before ending the match",
      })
    // why: the next game is already on every board, so it stays and opens the next match instead of being thrown away.
    await ctx.db.patch(match._id, { gameIds: match.gameIds.slice(0, -1) })
    await endHostedMatch(ctx, match._id, args.seats)
    await openHostedMatch(ctx, game, players, match.bestOf)
    return { publicId: game.publicId }
  },
})

type CompletionResult =
  { kind: "win"; winnerPlayerIds: Id<"gamePlayers">[] } | { kind: "draw" } | { kind: "unknown" }

function completionRequestKey(
  publicId: string,
  kind: "finish" | "abandon",
  result: CompletionResult,
) {
  return JSON.stringify([publicId, kind, result])
}

async function completeGameWithOperation(
  ctx: MutationCtx,
  args: {
    publicId: string
    operationId: string
    kind: "finish" | "abandon"
    result?: CompletionResult
  },
) {
  assertOperationId(args.operationId)
  const result: CompletionResult =
    args.kind === "finish" ? (args.result ?? { kind: "unknown" }) : { kind: "unknown" }
  const requestKey = completionRequestKey(args.publicId, args.kind, result)
  const game = await gameByPublicId(ctx, args.publicId)
  const user = await requireHost(ctx, game)
  const existing = await ctx.db
    .query("gameCompletionReceipts")
    .withIndex("by_host_and_operation_id", (q) =>
      q.eq("hostUserId", user._id).eq("operationId", args.operationId),
    )
    .unique()
  if (existing) {
    if (existing.gameId !== game._id || existing.requestKey !== requestKey)
      throw new Error("Operation identifier was reused with different data")
    return { ...existing.ack, deduplicated: true }
  }
  if (game.status === "finished" || game.status === "abandoned") {
    const summary = await ctx.db
      .query("gameSummaries")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .unique()
    if (!summary) throw new Error("Game already has a terminal state without a summary")
    return {
      publicId: game.publicId,
      summaryId: summary._id,
      finishedAt: summary.finishedAt,
      deduplicated: false,
      superseded: true as const,
    }
  }
  if (args.kind === "finish" && game.status !== "active")
    throw gameWriteError("game_not_active", "Only an active game can be finished")
  const summary = await terminalizeGame(
    ctx,
    game,
    args.kind === "finish" ? "finished" : "abandoned",
    args.kind === "finish" ? "host_finished" : "host_abandoned",
    user._id,
    result,
  )
  const ack = {
    publicId: game.publicId,
    summaryId: summary._id,
    finishedAt: summary.finishedAt,
  }
  await ctx.db.insert("gameCompletionReceipts", {
    hostUserId: user._id,
    gameId: game._id,
    operationId: args.operationId,
    requestKey,
    ack,
  })
  return { ...ack, deduplicated: false }
}

export const finishGameWithOperation = mutationHandler({
  args: {
    publicId: v.string(),
    operationId: v.string(),
    result: v.optional(
      v.union(
        v.object({ kind: v.literal("win"), winnerPlayerIds: v.array(v.id("gamePlayers")) }),
        v.object({ kind: v.literal("draw") }),
        v.object({ kind: v.literal("unknown") }),
      ),
    ),
  },
  handler: async (ctx, args) =>
    completeGameWithOperation(ctx, {
      publicId: args.publicId,
      operationId: args.operationId,
      kind: "finish",
      ...(args.result === undefined ? {} : { result: args.result }),
    }),
})

export const abandonGameWithOperation = mutationHandler({
  args: { publicId: v.string(), operationId: v.string() },
  handler: async (ctx, args) =>
    completeGameWithOperation(ctx, {
      publicId: args.publicId,
      operationId: args.operationId,
      kind: "abandon",
    }),
})

export const leaveMyGame = mutationHandler({
  args: { publicId: v.string(), deviceId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const game = await gameByPublicId(ctx, args.publicId)
    if (args.deviceId) assertDeviceId(args.deviceId)
    const user = await requireUser(ctx)
    if (game.hostUserId === user._id && (game.status === "lobby" || game.status === "active"))
      throw new ConvexError({
        code: "host_cannot_leave",
        message: "Hosts must finish or abandon an unfinished game instead of leaving it",
      })
    const userPlayers = await ctx.db
      .query("gamePlayers")
      .withIndex("by_game_user", (q) => q.eq("gameId", game._id).eq("userId", user._id))
      .take(MAX_PLAYERS_PER_GAME_READ)
    const player = args.deviceId
      ? userPlayers.find(
          (candidate) => candidate.deviceId === args.deviceId || candidate.deviceId === undefined,
        )
      : userPlayers[0]
    if (!player) throw gameWriteError("game_membership_required", "Game membership required")
    if (game.status === "lobby") {
      await ctx.db.delete(player._id)
      await ctx.db.patch(game._id, { updatedAt: Date.now() })
    } else if (player.resumable !== false) await ctx.db.patch(player._id, { resumable: false })
    return { publicId: game.publicId, left: true }
  },
})

export const abandonGame = mutationHandler({
  args: { publicId: v.string() },
  handler: async (ctx, args) => {
    const game = await gameByPublicId(ctx, args.publicId)
    const user = await requireHost(ctx, game)
    if (game.status !== "lobby" && game.status !== "active" && game.status !== "abandoned")
      throw new ConvexError({
        code: "game_ended",
        message: "Only a lobby or active game can be abandoned",
      })
    const summary = await terminalizeGame(ctx, game, "abandoned", "host_abandoned", user._id)
    return { publicId: game.publicId, summaryId: summary._id, abandonedAt: summary.finishedAt }
  },
})

export const cleanupStaleGames = mutationHandler({
  args: {},
  handler: async (ctx) => {
    const now = Date.now()
    const cutoff = now - STALE_GAME_INACTIVITY_MS
    let examined = 0
    let abandoned = 0
    for (const status of ["lobby", "active"] as const) {
      const games = await ctx.db
        .query("games")
        .withIndex("by_status_updated", (q) => q.eq("status", status).lte("updatedAt", cutoff))
        .order("asc")
        .take(STALE_GAME_CLEANUP_BATCH_SIZE)
      for (const game of games) {
        examined += 1
        const players = await playersForGame(ctx, game._id)
        const latestActivityAt = players.reduce(
          (latest, player) => Math.max(latest, player.lastEventAt ?? 0),
          game.updatedAt,
        )
        if (latestActivityAt > cutoff) {
          await ctx.db.patch(game._id, { updatedAt: latestActivityAt })
          continue
        }
        await terminalizeGame(ctx, game, "abandoned", "stale_inactivity")
        abandoned += 1
      }
    }
    return { examined, abandoned, cutoff, batchSizePerStatus: STALE_GAME_CLEANUP_BATCH_SIZE }
  },
})
