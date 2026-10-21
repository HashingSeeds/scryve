import { paginationOptsValidator } from "convex/server"
import { v } from "convex/values"

import type { Doc } from "./_generated/dataModel"
import { query, type QueryCtx } from "./_generated/server"
import { requireUser } from "./lib/auth"
import { assertDeckKey } from "./lib/deckKeys"
import { resultDeckKey } from "./lib/results"

// why: breakdowns read result rows, so a deck past this many results is broken down by its latest ones.
export const BREAKDOWN_SCAN = 1000
const MAX_LISTS = 50

type Result = Doc<"deckResults">

async function callerKey(ctx: QueryCtx, deckKey: string) {
  const user = await requireUser(ctx)
  assertDeckKey(deckKey)
  return {
    userId: user._id,
    deckKey: (await resultDeckKey(ctx, { userId: user._id, deckKey })) ?? deckKey,
  }
}

function resultsFor(ctx: QueryCtx, key: Awaited<ReturnType<typeof callerKey>>) {
  return ctx.db
    .query("deckResults")
    .withIndex("by_user_and_deck_key_and_finished_at", (q) =>
      q.eq("userId", key.userId).eq("deckKey", key.deckKey),
    )
    .order("desc")
}

const sourceGroup = (result: Result) => (result.source === "manual" ? "manual" : "scryve")

// why: slices hold plain outcome counts, so the client sums them for any filter without another query.
export const summary = query({
  args: { deckKey: v.string() },
  handler: async (ctx, args) => {
    const key = await callerKey(ctx, args.deckKey)
    const totals = await ctx.db
      .query("deckKeyStats")
      .withIndex("by_user_and_deck_key_and_fingerprint", (q) =>
        q.eq("userId", key.userId).eq("deckKey", key.deckKey),
      )
      .take(MAX_LISTS + 1)
    const scanned = await resultsFor(ctx, key).take(BREAKDOWN_SCAN + 1)
    const slices = new Map<
      string,
      {
        source: "scryve" | "manual"
        fingerprint: string | null
        podSize: number | null
        games: number
        wins: number
        losses: number
        draws: number
        firstAt: number
        lastAt: number
      }
    >()
    for (const result of scanned.slice(0, BREAKDOWN_SCAN)) {
      const slice = {
        source: sourceGroup(result),
        fingerprint: result.fingerprint ?? null,
        podSize: result.podSize ?? null,
      } as const
      const id = JSON.stringify(slice)
      const current = slices.get(id) ?? {
        ...slice,
        games: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        firstAt: result.finishedAt,
        lastAt: result.finishedAt,
      }
      slices.set(id, {
        ...current,
        games: current.games + 1,
        wins: current.wins + (result.outcome === "win" ? 1 : 0),
        losses: current.losses + (result.outcome === "loss" ? 1 : 0),
        draws: current.draws + (result.outcome === "draw" ? 1 : 0),
        firstAt: Math.min(current.firstAt, result.finishedAt),
        lastAt: Math.max(current.lastAt, result.finishedAt),
      })
    }
    return {
      all: totals.find((row) => row.fingerprint === "all") ?? null,
      lists: totals.filter((row) => row.fingerprint !== "all").slice(0, MAX_LISTS),
      slices: [...slices.values()],
      scannedAll: scanned.length <= BREAKDOWN_SCAN,
    }
  },
})

export const games = query({
  args: {
    deckKey: v.string(),
    // why: null picks results recorded before lists were tracked.
    fingerprint: v.optional(v.union(v.string(), v.null())),
    podSize: v.optional(v.number()),
    source: v.optional(v.union(v.literal("scryve"), v.literal("manual"))),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const key = await callerKey(ctx, args.deckKey)
    const page = await resultsFor(ctx, key)
      .filter((q) =>
        q.and(
          args.fingerprint === undefined
            ? true
            : q.eq(q.field("fingerprint"), args.fingerprint ?? undefined),
          args.podSize === undefined ? true : q.eq(q.field("podSize"), args.podSize),
          args.source === undefined
            ? true
            : args.source === "manual"
              ? q.eq(q.field("source"), "manual")
              : q.neq(q.field("source"), "manual"),
        ),
      )
      .paginate(args.paginationOpts)
    return {
      ...page,
      page: await Promise.all(
        page.page.map(async (result) => {
          const summary = result.summaryId ? await ctx.db.get(result.summaryId) : null
          const match = !summary && result.matchId ? await ctx.db.get(result.matchId) : null
          const opponents = summary
            ? summary.players
                .filter((player) => player.userId !== key.userId)
                .map((player) => ({ name: player.displayName, deckName: player.deckNameAtFinish }))
            : (match?.seats ?? [])
                .filter((seat) => seat.userId !== key.userId)
                .map((seat) => ({ name: seat.displayName, deckName: seat.deckName }))
          return {
            resultId: result.resultId,
            kind: result.kind,
            source: result.source,
            outcome: result.outcome,
            finishedAt: result.finishedAt,
            podSize: result.podSize ?? null,
            fingerprint: result.fingerprint ?? null,
            gamePublicId: summary?.publicId ?? null,
            matchPublicId: match?.publicId ?? null,
            opponents,
          }
        }),
      ),
    }
  },
})
