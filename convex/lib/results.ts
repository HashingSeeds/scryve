import { deckKeyOf } from "./deckKeys"
import {
  addDeckResult,
  removeDeckResult,
  canonicalResultId,
  gameResultId,
  setDeckResultOpponents,
  applyVersionStats,
} from "./deckResults"
import type { MatchOutcome } from "./matchResults"
import { resultOpponents, summarySeats } from "./opponentDecks"
import { MAX_PLAYERS } from "./policy"
import type { Doc, Id } from "../_generated/dataModel"
import type { MutationCtx, QueryCtx } from "../_generated/server"

export type ResultTally = {
  total: number
  wins: number
  losses: number
  draws: number
  unknown: number
}

type EnvelopeLine = "manualMatches" | "manualGames" | "connectedMatches"
export type TallyDeltas = Partial<Record<"games" | EnvelopeLine, ResultTally>>

export function outcomeTally(outcome: MatchOutcome): ResultTally {
  return {
    total: 1,
    wins: outcome === "win" ? 1 : 0,
    losses: outcome === "loss" ? 1 : 0,
    draws: outcome === "draw" ? 1 : 0,
    unknown: outcome === "unknown" ? 1 : 0,
  }
}

export function isAbandonedSummary(summary: Pick<Doc<"gameSummaries">, "terminalStatus">) {
  return summary.terminalStatus === "abandoned"
}

export async function recordPlayerResult(
  ctx: MutationCtx,
  summary: Doc<"gameSummaries">,
  player: Doc<"gameSummaries">["players"][number],
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
    opponents: resultOpponents(summarySeats(summary.players), {
      seat: player.seat,
      userId: player.userId,
    }),
    ...(summary.firstPlayerId !== undefined
      ? { wentFirst: summary.firstPlayerId === player.playerId }
      : {}),
    deltas: { games: outcomeTally(outcome) },
    ...(player.deckId && player.deckVersionId
      ? { legacyDeckId: player.deckId, deckVersionId: player.deckVersionId }
      : {}),
  })
}

export async function recordGameResults(ctx: MutationCtx, summary: Doc<"gameSummaries">) {
  const source = await gameResultSource(ctx, summary)
  for (const player of summary.players) await recordPlayerResult(ctx, summary, player, source)
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
  const removed =
    summary && player
      ? await removeDeckResult(ctx, result.userId, gameResultId(summary, player))
      : undefined
  if (!removed?.deckVersionId)
    await applyVersionStats(
      ctx,
      {
        legacyDeckId: result.deckId,
        deckVersionId: result.deckVersionId,
        deltas: { games: outcomeTally(result.outcome) },
      },
      -1,
      now,
    )
  await ctx.db.delete(result._id)
}

function ownerSeatOf(match: Doc<"matches">) {
  return match.seats.find((seat) => seat.userId !== undefined && seat.userId === match.ownerUserId)
}

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

export async function recordMatchResult(ctx: MutationCtx, match: Doc<"matches">) {
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
      opponents: resultOpponents(match.seats, { seat: seat.seat, userId: seat.userId }),
      deltas: matchDeltas(match, seat),
      ...(owner?.seat === seat.seat
        ? { legacyDeckId: owner.deckId, deckVersionId: owner.deckVersionId }
        : {}),
    })
  }
}

/** why: deleting a manual match must reverse exactly what recordMatchResult added. */
export async function removeMatchResult(ctx: MutationCtx, match: Doc<"matches">) {
  for (const seat of match.seats)
    if (seat.userId)
      await removeDeckResult(
        ctx,
        seat.userId,
        canonicalResultId({ kind: "match", publicId: match.publicId, seat: seat.seat }),
      )
}

/** why: a nearby claim or an account deletion changes a seat after the other seats' results were written. */
export async function refreshGameOpponents(ctx: MutationCtx, summary: Doc<"gameSummaries">) {
  const seats = summarySeats(summary.players)
  for (const player of summary.players)
    if (player.userId)
      await setDeckResultOpponents(
        ctx,
        player.userId,
        gameResultId(summary, player),
        resultOpponents(seats, { seat: player.seat, userId: player.userId }),
      )
}

export async function refreshMatchOpponents(ctx: MutationCtx, match: Doc<"matches">) {
  for (const seat of match.seats)
    if (seat.userId)
      await setDeckResultOpponents(
        ctx,
        seat.userId,
        canonicalResultId({ kind: "match", publicId: match.publicId, seat: seat.seat }),
        resultOpponents(match.seats, { seat: seat.seat, userId: seat.userId }),
      )
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
