import { paginationOptsValidator } from "convex/server"
import { v } from "convex/values"

import type { Doc, Id } from "./_generated/dataModel"
import type { MutationCtx, QueryCtx } from "./_generated/server"
import { internalMutation, mutation, query } from "./_generated/server"
import { requireHost, requireMembership, requireSeatOwner, requireUser } from "./lib/auth"
import {
  boundedPaginationOptions,
  CONNECTED_EVENT_PAGE_MAX_ITEMS,
  CONNECTED_MEMBERSHIP_PAGE_MAX_ITEMS,
} from "./lib/pagination"
import {
  assertAllowedColor,
  assertDisplayName,
  assertInviteToken,
  assertManualCodeCandidates,
  assertPlayerCount,
  assertRuleset,
  assertStartingLife,
  inviteIsUsable,
  INVITE_LIFETIME_MS,
  MEMBERSHIP_MIGRATION_VERSION,
  normalizeManualCode,
  STALE_GAME_CLEANUP_BATCH_SIZE,
  STALE_GAME_INACTIVITY_MS,
} from "./lib/policy"

const MAX_PLAYERS_PER_GAME_READ = 7
const MAX_INVITES_PER_GAME_READ = 20
const MAX_HOSTED_GAMES_RECOVERY_READ = 25

async function gameByPublicId(ctx: QueryCtx, publicId: string) {
  assertPublicId(publicId)
  const game = await ctx.db
    .query("games")
    .withIndex("by_public_id", (q) => q.eq("publicId", publicId))
    .unique()
  if (!game) throw new Error("Game not found")
  return game
}

function assertPublicId(publicId: string) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(publicId)) throw new Error("Invalid public game identifier")
}

function assertLifeDelta(delta: number) {
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 999_999)
    throw new Error("Life delta must be a non-zero whole number from -999999 to 999999")
}

function assertOperationId(operationId: string) {
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(operationId)) throw new Error("Invalid operation identifier")
}

function assertDeviceId(deviceId: string) {
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(deviceId)) throw new Error("Invalid device identifier")
}

async function consumeJoinAttempt(ctx: MutationCtx, clerkUserId: string) {
  const now = Date.now()
  const record = await ctx.db
    .query("joinAttempts")
    .withIndex("by_clerk_user", (q) => q.eq("clerkUserId", clerkUserId))
    .unique()
  if (!record || now - record.windowStartedAt >= 60_000) {
    if (record) await ctx.db.patch(record._id, { windowStartedAt: now, attempts: 1 })
    else await ctx.db.insert("joinAttempts", { clerkUserId, windowStartedAt: now, attempts: 1 })
    return
  }
  if (record.attempts >= 10) throw new Error("Too many join attempts; wait a minute and try again")
  await ctx.db.patch(record._id, { attempts: record.attempts + 1 })
}

async function playersForGame(ctx: QueryCtx, gameId: Id<"games">) {
  const players = await ctx.db
    .query("gamePlayers")
    .withIndex("by_game", (q) => q.eq("gameId", gameId))
    .take(MAX_PLAYERS_PER_GAME_READ)
  if (players.length > 6) throw new Error("Game has more than six seats")
  return players
}

function totalEventCount(game: Doc<"games">, players: Doc<"gamePlayers">[]) {
  return (
    (game.eventSequence ?? 0) +
    players.reduce((total, player) => total + (player.eventCount ?? 0), 0)
  )
}

async function findInvite(
  ctx: QueryCtx,
  args: { token?: string; manualCode?: string },
): Promise<Doc<"invitations"> | null> {
  if (args.token)
    return await ctx.db
      .query("invitations")
      .withIndex("by_token", (q) => q.eq("token", args.token!))
      .unique()
  if (args.manualCode)
    return await ctx.db
      .query("invitations")
      .withIndex("by_manual_code", (q) => q.eq("manualCode", normalizeManualCode(args.manualCode!)))
      .unique()
  return null
}

async function allocateInvite(ctx: QueryCtx, inviteToken: string, manualCodeCandidates: string[]) {
  if (
    await ctx.db
      .query("invitations")
      .withIndex("by_token", (q) => q.eq("token", inviteToken))
      .unique()
  )
    throw new Error("Invite collision; retry")
  for (const candidate of manualCodeCandidates) {
    const code = normalizeManualCode(candidate)
    const found = await ctx.db
      .query("invitations")
      .withIndex("by_manual_code", (q) => q.eq("manualCode", code))
      .unique()
    if (!found) return code
  }
  throw new Error("Manual code collision; retry with fresh candidates")
}

