import { paginationOptsValidator } from "convex/server"
import { v } from "convex/values"

import type { Doc, Id } from "./_generated/dataModel"
import { query, type QueryCtx } from "./_generated/server"
import { maskSummaryPlayersForViewer } from "./games"
import { requireUser } from "./lib/auth"
import { assertDeckKey } from "./lib/deckKeys"
import { blockedUserIdsFor, publicUsernameFor } from "./lib/moderation"
import { HIDDEN_DECK_NAME, HIDDEN_PLAYER_NAME, nameFailsGate } from "./lib/nameFilter"
import {
  gatedIdentity,
  summarySeats,
  type DeckIdentity,
  type DeckLabel,
  type ResultOpponent,
} from "./lib/opponentDecks"
import { boundedPaginationOptions } from "./lib/pagination"
import { resultDeckKey } from "./lib/results"

export const BREAKDOWN_SCAN = 200
const MAX_LISTS = 50
const MAX_DECK_TOTALS = 1000
const GAMES_PAGE_ROWS = 100
export const MATCHUP_SCAN = 500
export const MAX_MATCHUP_GROUPS = 200

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
const countsOnce = (result: Result) => result.kind === "game" || result.source === "manual"

export const summary = query({
  args: { deckKey: v.string() },
  handler: async (ctx, args) => {
    const key = await callerKey(ctx, args.deckKey)
    const scanned = await resultsFor(ctx, key).take(BREAKDOWN_SCAN + 1)
    const slices = new Map<
      string,
      {
        source: "scryve" | "manual"
        fingerprint: string | null
        podSize: number | null
        wentFirst: boolean | null
        games: number
        wins: number
        losses: number
        draws: number
        firstAt: number
        lastAt: number
      }
    >()
    for (const result of scanned.slice(0, BREAKDOWN_SCAN).filter(countsOnce)) {
      const slice = {
        source: sourceGroup(result),
        fingerprint: result.fingerprint ?? null,
        podSize: result.podSize ?? null,
        wentFirst: result.wentFirst ?? null,
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
    const lastPlayed = new Map<string, number>()
    for (const slice of slices.values())
      if (slice.fingerprint)
        lastPlayed.set(
          slice.fingerprint,
          Math.max(lastPlayed.get(slice.fingerprint) ?? 0, slice.lastAt),
        )
    const recent = [...lastPlayed.entries()]
      .sort((left, right) => right[1] - left[1])
      .slice(0, MAX_LISTS)
      .map(([fingerprint]) => fingerprint)
    const totals = await Promise.all(
      ["all", ...recent].map((fingerprint) =>
        ctx.db
          .query("deckKeyStats")
          .withIndex("by_user_and_deck_key_and_fingerprint", (q) =>
            q.eq("userId", key.userId).eq("deckKey", key.deckKey).eq("fingerprint", fingerprint),
          )
          .unique(),
      ),
    )
    return {
      all: totals[0],
      lists: totals.slice(1).filter((row) => row !== null),
      slices: [...slices.values()],
      scannedAll: scanned.length <= BREAKDOWN_SCAN,
    }
  },
})

function shownIdentity(
  seat: { userId?: Id<"users">; deckName?: string; deckLabel?: DeckLabel },
  blocked: Set<Id<"users">>,
) {
  if (seat.userId && blocked.has(seat.userId)) return undefined
  const deckName = seat.deckName ?? seat.deckLabel?.name
  if (deckName !== undefined && nameFailsGate(deckName)) return undefined
  return gatedIdentity(seat.deckLabel?.identity)
}

export const games = query({
  args: {
    deckKey: v.string(),
    fingerprint: v.optional(v.union(v.string(), v.null())),
    podSize: v.optional(v.number()),
    wentFirst: v.optional(v.union(v.boolean(), v.null())),
    source: v.optional(v.union(v.literal("scryve"), v.literal("manual"))),
    paginationOpts: paginationOptsValidator,
  },
  handler: async (ctx, args) => {
    const key = await callerKey(ctx, args.deckKey)
    const page = await resultsFor(ctx, key)
      .filter((q) =>
        q.and(
          q.or(q.eq(q.field("kind"), "game"), q.eq(q.field("source"), "manual")),
          args.fingerprint === undefined
            ? true
            : q.eq(q.field("fingerprint"), args.fingerprint ?? undefined),
          args.podSize === undefined ? true : q.eq(q.field("podSize"), args.podSize),
          args.wentFirst === undefined
            ? true
            : q.eq(q.field("wentFirst"), args.wentFirst ?? undefined),
          args.source === undefined
            ? true
            : args.source === "manual"
              ? q.eq(q.field("source"), "manual")
              : q.neq(q.field("source"), "manual"),
        ),
      )
      .paginate(boundedPaginationOptions(args.paginationOpts, GAMES_PAGE_ROWS))
    const blocked = await blockedUserIdsFor(ctx, key.userId)
    return {
      ...page,
      page: await Promise.all(
        page.page.map(async (result) => {
          const summary = result.summaryId ? await ctx.db.get(result.summaryId) : null
          const match = !summary && result.matchId ? await ctx.db.get(result.matchId) : null
          const seats = summary ? summarySeats(summary.players) : []
          const opponents = summary
            ? maskSummaryPlayersForViewer(summary.players, key.userId, blocked, {
                localGame: result.source === "local",
              }).flatMap((player, index) =>
                player.userId === key.userId
                  ? []
                  : [
                      {
                        name: player.displayName,
                        deckName: player.deckNameAtFinish,
                        identity: shownIdentity(seats[index], blocked),
                      },
                    ],
              )
            : (match?.seats ?? [])
                .filter((seat) => seat.userId !== key.userId)
                .map((seat) => ({
                  name: seat.displayName,
                  deckName: seat.deckName,
                  identity: shownIdentity(seat, blocked),
                }))
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

export const totalsByKey = query({
  args: {},
  handler: async (ctx) => {
    const user = await requireUser(ctx)
    const rows = await ctx.db
      .query("deckKeyStats")
      .withIndex("by_user_and_fingerprint", (q) =>
        q.eq("userId", user._id).eq("fingerprint", "all"),
      )
      .take(MAX_DECK_TOTALS)
    return rows.map(({ deckKey, games, wins, losses, draws, unknown, manualMatches }) => ({
      deckKey,
      games,
      wins,
      losses,
      draws,
      unknown,
      ...(manualMatches ? { manualMatches } : {}),
    }))
  },
})

type Tally = {
  games: number
  wins: number
  losses: number
  draws: number
  expectedWins: number
  theirWins: number
  lastPlayedAt: number
}

const normalized = (text: string) =>
  text.normalize("NFKC").trim().replace(/\s+/g, " ").toLowerCase()
const identityKey = (identity: DeckIdentity) => identity.map(({ cardId }) => cardId).join("+")
const HIDDEN_KEY = "hidden"

function opponentDeckGroup(deck: ResultOpponent["deck"], identity: DeckIdentity | undefined) {
  if (!deck) return undefined
  const hidden = deck.name !== undefined && nameFailsGate(deck.name)
  const shown = {
    opponentDeckKey: deck.deckKey ?? null,
    name: deck.name === undefined ? null : hidden ? HIDDEN_DECK_NAME : deck.name,
    identity: identity ?? null,
  }
  if (deck.deckKey) return { key: `deck:${deck.deckKey}`, shown }
  if (hidden) return { key: HIDDEN_KEY, shown }
  if (deck.name) return { key: `name:${normalized(deck.name)}`, shown }
  if (identity) return { key: `identity:${identityKey(identity)}`, shown }
  return undefined
}

function opponentPlayerGroup({ userId, displayName }: ResultOpponent) {
  const hidden = nameFailsGate(displayName)
  const key = userId ? `user:${userId}` : hidden ? HIDDEN_KEY : `name:${normalized(displayName)}`
  return {
    key,
    shown: { userId: userId ?? null, displayName: hidden ? HIDDEN_PLAYER_NAME : displayName },
  }
}

function grouping<Shown>() {
  const groups = new Map<string, Shown & Tally & { deckKey: string; key: string }>()
  return {
    add(
      result: Pick<Result, "outcome" | "finishedAt"> & { deckKey: string; podSize: number },
      matched: { key: string; won: boolean; shown: Shown }[],
    ) {
      const byKey = new Map<string, (typeof matched)[number]>()
      for (const entry of matched)
        byKey.set(entry.key, { ...entry, won: entry.won || Boolean(byKey.get(entry.key)?.won) })
      for (const { key, won, shown } of byKey.values()) {
        const id = `${result.deckKey}\n${key}`
        const current = groups.get(id) ?? {
          ...shown,
          deckKey: result.deckKey,
          key,
          games: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          expectedWins: 0,
          theirWins: 0,
          lastPlayedAt: result.finishedAt,
        }
        groups.set(id, {
          ...current,
          games: current.games + 1,
          wins: current.wins + (result.outcome === "win" ? 1 : 0),
          losses: current.losses + (result.outcome === "loss" ? 1 : 0),
          draws: current.draws + (result.outcome === "draw" ? 1 : 0),
          expectedWins: current.expectedWins + 1 / result.podSize,
          theirWins: current.theirWins + (won ? 1 : 0),
        })
      }
    },
    rows: () =>
      [...groups.values()]
        .sort((left, right) => right.games - left.games || right.lastPlayedAt - left.lastPlayedAt)
        .slice(0, MAX_MATCHUP_GROUPS),
  }
}

export const matchups = query({
  args: { deckKey: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const user = await requireUser(ctx)
    const results =
      args.deckKey === undefined
        ? ctx.db
            .query("deckResults")
            .withIndex("by_user_and_finished_at", (q) => q.eq("userId", user._id))
            .order("desc")
        : resultsFor(ctx, await callerKey(ctx, args.deckKey))
    const scanned = await results.take(MATCHUP_SCAN + 1)
    const blocked = await blockedUserIdsFor(ctx, user._id)
    const byIdentity = grouping<{ identity: DeckIdentity }>()
    const byDeck = grouping<NonNullable<ReturnType<typeof opponentDeckGroup>>["shown"]>()
    const byPlayer = grouping<ReturnType<typeof opponentPlayerGroup>["shown"]>()
    let counted = 0
    for (const result of scanned.slice(0, MATCHUP_SCAN)) {
      const { deckKey } = result
      if (!deckKey || !countsOnce(result) || !result.opponents?.length) continue
      counted += 1
      const mine = { ...result, deckKey, podSize: result.podSize ?? result.opponents.length + 1 }
      const opponents = result.opponents.map((opponent) => ({
        ...opponent,
        won: opponent.outcome === "win",
        visible: !opponent.userId || !blocked.has(opponent.userId),
        identity: shownIdentity({ userId: opponent.userId, deckLabel: opponent.deck }, blocked),
      }))
      byIdentity.add(
        mine,
        opponents.flatMap(({ identity, won }) =>
          identity ? [{ key: identityKey(identity), won, shown: { identity } }] : [],
        ),
      )
      byDeck.add(
        mine,
        opponents.flatMap(({ deck, identity, won, visible }) => {
          const group = visible ? opponentDeckGroup(deck, identity) : undefined
          return group ? [{ ...group, won }] : []
        }),
      )
      byPlayer.add(
        mine,
        opponents.flatMap((opponent) =>
          opponent.visible ? [{ ...opponentPlayerGroup(opponent), won: opponent.won }] : [],
        ),
      )
    }
    const players = byPlayer.rows()
    const users = await Promise.all(
      players.map(({ userId }) => (userId ? ctx.db.get(userId) : null)),
    )
    return {
      byIdentity: byIdentity.rows(),
      byDeck: byDeck.rows(),
      byPlayer: players.map((row, index) => {
        const user = users[index]
        const name = user ? publicUsernameFor(user) : undefined
        return name ? { ...row, displayName: name } : row
      }),
      counted,
      scannedAll: scanned.length <= MATCHUP_SCAN,
    }
  },
})
