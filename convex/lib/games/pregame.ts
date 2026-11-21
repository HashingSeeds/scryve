import { ConvexError, v } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx } from "../../_generated/server"
import { openHostedMatch } from "../../matches"
import {
  appearanceIsTaken,
  isProMarkShape,
  resolveAppearance,
  resolvePlayerAppearances,
  type PlayerMarkShape,
} from "../appearance"
import { requireHost, requireMembership, requireSeatOwner, requireUser } from "../auth"
import { pinnedDeck } from "../deckKeys"
import { deckStartingValue } from "../deckStartingValue"
import { limitGameRate } from "../gameRateLimits"
import { gameWriteError } from "../gameWriteErrors"
import { isMulliganCount, mulliganHandSize } from "../mulligans"
import { assertDeckLabel, deckLabelValidator } from "../opponentDecks"
import {
  assertAllowedColor,
  assertAllowedShape,
  assertDisplayName,
  assertPlayerCount,
  clientSeesSeats,
  MAX_PLAYERS,
  MIN_PLAYERS,
} from "../policy"
import { attachesDecks, systemDefinition } from "../systems"
import { ARCHENEMY_LIFE, modeGameFields, startModes } from "../tableModes"
import { isTeamVariant } from "../teamVariants"
import { TREACHERY_SEATS_MESSAGE } from "../treachery"
import { pairedTeams } from "../twoHeadedGiant"
import { mutationHandler } from "./handlers"
import {
  MAX_PLAYERS_PER_GAME_READ,
  NO_SEAT_DECK,
  appearanceOf,
  assertDeckRequirementSupported,
  assertDeviceId,
  assertVariantSeats,
  connectedMarkShapes,
  deckSelectionIsPlayable,
  gameByPublicId,
  gameDeckRules,
  holdsSeatOnDevice,
  lifeEditingFor,
  lobbyTeammate,
  playersForGame,
  proMarkFor,
  rolesFor,
  sharedSeatKey,
  takenAppearances,
} from "./shared"

function appearanceTaken() {
  return new ConvexError({
    code: "appearance_taken",
    message: "Another player already claimed that color or shape",
  })
}

async function requireProMark(ctx: MutationCtx, user: Doc<"users">, proShape: string) {
  if (!isProMarkShape(proShape)) throw new Error("Choose an available player shape")
  const mark = await proMarkFor(ctx, user, proShape)
  if (!mark) throw new ConvexError({ code: "pro_required", message: "Pro marks need Scryve Pro" })
  return mark
}

const seatTeams = (game: Doc<"games">, seats: number[]) =>
  isTeamVariant(game.variant) ? pairedTeams([...seats].sort((a, b) => a - b)) : []

export const setMyAppearance = mutationHandler({
  args: {
    publicId: v.string(),
    seat: v.number(),
    color: v.string(),
    shape: v.string(),
    // why: installed clients omit it, which must leave the seat's Pro mark as it is.
    proShape: v.optional(v.union(v.string(), v.null())),
    keepColor: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    assertAllowedColor(args.color)
    const game = await gameByPublicId(ctx, args.publicId)
    assertAllowedShape(args.shape, connectedMarkShapes(game.playerCount))
    if (game.status !== "lobby")
      throw new ConvexError({
        code: "game_not_lobby",
        message: "Appearance can only change in a lobby",
      })
    const { user, player } = await requireSeatOwner(ctx, game._id, args.seat)
    await limitGameRate(ctx, "gameWrite", user._id)
    const players = await playersForGame(ctx, game._id)
    const requested = {
      color: (args.keepColor ? player.color : args.color).toUpperCase(),
      shape: args.shape as PlayerMarkShape,
    }
    const teammate = lobbyTeammate(game, players, player.seat)
    if (appearanceIsTaken(takenAppearances(players, player._id, teammate), requested))
      throw appearanceTaken()
    const proMark =
      typeof args.proShape === "string"
        ? { foil: undefined, ...(await requireProMark(ctx, user, args.proShape)) }
        : args.proShape === null
          ? { proShape: undefined, foil: undefined }
          : {}
    if (
      proMark.proShape &&
      players.some((other) => other._id !== player._id && other.proShape === proMark.proShape)
    )
      throw appearanceTaken()
    await ctx.db.patch(player._id, { color: requested.color, shape: requested.shape, ...proMark })
    if (teammate && teammate.color !== requested.color)
      await ctx.db.patch(teammate._id, { color: requested.color })
    await ctx.db.patch(game._id, { updatedAt: Date.now() })
    return requested
  },
})

