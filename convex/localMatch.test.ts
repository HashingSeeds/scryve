import type { FunctionArgs } from "convex/server"
import { convexTest, type TestConvex } from "convex-test"

import { api, internal } from "./_generated/api"
import type { Doc, Id } from "./_generated/dataModel"
import schema from "./schema"

const modules = {
  "./_generated/api.ts": async () => jest.requireActual("./_generated/api"),
  "./_generated/server.ts": async () => jest.requireActual("./_generated/server"),
  "./accountDeletion.ts": async () => jest.requireActual("./accountDeletion"),
  "./deckCatalogs.ts": async () => jest.requireActual("./deckCatalogs"),
  "./decks.ts": async () => jest.requireActual("./decks"),
  "./entitlements.ts": async () => jest.requireActual("./entitlements"),
  "./games.ts": async () => jest.requireActual("./games"),
  "./integrationManifest.ts": async () => jest.requireActual("./integrationManifest"),
  "./matches.ts": async () => jest.requireActual("./matches"),
  "./users.ts": async () => jest.requireActual("./users"),
}

const STARTED_AT = 1_700_000_000_000
const MATCH_ID = "match_local_bo3_000001"

type PublishArgs = FunctionArgs<typeof api.games.publishFinishedLocalGame>

async function owner(t: TestConvex<typeof schema>, subject = "owner") {
  const actor = t.withIdentity({ subject })
  await actor.mutation(api.users.syncCurrent, { displayName: "Ada" })
  const deckId = await actor.mutation(api.decks.create, { name: "Burn", format: "modern" })
  const versionId = await actor.mutation(api.decks.saveVersion, { deckId, cards: [] })
  return { actor, deckId, versionId }
}

/** why: every game of the match keeps the same two seats; only the winner and order change. */
function matchGame(
  gameNumber: number,
  winner: "me" | "them" | "draw",
  versionId?: Id<"deckVersions">,
  bestOf: 1 | 3 | 5 = 3,
): PublishArgs {
  const finishedAt = STARTED_AT + gameNumber * 60_000
  return {
    publicId: `game_local_match_${String(gameNumber).padStart(6, "0")}`,
    system: "mtg",
    format: "modern",
    ruleset: "modern",
    startingLife: 20,
    startedAt: finishedAt - 30_000,
    finishedAt,
    eventCount: 3,
    players: [
      {
        localId: "player_me",
        seat: 1,
        displayName: "Ada",
        color: "#7C3AED",
        currentLife: 4,
        me: true,
        ...(versionId ? { deckVersionId: versionId } : {}),
      },
      { localId: "player_them", seat: 2, displayName: "Grace", color: "#2563EB", currentLife: 0 },
    ],
    result:
      winner === "draw"
        ? { kind: "draw" }
        : { kind: "win", winnerLocalIds: [winner === "me" ? "player_me" : "player_them"] },
    match: { publicId: MATCH_ID, bestOf, gameNumber },
  }
}

function finish(
  seats: { seat: number; gamesWon: number; gamesDrawn: number; outcome: "win" | "loss" | "draw" }[],
) {
  return { publicId: MATCH_ID, finishedAt: STARTED_AT + 4 * 60_000, seats }
}

async function rows(t: TestConvex<typeof schema>) {
  return await t.run(async (ctx) => ({
    matches: (await ctx.db.query("matches").collect()).filter(
      (match): match is Extract<Doc<"matches">, { source: "connected" }> =>
        match.source === "connected",
    ),
    games: await ctx.db.query("games").collect(),
    summaries: await ctx.db.query("gameSummaries").collect(),
    history: await ctx.db.query("gameHistoryEntries").collect(),
    results: await ctx.db.query("deckMatchResults").collect(),
    stats: await ctx.db.query("deckStats").collect(),
    versionStats: await ctx.db.query("deckVersionStats").collect(),
  }))
}

