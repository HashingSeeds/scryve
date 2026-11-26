import { ConvexError, v, type Infer } from "convex/values"

import type { Doc, Id } from "../../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../../_generated/server"
import {
  bestOfValidator,
  linkPublishedGameToMatch,
  openHostedMatch,
  publishedMatchValidator,
} from "../../matches"
import { resolvePlayerAppearances } from "../appearance"
import { requireUser } from "../auth"
import { assertDeckGameFormat, DEFAULT_DECK_GAME } from "../deckGames"
import { assertDeckKey, assertDeckFingerprint, pinnedDeck } from "../deckKeys"
import { limitResultRate } from "../deckRateLimits"
import { sharedSeatDeck, type SharedSeatDeck } from "../deckShares"
import { gatedTableState } from "../gameEngine"
import { storedDesignations } from "../gameEngineConvex"
import { limitGameRate } from "../gameRateLimits"
import {
  commanderField,
  isCommanderFormat,
  isCommanderSlot,
  MAX_COMMANDER_DAMAGE,
  MAX_SNAPSHOT_LIFE,
  type CommanderSlot,
} from "../gameRules"
import { insertGame } from "./setup"
import { assertGameSystem, requireReleasedCapability } from "../integrations"
import { playerGridLayoutValidator } from "../layouts"
import { MAX_GAMES_PER_MATCH, winsNeeded, type MatchBestOf } from "../matchResults"
import { isBlockedBetween } from "../moderation"
import { freeMulligansValidator, isMulliganCount, mulliganHandSize } from "../mulligans"
import { assertDeckLabel, deckLabelValidator } from "../opponentDecks"
import {
  assertAllowedColor,
  assertAllowedShape,
  assertDisplayName,
  assertInviteToken,
  assertManualCodeCandidates,
  assertPlayerCount,
  assertRuleset,
  assertStartingLife,
  INVITE_LIFETIME_MS,
} from "../policy"
import { recordPlayerResult, refreshGameOpponents } from "../results"
import { hashSeatPassToken, isSeatPassHash, nearbyGamePublicId } from "../seatPass"
import { attachesDecks, startingValueRange, systemDefinition, tableRules } from "../systems"
import {
  canonicalJson,
  isValidTableSnapshot,
  remapTableState,
  seatTable,
  tableStateValidator,
} from "../table"
import { isTeamVariant } from "../teamVariants"
import { gameVariantValidator } from "../treachery"
import { mutationHandler } from "./handlers"
import {
  JOIN_ATTEMPT_WINDOW_MS,
  MAX_COMMANDER_DAMAGE_ROWS,
  MAX_JOIN_ATTEMPTS,
  NO_GAME_SYSTEM,
  NO_SEAT_DECK,
  allocateInvite,
  assertClientPlaysGame,
  assertClientSeesSeats,
  assertDeviceId,
  assertInviteGuessesOpen,
  assertLifeDelta,
  assertOperationId,
  assertPublicId,
  assertVariantSeats,
  clearWayToHost,
  connectedMarkShapes,
  consumeJoinAttempt,
  countMissedCode,
  findGameByPublicId,
  gameDeckRules,
  inviteKey,
  joinAttemptsFor,
  joinableInviteGame,
  labelWithIdentity,
  playersForGame,
  summaryIdentitySnapshotFor,
  terminalizeGame,
  tooManyJoinAttempts,
} from "./shared"

function assertCommanderSlot(commander: number | undefined): asserts commander is CommanderSlot {
  if (!isCommanderSlot(commander))
    throw new Error("Commander must be omitted for the first commander or 1 for the partner")
}

function assertLocalId(localId: string) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(localId)) throw new Error("Invalid local player identifier")
}

function assertSnapshotLife(life: number) {
  if (!Number.isInteger(life) || Math.abs(life) > MAX_SNAPSHOT_LIFE)
    throw new Error("Snapshot life must be a whole number between -1000000 and 1000000")
}

/**
 * why: callers must return rather than throw after this, because a thrown error rolls the
 * counter back. The remembered invite lets claimSeat keep throwing for clients that predate this.
 */
async function recordFailedInvite(
  ctx: MutationCtx,
  clerkUserId: string,
  args: { token?: string; manualCode?: string },
) {
  await consumeJoinAttempt(ctx, clerkUserId)
  await countMissedCode(ctx, args)
  const record = await joinAttemptsFor(ctx, clerkUserId)
  if (record)
    await ctx.db.patch(record._id, { failedInvite: inviteKey(args), failedInviteAt: Date.now() })
}