export const updateLobbySettings = mutationHandler({
  args: {
    publicId: v.string(),
    playerCount: v.optional(v.number()),
    deckRequired: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const game = await gameByPublicId(ctx, args.publicId)
    const host = await requireHost(ctx, game)
    await limitGameRate(ctx, "gameWrite", host._id)
    if (game.status !== "lobby")
      throw new ConvexError({
        code: "lobby_settings_not_allowed",
        message: "Lobby settings can only change in a lobby",
      })
    const system = gameDeckRules(game)[0]
    assertDeckRequirementSupported(system, args.deckRequired)
    const deckRequired = attachesDecks(system) ? args.deckRequired : undefined
    if (args.playerCount !== undefined) {
      try {
        assertPlayerCount(args.playerCount)
      } catch (error) {
        throw new ConvexError({
          code: "invalid_player_count",
          message: error instanceof Error ? error.message : "Choose a valid seat count",
        })
      }
      if (game.variant !== undefined) {
        try {
          assertVariantSeats(game.variant, args.playerCount)
        } catch (error) {
          throw new ConvexError({
            code: "invalid_player_count",
            message: error instanceof Error ? error.message : TREACHERY_SEATS_MESSAGE,
          })
        }
      }
      const players = await playersForGame(ctx, game._id)
      const playerCount = args.playerCount
      if (players.some((player) => !clientSeesSeats(playerCount, player.maxSeats)))
        throw new ConvexError({
          code: "seat_limit",
          message: "A player needs to update Scryve before this game can have more seats",
        })
      if (args.playerCount < Math.max(...players.map((player) => player.seat)))
        throw new ConvexError({
          code: "occupied_seat",
          message: "Player count cannot remove an occupied seat",
        })
    }
    await ctx.db.patch(game._id, {
      ...(args.playerCount === undefined ? {} : { playerCount: args.playerCount }),
      ...(deckRequired === undefined ? {} : { deckRequired }),
      updatedAt: Date.now(),
    })
    return {
      playerCount: args.playerCount ?? game.playerCount,
      deckRequired: attachesDecks(system) && (deckRequired ?? game.deckRequired ?? false),
    }
  },
})

export const swapLobbySeats = mutationHandler({
  args: { publicId: v.string(), first: v.number(), second: v.number() },
  handler: async (ctx, args) => {
    const game = await gameByPublicId(ctx, args.publicId)
    const host = await requireHost(ctx, game)
    await limitGameRate(ctx, "gameWrite", host._id)
    if (game.status !== "lobby")
      throw new ConvexError({
        code: "lobby_settings_not_allowed",
        message: "Seats can only change in a lobby",
      })
    const seats = [args.first, args.second]
    if (
      args.first === args.second ||
      seats.some((seat) => !Number.isInteger(seat) || seat < 1 || seat > game.playerCount)
    )
      throw new ConvexError({ code: "invalid_seat", message: "Choose two different seats" })
    const players = await playersForGame(ctx, game._id)
    for (const player of players) {
      if (player.seat === args.first) await ctx.db.patch(player._id, { seat: args.second })
      else if (player.seat === args.second) await ctx.db.patch(player._id, { seat: args.first })
    }
    if (isTeamVariant(game.variant)) await keepTeamColors(ctx, game, players, args)
    await ctx.db.patch(game._id, { updatedAt: Date.now() })
    return null
  },
})

