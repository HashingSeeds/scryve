import { ConvexError, v } from "convex/values"

import type { Doc, Id } from "./_generated/dataModel"
import { mutation, type MutationCtx } from "./_generated/server"
import { requireUser } from "./lib/auth"
import { assertDeckGameFormat, DEFAULT_DECK_GAME } from "./lib/deckGames"
import { assertGameSystem } from "./lib/integrations"
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

const seatResultFields = {
  seat: v.number(),
  gamesWon: v.optional(v.number()),
  gamesDrawn: v.optional(v.number()),
  outcome: outcomeValidator,
}

type MatchSeat = Doc<"matches">["seats"][number]
type ManualRecord = NonNullable<Doc<"deckStats">["manualMatches"]>
type ManualDeltas = { matches: ManualRecord; games?: ManualRecord }

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

function assertGameScores(
  seats: readonly { gamesWon?: number; gamesDrawn?: number; outcome: MatchSeat["outcome"] }[],
  bestOf: 1 | 3 | 5,
) {
  const maxWins = Math.ceil(bestOf / 2)
  let totalWins = 0
  for (const seat of seats) {
    if (seat.gamesWon !== undefined) {
      if (!Number.isInteger(seat.gamesWon) || seat.gamesWon < 0 || seat.gamesWon > maxWins)
        throw new Error(`Games won must be 0–${maxWins} in a best of ${bestOf}`)
      totalWins += seat.gamesWon
    }
    if (
      seat.gamesDrawn !== undefined &&
      (!Number.isInteger(seat.gamesDrawn) || seat.gamesDrawn < 0 || seat.gamesDrawn > bestOf)
    )
      throw new Error(`Games drawn must be 0–${bestOf} in a best of ${bestOf}`)
  }
  if (totalWins > bestOf) throw new Error(`A best of ${bestOf} cannot have ${totalWins} wins`)
  if (seats.filter((seat) => seat.outcome === "win").length > 1)
    throw new Error("A match can only have one winner")
}

async function ownedDeckVersion(
  ctx: MutationCtx,
  userId: Id<"users">,
  deckVersionId: Id<"deckVersions">,
) {
  const version = await ctx.db.get(deckVersionId)
  const deck = version ? await ctx.db.get(version.deckId) : null
  if (!version || !deck || deck.ownerUserId !== userId)
    throw new ConvexError({ code: "deck_not_found", message: "Deck not found" })
  return { deck, version }
}

function ownerSeatOf(match: Doc<"matches">) {
  return match.seats.find((seat) => seat.userId !== undefined && seat.userId === match.ownerUserId)
}

// why: both record and delete derive counters from the stored seats so they always cancel out.
function manualDeltas(match: Doc<"matches">, owner: MatchSeat): ManualDeltas {
  const outcome = owner.outcome ?? "unknown"
  const matches = {
    total: 1,
    wins: outcome === "win" ? 1 : 0,
    losses: outcome === "loss" ? 1 : 0,
    draws: outcome === "draw" ? 1 : 0,
    unknown: outcome === "unknown" ? 1 : 0,
  }
  if (owner.gamesWon === undefined) return { matches }
  const wins = owner.gamesWon
  const draws = owner.gamesDrawn ?? 0
  const losses = match.seats
    .filter((seat) => seat.seat !== owner.seat)
    .reduce((sum, seat) => sum + (seat.gamesWon ?? 0), 0)
  return { matches, games: { total: wins + losses + draws, wins, losses, draws, unknown: 0 } }
}

function addRecord(current: ManualRecord | undefined, delta: ManualRecord, sign: 1 | -1) {
  const sum = (key: keyof ManualRecord) => Math.max(0, (current?.[key] ?? 0) + sign * delta[key])
  return {
    total: sum("total"),
    wins: sum("wins"),
    losses: sum("losses"),
    draws: sum("draws"),
    unknown: sum("unknown"),
  }
}

function manualStatsPatch(
  current: { manualMatches?: ManualRecord; manualGames?: ManualRecord } | null,
  deltas: ManualDeltas,
  sign: 1 | -1,
  now: number,
) {
  return {
    manualMatches: addRecord(current?.manualMatches, deltas.matches, sign),
    ...(deltas.games ? { manualGames: addRecord(current?.manualGames, deltas.games, sign) } : {}),
    updatedAt: now,
  }
}

const EMPTY_SCRYVE_RECORD = { games: 0, wins: 0, losses: 0, draws: 0, unknown: 0 }

async function applyManualStats(
  ctx: MutationCtx,
  deckId: Id<"decks">,
  deckVersionId: Id<"deckVersions">,
  deltas: ManualDeltas,
  sign: 1 | -1,
  now: number,
) {
  const stats = await ctx.db
    .query("deckStats")
    .withIndex("by_deck", (q) => q.eq("deckId", deckId))
    .unique()
  const patch = manualStatsPatch(stats, deltas, sign, now)
  if (stats) await ctx.db.patch(stats._id, patch)
  else await ctx.db.insert("deckStats", { deckId, ...EMPTY_SCRYVE_RECORD, ...patch })
  const versionStats = await ctx.db
    .query("deckVersionStats")
    .withIndex("by_version", (q) => q.eq("deckVersionId", deckVersionId))
    .unique()
  const versionPatch = manualStatsPatch(versionStats, deltas, sign, now)
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
    bestOf: v.union(v.literal(1), v.literal(3), v.literal(5)),
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
      await applyManualStats(
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
      await applyManualStats(
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
