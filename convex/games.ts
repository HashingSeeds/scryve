import { paginationOptsValidator } from "convex/server"
import { v, type Infer } from "convex/values"

import type { Doc, Id } from "./_generated/dataModel"
import type { MutationCtx, QueryCtx } from "./_generated/server"
import { internalMutation, mutation, query } from "./_generated/server"
import {
  appearanceIsTaken,
  isPlayerMarkShape,
  resolveAppearance,
  shapeForSeat,
  type PlayerAppearance,
  type PlayerMarkShape,
} from "./lib/appearance"
import { requireHost, requireMembership, requireSeatOwner, requireUser } from "./lib/auth"
import { assertDeckGameFormat, DEFAULT_DECK_GAME } from "./lib/deckGames"
import { hasFeature, PREMIUM_FEATURES } from "./lib/entitlements"
import { assertGameSystem, requireReleasedCapability } from "./lib/integrations"
import { blockedUserIdsFor, isBlockedBetween, publicUsernameFor } from "./lib/moderation"
import {
  boundedPaginationOptions,
  CONNECTED_EVENT_PAGE_MAX_ITEMS,
  CONNECTED_MEMBERSHIP_PAGE_MAX_ITEMS,
} from "./lib/pagination"
import {
  assertAllowedColor,
  assertAllowedShape,
  assertDisplayName,
  assertInviteToken,
  assertManualCodeCandidates,
  assertPlayerCount,
  assertRuleset,
  assertStartingLife,
  FREE_CONNECTED_HISTORY_GAMES,
  HISTORY_MIGRATION_VERSION,
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
const MAX_COMMANDER_DAMAGE = 99
const MAX_PENDING_COMMANDER_CLAIMS = 100

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

function assertCommanderDelta(delta: number) {
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > MAX_COMMANDER_DAMAGE)
    throw new Error("Commander damage delta must be a non-zero whole number from -99 to 99")
}

function isCommanderGame(game: Doc<"games">) {
  return (
    (game.system ?? game.game ?? DEFAULT_DECK_GAME) === "mtg" &&
    (game.format ?? game.ruleset) === "commander"
  )
}