async function keepTeamColors(
  ctx: MutationCtx,
  game: Doc<"games">,
  players: Doc<"gamePlayers">[],
  { first, second }: { first: number; second: number },
) {
  const [atFirst, atSecond] = [first, second].map((seat) =>
    players.find((player) => player.seat === seat),
  )
  if (atFirst && atSecond) {
    await ctx.db.patch(atFirst._id, { color: atSecond.color })
    await ctx.db.patch(atSecond._id, { color: atFirst.color })
    return
  }
  const mover = atFirst ?? atSecond
  if (!mover) return
  const seat = mover === atFirst ? second : first
  const seated = players.map((player) => (player._id === mover._id ? { ...player, seat } : player))
  const teammate = lobbyTeammate(game, seated, seat)
  const { color } = resolveAppearance({
    preferred: { color: teammate?.color ?? mover.color, shape: appearanceOf(mover).shape },
    taken: takenAppearances(seated, mover._id, teammate),
    seat,
    shapes: connectedMarkShapes(game.playerCount),
  })
  if (color !== mover.color) await ctx.db.patch(mover._id, { color })
}

export const startGame = mutationHandler({
  args: { publicId: v.string() },
  handler: async (ctx, args) => {
    const game = await gameByPublicId(ctx, args.publicId)
    await requireHost(ctx, game)
    if (game.status !== "lobby")
      throw new ConvexError({ code: "game_not_lobby", message: "Only a lobby can be started" })
    const players = await playersForGame(ctx, game._id)
    if (
      players.length < MIN_PLAYERS ||
      players.length > MAX_PLAYERS ||
      players.length !== game.playerCount
    )
      throw new ConvexError({
        code: "seats_unclaimed",
        message: "All configured seats must be claimed before starting",
      })
    const decks = attachesDecks(gameDeckRules(game)[0])
    if (decks && game.deckRequired === true) {
      for (const player of players) {
        if (
          !sharedSeatKey(player) &&
          (player.deckVersionId === undefined ||
            !(await deckSelectionIsPlayable(ctx, player.deckVersionId, game)))
        )
          throw new ConvexError({
            code: "deck_required",
            message: "Every occupied seat must choose a deck before starting",
          })
      }
    }
    const roles = rolesFor(game, players.length)
    const now = Date.now()
    const started = startModes(
      game.modeSetup,
      [...players].sort((a, b) => a.seat - b.seat).map((player) => player._id),
    )
    await ctx.db.patch(game._id, {
      status: "active",
      startedAt: now,
      updatedAt: now,
      ...lifeEditingFor(players),
      ...modeGameFields(started, now, `archenemy_${game.publicId}`),
      ...(isTeamVariant(game.variant)
        ? {
            turnGroups: pairedTeams(
              [...players].sort((a, b) => a.seat - b.seat).map(({ _id }) => _id),
            ),
          }
        : {}),
    })
    for (const [index, player] of resolvePlayerAppearances(
      players.map((seat) => (decks ? seat : { ...seat, ...NO_SEAT_DECK })),
      connectedMarkShapes(players.length),
      seatTeams(
        game,
        players.map(({ seat }) => seat),
      ),
    ).entries()) {
      const invalidSinceSelection =
        player.deckVersionId !== undefined &&
        !(await deckSelectionIsPlayable(ctx, player.deckVersionId, game))
      const deckLife = isTeamVariant(game.variant)
        ? undefined
        : sharedSeatKey(player)
          ? player.startingLife
          : player.deckVersionId && !invalidSinceSelection
            ? await deckStartingValue(ctx, player.deckVersionId, ...gameDeckRules(game))
            : undefined
      await ctx.db.patch(player._id, {
        resumable: true,
        color: player.color,
        shape: player.shape,
        ...(decks ? {} : NO_SEAT_DECK),
        ...(invalidSinceSelection
          ? { deckVersionId: undefined, deckKey: undefined, deckFingerprint: undefined }
          : player.deckVersionId
            ? await pinnedDeck(ctx, player.deckVersionId)
            : {}),
        ...(deckLife === undefined ? {} : { currentLife: deckLife, startingLife: deckLife }),
        ...(started.archenemyId === player._id
          ? { currentLife: ARCHENEMY_LIFE, startingLife: ARCHENEMY_LIFE }
          : {}),
        ...roles?.[index],
      })
    }
    if (game.matchBestOf) await openHostedMatch(ctx, game, players, game.matchBestOf)
    return { publicId: game.publicId }
  },
})

