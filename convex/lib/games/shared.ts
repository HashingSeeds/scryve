import { ConvexError } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../../_generated/server"
import { scoreHostedMatch } from "../../matches"
import {
  ACCEPTED_CONNECTED_PLAYER_MARK_SHAPES,
  MANY_SEAT_MARK_SHAPES,
  isPlayerMarkShape,
  shapeForSeat,
  type PlayerAppearance,
  type ProMarkShape,
  type TakenAppearance,
} from "../appearance"
import { DEFAULT_DECK_GAME } from "../deckGames"
import { canonicalResultId } from "../deckResults"
import { isSharedDeckKey } from "../deckShares"
import { hasFeature, PREMIUM_FEATURES } from "../entitlements"
import { checkDeviceId, checkOperationId } from "../gameEngine"
import { codeGuessWait, countCodeMiss } from "../gameRateLimits"
import { isLifeDelta } from "../gameRules"
import { gameWriteError } from "../gameWriteErrors"
import { publicUsernameFor } from "../moderation"
import { HIDDEN_DECK_NAME, nameFailsGate } from "../nameFilter"
import { deckIdentityOf, publicIdentity, type DeckLabel } from "../opponentDecks"
import { clientSeesSeats, inviteIsUsable, MAX_PLAYERS, normalizeManualCode } from "../policy"
import { recordGameResults } from "../results"
import { attachesDecks } from "../systems"
import { ARCHENEMY_MIN_SEATS, PLANECHASE_CAPABILITY } from "../tableModes"
import { isTeamPlayerCount, isTeamVariant, teamSeatsMessage } from "../teamVariants"
import {
  dealTreacheryRoles,
  isTreacheryPlayerCount,
  TREACHERY_SEATS_MESSAGE,
  type GameVariant,
} from "../treachery"
import { lobbyTeammateSeat } from "../twoHeadedGiant"

export const MAX_PLAYERS_PER_GAME_READ = MAX_PLAYERS + 1

export const MAX_COMMANDER_DAMAGE_ROWS =
  MAX_PLAYERS_PER_GAME_READ * (MAX_PLAYERS_PER_GAME_READ - 1) * 2

const MAX_INVITES_PER_GAME_READ = 20

export const NO_GAME_SYSTEM = "none"

export const NO_SEAT_DECK = {
  deckVersionId: undefined,
  deckKey: undefined,
  deckFingerprint: undefined,
  deckLabel: undefined,
}

export async function findGameByPublicId(ctx: QueryCtx, publicId: string) {
  assertPublicId(publicId)
  return await ctx.db
    .query("games")
    .withIndex("by_public_id", (q) => q.eq("publicId", publicId))
    .unique()
}

export async function gameByPublicId(ctx: QueryCtx, publicId: string) {
  const game = await findGameByPublicId(ctx, publicId)
  if (!game) throw gameWriteError("game_not_found", "Game not found")
  return game
}

export function assertPublicId(publicId: string) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(publicId)) throw new Error("Invalid public game identifier")
}

export function assertDeckRequirementSupported(gameSystem: string, deckRequired?: boolean) {
  if (gameSystem === NO_GAME_SYSTEM && deckRequired === true)
    throw new ConvexError({
      code: "deck_requirement_not_supported",
      message: "Decks cannot be required for a system-less lobby",
    })
}

export function assertLifeDelta(delta: number) {
  if (!isLifeDelta(delta))
    throw new Error("Life delta must be a non-zero whole number from -999999 to 999999")
}

export function assertOperationId(operationId: string) {
  if (checkOperationId(operationId)) throw new Error("Invalid operation identifier")
}

export function assertDeviceId(deviceId: string) {
  if (checkDeviceId(deviceId)) throw new Error("Invalid device identifier")
}

export const JOIN_ATTEMPT_WINDOW_MS = 60_000

export const MAX_JOIN_ATTEMPTS = 10

const TOO_MANY_JOINS_MESSAGE = "Too many join attempts; wait a minute and try again"

// why: production redacts plain Error messages to "Server Error"; ConvexError data reaches the client.
export function tooManyJoinAttempts() {
  return new ConvexError({ code: "too_many_join_attempts", message: TOO_MANY_JOINS_MESSAGE })
}

export async function joinAttemptsFor(ctx: QueryCtx, clerkUserId: string, kind?: "seatLookup") {
  return await ctx.db
    .query("joinAttempts")
    .withIndex("by_clerk_user_kind", (q) => q.eq("clerkUserId", clerkUserId).eq("kind", kind))
    .unique()
}

