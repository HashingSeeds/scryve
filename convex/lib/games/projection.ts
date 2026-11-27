import { ConvexError, v, type Infer } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import type { QueryCtx } from "../../_generated/server"
import { requireUser } from "../auth"
import { DEFAULT_DECK_GAME } from "../deckGames"
import {
  checkClientCreatedAt,
  checkDeviceId,
  checkOperationId,
  matchLifeRetry,
  matchTableRetry,
  rejectRequest,
} from "../gameEngine"
import {
  commanderField,
  commanderLethalDamage,
  isSameCommanderClaim,
  lastChangeFor,
  MAX_PENDING_COMMANDER_CLAIMS,
} from "../gameRules"
import { blockedUserIdsFor, publicUsernameFor } from "../moderation"
import { nameFailsGate } from "../nameFilter"
import { commanderOutState, outReason, type CommanderTotal, type OutState } from "../outReason"
import { inviteIsUsable } from "../policy"
import { attachesDecks, hasTable, systemDefinition, tableRules } from "../systems"
import {
  seatTable,
  MODES_TABLE_VERSION,
  TURN_TABLE_VERSION,
  tableActionIdentity,
  tableForVersion,
  tableActionValidator,
  type TableState,
} from "../table"
import { revealedModes } from "../tableModes"
import { treacheryOutcome } from "../treachery"
import { queryHandler } from "./handlers"
import {
  MAX_COMMANDER_DAMAGE_ROWS,
  NO_SEAT_DECK,
  appearanceOf,
  assertDeviceId,
  assertPublicId,
  currentUsableInvite,
  deckSelectionIsPlayable,
  gameByPublicId,
  gameDeckRules,
  holdsSeatOnDevice,
  playersForGame,
  seatLabelFor,
  sharedSeatKey,
  totalEventCount,
} from "./shared"

export function gameCommanderLethal(game: Doc<"games">) {
  return commanderLethalDamage(
    game.system ?? game.game ?? DEFAULT_DECK_GAME,
    game.format ?? game.ruleset,
  )
}

export function gameUnavailable() {
  return new ConvexError({ code: "forbidden", message: "Game unavailable" })
}

export function displayNameForViewer(
  player: Doc<"gamePlayers">,
  user: Doc<"users"> | null,
  { blocked, viewerIsHost }: { blocked: boolean; viewerIsHost: boolean },
) {
  if (blocked) return seatLabelFor(player)
  const resolved = (user ? publicUsernameFor(user) : undefined) ?? player.usernameAtJoin
  if (resolved !== undefined) return resolved
  if (player.deletedAt) return player.displayName
  if (player.userId !== undefined) return seatLabelFor(player)
  // why: a guest seat name is free text its host typed, so only the host sees it when it fails the filter.
  return viewerIsHost || !nameFailsGate(player.displayName)
    ? player.displayName
    : seatLabelFor(player)
}

async function displayNamesForViewer(
  ctx: QueryCtx,
  viewer: { user: Doc<"users">; isHost: boolean },
  players: Doc<"gamePlayers">[],
) {
  const blocked = await blockedUserIdsFor(ctx, viewer.user._id)
  const names = new Map<Id<"gamePlayers">, string>()
  const users = new Map([[viewer.user._id, viewer.user]])
  for (const player of players) {
    const user = player.userId
      ? (users.get(player.userId) ?? (await ctx.db.get(player.userId)))
      : null
    if (user) users.set(user._id, user)
    names.set(
      player._id,
      displayNameForViewer(player, user, {
        blocked: Boolean(player.userId && blocked.has(player.userId)),
        viewerIsHost: viewer.isHost,
      }),
    )
  }
  return names
}

