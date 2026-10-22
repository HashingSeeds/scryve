import { paginationOptsValidator } from "convex/server"
import { v } from "convex/values"

import { internal } from "./_generated/api"
import type { Doc, Id } from "./_generated/dataModel"
import type { QueryCtx } from "./_generated/server"
import { internalMutation, internalQuery } from "./_generated/server"
import { addDeckResult, canonicalResultId, gameResultId } from "./lib/deckResults"
import { resultOpponents, summarySeats } from "./lib/opponentDecks"
import {
  resultDeckKey,
  matchDeltas,
  outcomeTally,
  gameResultSource,
  isAbandonedSummary,
  removeGameResult,
} from "./lib/results"

// why: each row costs a summary lookup plus reads and writes on two stats tables, so a large page would hit transaction limits.
const MAX_BATCH = 100

/**
 * why: games abandoned before #350 still sit in deck results and counters. Filtering on the
 * summary keeps finished no-winner games, which are also "unknown", counting.
 * Deleted rows never match again, so a rerun or a restart from a null cursor is safe.
 */
export const removeAbandonedGameResults = internalMutation({
  args: {
    paginationOpts: paginationOptsValidator,
    dryRun: v.optional(v.boolean()),
    foundSoFar: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const paginationOpts = {
      ...args.paginationOpts,
      numItems: Math.min(args.paginationOpts.numItems, MAX_BATCH),
    }
    const page = await ctx.db.query("deckGameResults").paginate(paginationOpts)
    const now = Date.now()
    let found = 0
    for (const result of page.page) {
      const summary = await ctx.db
        .query("gameSummaries")
        .withIndex("by_game", (q) => q.eq("gameId", result.gameId))
        .unique()
      if (!summary || !isAbandonedSummary(summary)) continue
      found += 1
      if (!args.dryRun) await removeGameResult(ctx, result, now)
    }
    const foundSoFar = (args.foundSoFar ?? 0) + found
    console.log(
      `removeAbandonedGameResults ${args.dryRun ? "dry run " : ""}scanned=${page.page.length} found=${found} total=${foundSoFar} done=${page.isDone}`,
    )
    if (!page.isDone)
      await ctx.scheduler.runAfter(0, internal.resultsBackfill.removeAbandonedGameResults, {
        paginationOpts: { ...paginationOpts, cursor: page.continueCursor },
        ...(args.dryRun ? { dryRun: true } : {}),
        foundSoFar,
      })
    return {
      scanned: page.page.length,
      found,
      foundSoFar,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    }
  },
})

const batchArgs = { cursor: v.union(v.string(), v.null()), batchSize: v.number() }
function batchSize(size: number) {
  if (!Number.isSafeInteger(size) || size < 1 || size > 100)
    throw new Error("Batch size must be 1–100")
  return size
}

export const backfillDeckKeys = internalMutation({
  args: batchArgs,
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("decks")
      .paginate({ cursor: args.cursor, numItems: batchSize(args.batchSize) })
    return { isDone: page.isDone, continueCursor: page.continueCursor }
  },
})

export const backfillGameResults = internalMutation({
  args: batchArgs,
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("deckGameResults")
      .paginate({ cursor: args.cursor, numItems: batchSize(args.batchSize) })
    for (const result of page.page) {
      const summary = await ctx.db
        .query("gameSummaries")
        .withIndex("by_game", (q) => q.eq("gameId", result.gameId))
        .unique()
      if (!summary || isAbandonedSummary(summary)) continue
      const player = summary.players.find((player) => player.playerId === result.playerId)
      if (!player || player.userId !== result.userId) continue
      await addDeckResult(
        ctx,
        {
          resultId: gameResultId(summary, player),
          userId: result.userId,
          deckKey: await resultDeckKey(ctx, {
            deckId: result.deckId,
            deckKey: player.deckKey,
            userId: result.userId,
          }),
          kind: "game",
          source: await gameResultSource(ctx, summary),
          outcome: result.outcome,
          finishedAt: result.finishedAt,
          summaryId: summary._id,
          matchId: summary.matchId,
          podSize: summary.players.length,
          deltas: { games: outcomeTally(result.outcome) },
          legacyDeckId: result.deckId,
          deckVersionId: result.deckVersionId,
        },
        { versionStatsAlreadyApplied: true },
      )
    }
    return { isDone: page.isDone, continueCursor: page.continueCursor }
  },
})