export async function consumeJoinAttempt(
  ctx: MutationCtx,
  clerkUserId: string,
  kind?: "seatLookup",
) {
  const now = Date.now()
  const record = await joinAttemptsFor(ctx, clerkUserId, kind)
  if (!record || now - record.windowStartedAt >= JOIN_ATTEMPT_WINDOW_MS) {
    if (record) await ctx.db.patch(record._id, { windowStartedAt: now, attempts: 1 })
    else
      await ctx.db.insert("joinAttempts", {
        clerkUserId,
        windowStartedAt: now,
        attempts: 1,
        ...(kind ? { kind } : {}),
      })
    return
  }
  if (record.attempts >= MAX_JOIN_ATTEMPTS) {
    if (kind === "seatLookup") return ctx.db.patch(record._id, { attempts: record.attempts + 1 })
    throw tooManyJoinAttempts()
  }
  await ctx.db.patch(record._id, { attempts: record.attempts + 1 })
}

// why: a malformed code can never match an invite, so it counts as a wrong one instead of throwing and rolling back the attempt.
function manualCodeOrUndefined(code: string) {
  try {
    return normalizeManualCode(code)
  } catch {
    return undefined
  }
}

export function inviteKey(args: { token?: string; manualCode?: string }) {
  if (args.token) return args.token
  return args.manualCode ? (manualCodeOrUndefined(args.manualCode) ?? args.manualCode) : ""
}

const guessable = (args: { token?: string; manualCode?: string }) =>
  !args.token && !!args.manualCode

export async function assertInviteGuessesOpen(
  ctx: MutationCtx,
  args: { token?: string; manualCode?: string },
) {
  if (guessable(args) && (await codeGuessWait(ctx, "games")) !== undefined)
    throw tooManyJoinAttempts()
}

/** why: callers must return rather than throw after this, or the spent token rolls back. */
export async function countMissedCode(
  ctx: MutationCtx,
  args: { token?: string; manualCode?: string },
) {
  if (guessable(args)) await countCodeMiss(ctx, "games")
}

export async function joinableInviteGame(
  ctx: QueryCtx,
  args: { token?: string; manualCode?: string },
) {
  const invite = await findInvite(ctx, args)
  if (!invite) return null
  const game = await ctx.db.get(invite.gameId)
  if (
    !game ||
    (game.status !== "lobby" && game.status !== "active") ||
    !(await inviteIsCurrent(ctx, game, invite, Date.now()))
  )
    return null
  return game
}

/** why: clients that send no `systems` show unknown systems as Magic and know none beyond these three, so a newer system asks them to update. Builds older than Yu-Gi-Oh! and Pokémon still join those, as before this check. */
const SYSTEMS_BEFORE_CLIENT_LIST: readonly string[] = ["mtg", "ygo", "pokemon"]

/** why: clients list the variants they can play; ones from before the list play none. */
export function assertClientPlaysGame(
  game: Doc<"games">,
  {
    systems = SYSTEMS_BEFORE_CLIENT_LIST,
    variants = [],
  }: { systems?: readonly string[]; variants?: readonly string[] },
) {
  const system = game.system ?? game.game
  if (
    (system === undefined || system === NO_GAME_SYSTEM || systems.includes(system)) &&
    (game.variant === undefined || variants.includes(game.variant)) &&
    (!usesPlanechase(game) || variants.includes(PLANECHASE_CAPABILITY))
  )
    return
  throw new ConvexError({ code: "update_required", message: "Update Scryve to join this game" })
}

const usesPlanechase = (game: Pick<Doc<"games">, "modes" | "modeSetup">) =>
  Boolean(game.modes?.planechase ?? game.modeSetup?.planechase)

/** why: clients from before `maxSeats` draw at most six seats, so a bigger game asks them to update. */
export function assertClientSeesSeats(game: Doc<"games">, { maxSeats }: { maxSeats?: number }) {
  if (!clientSeesSeats(game.playerCount, maxSeats))
    throw new ConvexError({ code: "update_required", message: "Update Scryve to join this game" })
}

export const connectedMarkShapes = (playerCount: number) =>
  clientSeesSeats(playerCount) ? ACCEPTED_CONNECTED_PLAYER_MARK_SHAPES : MANY_SEAT_MARK_SHAPES