export const revealMyRole = mutationHandler({
  args: { publicId: v.string(), deviceId: v.string() },
  handler: async (ctx, args) => {
    assertDeviceId(args.deviceId)
    const game = await gameByPublicId(ctx, args.publicId)
    const user = await requireUser(ctx)
    const player = (
      await ctx.db
        .query("gamePlayers")
        .withIndex("by_game_user", (q) => q.eq("gameId", game._id).eq("userId", user._id))
        .take(MAX_PLAYERS_PER_GAME_READ)
    ).find((seat) => holdsSeatOnDevice(seat, user._id, args.deviceId))
    if (!player) throw gameWriteError("game_membership_required", "Game membership required")
    if (player.role === undefined)
      throw new ConvexError({ code: "no_hidden_roles", message: "This game has no hidden roles" })
    if (player.roleRevealed !== true) {
      await limitGameRate(ctx, "gameWrite", user._id)
      if (game.status !== "active") throw gameWriteError("game_not_active", "Game is not active")
      await ctx.db.patch(player._id, { roleRevealed: true })
    }
    return { role: player.role }
  },
})

export const noteAnySeatSupport = mutationHandler({
  args: { publicId: v.string(), deviceId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (args.deviceId) assertDeviceId(args.deviceId)
    const game = await gameByPublicId(ctx, args.publicId)
    if (game.status !== "lobby") return
    const user = await requireUser(ctx)
    const seats = await ctx.db
      .query("gamePlayers")
      .withIndex("by_game_user", (q) => q.eq("gameId", game._id).eq("userId", user._id))
      .take(MAX_PLAYERS_PER_GAME_READ)
    const behind = seats.filter(
      (seat) =>
        !seat.editsAnySeat && (seat.deviceId === undefined || seat.deviceId === args.deviceId),
    )
    if (behind.length === 0) return
    await limitGameRate(ctx, "gameWrite", user._id)
    for (const seat of behind) await ctx.db.patch(seat._id, { editsAnySeat: true })
    await ctx.db.patch(game._id, { updatedAt: Date.now() })
  },
})

export const updateMySeat = mutationHandler({
  args: {
    publicId: v.string(),
    seat: v.number(),
    displayName: v.string(),
    color: v.string(),
  },
  handler: async (ctx, args) => {
    const game = await gameByPublicId(ctx, args.publicId)
    if (game.status !== "lobby")
      throw new ConvexError({
        code: "game_not_lobby",
        message: "Seat metadata can only change in the lobby",
      })
    const { user, player } = await requireSeatOwner(ctx, game._id, args.seat)
    await limitGameRate(ctx, "gameWrite", user._id)
    const displayName = assertDisplayName(args.displayName)
    assertAllowedColor(args.color)
    const color = args.color.toUpperCase()
    if (color !== player.color.toUpperCase()) {
      const players = await playersForGame(ctx, game._id)
      if (players.some((other) => other._id !== player._id && other.color.toUpperCase() === color))
        throw appearanceTaken()
    }
    await ctx.db.patch(player._id, { displayName, color })
    await ctx.db.patch(game._id, { updatedAt: Date.now() })
  },
})

/** why: every device may tap at once, so the first call decides and later ones return what it decided. */
export const rollFirstPlayer = mutationHandler({
  args: { publicId: v.string() },
  handler: async (ctx, args) => {
    const game = await gameByPublicId(ctx, args.publicId)
    const { user } = await requireMembership(ctx, game._id)
    await limitGameRate(ctx, "gameWrite", user._id)
    if (game.status !== "active" || game.firstPlayerMode !== "roll")
      throw gameWriteError("game_not_active", "This game doesn't roll for first player")
    if (game.firstPlayerId || game.firstChooser) return
    const seats = (await playersForGame(ctx, game._id)).map((player) => player._id)
    const rules = systemDefinition(game.system ?? game.game)?.firstPlayer
    if (rules?.twoPlayerCoinFlip && seats.length === 2) {
      const winner = seats[Math.floor(Math.random() * 2)]
      await ctx.db.patch(game._id, {
        firstChooser: { playerId: winner, reason: "flip" },
        updatedAt: Date.now(),
      })
      return
    }
    const sides = Number((rules?.die ?? "d20").slice(1))
    const rolls = rollOff(seats, sides)
    const winner = seats.reduce((best, seat) => (rolls[seat] > rolls[best] ? seat : best))
    await ctx.db.patch(game._id, {
      firstRolls: rolls,
      ...(rules?.winnerChooses
        ? { firstChooser: { playerId: winner, reason: "roll" as const } }
        : { firstPlayerId: winner }),
      updatedAt: Date.now(),
    })
  },
})