function assertCommanderGame(game: Doc<"games">) {
  if (!isCommanderGame(game))
    throw new Error("Commander damage is only available in Commander games")
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

function seatLabelFor(player: { seat: number }) {
  return `Player ${player.seat}`
}

function displayNameForViewer(
  player: Doc<"gamePlayers">,
  user: Doc<"users"> | null,
  blocked: boolean,
) {
  if (blocked) return seatLabelFor(player)
  return (
    (user ? publicUsernameFor(user) : undefined) ??
    player.usernameAtJoin ??
    (player.deletedAt ? player.displayName : seatLabelFor(player))
  )
}

async function displayNamesForViewer(
  ctx: QueryCtx,
  viewerUserId: Id<"users">,
  players: Doc<"gamePlayers">[],
) {
  const blocked = await blockedUserIdsFor(ctx, viewerUserId)
  const names = new Map<Id<"gamePlayers">, string>()
  for (const player of players) {
    const user = player.userId ? await ctx.db.get(player.userId) : null
    names.set(
      player._id,
      displayNameForViewer(player, user, Boolean(player.userId && blocked.has(player.userId))),
    )
  }
  return names
}

function summaryIdentitySnapshotFor(
  player: Doc<"gamePlayers">,
  user: Doc<"users"> | null,
): { displayName: string; usernameAtFinish?: string } {
  const resolved = user ? publicUsernameFor(user) : undefined
  if (resolved) return { displayName: resolved, usernameAtFinish: resolved }
  if (player.deletedAt) return { displayName: player.displayName }
  if (player.usernameAtJoin)
    return { displayName: player.usernameAtJoin, usernameAtFinish: player.usernameAtJoin }
  return { displayName: seatLabelFor(player) }
}

function maskSummaryPlayersForViewer(
  players: Doc<"gameSummaries">["players"],
  blocked: Set<Id<"users">>,
) {
  return players.map((player) => {
    if (player.userId && blocked.has(player.userId)) {
      const { usernameAtFinish: _, ...masked } = player
      return { ...masked, displayName: seatLabelFor(player) }
    }
    return {
      ...player,
      displayName:
        player.usernameAtFinish ?? (player.deletedAt ? player.displayName : seatLabelFor(player)),
    }
  })
}

function appearanceOf(player: Doc<"gamePlayers">): PlayerAppearance {
  return {
    color: player.color,
    shape: isPlayerMarkShape(player.shape) ? player.shape : shapeForSeat(player.seat),
  }
}

function takenAppearances(players: Doc<"gamePlayers">[], exceptPlayerId?: Id<"gamePlayers">) {
  return players
    .filter((player) => player._id !== exceptPlayerId)
    .map((player) => appearanceOf(player))
}

async function playersForGame(ctx: QueryCtx, gameId: Id<"games">) {
  const players = await ctx.db
    .query("gamePlayers")
    .withIndex("by_game", (q) => q.eq("gameId", gameId))
    .take(MAX_PLAYERS_PER_GAME_READ)
  if (players.length > 6) throw new Error("Game has more than six seats")
  return players
}

async function commanderDamageProjection(
  ctx: QueryCtx,
  game: Doc<"games">,
  user: Doc<"users">,
  players: Doc<"gamePlayers">[],
) {
  if (!isCommanderGame(game)) return null
  const totals = await ctx.db
    .query("gameCommanderDamage")
    .withIndex("by_game", (q) => q.eq("gameId", game._id))
    .take(MAX_PLAYERS_PER_GAME_READ * (MAX_PLAYERS_PER_GAME_READ - 1))
  const pending = await ctx.db
    .query("gameCommanderClaims")
    .withIndex("by_game_and_status", (q) => q.eq("gameId", game._id).eq("status", "pending"))
    .take(MAX_PENDING_COMMANDER_CLAIMS + 1)
  if (pending.length > MAX_PENDING_COMMANDER_CLAIMS)
    throw new Error("Too many pending commander damage claims")
  const ownedPlayerIds = new Set(
    players.filter((player) => player.userId === user._id).map((player) => player._id),
  )
  const eliminatedPlayerIds = new Set<Id<"gamePlayers">>()
  for (const total of totals) {
    if (total.total >= 21) eliminatedPlayerIds.add(total.toPlayerId)
  }
  return {
    totals: totals.map((total) => ({
      fromPlayerId: total.fromPlayerId,
      toPlayerId: total.toPlayerId,
      total: total.total,
    })),
    pendingClaims: pending
      .filter((claim) => ownedPlayerIds.has(claim.toPlayerId))
      .map((claim) => ({
        claimId: claim._id,
        operationId: claim.operationId,
        fromPlayerId: claim.fromPlayerId,
        toPlayerId: claim.toPlayerId,
        delta: claim.delta,
        clientCreatedAt: claim.clientCreatedAt,
        createdAt: claim.createdAt,
      })),
    eliminatedPlayerIds: [...eliminatedPlayerIds],
  }
}

async function deckSelectionIsPlayable(ctx: QueryCtx, deckVersionId: Id<"deckVersions">) {
  const version = await ctx.db.get(deckVersionId)
  if (!version || version.archivedAt !== undefined) return false
  const deck = await ctx.db.get(version.deckId)
  return deck !== null && deck.archivedAt === undefined
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

type DeckRecord = { games: number; wins: number; losses: number; draws: number; unknown: number }

function incrementedRecord(
  current: DeckRecord | null,
  outcome: "win" | "loss" | "draw" | "unknown",
  now: number,
) {
  return {
    games: (current?.games ?? 0) + 1,
    wins: (current?.wins ?? 0) + (outcome === "win" ? 1 : 0),
    losses: (current?.losses ?? 0) + (outcome === "loss" ? 1 : 0),
    draws: (current?.draws ?? 0) + (outcome === "draw" ? 1 : 0),
    unknown: (current?.unknown ?? 0) + (outcome === "unknown" ? 1 : 0),
    updatedAt: now,
  }
}

async function terminalizeGame(
  ctx: MutationCtx,
  game: Doc<"games">,
  status: "finished" | "abandoned",
  reason: "host_finished" | "host_abandoned" | "stale_inactivity" | "account_deleted",
  endedByUserId?: Id<"users">,
  result:
    | { kind: "win"; winnerPlayerIds: Id<"gamePlayers">[] }
    | { kind: "draw" }
    | { kind: "unknown" } = {
    kind: "unknown",
  },
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
  const playerIds = new Set(players.map((player) => player._id))
  if (status !== "finished") result = { kind: "unknown" }
  if (result.kind === "win") {
    if (result.winnerPlayerIds.length < 1) throw new Error("Choose at least one winner")
    if (new Set(result.winnerPlayerIds).size !== result.winnerPlayerIds.length)
      throw new Error("A winning seat may only be selected once")
    if (result.winnerPlayerIds.some((playerId) => !playerIds.has(playerId)))
      throw new Error("Winner must belong to this game")
  }
  const winnerIds = new Set(result.kind === "win" ? result.winnerPlayerIds : [])
  const outcomeFor = (playerId: Id<"gamePlayers">): "win" | "loss" | "draw" | "unknown" =>
    result.kind === "draw"
      ? "draw"
      : result.kind === "unknown"
        ? "unknown"
        : winnerIds.has(playerId)
          ? "win"
          : "loss"
  const now = Date.now()
  const summaryPlayers = await Promise.all(
    players
      .sort((a, b) => a.seat - b.seat)
      .map(async (player) => {
        const user = player.userId ? await ctx.db.get(player.userId) : null
        const version = player.deckVersionId ? await ctx.db.get(player.deckVersionId) : null
        const deck = version ? await ctx.db.get(version.deckId) : null
        return {
          playerId: player._id,
          seat: player.seat,
          ...summaryIdentitySnapshotFor(player, user),
          ...(player.userId ? { userId: player.userId } : {}),
          ...(deck ? { deckId: deck._id, deckNameAtFinish: deck.name } : {}),
          ...(version
            ? { deckVersionId: version._id, deckVersionNumber: version.versionNumber }
            : {}),
          outcome: outcomeFor(player._id),
          color: player.color,
          shape: appearanceOf(player).shape,
          finalLife: player.currentLife,
        }
      }),
  )
  const summaryId = await ctx.db.insert("gameSummaries", {
    gameId: game._id,
    publicId: game.publicId,
    ...(endedByUserId ? { finishedByUserId: endedByUserId } : {}),
    terminalStatus: status,
    terminalReason: reason,
    startingLife: game.startingLife,
    ruleset: game.ruleset,
    game: game.game ?? DEFAULT_DECK_GAME,
    system: game.system ?? game.game ?? DEFAULT_DECK_GAME,
    format: game.format ?? game.ruleset,
    eventCount: totalEventCount(game, players),
    finishedAt: now,
    players: summaryPlayers,
    resultKind: result.kind,
    ...(result.kind === "win" ? { winnerPlayerIds: result.winnerPlayerIds } : {}),
  })
  const summary = (await ctx.db.get(summaryId))!
  const playersByUser = new Map<Id<"users">, typeof summaryPlayers>()
  for (const player of summaryPlayers) {
    if (!player.userId) continue
    const group = playersByUser.get(player.userId) ?? []
    group.push(player)
    playersByUser.set(player.userId, group)
  }
  for (const [userId, userPlayers] of playersByUser) {
    const outcome = userPlayers.some((player) => player.outcome === "win")
      ? "win"
      : userPlayers.every((player) => player.outcome === "draw")
        ? "draw"
        : userPlayers.every((player) => player.outcome === "unknown")
          ? "unknown"
          : "loss"
    await ctx.db.insert("gameHistoryEntries", {
      userId,
      gameId: game._id,
      summaryId,
      finishedAt: now,
      outcome,
    })
  }
  for (const player of summaryPlayers) {
    if (!player.userId || !player.deckId || !player.deckVersionId) continue
    await ctx.db.insert("deckGameResults", {
      deckId: player.deckId,
      deckVersionId: player.deckVersionId,
      gameId: game._id,
      playerId: player.playerId,
      userId: player.userId,
      outcome: player.outcome,
      finishedAt: now,
    })
    const stats = await ctx.db
      .query("deckStats")
      .withIndex("by_deck", (q) => q.eq("deckId", player.deckId!))
      .unique()
    const increment = incrementedRecord(stats, player.outcome, now)
    if (stats) await ctx.db.patch(stats._id, increment)
    else await ctx.db.insert("deckStats", { deckId: player.deckId, ...increment })
    const versionStats = await ctx.db
      .query("deckVersionStats")
      .withIndex("by_version", (q) => q.eq("deckVersionId", player.deckVersionId!))
      .unique()
    const versionIncrement = incrementedRecord(versionStats, player.outcome, now)
    if (versionStats) await ctx.db.patch(versionStats._id, versionIncrement)
    else
      await ctx.db.insert("deckVersionStats", {
        deckId: player.deckId,
        deckVersionId: player.deckVersionId,
        ...versionIncrement,
      })
  }
  await ctx.db.patch(game._id, { status, updatedAt: now })
  for (const player of players) await ctx.db.patch(player._id, { resumable: false })
  return summary
}

export async function terminalizeGameForAccountDeletion(ctx: MutationCtx, game: Doc<"games">) {
  if (game.status !== "lobby" && game.status !== "active") return null
  return await terminalizeGame(ctx, game, "abandoned", "account_deleted")
}

export const createLobby = mutation({
  args: {
    publicId: v.string(),
    playerCount: v.number(),
    startingLife: v.number(),
    ruleset: v.string(),
    game: v.optional(v.string()),
    system: v.optional(v.string()),
    format: v.optional(v.string()),
    inviteToken: v.string(),
    manualCodeCandidates: v.array(v.string()),
    hostDisplayName: v.string(),
    hostColor: v.string(),
    hostShape: v.optional(v.string()),
    deviceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    if (args.game !== undefined && args.system !== undefined && args.game !== args.system)
      throw new Error("Game system fields must match")
    const gameSystem = assertGameSystem(args.system ?? args.game ?? DEFAULT_DECK_GAME)
    await requireReleasedCapability(ctx, gameSystem, "playTracking")
    assertPlayerCount(args.playerCount)
    assertStartingLife(
      args.startingLife,
      gameSystem === "ygo" ? 999_999 : gameSystem === "pokemon" ? 99 : 999,
    )
    assertInviteToken(args.inviteToken)
    assertManualCodeCandidates(args.manualCodeCandidates)
    assertAllowedColor(args.hostColor)
    if (args.hostShape !== undefined) assertAllowedShape(args.hostShape)
    if (args.deviceId) assertDeviceId(args.deviceId)
    const ruleset = assertRuleset(args.ruleset)
    const format =
      args.format === undefined ? ruleset : assertDeckGameFormat(gameSystem, args.format)
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
      game: gameSystem,
      system: gameSystem,
      format,
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
      usernameAtJoin: user.username,
      color: args.hostColor,
      shape: resolveAppearance({
        preferred: {
          color: args.hostColor,
          ...(args.hostShape ? { shape: args.hostShape as PlayerMarkShape } : {}),
        },
        taken: [],
        seat: 1,
      }).shape,
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
    shape: v.optional(v.string()),
    deviceId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    await consumeJoinAttempt(ctx, String(user.clerkUserId))
    assertAllowedColor(args.color)
    if (args.shape !== undefined) assertAllowedShape(args.shape)
    if (args.deviceId) assertDeviceId(args.deviceId)
    const displayName = assertDisplayName(args.displayName)
    const invite = await findInvite(ctx, args)
    if (!invite) throw new Error("Invite is invalid, expired, or revoked")
    const game = await ctx.db.get(invite.gameId)
    if (!game || game.status !== "lobby" || !(await inviteIsCurrent(ctx, game, invite, Date.now())))
      throw new Error("Invite is invalid, expired, or revoked")
    const existingPlayers = await playersForGame(ctx, game._id)
    for (const seated of existingPlayers) {
      if (!seated.userId || seated.userId === user._id) continue
      if (await isBlockedBetween(ctx, user._id, seated.userId))
        throw new Error("You cannot join a game with a player you blocked or who blocked you")
    }
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
    const appearance = resolveAppearance({
      preferred: {
        color: args.color,
        ...(args.shape ? { shape: args.shape as PlayerMarkShape } : {}),
      },
      taken: takenAppearances(players),
      seat,
    })
    await ctx.db.insert("gamePlayers", {
      gameId: game._id,
      seat,
      userId: user._id,
      ...(args.deviceId ? { deviceId: args.deviceId } : {}),
      displayName,
      usernameAtJoin: user.username,
      color: appearance.color,
      shape: appearance.shape,
      currentLife: game.startingLife,
      eventCount: 0,
      resumable: true,
      joinedAt: Date.now(),
    })
    await ctx.db.patch(game._id, { updatedAt: Date.now() })
    return { publicId: game.publicId, seat }
  },
})

const connectedOperation = v.union(
  v.object({
    kind: v.literal("life.changed"),
    operationId: v.string(),
    playerId: v.id("gamePlayers"),
    delta: v.number(),
    deviceId: v.string(),
    clientCreatedAt: v.number(),
  }),
  v.object({
    kind: v.literal("commanderDamage.submitted"),
    operationId: v.string(),
    fromPlayerId: v.id("gamePlayers"),
    toPlayerId: v.id("gamePlayers"),
    delta: v.number(),
    deviceId: v.string(),
    clientCreatedAt: v.number(),
  }),
  v.object({
    kind: v.literal("commanderDamage.resolved"),
    operationId: v.string(),
    claimOperationId: v.string(),
    toPlayerId: v.id("gamePlayers"),
    accepted: v.boolean(),
    deviceId: v.string(),
    clientCreatedAt: v.number(),
  }),
)

export const lobbyProjection = query({
  args: {
    publicId: v.string(),
    deviceId: v.optional(v.string()),
    includeRecentOperationIds: v.optional(v.boolean()),
    operation: v.optional(connectedOperation),
  },
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
      args.includeRecentOperationIds !== false && game.status === "active"
        ? await ctx.db
            .query("gameEvents")
            .withIndex("by_game_server_time", (q) => q.eq("gameId", game._id))
            .order("desc")
            .take(100)
        : []
    const invite = isHost ? await currentUsableInvite(ctx, game, Date.now()) : null
    const displayNames = await displayNamesForViewer(ctx, user._id, players)
    const commanderDamage = await commanderDamageProjection(ctx, game, user, players)
    const eliminatedPlayerIds = new Set(commanderDamage?.eliminatedPlayerIds ?? [])
    const eventCount = totalEventCount(game, players)
    const serverUpdatedAt = players.reduce(
      (latest, player) => Math.max(latest, player.lastEventAt ?? 0),
      game.updatedAt,
    )
    return {
      schemaVersion: 1 as const,
      publicId: game.publicId,
      status: game.status,
      playerCount: game.playerCount,
      startingLife: game.startingLife,
      ruleset: game.ruleset,
      game: game.game ?? DEFAULT_DECK_GAME,
      system: game.system ?? game.game ?? DEFAULT_DECK_GAME,
      format: game.format ?? game.ruleset,
      isHost,
      eventSequence: eventCount,
      ...(args.operation
        ? { operationStatus: await statusForOperation(ctx, game, user, eventCount, args.operation) }
        : {}),
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
          displayName: displayNames.get(p._id) ?? seatLabelFor(p),
          deckVersionId: p.deckVersionId,
          color: p.color,
          shape: appearanceOf(p).shape,
          currentLife: p.currentLife,
          ...(commanderDamage
            ? { eliminatedByCommanderDamage: eliminatedPlayerIds.has(p._id) }
            : {}),
          controlledByMe:
            p.userId === user._id &&
            (args.deviceId ? p.deviceId === undefined || p.deviceId === args.deviceId : true),
        })),
      ...(commanderDamage ? { commanderDamage } : {}),
    }
  },
})

