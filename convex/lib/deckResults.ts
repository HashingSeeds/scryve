import type { Doc, Id } from "../_generated/dataModel"
import type { MutationCtx } from "../_generated/server"

type DeckResult = Omit<Doc<"deckResults">, "_id" | "_creationTime">
const LINES = ["manualMatches", "manualGames", "connectedMatches"] as const

type Tally = NonNullable<DeckResult["deltas"]["games"]>
type EnvelopeLine = (typeof LINES)[number]
type StatsPatch = Partial<Record<keyof typeof EMPTY_GAMES, number>> &
  Partial<Record<EnvelopeLine, Tally>> & { updatedAt: number }
const EMPTY_GAMES = { games: 0, wins: 0, losses: 0, draws: 0, unknown: 0 }

function addTally(current: Tally | undefined, delta: Tally, sign: 1 | -1) {
  const sum = (key: keyof Tally) => Math.max(0, (current?.[key] ?? 0) + sign * delta[key])
  return {
    total: sum("total"),
    wins: sum("wins"),
    losses: sum("losses"),
    draws: sum("draws"),
    unknown: sum("unknown"),
  }
}

function statsPatch(
  current: Doc<"deckVersionStats"> | null,
  deltas: DeckResult["deltas"],
  sign: 1 | -1,
  now: number,
) {
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
  for (const line of LINES) {
    const delta = deltas[line]
    if (delta) patch[line] = addTally(current?.[line], delta, sign)
  }
  return patch
}

async function applyVersionStats(
  ctx: MutationCtx,
  result: Pick<DeckResult, "legacyDeckId" | "deckVersionId" | "deltas">,
  sign: 1 | -1,
  now = Date.now(),
) {
  const { legacyDeckId: deckId, deckVersionId, deltas } = result
  if (!deckId || !deckVersionId) return
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

function storedResult(ctx: MutationCtx, userId: Id<"users">, resultId: string) {
  return ctx.db
    .query("deckResults")
    .withIndex("by_user_and_result_id", (q) => q.eq("userId", userId).eq("resultId", resultId))
    .unique()
}

export async function addDeckResult(ctx: MutationCtx, result: DeckResult) {
  const existing = await storedResult(ctx, result.userId, result.resultId)
  if (!existing) {
    await ctx.db.insert("deckResults", result)
    await apply(ctx, result, 1)
    await applyVersionStats(ctx, result, 1)
    return
  }
  const legacy =
    !existing.deckVersionId && result.legacyDeckId && result.deckVersionId
      ? { legacyDeckId: result.legacyDeckId, deckVersionId: result.deckVersionId }
      : {}
  const adoptedKey = existing.deckKey ? undefined : result.deckKey
  const adopted = adoptedKey
    ? {
        deckKey: adoptedKey,
        ...(result.fingerprint ? { fingerprint: result.fingerprint } : {}),
      }
    : {}
  if (Object.keys({ ...legacy, ...adopted }).length)
    await ctx.db.patch(existing._id, { ...legacy, ...adopted })
  if (adoptedKey) await apply(ctx, { ...existing, ...adopted }, 1)
  if (legacy.deckVersionId) await applyVersionStats(ctx, { ...existing, ...legacy }, 1)
}

export async function removeDeckResult(ctx: MutationCtx, userId: Id<"users">, resultId: string) {
  const result = await storedResult(ctx, userId, resultId)
  if (!result) return
  await apply(ctx, result, -1)
  await applyVersionStats(ctx, result, -1)
  await ctx.db.delete(result._id)
  return result
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
