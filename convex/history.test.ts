import { convexTest, type TestConvex } from "convex-test"

import { api } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import schema from "./schema"

const modules = {
  "./_generated/api.ts": async () => jest.requireActual("./_generated/api"),
  "./_generated/server.ts": async () => jest.requireActual("./_generated/server"),
  "./games.ts": async () => jest.requireActual("./games"),
  "./history.ts": async () => jest.requireActual("./history"),
  "./matches.ts": async () => jest.requireActual("./matches"),
  "./users.ts": async () => jest.requireActual("./users"),
}

const MATCH_AT = Date.UTC(2026, 9, 3)
const GAME_AT = Date.UTC(2026, 9, 2)
const PUBLIC_ID = "manual-match-000001"

async function signedIn(t: TestConvex<typeof schema>, subject: string, displayName: string) {
  const actor = t.withIdentity({ subject })
  await actor.mutation(api.users.syncCurrent, { displayName })
  const userId = await t.run(async (ctx) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_user", (q) => q.eq("clerkUserId", subject))
      .unique()
    return user!._id
  })
  return { actor, userId }
}

async function seedGame(t: TestConvex<typeof schema>, userId: Id<"users">) {
  await t.run(async (ctx) => {
    const gameId = await ctx.db.insert("games", {
      publicId: "history-game-0000000000000001",
      hostUserId: userId,
      mode: "connected",
      status: "finished",
      playerCount: 2,
      startingLife: 20,
      ruleset: "standard",
      createdAt: GAME_AT,
      updatedAt: GAME_AT,
    })
    const summaryId = await ctx.db.insert("gameSummaries", {
      gameId,
      publicId: "history-game-0000000000000001",
      terminalStatus: "finished",
      startingLife: 20,
      ruleset: "standard",
      eventCount: 3,
      finishedAt: GAME_AT,
      players: [],
    })
    await ctx.db.insert("gameHistoryEntries", {
      userId,
      gameId,
      summaryId,
      finishedAt: GAME_AT,
      outcome: "loss",
    })
  })
}

async function recordMatch(actor: ReturnType<TestConvex<typeof schema>["withIdentity"]>) {
  return await actor.mutation(api.matches.recordManualMatch, {
    publicId: PUBLIC_ID,
    bestOf: 3,
    finishedAt: MATCH_AT,
    eventName: "FNM",
    roundNumber: 2,
    me: { seat: 1, gamesWon: 2, gamesDrawn: 0, outcome: "win" },
    opponents: [{ seat: 2, displayName: "Bob", deckName: "Burn", gamesWon: 1, outcome: "loss" }],
  })
}

describe("history.entries", () => {
  it("lists manual matches and Scryve games in one page, newest first", async () => {
    const t = convexTest(schema, modules)
    const { actor, userId } = await signedIn(t, "history-owner", "Alice")
    await seedGame(t, userId)
    const { matchId } = await recordMatch(actor)

    const result = await actor.query(api.history.entries, {
      paginationOpts: { cursor: null, numItems: 10 },
    })

    expect(result.isDone).toBe(true)
    expect(result.migrationRequired).toBe(true)
    expect(result.page).toEqual([
      {
        kind: "match",
        matchId,
        publicId: PUBLIC_ID,
        bestOf: 3,
        eventName: "FNM",
        roundNumber: 2,
        finishedAt: MATCH_AT,
        outcome: "win",
        seats: [
          { seat: 1, displayName: "Alice", gamesWon: 2, gamesDrawn: 0, outcome: "win", mine: true },
          {
            seat: 2,
            displayName: "Bob",
            deckName: "Burn",
            gamesWon: 1,
            outcome: "loss",
            mine: false,
          },
        ],
      },
      expect.objectContaining({
        kind: "game",
        publicId: "history-game-0000000000000001",
        eventCount: 3,
        finishedAt: GAME_AT,
        outcome: "loss",
        terminalStatus: "finished",
      }),
    ])
    const game = result.page[1]
    expect(game.kind === "game" && game.source).toBeUndefined()
  })
})

describe("history.manualMatch", () => {
  it("lets a player without a username save, open, and delete a result", async () => {
    const t = convexTest(schema, modules)
    const { actor, userId } = await signedIn(t, "history-no-username", "Jane")
    const user = await t.run((ctx) => ctx.db.get(userId))
    expect(user?.username).toBeUndefined()
    const { matchId } = await recordMatch(actor)

    await expect(
      actor.query(api.history.manualMatch, { publicId: PUBLIC_ID }),
    ).resolves.toMatchObject({ matchId })
    await actor.mutation(api.matches.deleteManualMatch, { matchId })

    await expect(actor.query(api.history.manualMatch, { publicId: PUBLIC_ID })).resolves.toBeNull()
    const page = await actor.query(api.history.entries, {
      paginationOpts: { cursor: null, numItems: 10 },
    })
    expect(page.page).toEqual([])
  })

  it("returns the owner's match and hides it from everyone else", async () => {
    const t = convexTest(schema, modules)
    const { actor } = await signedIn(t, "history-owner", "Alice")
    const stranger = (await signedIn(t, "history-stranger", "Mallory")).actor
    const { matchId } = await recordMatch(actor)

    await expect(
      actor.query(api.history.manualMatch, { publicId: PUBLIC_ID }),
    ).resolves.toMatchObject({
      matchId,
      bestOf: 3,
      seats: [expect.objectContaining({ mine: true }), expect.anything()],
    })
    await expect(
      stranger.query(api.history.manualMatch, { publicId: PUBLIC_ID }),
    ).resolves.toBeNull()
    await expect(t.query(api.history.manualMatch, { publicId: PUBLIC_ID })).rejects.toThrow()
  })
})