function rollOff(seats: readonly Id<"gamePlayers">[], sides: number) {
  for (;;) {
    const rolls = Object.fromEntries(
      seats.map((seat) => [seat, Math.floor(Math.random() * sides) + 1]),
    )
    const high = Math.max(...Object.values(rolls))
    if (Object.values(rolls).filter((roll) => roll === high).length === 1) return rolls
  }
}

export const chooseFirstPlayer = mutationHandler({
  args: { publicId: v.string(), playerId: v.id("gamePlayers") },
  handler: async (ctx, args) => {
    const game = await gameByPublicId(ctx, args.publicId)
    const { user } = await requireMembership(ctx, game._id)
    await limitGameRate(ctx, "gameWrite", user._id)
    if (game.status !== "active") throw gameWriteError("game_not_active", "The game isn't active")
    if (game.firstPlayerId) return
    const players = await playersForGame(ctx, game._id)
    if (!players.some((seat) => seat._id === args.playerId))
      throw new Error("That player isn't in this game")
    const chooser =
      game.firstChooser && players.find((seat) => seat._id === game.firstChooser!.playerId)
    if (chooser) {
      const decides =
        chooser.userId === undefined ? game.hostUserId === user._id : chooser.userId === user._id
      if (!decides)
        throw gameWriteError("seat_owner_required", "That player chooses who goes first")
    } else if (game.firstPlayerMode !== "pick")
      throw gameWriteError("game_not_active", "This game doesn't pick a first player")
    await ctx.db.patch(game._id, {
      firstPlayerId: args.playerId,
      firstChooser: undefined,
      updatedAt: Date.now(),
    })
  },
})

export const keepHand = mutationHandler({
  args: { publicId: v.string(), seat: v.number(), mulligans: v.number() },
  handler: async (ctx, args) => {
    const game = await gameByPublicId(ctx, args.publicId)
    const { user, player } = await requireSeatOwner(ctx, game._id, args.seat)
    await limitGameRate(ctx, "gameWrite", user._id)
    const handSize = mulliganHandSize(game.system ?? game.game)
    if (
      game.status !== "active" ||
      !game.freeMulligans ||
      handSize === undefined ||
      !(player.deckVersionId || player.deckKey) ||
      !isMulliganCount(args.mulligans, game.freeMulligans, handSize)
    )
      throw gameWriteError("game_not_active", "This seat doesn't track mulligans")
    if (player.mulligans !== undefined) return
    await ctx.db.patch(player._id, { mulligans: args.mulligans })
  },
})

export const labelGuestSeatDeck = mutationHandler({
  args: {
    publicId: v.string(),
    seat: v.number(),
    deckLabel: v.union(deckLabelValidator, v.null()),
  },
  handler: async (ctx, args) => {
    const game = await gameByPublicId(ctx, args.publicId)
    const user = await requireHost(ctx, game)
    if (game.status !== "lobby" && game.status !== "active")
      throw new ConvexError({
        code: "game_ended",
        message: "Only a lobby or an active game can label a seat",
      })
    await limitGameRate(ctx, "gameWrite", user._id)
    const player = (await playersForGame(ctx, game._id)).find(({ seat }) => seat === args.seat)
    if (!player || player.userId)
      throw new ConvexError({
        code: "guest_seat_required",
        message: "Only a guest seat can be labeled",
      })
    const [system] = gameDeckRules(game)
    await ctx.db.patch(player._id, {
      deckLabel: attachesDecks(system)
        ? await assertDeckLabel(ctx, system, args.deckLabel ?? undefined)
        : undefined,
    })
    await ctx.db.patch(game._id, { updatedAt: Date.now() })
    return null
  },
})
