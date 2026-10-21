import type { Doc } from "../_generated/dataModel"
import type { MutationCtx } from "../_generated/server"

type DeckResult = Omit<Doc<"deckResults">, "_id" | "_creationTime">
const LINES = ["manualMatches", "manualGames", "connectedMatches"] as const

export function canonicalResultId(
  result:
    | { kind: "match"; publicId: string; seat: number }
    | {
        kind: "game"
        publicId: string
        playerId: string
        clientGameId?: string
        localId?: string
        legacySummaryId?: string
      },
) {
  if (result.kind === "match") return `match:${result.publicId}:${result.seat}`
  if (result.clientGameId && result.localId) return `game:${result.clientGameId}:${result.localId}`
  if (result.legacySummaryId) return `legacy:${result.legacySummaryId}:${result.playerId}`
  return `game:${result.publicId}:${result.playerId}`
}

export function gameResultId(
  summary: Doc<"gameSummaries">,
  player: Doc<"gameSummaries">["players"][number],
) {
  return (
    player.resultId ??
    canonicalResultId({
      kind: "game",
      publicId: summary.publicId,
      playerId: player.playerId,
      clientGameId: summary.clientGameId,
      localId: player.localId,
      ...(!summary.clientGameId ? { legacySummaryId: summary._id } : {}),
    })
  )
}

async function apply(ctx: MutationCtx, result: DeckResult, sign: 1 | -1) {
  if (!result.deckKey) return
  for (const fingerprint of result.fingerprint ? ["all", result.fingerprint] : ["all"]) {
    const current = await ctx.db
      .query("deckKeyStats")
      .withIndex("by_user_and_deck_key_and_fingerprint", (q) =>
        q.eq("userId", result.userId).eq("deckKey", result.deckKey!).eq("fingerprint", fingerprint),
      )
      .unique()
    const games = result.deltas.games
    const patch = {
      games: (current?.games ?? 0) + sign * (games?.total ?? 0),
      wins: (current?.wins ?? 0) + sign * (games?.wins ?? 0),
      losses: (current?.losses ?? 0) + sign * (games?.losses ?? 0),
      draws: (current?.draws ?? 0) + sign * (games?.draws ?? 0),
      unknown: (current?.unknown ?? 0) + sign * (games?.unknown ?? 0),
      updatedAt: Date.now(),
    }
    const envelopes = Object.fromEntries(
      LINES.flatMap((line) => {
        const delta = result.deltas[line]
        if (!delta) return []
        const before = current?.[line]
        return [
          [
            line,
            {
              total: (before?.total ?? 0) + sign * delta.total,
              wins: (before?.wins ?? 0) + sign * delta.wins,
              losses: (before?.losses ?? 0) + sign * delta.losses,
              draws: (before?.draws ?? 0) + sign * delta.draws,
              unknown: (before?.unknown ?? 0) + sign * delta.unknown,
            },
          ],
        ]
      }),
    )
    if (current) await ctx.db.patch(current._id, { ...patch, ...envelopes })
    else if (sign === 1)
      await ctx.db.insert("deckKeyStats", {
        userId: result.userId,
        deckKey: result.deckKey,
        fingerprint,
        ...patch,
        ...envelopes,
      })
  }
}

export async function addDeckResult(ctx: MutationCtx, result: DeckResult) {
  const existing = await ctx.db
    .query("deckResults")
    .withIndex("by_result_id", (q) => q.eq("resultId", result.resultId))
    .unique()
  if (existing) return
  await ctx.db.insert("deckResults", result)
  await apply(ctx, result, 1)
}

export async function removeDeckResult(ctx: MutationCtx, resultId: string) {
  const result = await ctx.db
    .query("deckResults")
    .withIndex("by_result_id", (q) => q.eq("resultId", resultId))
    .unique()
  if (!result) return
  await apply(ctx, result, -1)
  await ctx.db.delete(result._id)
}

export async function removeUserDeckStats(
  ctx: MutationCtx,
  userId: Doc<"users">["_id"],
  limit: number,
) {
  const rows = await ctx.db
    .query("deckKeyStats")
    .withIndex("by_user_and_deck_key_and_fingerprint", (q) => q.eq("userId", userId))
    .take(limit)
  for (const row of rows) await ctx.db.delete(row._id)
  return rows.length
}