describe("publishFinishedLocalGame with a match", () => {
  it("creates the match with the first game and links every later game in order", async () => {
    const t = convexTest(schema, modules)
    const { actor, deckId, versionId } = await owner(t)
    await actor.mutation(api.games.publishFinishedLocalGame, matchGame(1, "me", versionId))
    const first = await rows(t)
    expect(first.matches).toHaveLength(1)
    expect(first.matches[0]).toMatchObject({
      publicId: MATCH_ID,
      source: "connected",
      status: "active",
      bestOf: 3,
      system: "mtg",
      format: "modern",
      gameIds: [first.games[0]._id],
    })
    expect(first.matches[0].seats).toEqual([
      expect.objectContaining({ seat: 1, displayName: "Ada", deckId, deckVersionId: versionId }),
      { seat: 2, displayName: "Grace" },
    ])
    const matchId = first.matches[0]._id
    expect(first.games[0].matchId).toBe(matchId)
    expect(first.summaries[0].matchId).toBe(matchId)
    expect(first.history).toEqual([expect.objectContaining({ matchId, source: "local" })])

    await actor.mutation(api.games.publishFinishedLocalGame, matchGame(2, "them", versionId))
    await actor.mutation(api.games.publishFinishedLocalGame, matchGame(2, "them", versionId))
    await actor.mutation(api.games.publishFinishedLocalGame, matchGame(3, "me", versionId))
    const later = await rows(t)
    expect(later.matches).toHaveLength(1)
    const byPublicId = new Map(later.games.map((game) => [game._id, game.publicId]))
    expect(later.matches[0].gameIds.map((id) => byPublicId.get(id))).toEqual([
      "game_local_match_000001",
      "game_local_match_000002",
      "game_local_match_000003",
    ])
    expect(later.games.every((game) => game.matchId === matchId)).toBe(true)
    expect(later.history.filter((entry) => entry.matchId === matchId)).toHaveLength(3)
  })

  it("places a late retry by game order and caps a match at ten games", async () => {
    const t = convexTest(schema, modules)
    const { actor } = await owner(t)
    await actor.mutation(api.games.publishFinishedLocalGame, matchGame(2, "draw", undefined, 5))
    await actor.mutation(api.games.publishFinishedLocalGame, matchGame(1, "draw", undefined, 5))
    for (let number = 3; number <= 10; number += 1)
      await actor.mutation(
        api.games.publishFinishedLocalGame,
        matchGame(number, "draw", undefined, 5),
      )
    const { matches, games } = await rows(t)
    const byPublicId = new Map(games.map((game) => [game._id, game.publicId]))
    expect(matches[0].gameIds.map((id) => byPublicId.get(id)?.slice(-2))).toEqual([
      "01",
      "02",
      "03",
      "04",
      "05",
      "06",
      "07",
      "08",
      "09",
      "10",
    ])
    expect(games.every((game) => game.matchId === matches[0]._id)).toBe(true)
    await expect(
      actor.mutation(api.games.publishFinishedLocalGame, matchGame(11, "draw", undefined, 5)),
    ).rejects.toThrow("at most 10 games")
  })

  it("refuses to attach a game to another account's match", async () => {
    const t = convexTest(schema, modules)
    const ada = await owner(t)
    const bob = await owner(t, "bob")
    await ada.actor.mutation(api.games.publishFinishedLocalGame, matchGame(1, "me"))
    await expect(
      bob.actor.mutation(api.games.publishFinishedLocalGame, {
        ...matchGame(2, "me"),
        publicId: "game_local_match_bob_01",
      }),
    ).rejects.toThrow("another account")
  })
})