export const connectedOperationStatus = query({
  args: { publicId: v.string(), operation: connectedOperation },
  handler: async (ctx, args) => {
    assertPublicId(args.publicId)

    const game = await gameByPublicId(ctx, args.publicId)
    const user = await requireUser(ctx)
    const players = await playersForGame(ctx, game._id)
    if (!players.some((player) => player.userId === user._id)) throw new Error("Game unavailable")
    const projectionEventSequence = totalEventCount(game, players)
    return await statusForOperation(ctx, game, user, projectionEventSequence, args.operation)
  },
})

async function statusForOperation(
  ctx: QueryCtx,
  game: Doc<"games">,
  user: Doc<"users">,
  projectionEventSequence: number,
  operation: Infer<typeof connectedOperation>,
) {
  assertOperationId(operation.operationId)
  if (operation.kind === "commanderDamage.resolved") assertOperationId(operation.claimOperationId)
  assertDeviceId(operation.deviceId)
  if (!Number.isSafeInteger(operation.clientCreatedAt) || operation.clientCreatedAt < 0)
    throw new Error("Invalid client timestamp")
  if (operation.kind === "life.changed") assertLifeDelta(operation.delta)
  if (operation.kind === "commanderDamage.submitted") {
    assertCommanderDelta(operation.delta)
    if (operation.fromPlayerId === operation.toPlayerId)
      throw new Error("A commander cannot damage itself")
  }
  const conflict = (reason: string) => ({
    status: "conflict" as const,
    operationId: operation.operationId,
    reason,
  })
  const notFound = () => ({
    status: "not_found" as const,
    operationId: operation.operationId,
  })
  const acknowledged = () => ({
    status: "acknowledged" as const,
    operationId: operation.operationId,
    projectionEventSequence,
  })

  if (operation.kind === "commanderDamage.resolved") {
    const claim = await ctx.db
      .query("gameCommanderClaims")
      .withIndex("by_game_operation", (q) =>
        q.eq("gameId", game._id).eq("operationId", operation.claimOperationId),
      )
      .unique()
    if (!claim) return notFound()
    const expectedStatus = operation.accepted ? "confirmed" : "declined"
    if (claim.status === "pending") return notFound()
    if (claim.status !== expectedStatus)
      return conflict(
        "Operation identifier was reused with different data: Commander damage claim was resolved differently",
      )
    if (!claim.resolutionOperationId) return notFound()
    if (claim.resolutionOperationId !== operation.operationId)
      return conflict("Operation identifier was reused with different data")
    const decision = operation.accepted ? "confirmed" : "declined"
    const event = await commanderResolutionEvent(ctx, claim)
    if (!event) return notFound()
    if (
      event.kind !== `commanderDamage.${decision}` ||
      event.claimOperationId !== operation.claimOperationId ||
      event.playerId !== operation.toPlayerId ||
      event.toPlayerId !== operation.toPlayerId ||
      event.actorUserId !== user._id ||
      event.deviceId !== operation.deviceId ||
      event.clientCreatedAt !== operation.clientCreatedAt
    )
      return conflict("Operation identifier was reused with different data")
    return acknowledged()
  }

  const event = await ctx.db
    .query("gameEvents")
    .withIndex("by_game_operation", (q) =>
      q.eq("gameId", game._id).eq("operationId", operation.operationId),
    )
    .unique()
  if (!event) return notFound()
  const matches =
    event.actorUserId === user._id &&
    event.deviceId === operation.deviceId &&
    event.clientCreatedAt === operation.clientCreatedAt &&
    (operation.kind === "life.changed"
      ? event.kind === "life.changed" &&
        event.playerId === operation.playerId &&
        event.delta === operation.delta
      : event.kind === "commanderDamage.claimed" &&
        event.fromPlayerId === operation.fromPlayerId &&
        event.toPlayerId === operation.toPlayerId &&
        event.delta === operation.delta)
  return matches ? acknowledged() : conflict("Operation identifier was reused with different data")
}