export function seatLabelFor(player: { seat: number }) {
  return `Player ${player.seat}`
}

export function summaryIdentitySnapshotFor(
  player: Doc<"gamePlayers">,
  user: Doc<"users"> | null,
  localGame = false,
): { displayName: string; usernameAtFinish?: string } {
  const resolved = user ? publicUsernameFor(user) : undefined
  if (resolved) return { displayName: resolved, usernameAtFinish: resolved }
  if (player.deletedAt || localGame) return { displayName: player.displayName }
  if (player.usernameAtJoin)
    return { displayName: player.usernameAtJoin, usernameAtFinish: player.usernameAtJoin }
  return { displayName: seatLabelFor(player) }
}

export function maskSummaryPlayersForViewer(
  players: Doc<"gameSummaries">["players"],
  viewerUserId: Id<"users">,
  blocked: Set<Id<"users">>,
  options: { localGame?: boolean } = {},
) {
  return players.map((rawPlayer) => {
    const { deckNameAtFinish, deckLabel } = rawPlayer
    const player =
      rawPlayer.userId === viewerUserId
        ? rawPlayer
        : {
            ...rawPlayer,
            ...(deckNameAtFinish !== undefined && nameFailsGate(deckNameAtFinish)
              ? { deckNameAtFinish: HIDDEN_DECK_NAME }
              : {}),
            ...(deckLabel?.identity
              ? { deckLabel: { ...deckLabel, identity: publicIdentity(deckLabel.identity) } }
              : {}),
          }
    if (player.userId && blocked.has(player.userId)) {
      const { usernameAtFinish: _, ...masked } = player
      return { ...masked, displayName: seatLabelFor(player) }
    }
    return {
      ...player,
      displayName:
        player.usernameAtFinish ??
        (player.deletedAt || options.localGame ? player.displayName : seatLabelFor(player)),
    }
  })
}

export function appearanceOf(player: Doc<"gamePlayers">): PlayerAppearance {
  return {
    color: player.color,
    shape: isPlayerMarkShape(player.shape) ? player.shape : shapeForSeat(player.seat),
  }
}

export async function proMarkFor(ctx: MutationCtx, user: Doc<"users">, proShape: ProMarkShape) {
  if (!(await hasFeature(ctx, user, PREMIUM_FEATURES.proDecksLimit))) return null
  const foil = await hasFeature(ctx, user, PREMIUM_FEATURES.foil)
  return { proShape, ...(foil ? { foil } : {}) }
}

export function takenAppearances(
  players: Doc<"gamePlayers">[],
  exceptPlayerId?: Id<"gamePlayers">,
  teammate?: Doc<"gamePlayers">,
): TakenAppearance[] {
  return players
    .filter((player) => player._id !== exceptPlayerId)
    .map((player) =>
      player._id === teammate?._id ? { shape: appearanceOf(player).shape } : appearanceOf(player),
    )
}

export const lobbyTeammate = (game: Doc<"games">, players: Doc<"gamePlayers">[], seat: number) =>
  isTeamVariant(game.variant)
    ? players.find((player) => player.seat === lobbyTeammateSeat(seat))
    : undefined

export async function playersForGame(ctx: QueryCtx, gameId: Id<"games">) {
  const players = await ctx.db
    .query("gamePlayers")
    .withIndex("by_game", (q) => q.eq("gameId", gameId))
    .take(MAX_PLAYERS_PER_GAME_READ)
  if (players.length > MAX_PLAYERS) throw new Error(`Game has more than ${MAX_PLAYERS} seats`)
  return players
}

export function gameDeckRules(game: Doc<"games">) {
  return [game.system ?? game.game ?? DEFAULT_DECK_GAME, game.format ?? game.ruleset] as const
}

export async function deckSelectionIsPlayable(
  ctx: QueryCtx,
  deckVersionId: Id<"deckVersions">,
  game: Doc<"games">,
) {
  const version = await ctx.db.get(deckVersionId)
  if (!version || version.archivedAt !== undefined) return false
  const deck = await ctx.db.get(version.deckId)
  const [system, format] = gameDeckRules(game)
  return (
    deck !== null &&
    deck.archivedAt === undefined &&
    (deck.game ?? DEFAULT_DECK_GAME) === system &&
    deck.format === format
  )
}

/** why: a seat playing someone's shared deck has its key and list but no deck version of its own. */
export function sharedSeatKey(player: Pick<Doc<"gamePlayers">, "deckVersionId" | "deckKey">) {
  return player.deckVersionId === undefined && isSharedDeckKey(player.deckKey)
    ? player.deckKey
    : undefined
}

