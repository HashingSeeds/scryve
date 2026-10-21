import { deckKeyOf } from "./deckKeys"
import { addDeckResult, removeDeckResult, canonicalResultId, gameResultId } from "./deckResults"
import type { MatchOutcome } from "./matchResults"
import { MAX_PLAYERS } from "./policy"
import type { Doc, Id } from "../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../_generated/server"

// why: the only writer of deck result rows and deck stat counters, so every source counts the same way.
// why: Scryve games stay in top-level fields and other lines in envelopes; decks.ts reads both, and merging them needs a backfill.

export type ResultTally = {
  total: number
  wins: number
  losses: number
  draws: number
  unknown: number
}

type StatsDoc = Doc<"deckStats"> | Doc<"deckVersionStats">
type EnvelopeLine = "manualMatches" | "manualGames" | "connectedMatches"
export type TallyDeltas = Partial<Record<"games" | EnvelopeLine, ResultTally>>
type StatsPatch = Partial<Record<keyof typeof EMPTY_GAMES, number>> &
  Partial<Record<EnvelopeLine, ResultTally>> & { updatedAt: number }

const ENVELOPE_LINES = ["manualMatches", "manualGames", "connectedMatches"] as const
const EMPTY_GAMES = { games: 0, wins: 0, losses: 0, draws: 0, unknown: 0 }
const MAX_ROWS_PER_MATCH = 10

export function outcomeTally(outcome: MatchOutcome): ResultTally {
  return {
    total: 1,
    wins: outcome === "win" ? 1 : 0,
    losses: outcome === "loss" ? 1 : 0,
    draws: outcome === "draw" ? 1 : 0,
    unknown: outcome === "unknown" ? 1 : 0,
  }
}

function addTally(current: ResultTally | undefined, delta: ResultTally, sign: 1 | -1) {
  const sum = (key: keyof ResultTally) => Math.max(0, (current?.[key] ?? 0) + sign * delta[key])
  return {
    total: sum("total"),
    wins: sum("wins"),
    losses: sum("losses"),
    draws: sum("draws"),
    unknown: sum("unknown"),
  }
}

function statsPatch(current: StatsDoc | null, deltas: TallyDeltas, sign: 1 | -1, now: number) {
  const games =
    deltas.games &&
    addTally(current ? { ...current, total: current.games } : undefined, deltas.games, sign)
  const patch: StatsPatch = games
    ? {
        updatedAt: now,
        games: games.total,
        wins: games.wins,
        losses: games.losses,
        draws: games.draws,
        unknown: games.unknown,
      }
    : { updatedAt: now }
  for (const line of ENVELOPE_LINES) {
    const delta = deltas[line]
    if (delta) patch[line] = addTally(current?.[line], delta, sign)
  }
  return patch
}

async function applyStats(
  ctx: MutationCtx,
  deckId: Id<"decks">,
  deckVersionId: Id<"deckVersions">,
  deltas: TallyDeltas,
  sign: 1 | -1,
  now: number,
) {
  const stats = await ctx.db
    .query("deckStats")
    .withIndex("by_deck", (q) => q.eq("deckId", deckId))
    .unique()
  const patch = statsPatch(stats, deltas, sign, now)
  if (stats) await ctx.db.patch(stats._id, patch)
  else if (sign === 1) await ctx.db.insert("deckStats", { deckId, ...EMPTY_GAMES, ...patch })
  const versionStats = await ctx.db
    .query("deckVersionStats")
    .withIndex("by_version", (q) => q.eq("deckVersionId", deckVersionId))
    .unique()
  const versionPatch = statsPatch(versionStats, deltas, sign, now)
  if (versionStats) await ctx.db.patch(versionStats._id, versionPatch)
  else if (sign === 1)
    await ctx.db.insert("deckVersionStats", {
      deckId,
      deckVersionId,
      ...EMPTY_GAMES,
      ...versionPatch,
    })
}

export function isAbandonedSummary(summary: Pick<Doc<"gameSummaries">, "terminalStatus">) {
  return summary.terminalStatus === "abandoned"
}

export async function recordPlayerResult(
  ctx: MutationCtx,
  summary: Doc<"gameSummaries">,
  player: Doc<"gameSummaries">["players"][number],
  now: number,
  source?: "local" | "nearby" | "connected",
) {
  if (isAbandonedSummary(summary) || !player.userId) return
  const outcome = player.outcome ?? "unknown"
  source ??= await gameResultSource(ctx, summary)
  await addDeckResult(ctx, {
    resultId: gameResultId(summary, player),
    userId: player.userId,
    deckKey: await resultDeckKey(ctx, player),
    fingerprint: player.deckFingerprint,
    kind: "game",
    source,
    outcome,
    finishedAt: summary.finishedAt,
    summaryId: summary._id,
    matchId: summary.matchId,
    podSize: summary.players.length,
    deltas: { games: outcomeTally(outcome) },
    ...(player.deckId && player.deckVersionId ? { legacyDeckId: player.deckId } : {}),
  })
  if (!player.deckId || !player.deckVersionId) return
  await ctx.db.insert("deckGameResults", {
    deckId: player.deckId,
    deckVersionId: player.deckVersionId,
    gameId: summary.gameId,
    playerId: player.playerId,
    userId: player.userId,
    outcome,
    finishedAt: summary.finishedAt,
  })
  await applyStats(
    ctx,
    player.deckId,
    player.deckVersionId,
    { games: outcomeTally(outcome) },
    1,
    now,
  )
}

export async function recordGameResults(
  ctx: MutationCtx,
  summary: Doc<"gameSummaries">,
  now: number,
) {
  const source = await gameResultSource(ctx, summary)
  for (const player of summary.players) await recordPlayerResult(ctx, summary, player, now, source)
}

