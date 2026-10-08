import { ConvexError, v } from "convex/values"

import type { Doc, Id } from "./_generated/dataModel"
import { mutation, type MutationCtx } from "./_generated/server"
import { requireUser } from "./lib/auth"
import { assertDeckGameFormat, DEFAULT_DECK_GAME } from "./lib/deckGames"
import { assertGameSystem } from "./lib/integrations"
import {
  assertGameScores,
  MAX_GAMES_PER_MATCH,
  type MatchBestOf,
  type MatchOutcome,
} from "./lib/matchResults"
import {
  assertDeckName,
  assertDisplayName,
  assertEventName,
  assertMatchFinishedAt,
  assertRoundNumber,
  MAX_PLAYERS,
  MIN_PLAYERS,
} from "./lib/policy"

const outcomeValidator = v.union(
  v.literal("win"),
  v.literal("loss"),
  v.literal("draw"),
  v.literal("unknown"),
)

const bestOfValidator = v.union(v.literal(1), v.literal(3), v.literal(5))

const seatResultFields = {
  seat: v.number(),
  gamesWon: v.optional(v.number()),
  gamesDrawn: v.optional(v.number()),
  outcome: outcomeValidator,
}

type MatchSeat = Doc<"matches">["seats"][number]
type MatchRecord = NonNullable<Doc<"deckStats">["manualMatches"]>
type MatchCounters = Pick<Doc<"deckStats">, "manualMatches" | "manualGames" | "connectedMatches">
type MatchDeltas = Partial<Record<keyof MatchCounters, MatchRecord>>

// why: same rows a match doc can hold, so a doc never needs rewriting on read.
const MAX_ROWS_PER_MATCH = 10

function assertMatchPublicId(publicId: string) {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(publicId)) throw new Error("Invalid match identifier")
}

function assertSeatNumbers(seats: readonly { seat: number }[]) {
  if (seats.length < MIN_PLAYERS || seats.length > MAX_PLAYERS)
    throw new Error(`A match must have ${MIN_PLAYERS}–${MAX_PLAYERS} seats`)
  const numbers = new Set<number>()
  for (const { seat } of seats) {
    if (!Number.isInteger(seat) || seat < 1 || seat > MAX_PLAYERS || numbers.has(seat))
      throw new Error("Seats must be unique numbers between 1 and 6")
    numbers.add(seat)
  }
}

async function ownedDeckVersion(
  ctx: MutationCtx,
  userId: Id<"users">,
  deckVersionId: Id<"deckVersions">,
) {
  const version = await ctx.db.get(deckVersionId)
  const deck = version ? await ctx.db.get(version.deckId) : null
  if (
    !version ||
    !deck ||
    deck.ownerUserId !== userId ||
    deck.archivedAt !== undefined ||
    version.archivedAt !== undefined
  )
    throw new ConvexError({ code: "deck_not_found", message: "Deck not found" })
  return { deck, version }
}

function ownerSeatOf(match: Doc<"matches">) {
  return match.seats.find((seat) => seat.userId !== undefined && seat.userId === match.ownerUserId)
}

function outcomeRecord(outcome: MatchOutcome): MatchRecord {
  return {
    total: 1,
    wins: outcome === "win" ? 1 : 0,
    losses: outcome === "loss" ? 1 : 0,
    draws: outcome === "draw" ? 1 : 0,
    unknown: outcome === "unknown" ? 1 : 0,
  }
}

// why: both record and delete derive counters from the stored seats so they always cancel out.
function manualDeltas(match: Doc<"matches">, owner: MatchSeat): MatchDeltas {
  const manualMatches = outcomeRecord(owner.outcome ?? "unknown")
  const others = match.seats.filter((seat) => seat.seat !== owner.seat)
  // why: game counters need every seat's wins; an unset gamesDrawn means no drawn games.
  if (owner.gamesWon === undefined || others.some((seat) => seat.gamesWon === undefined))
    return { manualMatches }
  const wins = owner.gamesWon
  const draws = owner.gamesDrawn ?? 0
  const losses = others.reduce((sum, seat) => sum + (seat.gamesWon ?? 0), 0)
  return {
    manualMatches,
    manualGames: { total: wins + losses + draws, wins, losses, draws, unknown: 0 },
  }
}