const localTeamSeats = (
  groups: string[][] | undefined,
  players: { localId: string; seat: number }[],
) =>
  groups?.every((group) => group.length === 2)
    ? groups.map((group) =>
        group.flatMap(
          (localId) => players.find((player) => player.localId === localId)?.seat ?? [],
        ),
      )
    : []

const localSnapshotPlayer = v.object({
  localId: v.string(),
  seat: v.number(),
  displayName: v.string(),
  color: v.string(),
  shape: v.optional(v.string()),
  currentLife: v.number(),
})

async function resolveLocalGameSetup(
  ctx: QueryCtx,
  args: {
    system?: string
    format?: string
    ruleset: string
    startingLife: number
    lifeStep?: number
  },
) {
  const gameSystem =
    args.system === undefined || args.system === NO_GAME_SYSTEM
      ? NO_GAME_SYSTEM
      : assertGameSystem(args.system)
  const noSystem = gameSystem === NO_GAME_SYSTEM
  if (!noSystem) await requireReleasedCapability(ctx, gameSystem, "playTracking")
  assertStartingLife(args.startingLife, startingValueRange(gameSystem))
  if (args.lifeStep !== undefined) {
    assertLifeDelta(args.lifeStep)
    if (args.lifeStep < 1) throw new Error("Life step must be positive")
  }
  const ruleset = assertRuleset(args.ruleset)
  const format = noSystem
    ? undefined
    : args.format === undefined
      ? ruleset
      : assertDeckGameFormat(gameSystem, args.format)
  return { gameSystem, ruleset, format }
}

function assertSnapshotPlayers(players: Infer<typeof localSnapshotPlayer>[]) {
  assertPlayerCount(players.length)
  const localIds = new Set<string>()
  const seats = new Set<number>()
  for (const player of players) {
    assertLocalId(player.localId)
    assertDisplayName(player.displayName)
    assertAllowedColor(player.color)
    if (player.shape !== undefined) assertAllowedShape(player.shape)
    assertSnapshotLife(player.currentLife)
    if (localIds.has(player.localId)) throw new Error("Local player identifiers must be unique")
    localIds.add(player.localId)
    if (
      !Number.isInteger(player.seat) ||
      player.seat < 1 ||
      player.seat > players.length ||
      seats.has(player.seat)
    )
      throw new Error("Snapshot seats must be unique numbers from 1 to the player count")
    seats.add(player.seat)
  }
  return { localIds, seats }
}

function carriedMatchScore(
  match: {
    bestOf: MatchBestOf
    gameNumber: number
    gamesDrawn: number
    seats: { seat: number; gamesWon: number }[]
  },
  seats: ReadonlySet<number>,
) {
  const gamesWon = new Map(match.seats.map(({ seat, gamesWon }) => [seat, gamesWon]))
  const played = match.gameNumber - 1
  if (
    !Number.isInteger(match.gameNumber) ||
    match.gameNumber < 1 ||
    match.gameNumber > MAX_GAMES_PER_MATCH ||
    !Number.isInteger(match.gamesDrawn) ||
    match.gamesDrawn < 0 ||
    match.gamesDrawn > played ||
    gamesWon.size !== match.seats.length ||
    gamesWon.size !== seats.size ||
    match.seats.some(
      ({ seat, gamesWon: won }) =>
        !seats.has(seat) ||
        !Number.isInteger(won) ||
        won < 0 ||
        won > played ||
        won >= winsNeeded(match.bestOf),
    )
  )
    throw new Error("The match score does not fit this game")
  return { gameNumber: match.gameNumber, gamesDrawn: match.gamesDrawn, gamesWon }
}