async function currentUsableInvite(
  ctx: QueryCtx,
  game: Doc<"games">,
  now: number,
): Promise<Doc<"invitations"> | null> {
  if (game.currentInvitationId) {
    const invite = await ctx.db.get(game.currentInvitationId)
    return invite && invite.gameId === game._id && inviteIsUsable(invite, now) ? invite : null
  }
  const invites = await ctx.db
    .query("invitations")
    .withIndex("by_game", (q) => q.eq("gameId", game._id))
    .order("desc")
    .take(MAX_INVITES_PER_GAME_READ)
  return invites.find((invite) => inviteIsUsable(invite, now)) ?? null
}

async function inviteIsCurrent(
  ctx: QueryCtx,
  game: Doc<"games">,
  invite: Doc<"invitations">,
  now: number,
) {
  if (!inviteIsUsable(invite, now) || invite.gameId !== game._id) return false
  if (game.currentInvitationId) return game.currentInvitationId === invite._id
  const current = await currentUsableInvite(ctx, game, now)
  return current?._id === invite._id
}

async function terminalizeGame(
  ctx: MutationCtx,
  game: Doc<"games">,
  status: "finished" | "abandoned",
  reason: "host_finished" | "host_abandoned" | "stale_inactivity",
  endedByUserId?: Id<"users">,
): Promise<Doc<"gameSummaries">> {
  const existing = await ctx.db
    .query("gameSummaries")
    .withIndex("by_game", (q) => q.eq("gameId", game._id))
    .unique()
  if (existing) {
    if ((existing.terminalStatus ?? "finished") !== status)
      throw new Error("Game already has a different terminal summary")
    return existing
  }
  const players = await playersForGame(ctx, game._id)
  const now = Date.now()
  const summaryId = await ctx.db.insert("gameSummaries", {
    gameId: game._id,
    publicId: game.publicId,
    ...(endedByUserId ? { finishedByUserId: endedByUserId } : {}),
    terminalStatus: status,
    terminalReason: reason,
    startingLife: game.startingLife,
    ruleset: game.ruleset,
    eventCount: totalEventCount(game, players),
    finishedAt: now,
    players: players
      .sort((a, b) => a.seat - b.seat)
      .map((player) => ({
        playerId: player._id,
        seat: player.seat,
        displayName: player.displayName,
        color: player.color,
        finalLife: player.currentLife,
      })),
  })
  await ctx.db.patch(game._id, { status, updatedAt: now })
  for (const player of players) await ctx.db.patch(player._id, { resumable: false })
  return (await ctx.db.get(summaryId))!
}

export const createLobby = mutation({
  args: {
    publicId: v.string(),
    playerCount: v.number(),
    startingLife: v.number(),
    ruleset: v.string(),
    inviteToken: v.string(),
    manualCodeCandidates: v.array(v.string()),
    hostDisplayName: v.string(),
    hostColor: v.string(),
    deviceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    assertPlayerCount(args.playerCount)
    assertStartingLife(args.startingLife)
    assertInviteToken(args.inviteToken)
    assertManualCodeCandidates(args.manualCodeCandidates)
    assertAllowedColor(args.hostColor)
    if (args.deviceId) assertDeviceId(args.deviceId)
    const ruleset = assertRuleset(args.ruleset)
    const hostDisplayName = assertDisplayName(args.hostDisplayName)
    assertPublicId(args.publicId)
    for (const status of ["lobby", "active"] as const) {
      const existingHostedGame = await ctx.db
        .query("games")
        .withIndex("by_host_status", (q) => q.eq("hostUserId", user._id).eq("status", status))
        .first()
      if (existingHostedGame)
        throw new Error("You already host a lobby or active game; resume it before hosting another")
    }
    if (
      await ctx.db
        .query("games")
        .withIndex("by_public_id", (q) => q.eq("publicId", args.publicId))
        .unique()
    )
      throw new Error("Game identifier collision; retry")
    const manualCode = await allocateInvite(ctx, args.inviteToken, args.manualCodeCandidates)
    const now = Date.now()
    const gameId = await ctx.db.insert("games", {
      publicId: args.publicId,
      hostUserId: user._id,
      mode: "connected",
      status: "lobby",
      playerCount: args.playerCount,
      startingLife: args.startingLife,
      ruleset,
      createdAt: now,
      updatedAt: now,
      eventSequence: 0,
    })
    await ctx.db.insert("gamePlayers", {
      gameId,
      seat: 1,
      userId: user._id,
      ...(args.deviceId ? { deviceId: args.deviceId } : {}),
      displayName: hostDisplayName,
      avatarUrl: user.avatarUrl,
      color: args.hostColor,
      currentLife: args.startingLife,
      eventCount: 0,
      resumable: true,
      joinedAt: now,
    })
    const invitationId = await ctx.db.insert("invitations", {
      gameId,
      token: args.inviteToken,
      manualCode,
      expiresAt: now + INVITE_LIFETIME_MS,
      createdAt: now,
    })
    await ctx.db.patch(gameId, { currentInvitationId: invitationId })
    return {
      publicId: args.publicId,
      inviteToken: args.inviteToken,
      manualCode,
      expiresAt: now + INVITE_LIFETIME_MS,
    }
  },
})