/** why: the abandoned-game backfill must undo exactly what recordGameResults added. */
export async function removeGameResult(
  ctx: MutationCtx,
  result: Doc<"deckGameResults">,
  now: number,
) {
  const summary = await ctx.db
    .query("gameSummaries")
    .withIndex("by_game", (q) => q.eq("gameId", result.gameId))
    .unique()
  const player = summary?.players.find((player) => player.playerId === result.playerId)
  if (summary && player) await removeDeckResult(ctx, result.userId, gameResultId(summary, player))
  await ctx.db.delete(result._id)
  await applyStats(
    ctx,
    result.deckId,
    result.deckVersionId,
    { games: outcomeTally(result.outcome) },
    -1,
    now,
  )
}

function ownerSeatOf(match: Doc<"matches">) {
  return match.seats.find((seat) => seat.userId !== undefined && seat.userId === match.ownerUserId)
}

// why: record and remove derive counters from the stored seats so they always cancel out.
export function matchDeltas(
  match: Doc<"matches">,
  owner: Doc<"matches">["seats"][number],
): TallyDeltas {
  const matchTally = outcomeTally(owner.outcome ?? "unknown")
  if (match.source === "connected") return { connectedMatches: matchTally }
  const others = match.seats.filter((seat) => seat.seat !== owner.seat)
  if (owner.gamesWon === undefined || others.some((seat) => seat.gamesWon === undefined))
    return { manualMatches: matchTally }
  const wins = owner.gamesWon
  const draws = owner.gamesDrawn ?? 0
  const losses = others.reduce((sum, seat) => sum + (seat.gamesWon ?? 0), 0)
  return {
    manualMatches: matchTally,
    manualGames: { total: wins + losses + draws, wins, losses, draws, unknown: 0 },
  }
}

function deckedOwnerSeat(match: Doc<"matches">) {
  const owner = ownerSeatOf(match)
  if (!owner?.userId || !owner.deckId || !owner.deckVersionId) return undefined
  return {
    ...owner,
    userId: owner.userId,
    deckId: owner.deckId,
    deckVersionId: owner.deckVersionId,
  }
}

export async function recordMatchResult(ctx: MutationCtx, match: Doc<"matches">, now: number) {
  if (match.finishedAt === undefined) return
  if (match.source === "connected" && match.status !== "finished") return
  const owner = deckedOwnerSeat(match)
  for (const seat of match.seats) {
    if (!seat.userId) continue
    await addDeckResult(ctx, {
      resultId: canonicalResultId({ kind: "match", publicId: match.publicId, seat: seat.seat }),
      userId: seat.userId,
      deckKey: await resultDeckKey(ctx, seat),
      fingerprint: seat.deckFingerprint,
      kind: "match",
      source: match.source,
      outcome: seat.outcome ?? "unknown",
      finishedAt: match.finishedAt,
      matchId: match._id,
      podSize: match.seats.length,
      deltas: matchDeltas(match, seat),
      ...(owner?.seat === seat.seat ? { legacyDeckId: owner.deckId } : {}),
    })
  }
  if (!owner) return
  await ctx.db.insert("deckMatchResults", {
    deckId: owner.deckId,
    deckVersionId: owner.deckVersionId,
    matchId: match._id,
    userId: owner.userId,
    source: match.source,
    outcome: owner.outcome ?? "unknown",
    finishedAt: match.finishedAt,
  })
  await applyStats(ctx, owner.deckId, owner.deckVersionId, matchDeltas(match, owner), 1, now)
}

/** why: deleting a manual match must reverse exactly what recordMatchResult added. */
export async function removeMatchResult(ctx: MutationCtx, match: Doc<"matches">, now: number) {
  for (const seat of match.seats)
    if (seat.userId)
      await removeDeckResult(
        ctx,
        seat.userId,
        canonicalResultId({ kind: "match", publicId: match.publicId, seat: seat.seat }),
      )
  const owner = deckedOwnerSeat(match)
  if (!owner || match.finishedAt === undefined) return
  const finishedAt = match.finishedAt
  const results = await ctx.db
    .query("deckMatchResults")
    .withIndex("by_deck_and_source_and_finished_at", (q) =>
      q.eq("deckId", owner.deckId).eq("source", match.source).eq("finishedAt", finishedAt),
    )
    .filter((q) => q.eq(q.field("matchId"), match._id))
    .take(MAX_ROWS_PER_MATCH)
  for (const result of results) await ctx.db.delete(result._id)
  await applyStats(ctx, owner.deckId, owner.deckVersionId, matchDeltas(match, owner), -1, now)
}

export async function resultDeckKey(
  ctx: MutationCtx | QueryCtx,
  seat: { deckKey?: string; deckId?: Id<"decks">; userId?: Id<"users"> },
) {
  if (seat.deckKey) {
    if (seat.userId) {
      const alias = await ctx.db
        .query("decks")
        .withIndex("by_owner_and_guest_local_id", (q) =>
          q.eq("ownerUserId", seat.userId!).eq("guestLocalId", seat.deckKey),
        )
        .unique()
      if (alias) return deckKeyOf(alias)
    }
    return seat.deckKey
  }
  const deck = seat.deckId ? await ctx.db.get(seat.deckId) : null
  return deck ? deckKeyOf(deck) : undefined
}

export async function gameResultSource(ctx: MutationCtx, summary: Doc<"gameSummaries">) {
  const game = await ctx.db.get(summary.gameId)
  if (game?.mode !== "local") return "connected" as const
  const players = await ctx.db
    .query("gamePlayers")
    .withIndex("by_game", (q) => q.eq("gameId", summary.gameId))
    .take(MAX_PLAYERS)
  return players.some((player) => player.seatPassHash) ? ("nearby" as const) : ("local" as const)
}