describe("finishScryveMatch", () => {
  it("finalizes once, records the deck result, and counts the match for the deck", async () => {
    const t = convexTest(schema, modules)
    const { actor, deckId, versionId } = await owner(t)
    for (const [number, winner] of [
      [1, "me"],
      [2, "them"],
      [3, "me"],
    ] as const)
      await actor.mutation(api.games.publishFinishedLocalGame, matchGame(number, winner, versionId))
    const args = finish([
      { seat: 1, gamesWon: 2, gamesDrawn: 0, outcome: "win" },
      { seat: 2, gamesWon: 1, gamesDrawn: 0, outcome: "loss" },
    ])
    const first = await actor.mutation(api.matches.finishScryveMatch, args)
    const retry = await actor.mutation(api.matches.finishScryveMatch, args)
    expect(retry).toEqual(first)

    const { matches, results, stats, versionStats, history } = await rows(t)
    expect(matches[0]).toMatchObject({ status: "finished", finishedAt: args.finishedAt })
    expect(matches[0].seats).toEqual([
      expect.objectContaining({ seat: 1, gamesWon: 2, gamesDrawn: 0, outcome: "win" }),
      expect.objectContaining({ seat: 2, gamesWon: 1, gamesDrawn: 0, outcome: "loss" }),
    ])
    expect(results).toEqual([
      expect.objectContaining({
        deckId,
        deckVersionId: versionId,
        matchId: first.matchId,
        source: "connected",
        outcome: "win",
      }),
    ])
    const counted = { total: 1, wins: 1, losses: 0, draws: 0, unknown: 0 }
    expect(stats[0]).toMatchObject({ games: 3, wins: 2, losses: 1, connectedMatches: counted })
    expect(versionStats[0]).toMatchObject({ games: 3, wins: 2, connectedMatches: counted })
    expect(stats[0].manualMatches).toBeUndefined()
    // why: the games are the history; a finished match adds no row of its own.
    expect(history).toHaveLength(3)

    await t.mutation(internal.entitlements.setUserFeature, {
      clerkUserId: "owner",
      feature: "deck_analytics",
      enabled: true,
      source: "test",
    })
    await expect(actor.query(api.decks.stats, { deckId })).resolves.toMatchObject({
      connected: { games: { total: 3, wins: 2, losses: 1 }, matches: counted },
      manual: {},
    })
  })

  it("draws a called pod round for the seats still playing", async () => {
    const t = convexTest(schema, modules)
    const { actor, versionId } = await owner(t)
    await actor.mutation(api.games.publishFinishedLocalGame, {
      ...matchGame(1, "draw", versionId, 1),
      players: [
        ...matchGame(1, "draw", versionId, 1).players,
        { localId: "player_c", seat: 3, displayName: "Cat", color: "#10B981", currentLife: 12 },
        { localId: "player_d", seat: 4, displayName: "Dan", color: "#F59E0B", currentLife: 0 },
      ],
    })
    await actor.mutation(
      api.matches.finishScryveMatch,
      finish([
        { seat: 1, gamesWon: 0, gamesDrawn: 1, outcome: "draw" },
        { seat: 2, gamesWon: 0, gamesDrawn: 1, outcome: "loss" },
        { seat: 3, gamesWon: 0, gamesDrawn: 1, outcome: "draw" },
        { seat: 4, gamesWon: 0, gamesDrawn: 1, outcome: "loss" },
      ]),
    )
    const { matches, stats } = await rows(t)
    expect(matches[0].seats.map((seat) => seat.outcome)).toEqual(["draw", "loss", "draw", "loss"])
    expect(stats[0].connectedMatches).toEqual({
      total: 1,
      wins: 0,
      losses: 0,
      draws: 1,
      unknown: 0,
    })
  })

  it.each([
    {
      name: "two winners",
      seats: [
        { seat: 1, gamesWon: 2, gamesDrawn: 0, outcome: "win" as const },
        { seat: 2, gamesWon: 1, gamesDrawn: 0, outcome: "win" as const },
      ],
      message: "only have one winner",
    },
    {
      name: "a winner who is behind",
      seats: [
        { seat: 1, gamesWon: 1, gamesDrawn: 0, outcome: "win" as const },
        { seat: 2, gamesWon: 2, gamesDrawn: 0, outcome: "loss" as const },
      ],
      message: "winner must have the most game wins",
    },
    {
      name: "a missing seat",
      seats: [{ seat: 1, gamesWon: 2, gamesDrawn: 0, outcome: "win" as const }],
      message: "every seat exactly once",
    },
  ])("rejects $name and leaves the match active", async ({ seats, message }) => {
    const t = convexTest(schema, modules)
    const { actor } = await owner(t)
    await actor.mutation(api.games.publishFinishedLocalGame, matchGame(1, "me"))
    await expect(actor.mutation(api.matches.finishScryveMatch, finish(seats))).rejects.toThrow(
      message,
    )
    expect((await rows(t)).matches[0].status).toBe("active")
  })

  it("only lets the owner finish", async () => {
    const t = convexTest(schema, modules)
    const ada = await owner(t)
    const bob = await owner(t, "bob")
    await ada.actor.mutation(api.games.publishFinishedLocalGame, matchGame(1, "me"))
    await expect(
      bob.actor.mutation(
        api.matches.finishScryveMatch,
        finish([
          { seat: 1, gamesWon: 2, gamesDrawn: 0, outcome: "win" },
          { seat: 2, gamesWon: 0, gamesDrawn: 0, outcome: "loss" },
        ]),
      ),
    ).rejects.toThrow("Match not found")
  })
})

describe("account deletion", () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    jest.clearAllTimers()
    jest.useRealTimers()
  })

  it("anonymizes a deleted player's seat on a match someone else owns", async () => {
    const t = convexTest(schema, modules)
    const ada = await owner(t)
    await owner(t, "bob")
    await ada.actor.mutation(api.games.publishFinishedLocalGame, matchGame(1, "me"))
    // why: connected match mode will seat other accounts; until then the seat is linked by hand.
    const bobUserId = await t.run(async (ctx) => {
      const user = (await ctx.db
        .query("users")
        .withIndex("by_clerk_user", (q) => q.eq("clerkUserId", "bob"))
        .unique())!
      const match = (await ctx.db.query("matches").first())!
      const game = (await ctx.db.query("games").first())!
      const seat = (await ctx.db
        .query("gamePlayers")
        .withIndex("by_game_seat", (q) => q.eq("gameId", game._id).eq("seat", 2))
        .unique())!
      await ctx.db.patch(seat._id, { userId: user._id })
      await ctx.db.patch(match._id, {
        seats: match.seats.map((candidate) =>
          candidate.seat === 2
            ? { ...candidate, userId: user._id, deckName: "Secret tech" }
            : candidate,
        ),
      })
      return user._id
    })
    const requestId = await t.run(async (ctx) =>
      ctx.db.insert("accountDeletionRequests", {
        clerkUserId: "bob",
        userId: bobUserId,
        status: "processing",
        attempts: 0,
        requestedAt: Date.now(),
        updatedAt: Date.now(),
      }),
    )
    await t.mutation(internal.accountDeletion.processMemberships, { requestId })
    const { matches } = await rows(t)
    expect(matches[0].seats).toEqual([
      expect.objectContaining({ seat: 1, displayName: "Ada" }),
      expect.objectContaining({
        seat: 2,
        displayName: "Deleted player",
        deletedAt: expect.any(Number),
      }),
    ])
    expect(matches[0].seats[1].userId).toBeUndefined()
    expect(matches[0].seats[1].deckName).toBeUndefined()
    expect(matches[0].ownerUserId).toBeDefined()
    expect(matches[0].ownerUserId).not.toBe(bobUserId)
  })
})
