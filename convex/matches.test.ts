import { convexTest, type TestConvex } from "convex-test"

import { api, internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import schema from "./schema"

const modules = {
  "./_generated/api.ts": async () => jest.requireActual("./_generated/api"),
  "./_generated/server.ts": async () => jest.requireActual("./_generated/server"),
  "./accountDeletion.ts": async () => jest.requireActual("./accountDeletion"),
  "./decks.ts": async () => jest.requireActual("./decks"),
  "./games.ts": async () => jest.requireActual("./games"),
  "./matches.ts": async () => jest.requireActual("./matches"),
  "./users.ts": async () => jest.requireActual("./users"),
}

const FINISHED_AT = Date.UTC(2026, 9, 3)

async function owner(t: TestConvex<typeof schema>, subject = "match-owner") {
  const actor = t.withIdentity({ subject })
  await actor.mutation(api.users.syncCurrent, { displayName: "Alice" })
  const deckId = await actor.mutation(api.decks.create, { name: "Dragons", format: "modern" })
  const deckVersionId = await actor.mutation(api.decks.saveVersion, { deckId, cards: [] })
  return { actor, deckId, deckVersionId }
}

function twoPlayer(deckVersionId: Id<"deckVersions">, publicId = "manual-match-000001") {
  return {
    publicId,
    bestOf: 3 as const,
    finishedAt: FINISHED_AT,
    eventName: "FNM",
    roundNumber: 2,
    me: { seat: 1, deckVersionId, gamesWon: 2, gamesDrawn: 1, outcome: "win" as const },
    opponents: [
      {
        seat: 2,
        displayName: "Bob",
        deckName: "Burn",
        gamesWon: 1,
        gamesDrawn: 1,
        outcome: "loss" as const,
      },
    ],
  }
}

async function statsFor(t: TestConvex<typeof schema>, deckId: Id<"decks">) {
  return await t.run(async (ctx) => {
    const deck = await ctx.db
      .query("deckStats")
      .withIndex("by_deck", (q) => q.eq("deckId", deckId))
      .unique()
    const version = await ctx.db
      .query("deckVersionStats")
      .withIndex("by_deck", (q) => q.eq("deckId", deckId))
      .unique()
    return { deck, version }
  })
}

describe("recordManualMatch", () => {
  it("writes the match, history, deck result, and manual counters once per publicId", async () => {
    const t = convexTest(schema, modules)
    const { actor, deckId, deckVersionId } = await owner(t)
    const args = twoPlayer(deckVersionId)
    const first = await actor.mutation(api.matches.recordManualMatch, args)
    const retry = await actor.mutation(api.matches.recordManualMatch, args)
    expect(retry.matchId).toBe(first.matchId)

    const match = await t.run((ctx) => ctx.db.get(first.matchId))
    expect(match).toMatchObject({
      source: "manual",
      bestOf: 3,
      system: "mtg",
      format: "modern",
      eventName: "FNM",
      roundNumber: 2,
      finishedAt: FINISHED_AT,
    })
    expect(match?.seats).toEqual([
      expect.objectContaining({
        seat: 1,
        displayName: "Alice",
        deckId,
        deckVersionId,
        deckName: "Dragons",
        gamesWon: 2,
        gamesDrawn: 1,
        outcome: "win",
      }),
      expect.objectContaining({ seat: 2, displayName: "Bob", deckName: "Burn", gamesWon: 1 }),
    ])
    expect(match?.seats[1].userId).toBeUndefined()

    const rows = await t.run(async (ctx) => ({
      history: await ctx.db.query("gameHistoryEntries").collect(),
      results: await ctx.db.query("deckMatchResults").collect(),
    }))
    expect(rows.history).toEqual([
      expect.objectContaining({ source: "manual", matchId: first.matchId, outcome: "win" }),
    ])
    expect(rows.results).toEqual([
      expect.objectContaining({ deckId, deckVersionId, source: "manual", outcome: "win" }),
    ])

    const { deck, version } = await statsFor(t, deckId)
    const expected = {
      games: 0,
      manualMatches: { total: 1, wins: 1, losses: 0, draws: 0, unknown: 0 },
      manualGames: { total: 4, wins: 2, losses: 1, draws: 1, unknown: 0 },
    }
    expect(deck).toMatchObject(expected)
    expect(version).toMatchObject({ ...expected, deckVersionId })
  })

  it("counts matches but not games when no score is given", async () => {
    const t = convexTest(schema, modules)
    const { actor, deckId, deckVersionId } = await owner(t)
    await actor.mutation(api.matches.recordManualMatch, {
      publicId: "manual-match-000002",
      bestOf: 1,
      finishedAt: FINISHED_AT,
      me: { seat: 1, deckVersionId, outcome: "draw" },
      opponents: [
        { seat: 2, displayName: "Bob", outcome: "draw" },
        { seat: 3, displayName: "Cat", outcome: "draw" },
        { seat: 4, displayName: "Dan", outcome: "loss" },
      ],
    })
    const { deck } = await statsFor(t, deckId)
    expect(deck?.manualMatches).toEqual({ total: 1, wins: 0, losses: 0, draws: 1, unknown: 0 })
    expect(deck?.manualGames).toBeUndefined()
  })

  it("accepts a pod whose wins spread past the best of", async () => {
    const t = convexTest(schema, modules)
    const { actor, deckId } = await owner(t)
    await actor.mutation(api.matches.recordManualMatch, {
      publicId: "manual-match-pod-211",
      bestOf: 3,
      finishedAt: FINISHED_AT,
      me: { seat: 1, gamesWon: 2, outcome: "win" },
      opponents: [
        { seat: 2, displayName: "Bob", gamesWon: 1, outcome: "loss" },
        { seat: 3, displayName: "Cat", gamesWon: 1, outcome: "loss" },
      ],
    })
    const { deck } = await statsFor(t, deckId)
    expect(deck).toBeNull()
    expect((await t.run((ctx) => ctx.db.query("matches").collect()))[0].seats).toHaveLength(3)
  })

  it("leaves deck stats alone when no deck is attached", async () => {
    const t = convexTest(schema, modules)
    const { actor, deckId } = await owner(t)
    await actor.mutation(api.matches.recordManualMatch, {
      publicId: "manual-match-000003",
      bestOf: 3,
      finishedAt: FINISHED_AT,
      me: { seat: 1, outcome: "loss" },
      opponents: [{ seat: 2, displayName: "Bob", outcome: "win" }],
    })
    expect(await statsFor(t, deckId)).toEqual({ deck: null, version: null })
    const rows = await t.run(async (ctx) => ({
      matches: await ctx.db.query("matches").collect(),
      history: await ctx.db.query("gameHistoryEntries").collect(),
      results: await ctx.db.query("deckMatchResults").collect(),
    }))
    expect(rows.matches[0].system).toBeUndefined()
    expect(rows.history).toHaveLength(1)
    expect(rows.results).toHaveLength(0)
  })

  it("rejects another user's publicId and another user's deck", async () => {
    const t = convexTest(schema, modules)
    const alice = await owner(t)
    const bob = await owner(t, "match-other")
    await alice.actor.mutation(api.matches.recordManualMatch, twoPlayer(alice.deckVersionId))
    await expect(
      bob.actor.mutation(api.matches.recordManualMatch, twoPlayer(bob.deckVersionId)),
    ).rejects.toThrow("Match already recorded")
    await expect(
      bob.actor.mutation(
        api.matches.recordManualMatch,
        twoPlayer(alice.deckVersionId, "manual-match-000009"),
      ),
    ).rejects.toThrow("Deck not found")
    expect((await statsFor(t, bob.deckId)).deck).toBeNull()
  })

  it("rejects an archived version", async () => {
    const t = convexTest(schema, modules)
    const { actor, deckVersionId } = await owner(t)
    await t.run((ctx) => ctx.db.patch(deckVersionId, { archivedAt: Date.now() }))
    await expect(
      actor.mutation(api.matches.recordManualMatch, twoPlayer(deckVersionId)),
    ).rejects.toThrow("Deck not found")
  })

  it.each([
    {
      name: "duplicate seats",
      patch: { opponents: [{ seat: 1, displayName: "Bob", outcome: "loss" as const }] },
      message: "Seats must be unique",
    },
    {
      name: "too many wins for the best of",
      patch: { me: { seat: 1, gamesWon: 3, outcome: "win" as const } },
      message: "Games won must be 0–2",
    },
    {
      name: "two seats splitting more games than the best of",
      patch: {
        me: { seat: 1, gamesWon: 2, outcome: "win" as const },
        opponents: [{ seat: 2, displayName: "Bob", gamesWon: 2, outcome: "loss" as const }],
      },
      message: "cannot have 4 wins",
    },
    {
      name: "two winners",
      patch: {
        opponents: [{ seat: 2, displayName: "Bob", gamesWon: 1, outcome: "win" as const }],
      },
      message: "only have one winner",
    },
    {
      name: "a far-future date",
      patch: { finishedAt: Date.now() + 3 * 24 * 60 * 60 * 1000 },
      message: "cannot be in the future",
    },
    {
      name: "a partial score",
      patch: { opponents: [{ seat: 2, displayName: "Bob", outcome: "loss" as const }] },
      message: "every seat or leave the score blank",
    },
    {
      name: "a score that contradicts the result",
      patch: {
        me: { seat: 1, gamesWon: 0, outcome: "win" as const },
        opponents: [{ seat: 2, displayName: "Bob", gamesWon: 2, outcome: "loss" as const }],
      },
      message: "winner must have the most game wins",
    },
    {
      name: "a pod with no winner and no draw",
      patch: {
        me: { seat: 1, outcome: "loss" as const },
        opponents: [
          { seat: 2, displayName: "Bob", outcome: "loss" as const },
          { seat: 3, displayName: "Cat", outcome: "loss" as const },
        ],
      },
      message: "needs a winner unless it was drawn",
    },
    {
      name: "a format without a system",
      patch: { format: "modern" },
      message: "Format requires a game system",
    },
  ])("rejects $name", async ({ patch, message }) => {
    const t = convexTest(schema, modules)
    const { actor, deckVersionId } = await owner(t)
    await expect(
      actor.mutation(api.matches.recordManualMatch, { ...twoPlayer(deckVersionId), ...patch }),
    ).rejects.toThrow(message)
  })
})

describe("deleteManualMatch", () => {
  it("removes the rows and reverses the counters it added", async () => {
    const t = convexTest(schema, modules)
    const { actor, deckId, deckVersionId } = await owner(t)
    await actor.mutation(api.matches.recordManualMatch, {
      ...twoPlayer(deckVersionId, "manual-match-keep01"),
      me: { seat: 1, deckVersionId, gamesWon: 0, gamesDrawn: 0, outcome: "loss" },
      opponents: [{ seat: 2, displayName: "Bob", gamesWon: 2, gamesDrawn: 0, outcome: "win" }],
    })
    const { matchId } = await actor.mutation(
      api.matches.recordManualMatch,
      twoPlayer(deckVersionId),
    )
    await actor.mutation(api.matches.deleteManualMatch, { matchId })

    const rows = await t.run(async (ctx) => ({
      matches: await ctx.db.query("matches").collect(),
      history: await ctx.db.query("gameHistoryEntries").collect(),
      results: await ctx.db.query("deckMatchResults").collect(),
    }))
    expect(rows.matches.map((match) => match.publicId)).toEqual(["manual-match-keep01"])
    expect(rows.history).toHaveLength(1)
    expect(rows.results).toHaveLength(1)
    const { deck, version } = await statsFor(t, deckId)
    const expected = {
      manualMatches: { total: 1, wins: 0, losses: 1, draws: 0, unknown: 0 },
      manualGames: { total: 2, wins: 0, losses: 2, draws: 0, unknown: 0 },
    }
    expect(deck).toMatchObject(expected)
    expect(version).toMatchObject(expected)
  })

  it("only lets the owner delete", async () => {
    const t = convexTest(schema, modules)
    const alice = await owner(t)
    const bob = await owner(t, "match-other")
    const { matchId } = await alice.actor.mutation(
      api.matches.recordManualMatch,
      twoPlayer(alice.deckVersionId),
    )
    await expect(bob.actor.mutation(api.matches.deleteManualMatch, { matchId })).rejects.toThrow(
      "Match not found",
    )
    expect(await t.run((ctx) => ctx.db.get(matchId))).not.toBeNull()
  })
})

describe("account deletion", () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    jest.clearAllTimers()
    jest.useRealTimers()
  })

  it("deletes the owner's manual matches with their history and deck results", async () => {
    const t = convexTest(schema, modules)
    const { actor, deckVersionId } = await owner(t)
    await actor.mutation(api.matches.recordManualMatch, twoPlayer(deckVersionId))
    const requestId = await t.run(async (ctx) => {
      const user = (await ctx.db.query("users").first())!
      return await ctx.db.insert("accountDeletionRequests", {
        clerkUserId: user.clerkUserId,
        userId: user._id,
        status: "processing",
        attempts: 0,
        requestedAt: Date.now(),
        updatedAt: Date.now(),
      })
    })
    for (let step = 0; step < 6; step += 1)
      await t.mutation(internal.accountDeletion.processUserLinkedData, { requestId })

    const rows = await t.run(async (ctx) => ({
      matches: await ctx.db.query("matches").collect(),
      history: await ctx.db.query("gameHistoryEntries").collect(),
      results: await ctx.db.query("deckMatchResults").collect(),
    }))
    expect(rows).toEqual({ matches: [], history: [], results: [] })
  })
})