function addRecord(current: MatchRecord | undefined, delta: MatchRecord, sign: 1 | -1) {
  const sum = (key: keyof MatchRecord) => Math.max(0, (current?.[key] ?? 0) + sign * delta[key])
  return {
    total: sum("total"),
    wins: sum("wins"),
    losses: sum("losses"),
    draws: sum("draws"),
    unknown: sum("unknown"),
  }
}

const MATCH_COUNTER_KEYS = ["manualMatches", "manualGames", "connectedMatches"] as const

function matchStatsPatch(
  current: MatchCounters | null,
  deltas: MatchDeltas,
  sign: 1 | -1,
  now: number,
) {
  const patch: Partial<MatchCounters> & { updatedAt: number } = { updatedAt: now }
  for (const key of MATCH_COUNTER_KEYS) {
    const delta = deltas[key]
    if (delta) patch[key] = addRecord(current?.[key], delta, sign)
  }
  return patch
}

const EMPTY_SCRYVE_RECORD = { games: 0, wins: 0, losses: 0, draws: 0, unknown: 0 }

async function applyMatchStats(
  ctx: MutationCtx,
  deckId: Id<"decks">,
  deckVersionId: Id<"deckVersions">,
  deltas: MatchDeltas,
  sign: 1 | -1,
  now: number,
) {
  const stats = await ctx.db
    .query("deckStats")
    .withIndex("by_deck", (q) => q.eq("deckId", deckId))
    .unique()
  const patch = matchStatsPatch(stats, deltas, sign, now)
  if (stats) await ctx.db.patch(stats._id, patch)
  else await ctx.db.insert("deckStats", { deckId, ...EMPTY_SCRYVE_RECORD, ...patch })
  const versionStats = await ctx.db
    .query("deckVersionStats")
    .withIndex("by_version", (q) => q.eq("deckVersionId", deckVersionId))
    .unique()
  const versionPatch = matchStatsPatch(versionStats, deltas, sign, now)
  if (versionStats) await ctx.db.patch(versionStats._id, versionPatch)
  else
    await ctx.db.insert("deckVersionStats", {
      deckId,
      deckVersionId,
      ...EMPTY_SCRYVE_RECORD,
      ...versionPatch,
    })
}