// Deliberately returns validity only: invite possession must not disclose game/player data.
export const resolveInvite = mutation({
  args: { token: v.optional(v.string()), manualCode: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    await consumeJoinAttempt(ctx, String(user.clerkUserId))
    const invite = await findInvite(ctx, args)
    if (!invite) return { valid: false }
    const game = await ctx.db.get(invite.gameId)
    if (!game || game.status !== "lobby" || !(await inviteIsCurrent(ctx, game, invite, Date.now())))
      return { valid: false }
    const players = await playersForGame(ctx, game._id)
    return { valid: players.length < game.playerCount }
  },
})

export const claimSeat = mutation({
  args: {
    token: v.optional(v.string()),
    manualCode: v.optional(v.string()),
    displayName: v.string(),
    color: v.string(),
    deviceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    await consumeJoinAttempt(ctx, String(user.clerkUserId))
    assertAllowedColor(args.color)
    if (args.deviceId) assertDeviceId(args.deviceId)
    const displayName = assertDisplayName(args.displayName)
    const invite = await findInvite(ctx, args)
    if (!invite) throw new Error("Invite is invalid, expired, or revoked")
    const game = await ctx.db.get(invite.gameId)
    if (!game || game.status !== "lobby" || !(await inviteIsCurrent(ctx, game, invite, Date.now())))
      throw new Error("Invite is invalid, expired, or revoked")
    const existingPlayers = await playersForGame(ctx, game._id)
    const duplicate = existingPlayers.find(
      (candidate) =>
        candidate.userId === user._id &&
        (args.deviceId ? candidate.deviceId === args.deviceId : candidate.deviceId === undefined),
    )
    if (duplicate) return { publicId: game.publicId, seat: duplicate.seat }
    const players = existingPlayers
    const occupied = new Set(players.map((player) => player.seat))
    let seat = 1
    while (occupied.has(seat)) seat += 1
    if (seat > game.playerCount) throw new Error("Lobby is full")
    await ctx.db.insert("gamePlayers", {
      gameId: game._id,
      seat,
      userId: user._id,
      ...(args.deviceId ? { deviceId: args.deviceId } : {}),
      displayName,
      avatarUrl: user.avatarUrl,
      color: args.color,
      currentLife: game.startingLife,
      eventCount: 0,
      resumable: true,
      joinedAt: Date.now(),
    })
    await ctx.db.patch(game._id, { updatedAt: Date.now() })
    return { publicId: game.publicId, seat }
  },
})