export const publishLocalGame = mutationHandler({
  args: {
    operationId: v.string(),
    publicId: v.string(),
    system: v.optional(v.string()),
    format: v.optional(v.string()),
    ruleset: v.string(),
    startingLife: v.number(),
    lifeStep: v.optional(v.number()),
    inviteToken: v.string(),
    manualCodeCandidates: v.array(v.string()),
    deviceId: v.optional(v.string()),
    hostLocalId: v.string(),
    players: v.array(localSnapshotPlayer),
    commanderTotals: v.optional(
      v.array(
        v.object({
          fromSeat: v.number(),
          toSeat: v.number(),
          commander: v.optional(v.number()),
          total: v.number(),
        }),
      ),
    ),
    table: v.optional(tableStateValidator),
    layout: v.optional(playerGridLayoutValidator),
    // why: kept out of the receipt key, so a retry after the host updates the app still matches its first publish.
    editsAnySeat: v.optional(v.boolean()),
    variant: v.optional(gameVariantValidator),
    match: v.optional(
      v.object({
        bestOf: bestOfValidator,
        gameNumber: v.number(),
        gamesDrawn: v.number(),
        seats: v.array(v.object({ seat: v.number(), gamesWon: v.number() })),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    assertOperationId(args.operationId)
    assertPublicId(args.publicId)
    assertInviteToken(args.inviteToken)
    assertManualCodeCandidates(args.manualCodeCandidates)
    if (args.deviceId) assertDeviceId(args.deviceId)
    assertLocalId(args.hostLocalId)
    const { gameSystem, ruleset, format } = await resolveLocalGameSetup(ctx, args)
    const { localIds, seats } = assertSnapshotPlayers(args.players)
    if (!localIds.has(args.hostLocalId))
      throw new Error("Host seat must be one of the snapshot players")
    const commanderGame = isCommanderFormat(gameSystem, format ?? ruleset)
    if ((args.commanderTotals ?? []).length > 0 && !commanderGame)
      throw new Error("Commander damage totals are only supported in Commander games")
    const totalPairs = new Set<string>()
    const totals = (args.commanderTotals ?? []).map((total) => {
      if (!seats.has(total.fromSeat) || !seats.has(total.toSeat) || total.fromSeat === total.toSeat)
        throw new Error("Commander damage totals must reference distinct snapshot seats")
      assertCommanderSlot(total.commander)
      const pair = `${total.fromSeat}->${total.toSeat}:${total.commander ?? 0}`
      if (totalPairs.has(pair)) throw new Error("Duplicate commander damage pair")
      totalPairs.add(pair)
      if (!Number.isInteger(total.total) || total.total < 0 || total.total > MAX_COMMANDER_DAMAGE)
        throw new Error(`Commander damage total must be between 0 and ${MAX_COMMANDER_DAMAGE}`)
      return { ...total, commander: total.commander }
    })
    if (totalPairs.size > MAX_COMMANDER_DAMAGE_ROWS)
      throw new Error("Too many commander damage totals")
    if (args.table && !isValidTableSnapshot(args.table, tableRules(gameSystem, format), localIds))
      throw new Error("Table state does not fit this game")
    if (args.variant !== undefined) {
      if (
        !isTeamVariant(args.variant) ||
        !systemDefinition(gameSystem)?.variants.includes(args.variant) ||
        !args.table?.turnGroups
      )
        throw new Error("Only a team game with its teams can keep its variant")
      assertVariantSeats(args.variant, args.players.length)
    }
    const carried = args.match && carriedMatchScore(args.match, seats)
    const requestKey = JSON.stringify([
      args.publicId,
      args.system ?? null,
      args.format ?? null,
      args.ruleset,
      args.startingLife,
      args.lifeStep ?? null,
      args.inviteToken,
      args.manualCodeCandidates,
      args.deviceId ?? null,
      args.hostLocalId,
      args.players.map((player) => [
        player.localId,
        player.seat,
        player.displayName,
        player.color,
        player.shape ?? null,
        player.currentLife,
      ]),
      args.commanderTotals ?? null,
      // why: appended only when sent, so receipts written before tables existed keep their key.
      ...(args.table ? [canonicalJson(args.table)] : []),
      ...(args.layout ? [args.layout] : []),
      ...(args.variant ? [args.variant] : []),
      ...(args.match ? [canonicalJson(args.match)] : []),
    ])
    const receipt = await ctx.db
      .query("gamePublishReceipts")
      .withIndex("by_owner_and_operation_id", (q) =>
        q.eq("ownerUserId", user._id).eq("operationId", args.operationId),
      )
      .unique()
    if (receipt) {
      if (receipt.requestKey !== requestKey)
        throw new Error("Operation identifier was reused with different data")
      return {
        publicId: receipt.publicId,
        manualCode: receipt.manualCode,
        expiresAt: receipt.expiresAt,
        players: receipt.players,
      }
    }
    await limitGameRate(ctx, "lobbyCreate", user._id)
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
    const expiresAt = now + INVITE_LIFETIME_MS
    const gameId = await insertGame(
      ctx,
      {
        startingLife: args.startingLife,
        lifeStep: args.lifeStep,
        ruleset,
        deckRequired: undefined,
        game: gameSystem,
        system: gameSystem,
        format,
        variant: args.variant,
        modeSetup: undefined,
        layout: args.layout,
        lifeEditing: args.editsAnySeat ? "anyone" : undefined,
        matchBestOf: args.match?.bestOf,
        firstPlayerMode: undefined,
        freeMulligans: undefined,
      },
      {
        publicId: args.publicId,
        hostUserId: user._id,
        mode: "connected",
        status: "active",
        playerCount: args.players.length,
        createdAt: now,
        startedAt: now,
        updatedAt: now,
        eventSequence: 0,
      },
    )
    const mapping: { localId: string; playerId: Id<"gamePlayers">; seat: number }[] = []
    const playerIdsBySeat = new Map<number, Id<"gamePlayers">>()
    for (const player of resolvePlayerAppearances(
      args.players,
      connectedMarkShapes(args.players.length),
      localTeamSeats(args.table?.turnGroups, args.players),
    )) {
      const isHost = player.localId === args.hostLocalId
      const playerId = await ctx.db.insert("gamePlayers", {
        gameId,
        seat: player.seat,
        ...(isHost ? { userId: user._id } : {}),
        ...(isHost && args.deviceId ? { deviceId: args.deviceId } : {}),
        displayName: assertDisplayName(player.displayName),
        ...(isHost ? { usernameAtJoin: user.username } : {}),
        color: player.color,
        shape: player.shape,
        currentLife: player.currentLife,
        eventCount: 0,
        resumable: true,
        joinedAt: now,
        ...(isHost && args.editsAnySeat ? { editsAnySeat: true } : {}),
      })
      mapping.push({ localId: player.localId, playerId, seat: player.seat })
      playerIdsBySeat.set(player.seat, playerId)
    }
    if (args.table) {
      const playerIdsByLocalId = new Map(
        mapping.map(({ localId, playerId }) => [localId, playerId]),
      )
      const table = remapTableState(gatedTableState(args.table), (localId) =>
        playerIdsByLocalId.get(localId)!,
      )
      for (const [playerId, player] of Object.entries(table.players)) {
        const id = ctx.db.normalizeId("gamePlayers", playerId)
        if (id) await ctx.db.patch(id, seatTable(player))
      }
      if (Object.keys(table.designations).length > 0)
        await ctx.db.patch(gameId, { designations: storedDesignations(ctx, table.designations) })
      if (table.turn || table.turnGroups)
        await ctx.db.patch(gameId, {
          ...(table.turn ? { turn: table.turn } : {}),
          ...(table.turnGroups ? { turnGroups: table.turnGroups } : {}),
        })
    }
    for (const total of totals) {
      await ctx.db.insert("gameCommanderDamage", {
        gameId,
        fromPlayerId: playerIdsBySeat.get(total.fromSeat)!,
        toPlayerId: playerIdsBySeat.get(total.toSeat)!,
        ...commanderField(total.commander),
        total: total.total,
        updatedAt: now,
      })
    }
    if (args.match && carried)
      await openHostedMatch(
        ctx,
        (await ctx.db.get(gameId))!,
        await playersForGame(ctx, gameId),
        args.match.bestOf,
        carried,
      )
    const invitationId = await ctx.db.insert("invitations", {
      gameId,
      token: args.inviteToken,
      manualCode,
      expiresAt,
      createdAt: now,
    })
    await ctx.db.patch(gameId, { currentInvitationId: invitationId })
    await ctx.db.insert("gamePublishReceipts", {
      ownerUserId: user._id,
      operationId: args.operationId,
      requestKey,
      publicId: args.publicId,
      manualCode,
      expiresAt,
      players: mapping,
    })
    return { publicId: args.publicId, manualCode, expiresAt, players: mapping }
  },
})

const MAX_LOCAL_EVENT_COUNT = 100_000

const LOCAL_FINISH_CLOCK_SKEW_MS = 5 * 60 * 1000

// why: the local game id doubles as the public id, so a retry by the same account returns the first publish instead of a duplicate.
export const publishFinishedLocalGame = mutationHandler({
  args: {
    publicId: v.string(),
    retriesThrottled: v.optional(v.boolean()),
    system: v.optional(v.string()),
    format: v.optional(v.string()),
    ruleset: v.string(),
    startingLife: v.number(),
    lifeStep: v.optional(v.number()),
    startedAt: v.number(),
    finishedAt: v.number(),
    eventCount: v.number(),
    nearby: v.optional(v.boolean()),
    logged: v.optional(v.boolean()),
    firstPlayerLocalId: v.optional(v.string()),
    freeMulligans: v.optional(freeMulligansValidator),
    players: v.array(
      localSnapshotPlayer.extend({
        me: v.optional(v.boolean()),
        mulligans: v.optional(v.number()),
        deckVersionId: v.optional(v.id("deckVersions")),
        deckKey: v.optional(v.string()),
        deckFingerprint: v.optional(v.string()),
        deckName: v.optional(v.string()),
        deckLabel: v.optional(deckLabelValidator),
        seatPassHash: v.optional(v.string()),
      }),
    ),
    result: v.union(
      v.object({ kind: v.literal("win"), winnerLocalIds: v.array(v.string()) }),
      v.object({ kind: v.literal("draw") }),
      v.object({ kind: v.literal("unknown") }),
    ),
    match: v.optional(publishedMatchValidator),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    assertPublicId(args.publicId)
    const { gameSystem, ruleset, format } = await resolveLocalGameSetup(ctx, args)
    const decks = attachesDecks(gameSystem)
    const players = decks
      ? args.players
      : args.players.map((player) => ({ ...player, ...NO_SEAT_DECK, deckName: undefined }))
    const { localIds } = assertSnapshotPlayers(players)
    const firstPlayerLocalId =
      args.firstPlayerLocalId !== undefined && localIds.has(args.firstPlayerLocalId)
        ? args.firstPlayerLocalId
        : undefined
    const now = Date.now()
    if (
      !Number.isInteger(args.startedAt) ||
      !Number.isInteger(args.finishedAt) ||
      args.startedAt < 1 ||
      args.finishedAt < args.startedAt ||
      args.finishedAt > now + LOCAL_FINISH_CLOCK_SKEW_MS
    )
      throw new Error("A published game must start before it finishes, and finish in the past")
    if (
      !Number.isInteger(args.eventCount) ||
      args.eventCount < 0 ||
      args.eventCount > MAX_LOCAL_EVENT_COUNT
    )
      throw new Error("Event count is out of range")
    const meSeats = players.filter((player) => player.me)
    if (meSeats.length > 1) throw new Error("Only one seat can be yours")
    if (
      players.some(
        (player) =>
          (player.deckVersionId || player.deckKey || player.deckFingerprint) && !player.me,
      )
    )
      throw new Error("Only your seat can record a deck")
    const seatPassHashes = players.flatMap(({ seatPassHash }) => seatPassHash ?? [])
    if (
      players.some((player) => player.me && player.seatPassHash !== undefined) ||
      !seatPassHashes.every(isSeatPassHash) ||
      new Set(seatPassHashes).size !== seatPassHashes.length
    )
      throw new Error("Seat passes must be distinct hashes on other players' seats")
    if (args.result.kind === "win") {
      const winners = args.result.winnerLocalIds
      if (winners.length < 1) throw new Error("Choose at least one winner")
      if (new Set(winners).size !== winners.length)
        throw new Error("A winning seat may only be selected once")
      if (winners.some((localId) => !localIds.has(localId)))
        throw new Error("Winner must belong to this game")
    }
    let publicId = args.publicId
    let existing = await findGameByPublicId(ctx, publicId)
    if (
      existing &&
      seatPassHashes.length > 0 &&
      (existing.mode !== "local" || existing.hostUserId !== user._id)
    ) {
      publicId = await nearbyGamePublicId(args.publicId, user._id)
      existing = await findGameByPublicId(ctx, publicId)
    }
    if (existing) {
      if (existing.mode !== "local" || existing.hostUserId !== user._id)
        throw new Error("Game identifier collision; retry")
      const summary = await ctx.db
        .query("gameSummaries")
        .withIndex("by_game", (q) => q.eq("gameId", existing._id))
        .unique()
      if (!summary) throw new Error("Published game is missing its summary")
      return { publicId: existing.publicId, summaryId: summary._id, finishedAt: summary.finishedAt }
    }
    if (args.retriesThrottled === true) await limitResultRate(ctx, "localGamePublish", user._id)
    const me = meSeats[0]
    const handSize = mulliganHandSize(gameSystem)
    const mulligansOf = (player: (typeof players)[number]) =>
      args.freeMulligans &&
      handSize !== undefined &&
      (player.me || player.seatPassHash) &&
      player.mulligans !== undefined &&
      isMulliganCount(player.mulligans, args.freeMulligans, handSize)
        ? player.mulligans
        : undefined
    const tracksMulligans = players.some((player) => mulligansOf(player) !== undefined)
    if (me?.deckKey !== undefined) assertDeckKey(me.deckKey)
    if (me?.deckFingerprint !== undefined) assertDeckFingerprint(me.deckFingerprint)
    let myDeck: Doc<"decks"> | undefined
    let liveDeck = false
    let listUnchangedSinceStart = false
    if (me?.deckVersionId) {
      const version = await ctx.db.get(me.deckVersionId)
      listUnchangedSinceStart =
        version !== null && (version.updatedAt ?? version.createdAt) <= args.startedAt
      const deck = version ? await ctx.db.get(version.deckId) : null
      if (deck && deck.ownerUserId !== user._id)
        throw new ConvexError({ code: "deck_version_not_found", message: "Deck version not found" })
      // why: legacy stats still count an archived deck's games, as installed clients expect.
      if (deck) myDeck = deck
      liveDeck = Boolean(version?.archivedAt === undefined && deck && deck.archivedAt === undefined)
      if (deck && liveDeck && (deck.game ?? DEFAULT_DECK_GAME) !== gameSystem)
        throw new ConvexError({
          code: "deck_system_mismatch",
          message: "This deck belongs to another game system",
        })
      if (deck && liveDeck && deck.format !== (format ?? ruleset))
        throw new ConvexError({
          code: "deck_format_mismatch",
          message: "Choose a deck matching the game format",
        })
    }
    const attribution =
      me?.deckVersionId && !myDeck && !me.deckKey
        ? {}
        : {
            ...(myDeck ? { deckKey: myDeck.deckKey } : me?.deckKey ? { deckKey: me.deckKey } : {}),
            ...(me?.deckFingerprint
              ? { deckFingerprint: me.deckFingerprint }
              : me?.deckKey && liveDeck && listUnchangedSinceStart && me.deckVersionId
                ? { deckFingerprint: (await pinnedDeck(ctx, me.deckVersionId)).deckFingerprint }
                : {}),
          }
    const deckLabels = new Map(
      await Promise.all(
        players.map(
          async (player) =>
            [player.localId, await assertDeckLabel(ctx, gameSystem, player.deckLabel)] as const,
        ),
      ),
    )
    const gameId = await insertGame(
      ctx,
      {
        startingLife: args.startingLife,
        lifeStep: args.lifeStep,
        ruleset,
        deckRequired: undefined,
        game: gameSystem,
        system: gameSystem,
        format,
        variant: undefined,
        modeSetup: undefined,
        layout: undefined,
        lifeEditing: undefined,
        matchBestOf: undefined,
        firstPlayerMode: undefined,
        freeMulligans: tracksMulligans ? args.freeMulligans : undefined,
      },
      {
        publicId,
        hostUserId: user._id,
        mode: "local",
        status: "active",
        playerCount: players.length,
        createdAt: args.startedAt,
        startedAt: args.startedAt,
        updatedAt: now,
        // why: the device counted its own events; the summary reads this base plus per-seat counts.
        eventSequence: args.eventCount,
      },
    )
    const playerIdsByLocalId = new Map<string, Id<"gamePlayers">>()
    for (const player of resolvePlayerAppearances(players, connectedMarkShapes(players.length))) {
      const deckLabel = deckLabels.get(player.localId)
      const playerId = await ctx.db.insert("gamePlayers", {
        gameId,
        seat: player.seat,
        ...(player.me ? { userId: user._id, usernameAtJoin: user.username } : {}),
        ...(player.me && myDeck && player.deckVersionId
          ? { deckVersionId: player.deckVersionId }
          : {}),
        ...(player.me ? attribution : {}),
        ...(player.seatPassHash ? { seatPassHash: player.seatPassHash } : {}),
        ...(mulligansOf(player) !== undefined ? { mulligans: mulligansOf(player) } : {}),
        ...(deckLabel ? { deckLabel } : {}),
        displayName: assertDisplayName(player.displayName),
        color: player.color,
        shape: player.shape,
        currentLife: player.currentLife,
        eventCount: 0,
        resumable: false,
        joinedAt: args.startedAt,
      })
      playerIdsByLocalId.set(player.localId, playerId)
    }
    const matchId = args.match
      ? await linkPublishedGameToMatch(ctx, user, args.match, {
          id: gameId,
          system: gameSystem,
          ...(format ? { format } : {}),
          seats: players.map((player) => ({
            seat: player.seat,
            displayName: player.displayName,
            deckLabel: deckLabels.get(player.localId),
            ...(player.me
              ? {
                  userId: user._id,
                  ...attribution,
                  ...(player.deckVersionId ? { deckVersionId: player.deckVersionId } : {}),
                }
              : {}),
            ...(player.me && myDeck && player.deckVersionId
              ? { deckId: myDeck._id, deckVersionId: player.deckVersionId, deckName: myDeck.name }
              : {}),
          })),
        })
      : undefined
    if (matchId && args.match)
      await ctx.db.patch(gameId, { matchId, matchGameNumber: args.match.gameNumber })
    if (matchId && decks) {
      const match = await ctx.db.get(matchId)
      for (const player of players) {
        const locked = match?.seats.find((seat) => seat.seat === player.seat)
        if (locked)
          await ctx.db.patch(playerIdsByLocalId.get(player.localId)!, {
            deckKey: locked.deckKey,
            deckFingerprint: locked.deckFingerprint,
          })
      }
    }
    const game = (await ctx.db.get(gameId))!
    const summary = await terminalizeGame(
      ctx,
      game,
      "finished",
      "host_finished",
      user._id,
      args.result.kind === "win"
        ? {
            kind: "win",
            winnerPlayerIds: args.result.winnerLocalIds.map((localId) =>
              playerIdsByLocalId.get(localId)!,
            ),
          }
        : args.result,
      {
        finishedAt: args.finishedAt,
        historySource: "local",
        nearby: args.nearby ?? seatPassHashes.length > 0,
        logged: args.logged,
        clientGameId: args.publicId,
        ...(firstPlayerLocalId !== undefined
          ? { firstPlayerId: playerIdsByLocalId.get(firstPlayerLocalId)! }
          : {}),
        localIds: new Map(
          [...playerIdsByLocalId].map(([localId, playerId]) => [playerId, localId]),
        ),
        deckNames: new Map(
          players.flatMap((player) =>
            player.me && player.deckName?.trim()
              ? [[playerIdsByLocalId.get(player.localId)!, player.deckName.trim().slice(0, 80)]]
              : [],
          ),
        ),
        ...(matchId ? { matchId } : {}),
      },
    )
    if (!me)
      await ctx.db.insert("gameHistoryEntries", {
        userId: user._id,
        source: "local",
        gameId,
        summaryId: summary._id,
        ...(matchId ? { matchId } : {}),
        finishedAt: args.finishedAt,
        outcome: "unknown",
      })
    return { publicId, summaryId: summary._id, finishedAt: summary.finishedAt }
  },
})

const seatPassInvalid = () =>
  new ConvexError({ code: "seat_pass_invalid", message: "That seat pass is not for this game" })

async function claimableDeck(
  ctx: QueryCtx,
  deckVersionId: string | undefined,
  userId: Id<"users">,
  game: Doc<"games">,
) {
  const versionId = deckVersionId && ctx.db.normalizeId("deckVersions", deckVersionId)
  const version = versionId ? await ctx.db.get(versionId) : null
  const deck = version && version.archivedAt === undefined ? await ctx.db.get(version.deckId) : null
  const [system, format] = gameDeckRules(game)
  return version &&
    deck &&
    deck.ownerUserId === userId &&
    deck.archivedAt === undefined &&
    (deck.game ?? DEFAULT_DECK_GAME) === system &&
    deck.format === format
    ? { version, deck }
    : undefined
}

/** why: a claim naming a stale or mismatched shared deck still takes the seat, just without a deck: the owner may have edited it since, so a list other than the one played is not attributed. */
async function claimableSharedDeck(
  ctx: QueryCtx,
  { deckShareToken, deckFingerprint }: { deckShareToken?: string; deckFingerprint?: string },
  userId: Id<"users">,
  game: Doc<"games">,
): Promise<SharedSeatDeck | undefined> {
  if (deckShareToken === undefined) return undefined
  try {
    const shared = await sharedSeatDeck(ctx, deckShareToken, userId, gameDeckRules(game))
    return shared.kind === "shared" && shared.deckFingerprint !== deckFingerprint
      ? undefined
      : shared
  } catch (cause) {
    if (cause instanceof ConvexError) return undefined
    throw cause
  }
}

export const claimNearbySeat = mutationHandler({
  args: {
    publicId: v.string(),
    token: v.string(),
    deckVersionId: v.optional(v.string()),
    deckShareToken: v.optional(v.string()),
    deckFingerprint: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    if (args.token.length < 1 || args.token.length > 128) throw seatPassInvalid()
    assertPublicId(args.publicId)
    const hash = await hashSeatPassToken(args.token)
    let found: { game: Doc<"games">; seat: Doc<"gamePlayers"> } | undefined
    for await (const candidate of ctx.db
      .query("gamePlayers")
      .withIndex("by_seat_pass_hash", (q) => q.eq("seatPassHash", hash))) {
      const game = await ctx.db.get(candidate.gameId)
      if (
        game &&
        (game.publicId === args.publicId ||
          (game.hostUserId &&
            game.publicId === (await nearbyGamePublicId(args.publicId, game.hostUserId))))
      ) {
        found = { game, seat: candidate }
        break
      }
    }
    const summary =
      found &&
      (await ctx.db
        .query("gameSummaries")
        .withIndex("by_game", (q) => q.eq("gameId", found.game._id))
        .unique())
    if (!found || !summary) return { status: "pending" as const }
    const { game, seat } = found
    const players = await playersForGame(ctx, game._id)
    if (seat.userId === user._id) return { status: "claimed" as const }
    if (seat.userId)
      throw new ConvexError({ code: "seat_taken", message: "Another account claimed this seat" })
    if (game.hostUserId === user._id || players.some((player) => player.userId === user._id))
      throw new ConvexError({
        code: "already_seated",
        message: "You already hold a seat in this game",
      })
    const identity = { userId: user._id, usernameAtJoin: user.username }
    const decks = attachesDecks(gameDeckRules(game)[0])
    const sharedDeck = decks ? await claimableSharedDeck(ctx, args, user._id, game) : undefined
    const chosen =
      sharedDeck?.kind === "owned"
        ? sharedDeck
        : decks
          ? await claimableDeck(ctx, args.deckVersionId, user._id, game)
          : undefined
    const shared = sharedDeck?.kind === "shared" ? sharedDeck : undefined
    await ctx.db.patch(seat._id, {
      ...identity,
      ...(chosen
        ? {
            deckVersionId: chosen.version._id,
            deckKey: chosen.deck.deckKey,
          }
        : shared
          ? { deckKey: shared.deckKey, deckFingerprint: shared.deckFingerprint }
          : {}),
    })
    const claimed = summary.players.find((player) => player.playerId === seat._id)
    const deckLabel =
      chosen && (await labelWithIdentity(ctx, claimed?.deckLabel, chosen.version, game))
    const claimedPlayer = claimed && {
      ...claimed,
      ...summaryIdentitySnapshotFor({ ...seat, ...identity }, user, true),
      userId: user._id,
      ...(chosen
        ? {
            deckId: chosen.deck._id,
            deckKey: chosen.deck.deckKey,
            deckNameAtFinish: chosen.deck.name,
            deckVersionId: chosen.version._id,
            deckVersionNumber: chosen.version.versionNumber,
            ...(deckLabel ? { deckLabel } : {}),
          }
        : shared
          ? {
              deckKey: shared.deckKey,
              deckFingerprint: shared.deckFingerprint,
              deckNameAtFinish: shared.deckLabel.name,
              deckLabel: { ...claimed?.deckLabel, ...shared.deckLabel },
            }
          : {}),
    }
    await ctx.db.patch(summary._id, {
      players: summary.players.map((player) =>
        claimedPlayer && player.playerId === seat._id ? claimedPlayer : player,
      ),
    })
    if (claimedPlayer) {
      await recordPlayerResult(ctx, summary, claimedPlayer)
      await refreshGameOpponents(ctx, (await ctx.db.get(summary._id))!)
    }
    await ctx.db.insert("gameHistoryEntries", {
      userId: user._id,
      source: "local",
      gameId: game._id,
      summaryId: summary._id,
      ...(summary.matchId ? { matchId: summary.matchId } : {}),
      finishedAt: summary.finishedAt,
      outcome: summary.players.find((player) => player.playerId === seat._id)?.outcome ?? "unknown",
    })
    return { status: "claimed" as const }
  },
})

/**
 * Reports which seats an invite still leaves open, without disclosing who holds the rest.
 *
 * Imported games pre-create every seat with the published life totals, so the joiner has
 * to choose; a lobby creates seats on claim and answers with an empty list, which the
 * join screen reads as "nothing to choose" and claims straight away.
 */
export const claimableSeats = mutationHandler({
  args: {
    token: v.optional(v.string()),
    manualCode: v.optional(v.string()),
    systems: v.optional(v.array(v.string())),
    variants: v.optional(v.array(v.string())),
    maxSeats: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    const clerkUserId = String(user.clerkUserId)
    /* why: lookups reveal whether a code is live, so they stop once wrong codes or claims spent the join budget. */
    const joins = await joinAttemptsFor(ctx, clerkUserId)
    if (
      joins &&
      Date.now() - joins.windowStartedAt < JOIN_ATTEMPT_WINDOW_MS &&
      joins.attempts >= MAX_JOIN_ATTEMPTS
    )
      throw tooManyJoinAttempts()
    await consumeJoinAttempt(ctx, clerkUserId, "seatLookup")
    await assertInviteGuessesOpen(ctx, args)
    const game = await joinableInviteGame(ctx, args)
    if (!game) {
      await recordFailedInvite(ctx, clerkUserId, args)
      // why: clients that predate `invalid` see no seats and fall through to claimSeat, which throws.
      return { invalid: true as const, seats: [] }
    }
    assertClientPlaysGame(game, args)
    assertClientSeesSeats(game, args)
    const players = await playersForGame(ctx, game._id)
    for (const seated of players) {
      if (!seated.userId || seated.userId === user._id) continue
      if (await isBlockedBetween(ctx, user._id, seated.userId))
        throw new ConvexError({
          code: "blocked_player",
          message: "You cannot join a game with a player you blocked or who blocked you",
        })
    }
    return {
      publicId: game.publicId,
      mode: game.mode,
      seats: players
        .filter((player) => player.userId === undefined)
        .map((player) => player.seat)
        .sort((left, right) => left - right),
    }
  },
})