export const backfillMatchResults = internalMutation({
  args: batchArgs,
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("deckMatchResults")
      .paginate({ cursor: args.cursor, numItems: batchSize(args.batchSize) })
    for (const result of page.page) {
      const match = await ctx.db.get(result.matchId)
      if (!match) continue
      const seat = match.seats.find(
        (seat) => seat.userId === result.userId && seat.deckVersionId === result.deckVersionId,
      )
      if (!seat) continue
      await addDeckResult(
        ctx,
        {
          resultId: canonicalResultId({ kind: "match", publicId: match.publicId, seat: seat.seat }),
          userId: result.userId,
          deckKey: await resultDeckKey(ctx, seat),
          kind: "match",
          source: result.source,
          outcome: result.outcome,
          finishedAt: result.finishedAt,
          matchId: match._id,
          podSize: match.seats.length,
          deltas: matchDeltas(match, seat),
          legacyDeckId: result.deckId,
          deckVersionId: result.deckVersionId,
        },
        { versionStatsAlreadyApplied: true },
      )
    }
    return { isDone: page.isDone, continueCursor: page.continueCursor }
  },
})

/**
 * why: identity cards stay out, because versions are edited in place and today's commander may
 * not be the one played. Rows that already have opponents are skipped, so a rerun or a restart
 * from a null cursor is safe.
 */
export const backfillResultOpponents = internalMutation({
  args: batchArgs,
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("deckResults")
      .paginate({ cursor: args.cursor, numItems: batchSize(args.batchSize) })
    let patched = 0
    for (const result of page.page) {
      if (result.opponents) continue
      const summary = result.summaryId ? await ctx.db.get(result.summaryId) : null
      const player = summary?.players.find(
        (player) =>
          player.userId === result.userId && gameResultId(summary, player) === result.resultId,
      )
      const match = !summary && result.matchId ? await ctx.db.get(result.matchId) : null
      const seat = match?.seats.find(
        (seat) =>
          seat.userId === result.userId &&
          canonicalResultId({ kind: "match", publicId: match.publicId, seat: seat.seat }) ===
            result.resultId,
      )
      const opponents =
        summary && player
          ? resultOpponents(summarySeats(summary.players), {
              userId: result.userId,
              seat: player.seat,
            })
          : match && seat
            ? resultOpponents(match.seats, { userId: result.userId, seat: seat.seat })
            : undefined
      if (!opponents) continue
      await ctx.db.patch(result._id, { opponents })
      patched += 1
    }
    return { patched, isDone: page.isDone, continueCursor: page.continueCursor }
  },
})

const MAX_COMPARED_RESULTS = 2000
type Tally = { total: number; wins: number; losses: number; draws: number; unknown: number }
type Deltas = Doc<"deckResults">["deltas"]

function sumDeltas(all: Deltas[]) {
  const add = (sum: Tally | undefined, delta: Tally | undefined) =>
    delta
      ? {
          total: (sum?.total ?? 0) + delta.total,
          wins: (sum?.wins ?? 0) + delta.wins,
          losses: (sum?.losses ?? 0) + delta.losses,
          draws: (sum?.draws ?? 0) + delta.draws,
          unknown: (sum?.unknown ?? 0) + delta.unknown,
        }
      : sum
  let games: Tally | undefined
  let manualMatches: Tally | undefined
  let manualGames: Tally | undefined
  let connectedMatches: Tally | undefined
  for (const deltas of all) {
    games = add(games, deltas.games)
    manualMatches = add(manualMatches, deltas.manualMatches)
    manualGames = add(manualGames, deltas.manualGames)
    connectedMatches = add(connectedMatches, deltas.connectedMatches)
  }
  return {
    games: games?.total ?? 0,
    wins: games?.wins ?? 0,
    losses: games?.losses ?? 0,
    draws: games?.draws ?? 0,
    unknown: games?.unknown ?? 0,
    manualMatches,
    manualGames,
    connectedMatches,
  }
}

