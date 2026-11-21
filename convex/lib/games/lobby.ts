import { paginationOptsValidator } from "convex/server"
import { ConvexError, v } from "convex/values"

import type { Doc } from "../../_generated/dataModel"
import type { MutationCtx } from "../../_generated/server"
import { bestOfValidator } from "../../matches"
import { MANY_SEAT_MARK_SHAPES, resolveAppearance, type PlayerMarkShape } from "../appearance"
import { requireHost, requireUser } from "../auth"
import { assertDeckGameFormat, DEFAULT_DECK_GAME } from "../deckGames"
import { limitGameRate } from "../gameRateLimits"
import { insertGame } from "./setup"
import { assertGameSystem, requireReleasedCapability } from "../integrations"
import { playerGridLayoutValidator } from "../layouts"
import { isBlockedBetween } from "../moderation"
import { firstPlayerModeValidator, freeMulligansValidator, mulliganHandSize } from "../mulligans"
import { boundedPaginationOptions, CONNECTED_MEMBERSHIP_PAGE_MAX_ITEMS } from "../pagination"
import {
  assertAllowedColor,
  assertAllowedShape,
  assertDisplayName,
  assertInviteToken,
  assertManualCodeCandidates,
  assertPlayerCount,
  assertRuleset,
  assertStartingLife,
  clientSeesSeats,
  INVITE_LIFETIME_MS,
  MAX_PLAYERS,
  SEATS_BEFORE_CLIENT_LIMIT,
} from "../policy"
import { attachesDecks, startingValueRange, systemDefinition } from "../systems"
import { isValidModeSetup, modeSetupValidator, systemPlaysModeSetup } from "../tableModes"
import { gameVariantValidator } from "../treachery"
import { mutationHandler, queryHandler } from "./handlers"
import {
  JOIN_ATTEMPT_WINDOW_MS,
  NO_GAME_SYSTEM,
  allocateInvite,
  assertClientPlaysGame,
  assertClientSeesSeats,
  assertDeckRequirementSupported,
  assertDeviceId,
  assertInviteGuessesOpen,
  assertLifeDelta,
  assertPublicId,
  assertVariantSeats,
  clearWayToHost,
  connectedMarkShapes,
  consumeJoinAttempt,
  countMissedCode,
  currentUsableInvite,
  findInvite,
  gameByPublicId,
  inviteIsCurrent,
  inviteKey,
  joinAttemptsFor,
  joinableInviteGame,
  lifeEditingFor,
  lobbyTeammate,
  playersForGame,
  takenAppearances,
} from "./shared"

const MAX_HOSTED_GAMES_RECOVERY_READ = 25

const INVALID_INVITE_MESSAGE = "Invite is invalid, expired, or revoked"

// why: hidden roles are shown per device, so a Treachery seat must belong to one.
const TREACHERY_DEVICE_MESSAGE = "Treachery seats need a device"

const seatLimitOf = (maxSeats: number | undefined) =>
  maxSeats !== undefined && Number.isInteger(maxSeats) && maxSeats > SEATS_BEFORE_CLIENT_LIMIT
    ? { maxSeats: Math.min(maxSeats, MAX_PLAYERS) }
    : {}

