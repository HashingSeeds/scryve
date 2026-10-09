import type { FunctionArgs } from "convex/server"
import { convexTest, type TestConvex } from "convex-test"

import { api, internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import schema from "./schema"

const modules = {
  "./_generated/api.ts": async () => jest.requireActual("./_generated/api"),
  "./_generated/server.ts": async () => jest.requireActual("./_generated/server"),
  "./decks.ts": async () => jest.requireActual("./decks"),
  "./entitlements.ts": async () => jest.requireActual("./entitlements"),
  "./games.ts": async () => jest.requireActual("./games"),
  "./integrationManifest.ts": async () => jest.requireActual("./integrationManifest"),
  "./matches.ts": async () => jest.requireActual("./matches"),
  "./resultsBackfill.ts": async () => jest.requireActual("./resultsBackfill"),
  "./users.ts": async () => jest.requireActual("./users"),
}

const FINISHED_AT = 1_700_000_900_000
type Tester = TestConvex<typeof schema>
type PublishArgs = FunctionArgs<typeof api.games.publishFinishedLocalGame>

async function publish(
  owner: ReturnType<Tester["withIdentity"]>,
  publicId: string,
  deckVersionId: Id<"deckVersions">,
  result: PublishArgs["result"],
) {
  await owner.mutation(api.games.publishFinishedLocalGame, {
    publicId,
    system: "mtg",
    format: "commander",
    ruleset: "commander",
    startingLife: 40,
    startedAt: FINISHED_AT - 60_000,
    finishedAt: FINISHED_AT,
    eventCount: 3,
    players: [
      {
        localId: "me",
        seat: 1,
        displayName: "Ada",
        color: "#7C3AED",
        currentLife: 12,
        me: true,
        deckVersionId,
      },
      { localId: "them", seat: 2, displayName: "Grace", color: "#2563EB", currentLife: 0 },
    ],
    result,
  })
}

// why: before #350 an abandoned game recorded an unknown result, which is a no-winner publish plus an abandoned summary.
async function markAbandoned(t: Tester, publicId: string) {
  await t.run(async (ctx) => {
    const summary = await ctx.db
      .query("gameSummaries")
      .withIndex("by_public_id", (q) => q.eq("publicId", publicId))
      .unique()
    await ctx.db.patch(summary!._id, { terminalStatus: "abandoned" })
  })
}

async function seed(t: Tester) {
  const owner = t.withIdentity({ subject: "owner" })
  await owner.mutation(api.users.syncCurrent, { displayName: "Owner" })
  const deckA = await owner.mutation(api.decks.create, { name: "Atraxa", format: "commander" })
  const versionA = await owner.mutation(api.decks.saveVersion, { deckId: deckA, cards: [] })
  const deckB = await owner.mutation(api.decks.create, { name: "Edgar", format: "commander" })
  const versionB = await owner.mutation(api.decks.saveVersion, { deckId: deckB, cards: [] })
  await publish(owner, "game_won_0000000000001", versionA, { kind: "win", winnerLocalIds: ["me"] })
  await publish(owner, "game_nowinner_000000001", versionA, { kind: "unknown" })
  await publish(owner, "game_abandoned_00000001", versionA, { kind: "unknown" })
  await publish(owner, "game_abandoned_00000002", versionB, { kind: "unknown" })
  await markAbandoned(t, "game_abandoned_00000001")
  await markAbandoned(t, "game_abandoned_00000002")
  await owner.mutation(api.matches.recordManualMatch, {
    publicId: "manual_match_00000000001",
    bestOf: 3,
    finishedAt: FINISHED_AT,
    me: { seat: 1, gamesWon: 2, outcome: "win", deckVersionId: versionA },
    opponents: [{ seat: 2, displayName: "Grace", gamesWon: 1, outcome: "loss" }],
  })
  return { deckA, versionA, deckB, versionB }
}

async function state(t: Tester) {
  return await t.run(async (ctx) => {
    const strip = <T extends { _id: unknown; _creationTime: number; updatedAt: number }>(
      row: T | undefined,
    ) => {
      if (!row) return row
      const { _id, _creationTime, updatedAt: _updatedAt, ...rest } = row
      return rest
    }
    const results = await ctx.db.query("deckGameResults").collect()
    const games = await Promise.all(results.map((result) => ctx.db.get(result.gameId)))
    return {
      results: games.map((game) => game?.publicId).sort(),
      outcomes: results.map((result) => result.outcome).sort(),
      stats: (await ctx.db.query("deckStats").collect()).map(strip),
      versionStats: (await ctx.db.query("deckVersionStats").collect()).map(strip),
    }
  })
}

async function runBackfill(t: Tester, args: { numItems: number; dryRun?: boolean }) {
  const first = await t.mutation(internal.resultsBackfill.removeAbandonedGameResults, {
    paginationOpts: { numItems: args.numItems, cursor: null },
    ...(args.dryRun ? { dryRun: true } : {}),
  })
  await t.finishAllScheduledFunctions(() => jest.runAllTimers())
  return first
}

describe("removeAbandonedGameResults", () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it("removes only abandoned games and keeps finished no-winner games counting", async () => {
    const t = convexTest(schema, modules)
    const { deckA, deckB } = await seed(t)
    const before = await state(t)
    expect(before.results).toHaveLength(4)
    expect(before.stats.find((row) => row?.deckId === deckA)).toMatchObject({
      games: 3,
      wins: 1,
      unknown: 2,
    })

    await runBackfill(t, { numItems: 1 })
    const after = await state(t)
    expect(after.results).toEqual(["game_nowinner_000000001", "game_won_0000000000001"])
    expect(after.outcomes).toEqual(["unknown", "win"])
    const manualMatches = { total: 1, wins: 1, losses: 0, draws: 0, unknown: 0 }
    const manualGames = { total: 3, wins: 2, losses: 1, draws: 0, unknown: 0 }
    expect(after.stats).toEqual([
      {
        deckId: deckA,
        games: 2,
        wins: 1,
        losses: 0,
        draws: 0,
        unknown: 1,
        manualMatches,
        manualGames,
      },
      { deckId: deckB, games: 0, wins: 0, losses: 0, draws: 0, unknown: 0 },
    ])
    expect(after.versionStats.map((row) => row && { ...row, deckVersionId: undefined })).toEqual(
      after.stats.map((row) => row && { ...row, deckVersionId: undefined }),
    )

    await runBackfill(t, { numItems: 1 })
    expect(await state(t)).toEqual(after)
  })

  it("reaches the same result when a run is interrupted and restarted from the beginning", async () => {
    const reference = convexTest(schema, modules)
    await seed(reference)
    await runBackfill(reference, { numItems: 50 })

    const t = convexTest(schema, modules)
    await seed(t)
    // why: the first batch's continuation stays queued, standing in for a run cut off mid-way.
    const first = await t.mutation(internal.resultsBackfill.removeAbandonedGameResults, {
      paginationOpts: { numItems: 2, cursor: null },
    })
    expect(first.isDone).toBe(false)
    await runBackfill(t, { numItems: 1 })
    const ids = (rows: Awaited<ReturnType<typeof state>>) => ({
      ...rows,
      stats: rows.stats.map((row) => row && { ...row, deckId: undefined }),
      versionStats: rows.versionStats.map(
        (row) => row && { ...row, deckId: undefined, deckVersionId: undefined },
      ),
    })
    expect(ids(await state(t))).toEqual(ids(await state(reference)))
  })

  it("counts without writing on a dry run", async () => {
    const t = convexTest(schema, modules)
    await seed(t)
    const before = await state(t)
    const log = jest.spyOn(console, "log").mockImplementation(() => {})
    try {
      await runBackfill(t, { numItems: 1, dryRun: true })
      expect(log).toHaveBeenLastCalledWith(expect.stringMatching(/dry run .* total=2 done=true$/))
    } finally {
      log.mockRestore()
    }
    expect(await state(t)).toEqual(before)
  })
})