/** why: unclaimed seats belong to the host, so only apps holding a seat decide whether editing opens. */
export function lifeEditingFor(
  players: readonly Pick<Doc<"gamePlayers">, "userId" | "editsAnySeat">[],
) {
  return players.every((player) => player.userId === undefined || player.editsAnySeat)
    ? { lifeEditing: "anyone" as const }
    : {}
}

export function totalEventCount(game: Doc<"games">, players: Doc<"gamePlayers">[]) {
  return (
    (game.eventSequence ?? 0) +
    players.reduce((total, player) => total + (player.eventCount ?? 0), 0)
  )
}

export function isUntouchedRematch(game: Doc<"games">, players: Doc<"gamePlayers">[]) {
  return game.rematchOfGameId !== undefined && totalEventCount(game, players) === 0
}

export async function clearWayToHost(ctx: MutationCtx, hostUserId: Id<"users">) {
  for (const status of ["lobby", "active"] as const) {
    const existingHostedGame = await ctx.db
      .query("games")
      .withIndex("by_host_status", (q) => q.eq("hostUserId", hostUserId).eq("status", status))
      .first()
    if (!existingHostedGame) continue
    if (
      status === "active" &&
      isUntouchedRematch(existingHostedGame, await playersForGame(ctx, existingHostedGame._id))
    ) {
      await terminalizeGame(ctx, existingHostedGame, "abandoned", "host_abandoned", hostUserId)
      continue
    }
    throw new ConvexError({
      code: "already_hosting",
      message: "You already host a lobby or active game; resume it before hosting another",
    })
  }
}

export async function findInvite(
  ctx: QueryCtx,
  args: { token?: string; manualCode?: string },
): Promise<Doc<"invitations"> | null> {
  if (args.token)
    return await ctx.db
      .query("invitations")
      .withIndex("by_token", (q) => q.eq("token", args.token!))
      .unique()
  const manualCode = args.manualCode ? manualCodeOrUndefined(args.manualCode) : undefined
  if (manualCode)
    return await ctx.db
      .query("invitations")
      .withIndex("by_manual_code", (q) => q.eq("manualCode", manualCode))
      .unique()
  return null
}