export const lobbyProjection = query({
  args: { publicId: v.string(), deviceId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    assertPublicId(args.publicId)
    if (args.deviceId) assertDeviceId(args.deviceId)
    const user = await requireUser(ctx)
    const game = await ctx.db
      .query("games")
      .withIndex("by_public_id", (q) => q.eq("publicId", args.publicId))
      .unique()
    if (!game) throw new Error("Game unavailable")
    const players = await playersForGame(ctx, game._id)
    if (!players.some((player) => player.userId === user._id)) throw new Error("Game unavailable")
    const isHost = game.hostUserId === user._id
    const recentEvents =
      game.status === "active"
        ? await ctx.db
            .query("gameEvents")
            .withIndex("by_game_server_time", (q) => q.eq("gameId", game._id))
            .order("desc")
            .take(100)
        : []
    const invite = isHost ? await currentUsableInvite(ctx, game, Date.now()) : null
    const eventCount = totalEventCount(game, players)
    const serverUpdatedAt = players.reduce(
      (latest, player) => Math.max(latest, player.lastEventAt ?? 0),
      game.updatedAt,
    )
    return {
      schemaVersion: 1,
      publicId: game.publicId,
      status: game.status,
      playerCount: game.playerCount,
      startingLife: game.startingLife,
      ruleset: game.ruleset,
      isHost,
      eventSequence: eventCount,
      serverUpdatedAt,
      recentOperationIds: recentEvents.map((event) => event.operationId),
      invitation:
        invite && inviteIsUsable(invite, Date.now())
          ? {
              token: invite.token,
              manualCode: invite.manualCode,
              expiresAt: invite.expiresAt,
            }
          : null,
      players: players
        .sort((a, b) => a.seat - b.seat)
        .map((p) => ({
          playerId: p._id,
          seat: p.seat,
          displayName: p.displayName,
          avatarUrl: p.avatarUrl,
          color: p.color,
          currentLife: p.currentLife,
          controlledByMe:
            p.userId === user._id &&
            (args.deviceId ? p.deviceId === undefined || p.deviceId === args.deviceId : true),
        })),
    }
  },
})

export const startGame = mutation({
  args: { publicId: v.string() },
  handler: async (ctx, args) => {
    const game = await gameByPublicId(ctx, args.publicId)
    await requireHost(ctx, game)
    if (game.status !== "lobby") throw new Error("Only a lobby can be started")
    const players = await playersForGame(ctx, game._id)
    if (players.length < 2 || players.length > 6 || players.length !== game.playerCount)
      throw new Error("All configured seats (2–6) must be claimed before starting")
    const now = Date.now()
    await ctx.db.patch(game._id, { status: "active", startedAt: now, updatedAt: now })
    for (const player of players) await ctx.db.patch(player._id, { resumable: true })
    return { publicId: game.publicId }
  },
})

export const updateMySeat = mutation({
  args: {
    publicId: v.string(),
    seat: v.number(),
    displayName: v.string(),
    color: v.string(),
  },
  handler: async (ctx, args) => {
    const game = await gameByPublicId(ctx, args.publicId)
    if (game.status !== "lobby") throw new Error("Seat metadata can only change in the lobby")
    const { player } = await requireSeatOwner(ctx, game._id, args.seat)
    const displayName = assertDisplayName(args.displayName)
    assertAllowedColor(args.color)
    await ctx.db.patch(player._id, { displayName, color: args.color })
    await ctx.db.patch(game._id, { updatedAt: Date.now() })
  },
})

export const revokeInvite = mutation({
  args: { publicId: v.string() },
  handler: async (ctx, args) => {
    const game = await gameByPublicId(ctx, args.publicId)
    await requireHost(ctx, game)
    const invite = await currentUsableInvite(ctx, game, Date.now())
    if (invite) await ctx.db.patch(invite._id, { revokedAt: Date.now() })
  },
})

export const rotateInvite = mutation({
  args: {
    publicId: v.string(),
    inviteToken: v.string(),
    manualCodeCandidates: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const game = await gameByPublicId(ctx, args.publicId)
    await requireHost(ctx, game)
    if (game.status !== "lobby") throw new Error("Only a lobby invite can be rotated")
    assertInviteToken(args.inviteToken)
    assertManualCodeCandidates(args.manualCodeCandidates)
    const manualCode = await allocateInvite(ctx, args.inviteToken, args.manualCodeCandidates)
    const now = Date.now()
    const previous = await currentUsableInvite(ctx, game, now)
    const invitationId = await ctx.db.insert("invitations", {
      gameId: game._id,
      token: args.inviteToken,
      manualCode,
      expiresAt: now + INVITE_LIFETIME_MS,
      createdAt: now,
    })
    if (previous) await ctx.db.patch(previous._id, { revokedAt: now })
    await ctx.db.patch(game._id, { currentInvitationId: invitationId, updatedAt: now })
    return { inviteToken: args.inviteToken, manualCode, expiresAt: now + INVITE_LIFETIME_MS }
  },
})