export const recordManualMatch = mutation({
  args: {
    publicId: v.string(),
    bestOf: bestOfValidator,
    system: v.optional(v.string()),
    format: v.optional(v.string()),
    finishedAt: v.number(),
    eventName: v.optional(v.string()),
    roundNumber: v.optional(v.number()),
    me: v.object({ ...seatResultFields, deckVersionId: v.optional(v.id("deckVersions")) }),
    opponents: v.array(
      v.object({
        ...seatResultFields,
        displayName: v.string(),
        deckName: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    assertMatchPublicId(args.publicId)
    const existing = await ctx.db
      .query("matches")
      .withIndex("by_public_id", (q) => q.eq("publicId", args.publicId))
      .unique()
    if (existing) {
      if (existing.source !== "manual" || existing.ownerUserId !== user._id)
        throw new ConvexError({ code: "match_conflict", message: "Match already recorded" })
      return { matchId: existing._id }
    }
    const now = Date.now()
    const finishedAt = assertMatchFinishedAt(args.finishedAt, now)
    assertSeatNumbers([args.me, ...args.opponents])
    assertGameScores([args.me, ...args.opponents], args.bestOf)
    const attached = args.me.deckVersionId
      ? await ownedDeckVersion(ctx, user._id, args.me.deckVersionId)
      : undefined
    let system: string | undefined
    let format: string | undefined
    if (args.system !== undefined) {
      system = assertGameSystem(args.system)
      format = args.format === undefined ? undefined : assertDeckGameFormat(system, args.format)
    } else if (args.format !== undefined) {
      throw new Error("Format requires a game system")
    } else if (attached) {
      // why: an attached deck already knows its system and format, so the form need not repeat them.
      system = attached.deck.game ?? DEFAULT_DECK_GAME
      format = attached.deck.format
    }
    const eventName = args.eventName === undefined ? undefined : assertEventName(args.eventName)
    const roundNumber =
      args.roundNumber === undefined ? undefined : assertRoundNumber(args.roundNumber)
    const scoreFields = (seat: { gamesWon?: number; gamesDrawn?: number }) => ({
      ...(seat.gamesWon === undefined ? {} : { gamesWon: seat.gamesWon }),
      ...(seat.gamesDrawn === undefined ? {} : { gamesDrawn: seat.gamesDrawn }),
    })
    const seats: MatchSeat[] = [
      {
        seat: args.me.seat,
        displayName: user.displayName,
        userId: user._id,
        ...(attached
          ? {
              deckId: attached.deck._id,
              deckVersionId: attached.version._id,
              deckName: attached.deck.name,
            }
          : {}),
        ...scoreFields(args.me),
        outcome: args.me.outcome,
      },
      ...args.opponents.map((opponent) => ({
        seat: opponent.seat,
        displayName: assertDisplayName(opponent.displayName),
        ...(opponent.deckName === undefined || opponent.deckName.trim() === ""
          ? {}
          : { deckName: assertDeckName(opponent.deckName) }),
        ...scoreFields(opponent),
        outcome: opponent.outcome,
      })),
    ].sort((left, right) => left.seat - right.seat)
    const matchId = await ctx.db.insert("matches", {
      publicId: args.publicId,
      ownerUserId: user._id,
      source: "manual",
      bestOf: args.bestOf,
      ...(system ? { system } : {}),
      ...(format ? { format } : {}),
      seats,
      ...(eventName ? { eventName } : {}),
      ...(roundNumber === undefined ? {} : { roundNumber }),
      finishedAt,
      createdAt: now,
      updatedAt: now,
    })
    await ctx.db.insert("gameHistoryEntries", {
      userId: user._id,
      source: "manual",
      matchId,
      finishedAt,
      outcome: args.me.outcome,
    })
    if (attached) {
      await ctx.db.insert("deckMatchResults", {
        deckId: attached.deck._id,
        deckVersionId: attached.version._id,
        matchId,
        userId: user._id,
        source: "manual",
        outcome: args.me.outcome,
        finishedAt,
      })
      const match = (await ctx.db.get(matchId))!
      await applyMatchStats(
        ctx,
        attached.deck._id,
        attached.version._id,
        manualDeltas(match, ownerSeatOf(match)!),
        1,
        now,
      )
    }
    return { matchId }
  },
})

export const deleteManualMatch = mutation({
  args: { matchId: v.id("matches") },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    const match = await ctx.db.get(args.matchId)
    if (!match || match.source !== "manual" || match.ownerUserId !== user._id)
      throw new ConvexError({ code: "match_not_found", message: "Match not found" })
    const history = await ctx.db
      .query("gameHistoryEntries")
      .withIndex("by_user_and_finished_at", (q) =>
        q.eq("userId", user._id).eq("finishedAt", match.finishedAt),
      )
      .filter((q) => q.eq(q.field("matchId"), match._id))
      .take(MAX_ROWS_PER_MATCH)
    for (const entry of history) await ctx.db.delete(entry._id)
    const owner = ownerSeatOf(match)
    if (owner?.deckId && owner.deckVersionId) {
      const results = await ctx.db
        .query("deckMatchResults")
        .withIndex("by_deck_and_source_and_finished_at", (q) =>
          q.eq("deckId", owner.deckId!).eq("source", "manual").eq("finishedAt", match.finishedAt),
        )
        .filter((q) => q.eq(q.field("matchId"), match._id))
        .take(MAX_ROWS_PER_MATCH)
      for (const result of results) await ctx.db.delete(result._id)
      await applyMatchStats(
        ctx,
        owner.deckId,
        owner.deckVersionId,
        manualDeltas(match, owner),
        -1,
        Date.now(),
      )
    }
    await ctx.db.delete(match._id)
    return null
  },
})

export const publishedMatchValidator = v.object({
  publicId: v.string(),
  bestOf: bestOfValidator,
  gameNumber: v.number(),
})

export type PublishedMatchSeat = Pick<
  MatchSeat,
  "seat" | "displayName" | "userId" | "deckId" | "deckVersionId" | "deckName"
>

function assertGameNumber(gameNumber: number) {
  if (!Number.isInteger(gameNumber) || gameNumber < 1 || gameNumber > MAX_GAMES_PER_MATCH)
    throw new Error(`A match holds at most ${MAX_GAMES_PER_MATCH} games`)
}

async function matchByPublicId(ctx: MutationCtx, publicId: string) {
  assertMatchPublicId(publicId)
  return await ctx.db
    .query("matches")
    .withIndex("by_public_id", (q) => q.eq("publicId", publicId))
    .unique()
}

type ScryveMatch = Extract<Doc<"matches">, { source: "connected" }>

async function ownedScryveMatch(ctx: MutationCtx, user: Doc<"users">, publicId: string) {
  const match = await matchByPublicId(ctx, publicId)
  if (!match || match.source !== "connected" || match.ownerUserId !== user._id)
    throw new ConvexError({ code: "match_not_found", message: "Match not found" })
  return match
}

/** why: a match's games are capped, so reading each one is a bounded way to know their order. */
async function matchGames(ctx: MutationCtx, match: ScryveMatch) {
  const games = await Promise.all(match.gameIds.map((gameId) => ctx.db.get(gameId)))
  return games.flatMap((game) => (game ? [game] : []))
}

function meSeatOf(seats: readonly PublishedMatchSeat[]) {
  return seats.find((seat) => seat.userId !== undefined)
}

/** why: the first published game creates its match in the same mutation, so neither record exists without the other. */
export async function linkPublishedGameToMatch(
  ctx: MutationCtx,
  user: Doc<"users">,
  match: { publicId: string; bestOf: MatchBestOf; gameNumber: number },
  game: { id: Id<"games">; system?: string; format?: string; seats: PublishedMatchSeat[] },
): Promise<Id<"matches">> {
  assertGameNumber(match.gameNumber)
  const now = Date.now()
  const existing = await matchByPublicId(ctx, match.publicId)
  if (!existing) {
    assertSeatNumbers(game.seats)
    return await ctx.db.insert("matches", {
      publicId: match.publicId,
      ownerUserId: user._id,
      source: "connected",
      status: "active",
      bestOf: match.bestOf,
      ...(game.system ? { system: game.system } : {}),
      ...(game.format ? { format: game.format } : {}),
      seats: game.seats,
      gameIds: [game.id],
      createdAt: now,
      updatedAt: now,
    })
  }
  if (existing.source !== "connected" || existing.ownerUserId !== user._id)
    throw new ConvexError({ code: "match_conflict", message: "Match belongs to another account" })
  if (existing.status !== "active")
    throw new ConvexError({ code: "match_finished", message: "This match already ended" })
  if (existing.seats.length !== game.seats.length)
    throw new Error("A match keeps the same seats for every game")
  // why: a match is one deck's record, so the account's seat and deck cannot move between its games.
  const lockedSeat = meSeatOf(existing.seats)
  const mySeat = meSeatOf(game.seats)
  if (lockedSeat?.seat !== mySeat?.seat || lockedSeat?.deckVersionId !== mySeat?.deckVersionId)
    throw new Error("A match keeps the same seat and deck for every game")
  if (existing.gameIds.includes(game.id)) return existing._id
  if (existing.gameIds.length >= MAX_GAMES_PER_MATCH)
    throw new Error(`A match holds at most ${MAX_GAMES_PER_MATCH} games`)
  const games = await matchGames(ctx, existing)
  if (games.some((other) => other.matchGameNumber === match.gameNumber))
    throw new Error(`Game ${match.gameNumber} of this match was already published`)
  const ordered = [...games.map((other) => ({ id: other._id, number: other.matchGameNumber ?? 0 }))]
  ordered.push({ id: game.id, number: match.gameNumber })
  ordered.sort((left, right) => left.number - right.number)
  await ctx.db.patch(existing._id, { gameIds: ordered.map((entry) => entry.id), updatedAt: now })
  return existing._id
}

/** why: the server scores a match from the games it holds, so a client cannot finalize a score its games do not show. */
async function matchScoreFromGames(ctx: MutationCtx, match: ScryveMatch, gameCount: number) {
  const games = await matchGames(ctx, match)
  const ordinals = new Set(games.map((game) => game.matchGameNumber))
  if (
    games.length !== gameCount ||
    Array.from({ length: gameCount }, (_, index) => index + 1).some((n) => !ordinals.has(n))
  )
    throw new Error("Some games of this match are missing or still uploading")
  const wins = new Map(match.seats.map((seat) => [seat.seat, 0]))
  let draws = 0
  for (const game of games) {
    const summary = await ctx.db
      .query("gameSummaries")
      .withIndex("by_game", (q) => q.eq("gameId", game._id))
      .unique()
    if (!summary) throw new Error("A game of this match is missing its summary")
    if (summary.resultKind === "draw") draws += 1
    else if (summary.resultKind === "win")
      for (const player of summary.players)
        if (player.outcome === "win") wins.set(player.seat, (wins.get(player.seat) ?? 0) + 1)
  }
  return { wins, draws }
}

// why: the device finalizes once every game is acked, and a retry after a lost ack must not count the match twice.
export const finishScryveMatch = mutation({
  args: {
    publicId: v.string(),
    finishedAt: v.number(),
    // why: how many games the device played, so a finish cannot land before the last one is linked.
    gameCount: v.number(),
    seats: v.array(
      v.object({
        seat: v.number(),
        gamesWon: v.number(),
        gamesDrawn: v.number(),
        outcome: outcomeValidator,
      }),
    ),
  },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    const match = await ownedScryveMatch(ctx, user, args.publicId)
    if (match.status === "finished") return { matchId: match._id }
    if (match.status !== "active")
      throw new ConvexError({ code: "match_finished", message: "This match already ended" })
    const now = Date.now()
    const finishedAt = assertMatchFinishedAt(args.finishedAt, now)
    assertGameNumber(args.gameCount)
    const results = new Map(args.seats.map((seat) => [seat.seat, seat]))
    if (
      results.size !== args.seats.length ||
      results.size !== match.seats.length ||
      match.seats.some((seat) => !results.has(seat.seat))
    )
      throw new Error("A match result needs every seat exactly once")
    const score = await matchScoreFromGames(ctx, match, args.gameCount)
    if (
      args.seats.some(
        (seat) => seat.gamesWon !== score.wins.get(seat.seat) || seat.gamesDrawn !== score.draws,
      )
    )
      throw new Error("The match score does not match its published games")
    assertGameScores(args.seats, match.bestOf)
    const seats = match.seats.map((seat) => {
      const result = results.get(seat.seat)!
      return {
        ...seat,
        gamesWon: result.gamesWon,
        gamesDrawn: result.gamesDrawn,
        outcome: result.outcome,
      }
    })
    await ctx.db.patch(match._id, { status: "finished", finishedAt, seats, updatedAt: now })
    const owner = seats.find((seat) => seat.userId === user._id)
    if (owner?.deckId && owner.deckVersionId) {
      await ctx.db.insert("deckMatchResults", {
        deckId: owner.deckId,
        deckVersionId: owner.deckVersionId,
        matchId: match._id,
        userId: user._id,
        source: "connected",
        outcome: owner.outcome,
        finishedAt,
      })
      await applyMatchStats(
        ctx,
        owner.deckId,
        owner.deckVersionId,
        { connectedMatches: outcomeRecord(owner.outcome) },
        1,
        now,
      )
    }
    return { matchId: match._id }
  },
})