type Counts = Pick<
  Doc<"deckKeyStats">,
  | "games"
  | "wins"
  | "losses"
  | "draws"
  | "unknown"
  | "manualMatches"
  | "manualGames"
  | "connectedMatches"
>

function countDifferences(legacy: Counts | null, stats: Counts | null) {
  const fields = ["games", "wins", "losses", "draws", "unknown"] as const
  const lines = ["manualMatches", "manualGames", "connectedMatches"] as const
  const tallyFields = ["total", "wins", "losses", "draws", "unknown"] as const
  return [
    ...fields.map((field) => ({ field, legacy: legacy?.[field] ?? 0, stats: stats?.[field] ?? 0 })),
    ...lines.flatMap((line) =>
      tallyFields.map((field) => ({
        field: `${line}.${field}`,
        legacy: legacy?.[line]?.[field] ?? 0,
        stats: stats?.[line]?.[field] ?? 0,
      })),
    ),
  ].filter((difference) => difference.legacy !== difference.stats)
}

async function legacyReasons(
  ctx: QueryCtx,
  deckId: Id<"decks">,
  differences: ReturnType<typeof countDifferences>,
  versionId?: Id<"deckVersions">,
) {
  const games = await ctx.db
    .query("deckGameResults")
    .withIndex("by_deck_and_finished_at", (q) => q.eq("deckId", deckId))
    .take(MAX_COMPARED_RESULTS + 1)
  const matches = await ctx.db
    .query("deckMatchResults")
    .withIndex("by_deck_and_finished_at", (q) => q.eq("deckId", deckId))
    .take(MAX_COMPARED_RESULTS + 1)
  const reasons = new Set<string>()
  if (!versionId) {
    const deck = await ctx.db.get(deckId)
    if (deck) {
      const results = await ctx.db
        .query("deckResults")
        .withIndex("by_user_and_deck_key_and_finished_at", (q) =>
          q.eq("userId", deck.ownerUserId).eq("deckKey", deck.deckKey),
        )
        .take(MAX_COMPARED_RESULTS + 1)
      if (results.some((result) => !result.legacyDeckId)) reasons.add("device_only_results")
      if (results.length > MAX_COMPARED_RESULTS) reasons.add("legacy_reason_scan_limit")
    }
  }
  const seen = new Set<string>()
  const summaryIds: Id<"gameSummaries">[] = []
  for (const game of games) {
    if (versionId && game.deckVersionId !== versionId) continue
    const summary = await ctx.db
      .query("gameSummaries")
      .withIndex("by_game", (q) => q.eq("gameId", game.gameId))
      .unique()
    if (summary && isAbandonedSummary(summary)) {
      reasons.add("abandoned_games_skipped")
      summaryIds.push(summary._id)
    }
    const player = summary?.players.find((player) => player.playerId === game.playerId)
    const id = summary && player ? gameResultId(summary, player) : `${game.gameId}:${game.playerId}`
    if (seen.has(id)) reasons.add("duplicate_legacy_seats")
    seen.add(id)
  }
  for (const match of matches) {
    if (versionId && match.deckVersionId !== versionId) continue
    const id = `${match.matchId}:${match.userId}:${match.deckVersionId}`
    if (seen.has(id)) reasons.add("duplicate_legacy_seats")
    seen.add(id)
  }
  if (games.length > MAX_COMPARED_RESULTS || matches.length > MAX_COMPARED_RESULTS)
    reasons.add("legacy_reason_scan_limit")
  // why: old counters clamp at zero but retain no audit trail, so a zero discrepancy is only a candidate explanation.
  if (differences.some((difference) => difference.legacy === 0))
    reasons.add("legacy_zero_clamp_possible")
  return { reasons: reasons.size ? [...reasons] : ["unexplained"], summaryIds }
}