export const changeLife = mutation({
  args: {
    publicId: v.string(),
    playerId: v.id("gamePlayers"),
    operationId: v.string(),
    delta: v.number(),
    deviceId: v.string(),
    clientCreatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    assertLifeDelta(args.delta)
    assertOperationId(args.operationId)
    assertDeviceId(args.deviceId)
    if (!Number.isSafeInteger(args.clientCreatedAt) || args.clientCreatedAt < 0)
      throw new Error("Invalid client timestamp")

    const game = await gameByPublicId(ctx, args.publicId)
    const user = await requireUser(ctx)
    const membership = await ctx.db
      .query("gamePlayers")
      .withIndex("by_game_user", (q) => q.eq("gameId", game._id).eq("userId", user._id))
      .first()
    if (!membership) throw new Error("Game membership required")
    const target = await ctx.db.get(args.playerId)
    if (
      !target ||
      target.gameId !== game._id ||
      target.userId !== user._id ||
      (target.deviceId !== undefined && target.deviceId !== args.deviceId)
    )
      throw new Error("Seat-owner permission required")

    const duplicate = await ctx.db
      .query("gameEvents")
      .withIndex("by_game_operation", (q) =>
        q.eq("gameId", game._id).eq("operationId", args.operationId),
      )
      .unique()
    if (duplicate) {
      if (
        duplicate.playerId !== target._id ||
        duplicate.actorUserId !== user._id ||
        duplicate.delta !== args.delta ||
        duplicate.deviceId !== args.deviceId ||
        duplicate.clientCreatedAt !== args.clientCreatedAt
      )
        throw new Error("Operation identifier was reused with different data")
      return {
        operationId: duplicate.operationId,
        eventId: duplicate._id,
        sequence: duplicate.sequence ?? null,
        currentLife: target.currentLife,
        deduplicated: true,
      }
    }
    if (game.status !== "active") throw new Error("Game is not active")

    const now = Date.now()
    const currentLife = target.currentLife + args.delta
    const eventId = await ctx.db.insert("gameEvents", {
      gameId: game._id,
      playerId: target._id,
      operationId: args.operationId,
      kind: "life.changed",
      delta: args.delta,
      actorUserId: user._id,
      deviceId: args.deviceId,
      clientCreatedAt: args.clientCreatedAt,
      serverCreatedAt: now,
    })
    await ctx.db.patch(target._id, {
      currentLife,
      eventCount: (target.eventCount ?? 0) + 1,
      lastEventAt: now,
    })
    return {
      operationId: args.operationId,
      eventId,
      sequence: null,
      currentLife,
      deduplicated: false,
    }
  },
})

export const finishGame = mutation({
  args: { publicId: v.string() },
  handler: async (ctx, args) => {
    const game = await gameByPublicId(ctx, args.publicId)
    const user = await requireHost(ctx, game)
    if (game.status !== "active") throw new Error("Only an active game can be finished")
    const summary = await terminalizeGame(ctx, game, "finished", "host_finished", user._id)
    return { publicId: game.publicId, summaryId: summary._id, finishedAt: summary.finishedAt }
  },
})

export const leaveMyGame = mutation({
  args: { publicId: v.string(), deviceId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const game = await gameByPublicId(ctx, args.publicId)
    if (args.deviceId) assertDeviceId(args.deviceId)
    const user = await requireUser(ctx)
    if (game.hostUserId === user._id && (game.status === "lobby" || game.status === "active"))
      throw new Error("Hosts must finish or abandon an unfinished game instead of leaving it")
    const userPlayers = await ctx.db
      .query("gamePlayers")
      .withIndex("by_game_user", (q) => q.eq("gameId", game._id).eq("userId", user._id))
      .take(MAX_PLAYERS_PER_GAME_READ)
    const player = args.deviceId
      ? userPlayers.find(
          (candidate) => candidate.deviceId === args.deviceId || candidate.deviceId === undefined,
        )
      : userPlayers[0]
    if (!player) throw new Error("Game membership required")
    if (player.resumable !== false) await ctx.db.patch(player._id, { resumable: false })
    return { publicId: game.publicId, left: true }
  },
})

export const abandonGame = mutation({
  args: { publicId: v.string() },
  handler: async (ctx, args) => {
    const game = await gameByPublicId(ctx, args.publicId)
    const user = await requireHost(ctx, game)
    if (game.status !== "lobby" && game.status !== "active" && game.status !== "abandoned")
      throw new Error("Only a lobby or active game can be abandoned")
    const summary = await terminalizeGame(ctx, game, "abandoned", "host_abandoned", user._id)
    return { publicId: game.publicId, summaryId: summary._id, abandonedAt: summary.finishedAt }
  },
})