export async function allocateInvite(
  ctx: QueryCtx,
  inviteToken: string,
  manualCodeCandidates: string[],
) {
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

export async function currentUsableInvite(
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

export async function inviteIsCurrent(
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

export async function labelWithIdentity(
  ctx: QueryCtx,
  label: DeckLabel | undefined,
  version: Doc<"deckVersions"> | null,
  game: Doc<"games">,
): Promise<DeckLabel | undefined> {
  const identity =
    version && version.archivedAt === undefined
      ? await deckIdentityOf(ctx, version._id, ...gameDeckRules(game))
      : undefined
  return identity ? { ...label, identity } : label
}

export async function terminalizeGame(
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
  options: {
    finishedAt?: number
    historySource?: "local"
    nearby?: boolean
    matchId?: Id<"matches">
    clientGameId?: string
    firstPlayerId?: Id<"gamePlayers">
    localIds?: Map<Id<"gamePlayers">, string>
    deckNames?: Map<Id<"gamePlayers">, string>
  } = {},
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
  const recordsHistory = !(status === "abandoned" && isUntouchedRematch(game, players))
  if (!recordsHistory && game.rematchOfGameId)
    await ctx.db.patch(game.rematchOfGameId, { rematchPublicId: undefined })
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
  const finishedAt = options.finishedAt ?? now
  const hostedMatchId = game.mode === "connected" ? game.matchId : undefined
  const matchId = options.matchId ?? hostedMatchId
  const decks = attachesDecks(gameDeckRules(game)[0])
  const summaryPlayers = await Promise.all(
    players
      .sort((a, b) => a.seat - b.seat)
      .map((seat) => (decks ? seat : { ...seat, ...NO_SEAT_DECK }))
      .map(async (player) => {
        const user = player.userId ? await ctx.db.get(player.userId) : null
        const version = player.deckVersionId ? await ctx.db.get(player.deckVersionId) : null
        const deck = version ? await ctx.db.get(version.deckId) : null
        const deckLabel = await labelWithIdentity(ctx, player.deckLabel, version, game)
        return {
          playerId: player._id,
          resultId: canonicalResultId({
            kind: "game",
            publicId: game.publicId,
            playerId: player._id,
            clientGameId: options.clientGameId,
            localId: options.localIds?.get(player._id),
          }),
          ...(options.localIds?.has(player._id)
            ? { localId: options.localIds.get(player._id) }
            : {}),
          ...(player.deckKey ? { deckKey: player.deckKey } : {}),
          ...(player.deckFingerprint ? { deckFingerprint: player.deckFingerprint } : {}),
          ...(deckLabel ? { deckLabel } : {}),
          seat: player.seat,
          ...summaryIdentitySnapshotFor(player, user, game.mode === "local"),
          ...(player.userId ? { userId: player.userId } : {}),
          ...(deck
            ? { deckId: deck._id, deckNameAtFinish: deck.name }
            : player.deckKey && options.deckNames?.has(player._id)
              ? { deckNameAtFinish: options.deckNames.get(player._id) }
              : sharedSeatKey(player) && player.deckLabel?.name
                ? { deckNameAtFinish: player.deckLabel.name }
                : {}),
          ...(version
            ? { deckVersionId: version._id, deckVersionNumber: version.versionNumber }
            : {}),
          outcome: outcomeFor(player._id),
          color: player.color,
          shape: appearanceOf(player).shape,
          finalLife: player.currentLife,
          ...(game.freeMulligans && player.mulligans !== undefined
            ? { mulligans: player.mulligans }
            : {}),
        }
      }),
  )
  const summaryId = await ctx.db.insert("gameSummaries", {
    clientGameId: options.clientGameId ?? game.publicId,
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
    finishedAt,
    players: summaryPlayers,
    ...((options.firstPlayerId ?? game.firstPlayerId)
      ? { firstPlayerId: options.firstPlayerId ?? game.firstPlayerId }
      : {}),
    ...(game.freeMulligans ? { freeMulligans: game.freeMulligans } : {}),
    resultKind: result.kind,
    ...(result.kind === "win" ? { winnerPlayerIds: result.winnerPlayerIds } : {}),
    ...(matchId ? { matchId } : {}),
    ...(game.turnGroups ? { turnGroups: game.turnGroups } : {}),
    ...(game.variant ? { variant: game.variant } : {}),
    ...(options.nearby ? { nearby: true as const } : {}),
  })
  const summary = (await ctx.db.get(summaryId))!
  const playersByUser = new Map<Id<"users">, typeof summaryPlayers>()
  for (const player of recordsHistory ? summaryPlayers : []) {
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
      ...(options.historySource ? { source: options.historySource } : {}),
      gameId: game._id,
      summaryId,
      ...(matchId ? { matchId } : {}),
      finishedAt,
      outcome,
    })
  }
  await recordGameResults(ctx, summary)
  await ctx.db.patch(game._id, { status, updatedAt: now })
  for (const player of players)
    await ctx.db.patch(player._id, { resumable: false, ...(decks ? {} : NO_SEAT_DECK) })
  if (hostedMatchId) await scoreHostedMatch(ctx, game, summary, { discarded: !recordsHistory })
  return summary
}

export async function terminalizeGameForAccountDeletion(ctx: MutationCtx, game: Doc<"games">) {
  if (game.status !== "lobby" && game.status !== "active") return null
  return await terminalizeGame(ctx, game, "abandoned", "account_deleted")
}

// why: one account may hold seats on two devices, so a hidden role needs an exact device match.
export function holdsSeatOnDevice(
  player: Doc<"gamePlayers">,
  userId: Id<"users">,
  deviceId?: string,
) {
  return player.userId === userId && deviceId !== undefined && player.deviceId === deviceId
}

export function assertVariantSeats(variant: GameVariant, playerCount: number) {
  if (variant === "treachery" && !isTreacheryPlayerCount(playerCount))
    throw new Error(TREACHERY_SEATS_MESSAGE)
  if (isTeamVariant(variant) && !isTeamPlayerCount(variant, playerCount))
    throw new Error(teamSeatsMessage(variant))
  if (variant === "archenemy" && playerCount < ARCHENEMY_MIN_SEATS)
    throw new Error("Archenemy needs at least 3 seats")
}

export function rolesFor(game: Doc<"games">, playerCount: number) {
  if (game.variant !== "treachery") return undefined
  return dealTreacheryRoles(playerCount).map((role) => ({
    role,
    roleRevealed: role === "leader",
  }))
}