async function commanderDamageProjection(
  ctx: QueryCtx,
  game: Doc<"games">,
  user: Doc<"users">,
  players: Doc<"gamePlayers">[],
) {
  const lethal = gameCommanderLethal(game)
  if (lethal === undefined) return null
  const totals = await ctx.db
    .query("gameCommanderDamage")
    .withIndex("by_game", (q) => q.eq("gameId", game._id))
    .take(MAX_COMMANDER_DAMAGE_ROWS)
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
    if (total.total >= lethal) eliminatedPlayerIds.add(total.toPlayerId)
  }
  return {
    totals: totals.map((total) => ({
      fromPlayerId: total.fromPlayerId,
      toPlayerId: total.toPlayerId,
      ...commanderField(total.commander),
      total: total.total,
    })),
    pendingClaims: pending
      .filter((claim) => ownedPlayerIds.has(claim.toPlayerId))
      .map((claim) => ({
        claimId: claim._id,
        operationId: claim.operationId,
        fromPlayerId: claim.fromPlayerId,
        toPlayerId: claim.toPlayerId,
        ...commanderField(claim.commander),
        delta: claim.delta,
        clientCreatedAt: claim.clientCreatedAt,
        createdAt: claim.createdAt,
      })),
    eliminatedPlayerIds: [...eliminatedPlayerIds],
  }
}

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
    commander: v.optional(v.number()),
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
  v.object({
    kind: v.literal("table.action"),
    operationId: v.string(),
    action: tableActionValidator,
    deviceId: v.string(),
    clientCreatedAt: v.number(),
  }),
)

export async function matchProjection(
  ctx: QueryCtx,
  game: Doc<"games">,
  viewer: { isHost: boolean; eventCount: number },
) {
  const match = game.matchId ? await ctx.db.get(game.matchId) : null
  if (match?.source !== "connected")
    return { bestOf: game.matchBestOf, gameNumber: game.matchGameNumber ?? 1 }
  const hasFinishedGame = game.status === "finished" || (game.matchGameNumber ?? 1) > 1
  const betweenGames =
    game.status === "finished" || (game.status === "active" && viewer.eventCount === 0)
  return {
    bestOf: match.bestOf,
    gameNumber: game.matchGameNumber ?? 1,
    status: match.status,
    seats: match.seats.map((seat) => ({
      seat: seat.seat,
      gamesWon: seat.gamesWon ?? 0,
      gamesDrawn: seat.gamesDrawn ?? 0,
      ...(seat.outcome ? { outcome: seat.outcome } : {}),
    })),
    ...(viewer.isHost &&
    match.status === "active" &&
    hasFinishedGame &&
    betweenGames &&
    match.gameIds.at(-1) === game._id
      ? { canEnd: true }
      : {}),
  }
}