export const cleanupStaleGames = internalMutation({
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

export const connectedHistory = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    const memberships = await ctx.db
      .query("gamePlayers")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .paginate(boundedPaginationOptions(args.paginationOpts, CONNECTED_MEMBERSHIP_PAGE_MAX_ITEMS))
    const page = []
    const includedGameIds = new Set<string>()
    for (const membership of memberships.page) {
      if (includedGameIds.has(membership.gameId)) continue
      const game = await ctx.db.get(membership.gameId)
      if (!game || (game.status !== "finished" && game.status !== "abandoned")) continue
      const summary = await ctx.db
        .query("gameSummaries")
        .withIndex("by_game", (q) => q.eq("gameId", game._id))
        .unique()
      if (summary) {
        includedGameIds.add(membership.gameId)
        page.push({
          publicId: game.publicId,
          startingLife: summary.startingLife,
          ruleset: summary.ruleset,
          eventCount: summary.eventCount,
          finishedAt: summary.finishedAt,
          terminalStatus: summary.terminalStatus ?? "finished",
          terminalReason: summary.terminalReason,
          players: summary.players,
        })
      }
    }
    return { ...memberships, page }
  },
})

export const migrateMyGameMemberships = mutation({
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

export const activeConnectedGames = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    const memberships = await ctx.db
      .query("gamePlayers")
      .withIndex("by_user_resumable", (q) => q.eq("userId", user._id).eq("resumable", true))
      .order("desc")
      .paginate(boundedPaginationOptions(args.paginationOpts, CONNECTED_MEMBERSHIP_PAGE_MAX_ITEMS))
    const active = []
    const includedGameIds = new Set<string>()
    if (args.paginationOpts.cursor === null) {
      for (const status of ["lobby", "active"] as const) {
        const hostedGames = await ctx.db
          .query("games")
          .withIndex("by_host_status", (q) => q.eq("hostUserId", user._id).eq("status", status))
          .order("desc")
          .take(MAX_HOSTED_GAMES_RECOVERY_READ)
        for (const game of hostedGames) {
          if (includedGameIds.has(game._id)) continue
          includedGameIds.add(game._id)
          active.push({
            publicId: game.publicId,
            status: game.status,
            isHost: true,
            playerCount: game.playerCount,
            ruleset: game.ruleset,
            startingLife: game.startingLife,
            updatedAt: game.updatedAt,
          })
        }
      }
    }
    for (const membership of memberships.page) {
      if (includedGameIds.has(membership.gameId)) continue
      const game = await ctx.db.get(membership.gameId)
      if (game && (game.status === "lobby" || game.status === "active")) {
        includedGameIds.add(membership.gameId)
        active.push({
          publicId: game.publicId,
          status: game.status,
          isHost: game.hostUserId === user._id,
          playerCount: game.playerCount,
          ruleset: game.ruleset,
          startingLife: game.startingLife,
          updatedAt: game.updatedAt,
        })
      }
    }
    active.sort((left, right) => right.updatedAt - left.updatedAt)
    return { ...memberships, page: active }
  },
})

export const connectedSummary = query({
  args: { publicId: v.string() },
  handler: async (ctx, args) => {
    const game = await gameByPublicId(ctx, args.publicId)
    await requireMembership(ctx, game._id)
    if (game.status !== "finished" && game.status !== "abandoned") return null
    return await ctx.db
      .query("gameSummaries")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .unique()
  },
})

export const connectedEvents = query({
  args: { publicId: v.string(), paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const game = await gameByPublicId(ctx, args.publicId)
    await requireMembership(ctx, game._id)
    const result = await ctx.db
      .query("gameEvents")
      .withIndex("by_game_server_time", (q) => q.eq("gameId", game._id))
      .order("desc")
      .paginate(boundedPaginationOptions(args.paginationOpts, CONNECTED_EVENT_PAGE_MAX_ITEMS))
    return {
      ...result,
      page: result.page.map((event) => ({
        operationId: event.operationId,
        playerId: event.playerId,
        kind: event.kind,
        delta: event.delta,
        clientCreatedAt: event.clientCreatedAt,
        serverCreatedAt: event.serverCreatedAt,
        eventId: event._id,
        sequence: event.sequence ?? null,
      })),
    }
  },
})