export const createLobby = mutationHandler({
  args: {
    publicId: v.string(),
    playerCount: v.number(),
    startingLife: v.number(),
    lifeStep: v.optional(v.number()),
    ruleset: v.string(),
    deckRequired: v.optional(v.boolean()),
    game: v.optional(v.string()),
    system: v.optional(v.string()),
    format: v.optional(v.string()),
    variant: v.optional(gameVariantValidator),
    modeSetup: v.optional(modeSetupValidator),
    layout: v.optional(playerGridLayoutValidator),
    editsAnySeat: v.optional(v.boolean()),
    matchBestOf: v.optional(bestOfValidator),
    firstPlayerMode: v.optional(firstPlayerModeValidator),
    freeMulligans: v.optional(freeMulligansValidator),
    inviteToken: v.string(),
    manualCodeCandidates: v.array(v.string()),
    hostDisplayName: v.string(),
    hostColor: v.string(),
    hostShape: v.optional(v.string()),
    deviceId: v.optional(v.string()),
    maxSeats: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    await limitGameRate(ctx, "lobbyCreate", user._id)
    if (args.game !== undefined && args.system !== undefined && args.game !== args.system)
      throw new Error("Game system fields must match")
    const noSystem = (args.system ?? args.game) === NO_GAME_SYSTEM
    const gameSystem = noSystem
      ? NO_GAME_SYSTEM
      : assertGameSystem(args.system ?? args.game ?? DEFAULT_DECK_GAME)
    assertDeckRequirementSupported(gameSystem, args.deckRequired)
    if (!noSystem) await requireReleasedCapability(ctx, gameSystem, "playTracking")
    assertPlayerCount(args.playerCount)
    if (args.variant !== undefined) {
      if (!systemDefinition(gameSystem)?.variants.includes(args.variant))
        throw new Error("This game doesn't offer that variant")
      assertVariantSeats(args.variant, args.playerCount)
      if (args.variant === "treachery" && !args.deviceId) throw new Error(TREACHERY_DEVICE_MESSAGE)
    }
    if (args.modeSetup) {
      if (!systemPlaysModeSetup(gameSystem, args.modeSetup))
        throw new Error("Planechase and Archenemy are for Magic")
      if (
        (args.modeSetup.archenemy !== undefined) !== (args.variant === "archenemy") ||
        !isValidModeSetup(args.modeSetup, args.playerCount)
      )
        throw new Error("Invalid Planechase or Archenemy setup")
    } else if (args.variant === "archenemy") throw new Error("Archenemy needs a setup")
    assertStartingLife(args.startingLife, startingValueRange(gameSystem))
    if (args.lifeStep !== undefined) {
      assertLifeDelta(args.lifeStep)
      if (args.lifeStep < 1) throw new Error("Life step must be positive")
    }
    assertInviteToken(args.inviteToken)
    assertManualCodeCandidates(args.manualCodeCandidates)
    assertAllowedColor(args.hostColor)
    if (!clientSeesSeats(args.playerCount, args.maxSeats))
      throw new ConvexError({ code: "update_required", message: "Update Scryve to host this game" })
    if (args.hostShape !== undefined)
      assertAllowedShape(args.hostShape, connectedMarkShapes(args.playerCount))
    if (args.deviceId) assertDeviceId(args.deviceId)
    const ruleset = assertRuleset(args.ruleset)
    const format = noSystem
      ? undefined
      : args.format === undefined
        ? ruleset
        : assertDeckGameFormat(gameSystem, args.format)
    const hostDisplayName = assertDisplayName(args.hostDisplayName)
    assertPublicId(args.publicId)
    await clearWayToHost(ctx, user._id)
    if (
      await ctx.db
        .query("games")
        .withIndex("by_public_id", (q) => q.eq("publicId", args.publicId))
        .unique()
    )
      throw new Error("Game identifier collision; retry")
    const manualCode = await allocateInvite(ctx, args.inviteToken, args.manualCodeCandidates)
    const now = Date.now()
    const gameId = await insertGame(
      ctx,
      {
        startingLife: args.startingLife,
        lifeStep: args.lifeStep,
        ruleset,
        deckRequired: attachesDecks(gameSystem) ? args.deckRequired : undefined,
        game: gameSystem,
        system: gameSystem,
        format,
        variant: args.variant,
        modeSetup: args.modeSetup,
        layout: args.layout,
        lifeEditing: undefined,
        matchBestOf: args.matchBestOf,
        firstPlayerMode: args.firstPlayerMode,
        freeMulligans: mulliganHandSize(gameSystem) === undefined ? undefined : args.freeMulligans,
      },
      {
        publicId: args.publicId,
        hostUserId: user._id,
        mode: "connected",
        status: "lobby",
        playerCount: args.playerCount,
        createdAt: now,
        updatedAt: now,
        eventSequence: 0,
      },
    )
    await ctx.db.insert("gamePlayers", {
      gameId,
      seat: 1,
      userId: user._id,
      ...(args.deviceId ? { deviceId: args.deviceId } : {}),
      displayName: hostDisplayName,
      usernameAtJoin: user.username,
      color: args.hostColor.toUpperCase(),
      shape: resolveAppearance({
        preferred: {
          color: args.hostColor,
          ...(args.hostShape ? { shape: args.hostShape as PlayerMarkShape } : {}),
        },
        taken: [],
        seat: 1,
        shapes: connectedMarkShapes(args.playerCount),
      }).shape,
      currentLife: args.startingLife,
      eventCount: 0,
      resumable: true,
      joinedAt: now,
      ...(args.editsAnySeat ? { editsAnySeat: true } : {}),
      ...seatLimitOf(args.maxSeats),
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
export const resolveInvite = mutationHandler({
  args: { token: v.optional(v.string()), manualCode: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    await consumeJoinAttempt(ctx, String(user.clerkUserId))
    await assertInviteGuessesOpen(ctx, args)
    const invite = await findInvite(ctx, args)
    const game = invite ? await ctx.db.get(invite.gameId) : null
    if (
      !invite ||
      !game ||
      game.status !== "lobby" ||
      !(await inviteIsCurrent(ctx, game, invite, Date.now()))
    ) {
      await countMissedCode(ctx, args)
      return { valid: false }
    }
    const players = await playersForGame(ctx, game._id)
    return { valid: players.length < game.playerCount }
  },
})

/**
 * Attaches an account to a seat an imported game already created.
 *
 * Imported seats carry the published local game's life totals and appearance, so
 * claiming patches identity onto the existing row rather than inserting a new one
 * and never touches `currentLife`. Unlike a lobby claim, an account may hold only
 * one imported seat regardless of device. Omitting `seat` takes the lowest
 * unclaimed one, which is how clients that predate seat selection join.
 */
async function claimPreparedSeat(
  ctx: MutationCtx,
  {
    game,
    user,
    players,
    seat,
    deviceId,
    displayName,
    editsAnySeat,
  }: {
    game: Doc<"games">
    user: Doc<"users">
    players: Doc<"gamePlayers">[]
    seat?: number
    deviceId?: string
    displayName?: string
    editsAnySeat?: boolean
  },
) {
  const held = players.find((player) => player.userId === user._id)
  const target =
    seat === undefined
      ? players
          .filter((player) => player.userId === undefined)
          .sort((left, right) => left.seat - right.seat)[0]
      : players.find((player) => player.seat === seat)
  if (held) {
    if (seat === undefined || held.seat === seat)
      return { publicId: game.publicId, seat: held.seat }
    throw new ConvexError({
      code: "seat_already_held",
      message: "You already hold a seat in this game",
    })
  }
  if (seat !== undefined && !target)
    throw new ConvexError({ code: "seat_not_found", message: "Seat not found" })
  if (!target) throw new ConvexError({ code: "game_full", message: "Lobby is full" })
  if (target.userId !== undefined)
    throw new ConvexError({ code: "seat_taken", message: "Seat already claimed" })
  const claimed = {
    userId: user._id,
    ...(deviceId ? { deviceId } : {}),
    ...(displayName ? { displayName } : {}),
    usernameAtJoin: user.username,
    ...(editsAnySeat ? { editsAnySeat: true } : {}),
  }
  await ctx.db.patch(target._id, claimed)
  // why: an older app claiming here closes editing again, so it never sees others change its seat.
  const { lifeEditing } = lifeEditingFor(
    players.map((player) => (player._id === target._id ? { ...player, ...claimed } : player)),
  )
  await ctx.db.patch(game._id, { updatedAt: Date.now(), lifeEditing })
  return { publicId: game.publicId, seat: target.seat }
}

export const claimSeat = mutationHandler({
  args: {
    token: v.optional(v.string()),
    manualCode: v.optional(v.string()),
    /** Required for a lobby claim. Imported seats keep the name the host gave them. */
    displayName: v.optional(v.string()),
    color: v.optional(v.string()),
    shape: v.optional(v.string()),
    deviceId: v.optional(v.string()),
    /** Imported games only: which existing seat to take. Lowest unclaimed when omitted. */
    seat: v.optional(v.number()),
    systems: v.optional(v.array(v.string())),
    variants: v.optional(v.array(v.string())),
    editsAnySeat: v.optional(v.boolean()),
    maxSeats: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    const clerkUserId = String(user.clerkUserId)
    await consumeJoinAttempt(ctx, clerkUserId)
    await assertInviteGuessesOpen(ctx, args)
    if (args.color !== undefined) assertAllowedColor(args.color)
    if (args.shape !== undefined) assertAllowedShape(args.shape, MANY_SEAT_MARK_SHAPES)
    if (args.deviceId) assertDeviceId(args.deviceId)
    const game = await joinableInviteGame(ctx, args)
    if (!game) {
      /* why: installed clients claim right after claimableSeats rejected the same invite and expect this throw; that lookup already counted the failure. Grace is timed from the lookup, so a window rollover between the calls still throws. Other wrong invites return null so the counted attempt commits. */
      const joins = await joinAttemptsFor(ctx, clerkUserId)
      if (
        joins?.failedInvite === inviteKey(args) &&
        joins.failedInviteAt !== undefined &&
        Date.now() - joins.failedInviteAt < JOIN_ATTEMPT_WINDOW_MS
      )
        throw new ConvexError({ code: "invalid_invite", message: INVALID_INVITE_MESSAGE })
      await countMissedCode(ctx, args)
      return null
    }
    assertClientPlaysGame(game, args)
    assertClientSeesSeats(game, args)
    if (args.shape !== undefined)
      assertAllowedShape(args.shape, connectedMarkShapes(game.playerCount))
    if (game.variant === "treachery" && !args.deviceId)
      throw new ConvexError({ code: "device_required", message: TREACHERY_DEVICE_MESSAGE })
    const existingPlayers = await playersForGame(ctx, game._id)
    for (const seated of existingPlayers) {
      if (!seated.userId || seated.userId === user._id) continue
      if (await isBlockedBetween(ctx, user._id, seated.userId))
        throw new ConvexError({
          code: "blocked_player",
          message: "You cannot join a game with a player you blocked or who blocked you",
        })
    }
    const claimedName =
      args.displayName === undefined ? undefined : assertDisplayName(args.displayName)
    // An active game with an unclaimed seat can only be an imported one: startGame
    // refuses to leave a lobby until every seat is claimed.
    if (game.status === "active")
      return await claimPreparedSeat(ctx, {
        game,
        user,
        players: existingPlayers,
        ...(args.seat === undefined ? {} : { seat: args.seat }),
        ...(args.deviceId ? { deviceId: args.deviceId } : {}),
        ...(claimedName === undefined ? {} : { displayName: claimedName }),
        ...(args.editsAnySeat ? { editsAnySeat: true } : {}),
      })
    if (claimedName === undefined)
      throw new ConvexError({
        code: "display_name_required",
        message: "A display name is required to claim a lobby seat",
      })
    const displayName = claimedName
    const duplicate = existingPlayers.find(
      (candidate) =>
        candidate.userId === user._id &&
        (args.deviceId ? candidate.deviceId === args.deviceId : candidate.deviceId === undefined),
    )
    if (duplicate) {
      // why: a player who updated Scryve reclaims their seat with the new limit, so the host can grow past six.
      const { maxSeats }: { maxSeats?: number } = seatLimitOf(args.maxSeats)
      if (duplicate.maxSeats !== maxSeats) await ctx.db.patch(duplicate._id, { maxSeats })
      return { publicId: game.publicId, seat: duplicate.seat }
    }
    const players = existingPlayers
    const occupied = new Set(players.map((player) => player.seat))
    let seat = 1
    while (occupied.has(seat)) seat += 1
    if (seat > game.playerCount)
      throw new ConvexError({ code: "game_full", message: "Lobby is full" })
    const teammate = lobbyTeammate(game, players, seat)
    const color = teammate?.color ?? args.color
    const appearance = resolveAppearance({
      preferred: {
        ...(color ? { color } : {}),
        ...(args.shape ? { shape: args.shape as PlayerMarkShape } : {}),
      },
      taken: takenAppearances(players, undefined, teammate),
      seat,
      shapes: connectedMarkShapes(game.playerCount),
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
      ...(args.editsAnySeat ? { editsAnySeat: true } : {}),
      ...seatLimitOf(args.maxSeats),
    })
    await ctx.db.patch(game._id, { updatedAt: Date.now() })
    return { publicId: game.publicId, seat }
  },
})

export const revokeInvite = mutationHandler({
  args: { publicId: v.string() },
  handler: async (ctx, args) => {
    const game = await gameByPublicId(ctx, args.publicId)
    await requireHost(ctx, game)
    const invite = await currentUsableInvite(ctx, game, Date.now())
    if (invite) await ctx.db.patch(invite._id, { revokedAt: Date.now() })
  },
})

export const rotateInvite = mutationHandler({
  args: {
    publicId: v.string(),
    inviteToken: v.string(),
    manualCodeCandidates: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const game = await gameByPublicId(ctx, args.publicId)
    const host = await requireHost(ctx, game)
    await limitGameRate(ctx, "gameWrite", host._id)
    if (game.status !== "lobby" && game.status !== "active")
      throw new ConvexError({
        code: "game_ended",
        message: "Only a lobby or active game invite can be rotated",
      })
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

/** why: Treachery and Archenemy games were listed before clients sent `variants`; every newer variant waits for a client that names it. */
const VARIANTS_BEFORE_CLIENT_LIST: readonly (string | undefined)[] = [
  undefined,
  "treachery",
  "archenemy",
]

const listsVariant = (game: Doc<"games">, variants: readonly string[] = []) =>
  VARIANTS_BEFORE_CLIENT_LIST.includes(game.variant) ||
  (game.variant !== undefined && variants.includes(game.variant))

export const activeConnectedGames = queryHandler({
  args: {
    paginationOpts: paginationOptsValidator,
    /** why: clients that omit it predate Two-Headed Giant, so its games stay off their list. */
    variants: v.optional(v.array(v.string())),
    maxSeats: v.optional(v.number()),
  },
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
          if (
            includedGameIds.has(game._id) ||
            !listsVariant(game, args.variants) ||
            !clientSeesSeats(game.playerCount, args.maxSeats)
          )
            continue
          includedGameIds.add(game._id)
          active.push({
            publicId: game.publicId,
            status: game.status,
            isHost: true,
            playerCount: game.playerCount,
            ruleset: game.ruleset,
            deckRequired: game.deckRequired ?? false,
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
      if (
        game &&
        (game.status === "lobby" || game.status === "active") &&
        listsVariant(game, args.variants) &&
        clientSeesSeats(game.playerCount, args.maxSeats)
      ) {
        includedGameIds.add(membership.gameId)
        active.push({
          publicId: game.publicId,
          status: game.status,
          isHost: game.hostUserId === user._id,
          playerCount: game.playerCount,
          ruleset: game.ruleset,
          deckRequired: game.deckRequired ?? false,
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