export const lobbyProjection = queryHandler({
  args: {
    publicId: v.string(),
    deviceId: v.optional(v.string()),
    includeRecentOperationIds: v.optional(v.boolean()),
    operation: v.optional(connectedOperation),
    tableVersion: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    assertPublicId(args.publicId)
    if (args.deviceId) assertDeviceId(args.deviceId)
    const user = await requireUser(ctx)
    const game = await ctx.db
      .query("games")
      .withIndex("by_public_id", (q) => q.eq("publicId", args.publicId))
      .unique()
    if (!game) throw gameUnavailable()
    const players = await playersForGame(ctx, game._id)
    if (!players.some((player) => player.userId === user._id)) throw gameUnavailable()
    const isHost = game.hostUserId === user._id
    const decks = attachesDecks(gameDeckRules(game)[0])
    const recentEvents =
      args.includeRecentOperationIds !== false && game.status === "active"
        ? await ctx.db
            .query("gameEvents")
            .withIndex("by_game_server_time", (q) => q.eq("gameId", game._id))
            .order("desc")
            .take(100)
        : []
    const invite = isHost ? await currentUsableInvite(ctx, game, Date.now()) : null
    const displayNames = await displayNamesForViewer(ctx, { user, isHost }, players)
    const commanderDamage = await commanderDamageProjection(ctx, game, user, players)
    const eliminatedPlayerIds = new Set(commanderDamage?.eliminatedPlayerIds ?? [])
    const decidedOutcome =
      isHost && game.status === "active" && game.variant === "treachery"
        ? decidedTreacheryOutcome(game, players, commanderDamage?.totals ?? [])
        : undefined
    const eventCount = totalEventCount(game, players)
    const serverUpdatedAt = players.reduce(
      (latest, player) => Math.max(latest, player.lastEventAt ?? 0),
      game.updatedAt,
    )
    const lastChanged = players.reduce<Doc<"gamePlayers"> | undefined>(
      (latest, player) =>
        (player.lastEventAt ?? 0) > (latest?.lastEventAt ?? 0) ? player : latest,
      undefined,
    )
    const lastChange =
      game.status === "active"
        ? lastChangeFor(lastChanged, { userId: user._id, deviceId: args.deviceId }, game.hostUserId)
        : undefined
    return {
      schemaVersion: 1 as const,
      publicId: game.publicId,
      status: game.status,
      playerCount: game.playerCount,
      startingLife: game.startingLife,
      ...(game.lifeStep === undefined ? {} : { lifeStep: game.lifeStep }),
      ruleset: game.ruleset,
      deckRequired: decks && (game.deckRequired ?? false),
      game: game.game ?? DEFAULT_DECK_GAME,
      system: game.system ?? game.game ?? DEFAULT_DECK_GAME,
      format: game.format ?? game.ruleset,
      ...(game.variant ? { variant: game.variant } : {}),
      ...(game.modeSetup ? { modeSetup: game.modeSetup } : {}),
      ...(game.layout ? { layout: game.layout } : {}),
      ...(game.lifeEditing === "anyone" ? { lifeEditing: game.lifeEditing } : {}),
      ...(game.freeMulligans ? { freeMulligans: game.freeMulligans } : {}),
      ...(game.firstPlayerMode || game.firstPlayerId || game.firstChooser
        ? {
            firstPlayer: {
              ...(game.firstPlayerMode ? { mode: game.firstPlayerMode } : {}),
              ...(game.firstPlayerId ? { playerId: game.firstPlayerId } : {}),
              ...(game.firstRolls ? { rolls: game.firstRolls } : {}),
              ...(game.firstChooser ? { chooser: game.firstChooser } : {}),
            },
          }
        : {}),
      isHost,
      ...(game.rematchPublicId ? { rematchPublicId: game.rematchPublicId } : {}),
      ...(game.matchBestOf
        ? { match: await matchProjection(ctx, game, { isHost, eventCount }) }
        : {}),
      eventSequence: eventCount,
      ...(args.operation
        ? { operationStatus: await statusForOperation(ctx, game, user, eventCount, args.operation) }
        : {}),
      serverUpdatedAt,
      ...(lastChange ? { lastChange } : {}),
      recentOperationIds: recentEvents.map((event) => event.operationId),
      invitation:
        invite && inviteIsUsable(invite, Date.now())
          ? {
              token: invite.token,
              manualCode: invite.manualCode,
              expiresAt: invite.expiresAt,
            }
          : null,
      players: await Promise.all(
        players
          .sort((a, b) => a.seat - b.seat)
          .map((seat) => (decks ? seat : { ...seat, ...NO_SEAT_DECK }))
          .map(async (p) => ({
            playerId: p._id,
            seat: p.seat,
            displayName: displayNames.get(p._id) ?? seatLabelFor(p),
            // why: installed clients count a seat as having a deck only when this is set, so a shared deck's key fills it.
            deckVersionId: !p.deckVersionId
              ? sharedSeatKey(p)
              : game.status === "lobby" &&
                  !(await deckSelectionIsPlayable(ctx, p.deckVersionId, game))
                ? undefined
                : p.deckVersionId,
            color: p.color,
            shape: appearanceOf(p).shape,
            ...(p.proShape ? { proShape: p.proShape } : {}),
            ...(p.foil ? { foil: true } : {}),
            ...(isHost && p.deckLabel ? { deckLabel: p.deckLabel } : {}),
            currentLife: p.currentLife,
            ...(commanderDamage
              ? { eliminatedByCommanderDamage: eliminatedPlayerIds.has(p._id) }
              : {}),
            ...(p.editsAnySeat ? { editsAnySeat: true } : {}),
            ...(p.mulligans === undefined ? {} : { mulligans: p.mulligans }),
            controlledByMe:
              (p.userId === user._id || (p.userId === undefined && isHost)) &&
              (args.deviceId ? p.deviceId === undefined || p.deviceId === args.deviceId : true),
            ...roleForViewer(game, p, user._id, args.deviceId),
          })),
      ),
      ...(commanderDamage ? { commanderDamage } : {}),
      ...(decidedOutcome ? { treacheryOutcome: decidedOutcome } : {}),
      ...(hasTable(gameTableRules(game)) ||
      ((game.turn || game.turnGroups) && (args.tableVersion ?? 1) >= TURN_TABLE_VERSION) ||
      (game.modes && (args.tableVersion ?? 1) >= MODES_TABLE_VERSION)
        ? { table: tableForVersion(tableProjection(game, players), args.tableVersion) }
        : {}),
    }
  },
})