const COMPARISON_PHASES = ["decks", "versions", "totals", "results"] as const

/**
 * why: each entity can read up to MAX_COMPARED_RESULTS results, so run it in small batches; oversized histories fail the gate explicitly.
 * This comparison only applies before legacy stat writes retire; deckStats freezes after that release.
 */
export const compareDeckKeyStats = internalQuery({
  args: batchArgs,
  handler: async (ctx, args) => {
    const phaseIndex = args.cursor
      ? COMPARISON_PHASES.findIndex((phase) => args.cursor!.startsWith(`${phase}:`))
      : 0
    if (phaseIndex < 0) throw new Error("Invalid comparison cursor")
    const phase = COMPARISON_PHASES[phaseIndex]
    const cursor = args.cursor ? args.cursor.slice(phase.length + 1) || null : null
    const pagination = { cursor, numItems: batchSize(args.batchSize) }
    type Mismatch = {
      scope: string
      reason: string
      userId?: Id<"users">
      deckKey?: string
      deckId?: Id<"decks">
      deckVersionId?: Id<"deckVersions">
      statsId?: Id<"deckKeyStats">
      legacyStatsId?: Id<"deckStats"> | Id<"deckVersionStats">
      resultId?: string
      fingerprint?: string
      legacy?: Counts | null
      stats?: Counts | null
      expected?: Counts
      differences?: ReturnType<typeof countDifferences>
      reasons?: string[]
      summaryIds?: Id<"gameSummaries">[]
      fingerprints?: { fingerprint: string | null; stats: Counts }[]
    }
    const mismatches: Mismatch[] = []
    const finish = (page: { isDone: boolean; continueCursor: string }) => {
      const nextPhase = COMPARISON_PHASES[phaseIndex + 1]
      return {
        mismatches,
        phase,
        isDone: page.isDone && !nextPhase,
        continueCursor: page.isDone
          ? nextPhase
            ? `${nextPhase}:`
            : ""
          : `${phase}:${page.continueCursor}`,
      }
    }
    const keyStats = (userId: Id<"users">, deckKey: string, fingerprint = "all") =>
      ctx.db
        .query("deckKeyStats")
        .withIndex("by_user_and_deck_key_and_fingerprint", (q) =>
          q.eq("userId", userId).eq("deckKey", deckKey).eq("fingerprint", fingerprint),
        )
        .unique()
    const keyResults = (userId: Id<"users">, deckKey: string) =>
      ctx.db
        .query("deckResults")
        .withIndex("by_user_and_deck_key_and_finished_at", (q) =>
          q.eq("userId", userId).eq("deckKey", deckKey),
        )
        .take(MAX_COMPARED_RESULTS + 1)

    if (phase === "decks") {
      const page = await ctx.db.query("decks").paginate(pagination)
      for (const deck of page.page) {
        if (deck.archivedAt !== undefined) continue
        const deckKey = deck.deckKey
        const legacy = await ctx.db
          .query("deckStats")
          .withIndex("by_deck", (q) => q.eq("deckId", deck._id))
          .unique()
        const stats = await keyStats(deck.ownerUserId, deckKey)
        const differences = countDifferences(legacy, stats)
        if (differences.length) {
          const facts = await legacyReasons(ctx, deck._id, differences)
          mismatches.push({
            scope: "deck",
            reason: facts.reasons[0],
            userId: deck.ownerUserId,
            deckId: deck._id,
            deckKey,
            legacyStatsId: legacy?._id,
            statsId: stats?._id,
            legacy,
            stats,
            differences,
            ...facts,
          })
        }
      }
      return finish(page)
    }
    if (phase === "versions") {
      const page = await ctx.db.query("deckVersionStats").paginate(pagination)
      for (const legacy of page.page) {
        const deck = await ctx.db.get(legacy.deckId)
        const all = await ctx.db
          .query("deckResults")
          .withIndex("by_legacy_deck_id", (q) => q.eq("legacyDeckId", legacy.deckId))
          .take(MAX_COMPARED_RESULTS + 1)
        const ids = {
          deckId: legacy.deckId,
          deckVersionId: legacy.deckVersionId,
          legacyStatsId: legacy._id,
          userId: deck?.ownerUserId,
          deckKey: deck ? deck.deckKey : undefined,
        }
        if (all.length > MAX_COMPARED_RESULTS) {
          mismatches.push({ scope: "version", reason: "comparison_limit", ...ids })
          continue
        }
        const results = all.filter(
          (result) =>
            result.deckVersionId === legacy.deckVersionId &&
            result.userId === deck?.ownerUserId &&
            result.deckKey === (deck && deck.deckKey),
        )
        const stats = sumDeltas(results.map((result) => result.deltas))
        const differences = countDifferences(legacy, stats)
        if (differences.length) {
          const fingerprints = [...new Set(results.map((result) => result.fingerprint))].map(
            (fingerprint) => ({
              fingerprint: fingerprint ?? null,
              stats: sumDeltas(
                results
                  .filter((result) => result.fingerprint === fingerprint)
                  .map((result) => result.deltas),
              ),
            }),
          )
          const facts = await legacyReasons(ctx, legacy.deckId, differences, legacy.deckVersionId)
          mismatches.push({
            scope: "version",
            reason: facts.reasons[0],
            ...ids,
            legacy,
            stats,
            differences,
            fingerprints,
            ...facts,
          })
        }
      }
      return finish(page)
    }
    if (phase === "totals") {
      const page = await ctx.db.query("deckKeyStats").paginate(pagination)
      for (const stats of page.page) {
        const results = await keyResults(stats.userId, stats.deckKey)
        const ids = {
          userId: stats.userId,
          deckKey: stats.deckKey,
          fingerprint: stats.fingerprint,
          statsId: stats._id,
        }
        if (results.length > MAX_COMPARED_RESULTS) {
          mismatches.push({ scope: "key", reason: "comparison_limit", ...ids })
          continue
        }
        const expected = sumDeltas(
          results
            .filter(
              (result) => stats.fingerprint === "all" || result.fingerprint === stats.fingerprint,
            )
            .map((result) => result.deltas),
        )
        if (countDifferences(expected, stats).length)
          mismatches.push({
            scope: "key",
            reason: "totals_differ_from_results",
            ...ids,
            stats,
            expected,
          })
      }
      return finish(page)
    }
    const page = await ctx.db.query("deckResults").paginate(pagination)
    for (const result of page.page) {
      if (!result.deckKey) continue
      for (const fingerprint of result.fingerprint ? ["all", result.fingerprint] : ["all"])
        if (!(await keyStats(result.userId, result.deckKey, fingerprint)))
          mismatches.push({
            scope: "result",
            reason: "missing_totals",
            userId: result.userId,
            deckKey: result.deckKey,
            resultId: result.resultId,
            fingerprint,
          })
      if (
        result.deckVersionId &&
        !(await ctx.db
          .query("deckVersionStats")
          .withIndex("by_version", (q) => q.eq("deckVersionId", result.deckVersionId!))
          .unique())
      )
        mismatches.push({
          scope: "version",
          reason: "missing_legacy_version_stats",
          userId: result.userId,
          deckKey: result.deckKey,
          deckVersionId: result.deckVersionId,
          resultId: result.resultId,
        })
    }
    return finish(page)
  },
})