export const setMyAppearance = mutation({
  args: {
    publicId: v.string(),
    seat: v.number(),
    color: v.string(),
    shape: v.string(),
  },
  handler: async (ctx, args) => {
    assertAllowedColor(args.color)
    assertAllowedShape(args.shape)
    const game = await gameByPublicId(ctx, args.publicId)
    if (game.status !== "lobby") throw new Error("Appearance can only change in a lobby")
    const { player } = await requireSeatOwner(ctx, game._id, args.seat)
    const players = await playersForGame(ctx, game._id)
    const requested = { color: args.color.toUpperCase(), shape: args.shape as PlayerMarkShape }
    if (appearanceIsTaken(takenAppearances(players, player._id), requested))
      throw new Error("Another player already claimed that color and shape")
    await ctx.db.patch(player._id, { color: requested.color, shape: requested.shape })
    await ctx.db.patch(game._id, { updatedAt: Date.now() })
    return requested
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
    for (const player of players) {
      const deletedSinceSelection =
        player.deckVersionId !== undefined &&
        !(await deckSelectionIsPlayable(ctx, player.deckVersionId))
      await ctx.db.patch(player._id, {
        resumable: true,
        ...(deletedSinceSelection ? { deckVersionId: undefined } : {}),
      })
    }
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

async function commanderPlayerForWrite(
  ctx: MutationCtx,
  game: Doc<"games">,
  playerId: Id<"gamePlayers">,
  user: Doc<"users">,
  deviceId: string,
  label: "source" | "target",
) {
  const player = await ctx.db.get(playerId)
  if (
    !player ||
    player.gameId !== game._id ||
    player.userId !== user._id ||
    (player.deviceId !== undefined && player.deviceId !== deviceId)
  )
    throw new Error(
      `${label === "source" ? "Attacking" : "Defending"} seat-owner permission required`,
    )
  return player
}

function commanderClaimMatches(
  claim: Doc<"gameCommanderClaims">,
  args: {
    operationId: string
    fromPlayerId: Id<"gamePlayers">
    toPlayerId: Id<"gamePlayers">
    delta: number
    deviceId: string
    clientCreatedAt: number
  },
  userId: Id<"users">,
) {
  return (
    claim.operationId === args.operationId &&
    claim.fromPlayerId === args.fromPlayerId &&
    claim.toPlayerId === args.toPlayerId &&
    claim.delta === args.delta &&
    claim.actorUserId === userId &&
    claim.deviceId === args.deviceId &&
    claim.clientCreatedAt === args.clientCreatedAt
  )
}

export const submitCommanderDamage = mutation({
  args: {
    publicId: v.string(),
    fromPlayerId: v.id("gamePlayers"),
    toPlayerId: v.id("gamePlayers"),
    operationId: v.string(),
    delta: v.number(),
    deviceId: v.string(),
    clientCreatedAt: v.number(),
  },
  handler: async (ctx, args) => {
    assertCommanderDelta(args.delta)
    assertOperationId(args.operationId)
    assertDeviceId(args.deviceId)
    if (!Number.isSafeInteger(args.clientCreatedAt) || args.clientCreatedAt < 0)
      throw new Error("Invalid client timestamp")
    if (args.fromPlayerId === args.toPlayerId) throw new Error("A commander cannot damage itself")

    const game = await gameByPublicId(ctx, args.publicId)
    assertCommanderGame(game)
    const user = await requireUser(ctx)
    if (game.status !== "active") throw new Error("Game is not active")
    const source = await commanderPlayerForWrite(
      ctx,
      game,
      args.fromPlayerId,
      user,
      args.deviceId,
      "source",
    )
    const target = await ctx.db.get(args.toPlayerId)
    if (!target || target.gameId !== game._id)
      throw new Error("Commander damage target must belong to this game")

    const existing = await ctx.db
      .query("gameCommanderClaims")
      .withIndex("by_game_operation", (q) =>
        q.eq("gameId", game._id).eq("operationId", args.operationId),
      )
      .unique()
    if (existing) {
      if (!commanderClaimMatches(existing, args, user._id))
        throw new Error("Operation identifier was reused with different data")
      return {
        operationId: existing.operationId,
        claimId: existing._id,
        status: existing.status,
        deduplicated: true,
      }
    }
    const eventWithOperation = await ctx.db
      .query("gameEvents")
      .withIndex("by_game_operation", (q) =>
        q.eq("gameId", game._id).eq("operationId", args.operationId),
      )
      .unique()
    if (eventWithOperation) throw new Error("Operation identifier was reused with different data")

    const pair = await ctx.db
      .query("gameCommanderDamage")
      .withIndex("by_game_and_pair", (q) =>
        q.eq("gameId", game._id).eq("fromPlayerId", source._id).eq("toPlayerId", target._id),
      )
      .unique()
    const nextTotal = (pair?.total ?? 0) + args.delta
    if (nextTotal < 0 || nextTotal > MAX_COMMANDER_DAMAGE)
      throw new Error("Commander damage total must remain between 0 and 99")
    const pending = await ctx.db
      .query("gameCommanderClaims")
      .withIndex("by_game_and_status", (q) => q.eq("gameId", game._id).eq("status", "pending"))
      .take(MAX_PENDING_COMMANDER_CLAIMS + 1)
    if (
      pending.some((claim) => claim.fromPlayerId === source._id && claim.toPlayerId === target._id)
    )
      throw new Error("A pending commander damage claim already exists for this pair")
    if (pending.length >= MAX_PENDING_COMMANDER_CLAIMS)
      throw new Error("Too many pending commander damage claims")

    const now = Date.now()
    const claimId = await ctx.db.insert("gameCommanderClaims", {
      gameId: game._id,
      operationId: args.operationId,
      fromPlayerId: source._id,
      toPlayerId: target._id,
      delta: args.delta,
      status: "pending",
      actorUserId: user._id,
      deviceId: args.deviceId,
      clientCreatedAt: args.clientCreatedAt,
      createdAt: now,
    })
    await ctx.db.insert("gameEvents", {
      gameId: game._id,
      playerId: target._id,
      operationId: args.operationId,
      kind: "commanderDamage.claimed",
      delta: args.delta,
      fromPlayerId: source._id,
      toPlayerId: target._id,
      claimOperationId: args.operationId,
      actorUserId: user._id,
      deviceId: args.deviceId,
      clientCreatedAt: args.clientCreatedAt,
      serverCreatedAt: now,
    })
    await ctx.db.patch(target._id, {
      eventCount: (target.eventCount ?? 0) + 1,
      lastEventAt: now,
    })
    return {
      operationId: args.operationId,
      claimId,
      status: "pending" as const,
      deduplicated: false,
    }
  },
})

async function commanderResolutionEvent(ctx: QueryCtx, claim: Doc<"gameCommanderClaims">) {
  const operationId = claim.resolutionOperationId
  if (operationId) {
    const event = await ctx.db
      .query("gameEvents")
      .withIndex("by_game_operation", (q) =>
        q.eq("gameId", claim.gameId).eq("operationId", operationId),
      )
      .unique()
    if (event) return event
  }
  return await ctx.db
    .query("gameEvents")
    .withIndex("by_game_operation", (q) =>
      q.eq("gameId", claim.gameId).eq("operationId", `${claim.operationId}_${claim.status}`),
    )
    .unique()
}

async function resolveCommanderClaim(
  ctx: MutationCtx,
  args: {
    publicId: string
    operationId: string
    deviceId: string
    clientCreatedAt: number
    resolutionOperationId?: string
  },
  decision: "confirmed" | "declined",
) {
  assertOperationId(args.operationId)
  if (args.resolutionOperationId !== undefined) assertOperationId(args.resolutionOperationId)
  assertDeviceId(args.deviceId)
  if (!Number.isSafeInteger(args.clientCreatedAt) || args.clientCreatedAt < 0)
    throw new Error("Invalid client timestamp")
  const game = await gameByPublicId(ctx, args.publicId)
  assertCommanderGame(game)
  const user = await requireUser(ctx)
  const claim = await ctx.db
    .query("gameCommanderClaims")
    .withIndex("by_game_operation", (q) =>
      q.eq("gameId", game._id).eq("operationId", args.operationId),
    )
    .unique()
  if (!claim) throw new Error("Commander damage claim not found")
  if (
    args.resolutionOperationId &&
    claim.resolutionOperationId &&
    claim.resolutionOperationId !== args.resolutionOperationId
  )
    throw new Error("Operation identifier was reused with different data")
  const target = await commanderPlayerForWrite(
    ctx,
    game,
    claim.toPlayerId,
    user,
    args.deviceId,
    "target",
  )
  if (args.resolutionOperationId) {
    const operationId = args.resolutionOperationId
    const existing = await ctx.db
      .query("gameEvents")
      .withIndex("by_game_operation", (q) =>
        q.eq("gameId", game._id).eq("operationId", operationId),
      )
      .unique()
    if (
      existing &&
      (existing.claimOperationId !== claim.operationId ||
        existing.kind !== `commanderDamage.${decision}`)
    )
      throw new Error("Operation identifier was reused with different data")
  }
  if (claim.status !== "pending") {
    if (args.resolutionOperationId) {
      if (claim.status !== decision)
        throw new Error("Operation identifier was reused with different data")
      const event = await commanderResolutionEvent(ctx, claim)
      if (
        !event ||
        event.kind !== `commanderDamage.${claim.status}` ||
        event.claimOperationId !== claim.operationId ||
        event.playerId !== claim.toPlayerId ||
        event.toPlayerId !== claim.toPlayerId ||
        event.actorUserId !== user._id ||
        event.deviceId !== args.deviceId ||
        event.clientCreatedAt !== args.clientCreatedAt
      )
        throw new Error("Operation identifier was reused with different data")
      if (!claim.resolutionOperationId)
        await ctx.db.patch(claim._id, { resolutionOperationId: args.resolutionOperationId })
      if (event.operationId !== args.resolutionOperationId)
        await ctx.db.patch(event._id, { operationId: args.resolutionOperationId })
    }
    return {
      operationId: args.resolutionOperationId ?? claim.operationId,
      claimId: claim._id,
      status: claim.status,
      deduplicated: true,
      ...(decision === "confirmed" && claim.status === "confirmed"
        ? {
            total:
              (
                await ctx.db
                  .query("gameCommanderDamage")
                  .withIndex("by_game_and_pair", (q) =>
                    q
                      .eq("gameId", game._id)
                      .eq("fromPlayerId", claim.fromPlayerId)
                      .eq("toPlayerId", claim.toPlayerId),
                  )
                  .unique()
              )?.total ?? 0,
            currentLife: target.currentLife,
          }
        : {}),
    }
  }
  if (game.status !== "active") throw new Error("Game is not active")

  const now = Date.now()
  const eventOperationId = args.resolutionOperationId ?? `${claim.operationId}_${decision}`
  if (decision === "confirmed") {
    const pair = await ctx.db
      .query("gameCommanderDamage")
      .withIndex("by_game_and_pair", (q) =>
        q
          .eq("gameId", game._id)
          .eq("fromPlayerId", claim.fromPlayerId)
          .eq("toPlayerId", claim.toPlayerId),
      )
      .unique()
    const total = (pair?.total ?? 0) + claim.delta
    if (total < 0 || total > MAX_COMMANDER_DAMAGE)
      throw new Error("Commander damage total must remain between 0 and 99")
    await ctx.db.insert("gameEvents", {
      gameId: game._id,
      playerId: target._id,
      operationId: eventOperationId,
      kind: "commanderDamage.confirmed",
      delta: claim.delta,
      fromPlayerId: claim.fromPlayerId,
      toPlayerId: claim.toPlayerId,
      claimOperationId: claim.operationId,
      actorUserId: user._id,
      deviceId: args.deviceId,
      clientCreatedAt: args.clientCreatedAt,
      serverCreatedAt: now,
    })
    if (pair) await ctx.db.patch(pair._id, { total, updatedAt: now })
    else
      await ctx.db.insert("gameCommanderDamage", {
        gameId: game._id,
        fromPlayerId: claim.fromPlayerId,
        toPlayerId: claim.toPlayerId,
        total,
        updatedAt: now,
      })
    await ctx.db.patch(target._id, {
      currentLife: target.currentLife - claim.delta,
      eventCount: (target.eventCount ?? 0) + 1,
      lastEventAt: now,
    })
    await ctx.db.patch(claim._id, {
      status: "confirmed",
      ...(args.resolutionOperationId ? { resolutionOperationId: args.resolutionOperationId } : {}),
      resolvedAt: now,
      resolvedByUserId: user._id,
    })
    return {
      operationId: args.resolutionOperationId ?? claim.operationId,
      claimId: claim._id,
      status: "confirmed" as const,
      total,
      currentLife: target.currentLife - claim.delta,
      deduplicated: false,
    }
  }

  await ctx.db.insert("gameEvents", {
    gameId: game._id,
    playerId: target._id,
    operationId: eventOperationId,
    kind: "commanderDamage.declined",
    delta: claim.delta,
    fromPlayerId: claim.fromPlayerId,
    toPlayerId: claim.toPlayerId,
    claimOperationId: claim.operationId,
    actorUserId: user._id,
    deviceId: args.deviceId,
    clientCreatedAt: args.clientCreatedAt,
    serverCreatedAt: now,
  })
  await ctx.db.patch(claim._id, {
    status: "declined",
    ...(args.resolutionOperationId ? { resolutionOperationId: args.resolutionOperationId } : {}),
    resolvedAt: now,
    resolvedByUserId: user._id,
  })
  await ctx.db.patch(target._id, {
    eventCount: (target.eventCount ?? 0) + 1,
    lastEventAt: now,
  })
  return {
    operationId: args.resolutionOperationId ?? claim.operationId,
    claimId: claim._id,
    status: "declined" as const,
    deduplicated: false,
  }
}

export const confirmCommanderDamage = mutation({
  args: {
    publicId: v.string(),
    operationId: v.string(),
    deviceId: v.string(),
    clientCreatedAt: v.number(),
    resolutionOperationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => resolveCommanderClaim(ctx, args, "confirmed"),
})

export const declineCommanderDamage = mutation({
  args: {
    publicId: v.string(),
    operationId: v.string(),
    deviceId: v.string(),
    clientCreatedAt: v.number(),
    resolutionOperationId: v.optional(v.string()),
  },
  handler: async (ctx, args) => resolveCommanderClaim(ctx, args, "declined"),
})

export const finishGame = mutation({
  args: {
    publicId: v.string(),
    result: v.optional(
      v.union(
        v.object({ kind: v.literal("win"), winnerPlayerIds: v.array(v.id("gamePlayers")) }),
        v.object({ kind: v.literal("draw") }),
        v.object({ kind: v.literal("unknown") }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const game = await gameByPublicId(ctx, args.publicId)
    const user = await requireHost(ctx, game)
    if (game.status !== "active") throw new Error("Only an active game can be finished")
    const summary = await terminalizeGame(
      ctx,
      game,
      "finished",
      "host_finished",
      user._id,
      args.result ?? { kind: "unknown" },
    )
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
    const premium = await hasFeature(ctx, user, PREMIUM_FEATURES.fullHistory)
    const history = await ctx.db
      .query("gameHistoryEntries")
      .withIndex("by_user_and_finished_at", (q) => q.eq("userId", user._id))
      .order("desc")
      .paginate(
        boundedPaginationOptions(
          args.paginationOpts,
          premium
            ? CONNECTED_MEMBERSHIP_PAGE_MAX_ITEMS
            : Math.min(FREE_CONNECTED_HISTORY_GAMES, CONNECTED_MEMBERSHIP_PAGE_MAX_ITEMS),
        ),
      )
    const blocked = await blockedUserIdsFor(ctx, user._id)
    const page = []
    for (const entry of history.page) {
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
          terminalStatus: summary.terminalStatus ?? "finished",
          terminalReason: summary.terminalReason,
          players: maskSummaryPlayersForViewer(summary.players, blocked),
        })
      }
    }
    return {
      ...history,
      page,
      isDone: premium ? history.isDone : true,
      premium,
      hasLockedHistory: !premium && !history.isDone,
      migrationRequired: (user.historyMigrationVersion ?? 0) < HISTORY_MIGRATION_VERSION,
    }
  },
})

export const migrateMyHistoryEntries = mutation({
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
            game: game.game ?? DEFAULT_DECK_GAME,
            system: game.system ?? game.game ?? DEFAULT_DECK_GAME,
            format: game.format ?? game.ruleset,
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
          game: game.game ?? DEFAULT_DECK_GAME,
          system: game.system ?? game.game ?? DEFAULT_DECK_GAME,
          format: game.format ?? game.ruleset,
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
    const summary = await ctx.db
      .query("gameSummaries")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .unique()
    if (!summary) return null
    const viewer = await requireUser(ctx)
    const blocked = await blockedUserIdsFor(ctx, viewer._id)
    return {
      ...summary,
      game: summary.game ?? DEFAULT_DECK_GAME,
      system: summary.system ?? summary.game ?? DEFAULT_DECK_GAME,
      format: summary.format ?? summary.ruleset,
      players: maskSummaryPlayersForViewer(summary.players, blocked),
      viewerPlayerIds: summary.players
        .filter((player) => player.userId === viewer._id)
        .map((player) => player.playerId),
    }
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
        fromPlayerId: event.fromPlayerId,
        toPlayerId: event.toPlayerId,
        claimOperationId: event.claimOperationId,
        clientCreatedAt: event.clientCreatedAt,
        serverCreatedAt: event.serverCreatedAt,
        eventId: event._id,
        sequence: event.sequence ?? null,
      })),
    }
  },
})