function roleForViewer(
  game: Doc<"games">,
  player: Doc<"gamePlayers">,
  viewerId: Id<"users">,
  deviceId?: string,
) {
  if (player.role === undefined) return {}
  const roleRevealed = player.roleRevealed === true
  return roleRevealed || holdsSeatOnDevice(player, viewerId, deviceId) || game.status !== "active"
    ? { role: player.role, roleRevealed }
    : { roleRevealed }
}

/* why: only Convex sees every hidden role, so it tells the host who won for the end screen.
   It is undefined until the rules decide the game, so it names no team before then. */
function decidedTreacheryOutcome(
  game: Doc<"games">,
  players: Doc<"gamePlayers">[],
  commanderTotals: readonly CommanderTotal<Id<"gamePlayers">>[],
) {
  const lethal = gameCommanderLethal(game)
  const outState: OutState<Id<"gamePlayers">> = {
    counter: systemDefinition(game.system ?? game.game)?.counter,
    tableRules: gameTableRules(game),
    table: tableProjection(game, players),
    lives: players.map((player) => ({ playerId: player._id, life: player.currentLife })),
    commanderDamage: commanderOutState(lethal, commanderTotals),
  }
  return treacheryOutcome(
    players.flatMap((player) =>
      player.role === undefined
        ? []
        : [{ playerId: player._id, role: player.role, inGame: !outReason(outState, player._id) }],
    ),
  )
}

function tableProjection(game: Doc<"games">, players: Doc<"gamePlayers">[]): TableState {
  return {
    designations: game.designations ?? {},
    players: Object.fromEntries(players.map((player) => [player._id, seatTable(player)])),
    ...(game.turn ? { turn: game.turn } : {}),
    ...(game.turnGroups ? { turnGroups: game.turnGroups } : {}),
    ...(game.modes ? { modes: revealedModes(game.modes) } : {}),
  }
}

export const connectedOperationStatus = queryHandler({
  args: { publicId: v.string(), operation: connectedOperation },
  handler: async (ctx, args) => {
    assertPublicId(args.publicId)

    const game = await gameByPublicId(ctx, args.publicId)
    const user = await requireUser(ctx)
    const players = await playersForGame(ctx, game._id)
    if (!players.some((player) => player.userId === user._id)) throw gameUnavailable()
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
  const invalid =
    checkOperationId(operation.operationId) ??
    (operation.kind === "commanderDamage.resolved"
      ? checkOperationId(operation.claimOperationId)
      : null) ??
    checkDeviceId(operation.deviceId) ??
    checkClientCreatedAt(operation.clientCreatedAt) ??
    (operation.kind === "life.changed"
      ? rejectRequest({ ...operation, kind: "life" })
      : operation.kind === "commanderDamage.submitted"
        ? rejectRequest({ ...operation, kind: "commander.claim" })
        : null)
  if (invalid) throw new Error(invalid.message)
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
  const reused = "Operation identifier was reused with different data"

  if (operation.kind === "commanderDamage.resolved") {
    const claim = await ctx.db
      .query("gameCommanderClaims")
      .withIndex("by_game_operation", (q) =>
        q.eq("gameId", game._id).eq("operationId", operation.claimOperationId),
      )
      .unique()
    // why: a settled claim counts every confirm or decline as done, as the mutation does, so an older app's queue drains.
    return !claim || claim.status === "pending" ? notFound() : acknowledged()
  }

  const event = await ctx.db
    .query("gameEvents")
    .withIndex("by_game_operation", (q) =>
      q.eq("gameId", game._id).eq("operationId", operation.operationId),
    )
    .unique()
  if (!event) return notFound()
  const request = { ...operation, actorUserId: user._id }
  const matches =
    request.kind === "life.changed"
      ? matchLifeRetry(event, request) === "duplicate"
      : request.kind === "table.action"
        ? matchTableRetry(event, request.action.playerId, {
            ...request,
            actionIdentity: tableActionIdentity(request.action),
          }) === "duplicate"
        : event.kind === "commanderDamage.claimed" && isSameCommanderClaim(event, request)
  return matches ? acknowledged() : conflict(reused)
}

export function gameTableRules(game: Doc<"games">) {
  return tableRules(game.system ?? game.game ?? DEFAULT_DECK_GAME, game.format ?? game.ruleset)
}
