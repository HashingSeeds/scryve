import type { FunctionArgs } from "convex/server"
import { convexTest } from "convex-test"

import { api, internal } from "./_generated/api"
import schema from "./schema"

const modules = {
  "./_generated/api.ts": async () => jest.requireActual("./_generated/api"),
  "./_generated/server.ts": async () => jest.requireActual("./_generated/server"),
  "./accountDeletion.ts": async () => jest.requireActual("./accountDeletion"),
  "./deckCatalogs.ts": async () => jest.requireActual("./deckCatalogs"),
  "./decks.ts": async () => jest.requireActual("./decks"),
  "./entitlements.ts": async () => jest.requireActual("./entitlements"),
  "./games.ts": async () => jest.requireActual("./games"),
  "./history.ts": async () => jest.requireActual("./history"),
  "./integrationManifest.ts": async () => jest.requireActual("./integrationManifest"),
  "./users.ts": async () => jest.requireActual("./users"),
}

const FINISHED_AT = 1_700_000_900_000

async function synced(t: ReturnType<typeof convexTest>, subject: string, name: string) {
  const actor = t.withIdentity({ subject })
  await actor.mutation(api.users.syncCurrent, { displayName: name })
  return actor
}

type PublishArgs = FunctionArgs<typeof api.games.publishFinishedLocalGame>

function finishedGame(overrides: Partial<PublishArgs> = {}): PublishArgs {
  return {
    publicId: "game_local_finished_000001",
    system: "mtg",
    format: "commander",
    ruleset: "commander",
    startingLife: 40,
    startedAt: FINISHED_AT - 60_000,
    finishedAt: FINISHED_AT,
    eventCount: 7,
    players: [
      { localId: "player_a", seat: 1, displayName: "Ada", color: "#7C3AED", currentLife: 12 },
      { localId: "player_b", seat: 2, displayName: "Grace", color: "#2563EB", currentLife: 0 },
    ],
    result: { kind: "win" as const, winnerLocalIds: ["player_a"] },
    ...overrides,
  }
}

async function ownedDeck(actor: ReturnType<ReturnType<typeof convexTest>["withIdentity"]>) {
  const deckId = await actor.mutation(api.decks.create, { name: "Atraxa", format: "commander" })
  const versionId = await actor.mutation(api.decks.saveVersion, { deckId, cards: [] })
  return { deckId, versionId }
}

describe("publishFinishedLocalGame", () => {
  it("records the account's seat and deck once, and returns the same result on retry", async () => {
    const t = convexTest(schema, modules)
    const owner = await synced(t, "owner", "Owner")
    const { deckId, versionId } = await ownedDeck(owner)
    const args = finishedGame()
    args.players[0] = { ...args.players[0], me: true, deckVersionId: versionId }

    const first = await owner.mutation(api.games.publishFinishedLocalGame, args)
    const second = await owner.mutation(api.games.publishFinishedLocalGame, args)
    expect(second).toEqual(first)
    expect(first.finishedAt).toBe(FINISHED_AT)

    const history = await owner.query(api.games.connectedHistory, {
      paginationOpts: { numItems: 10, cursor: null },
    })
    expect(history.page).toHaveLength(1)
    expect(history.page[0]).toMatchObject({
      publicId: args.publicId,
      source: "local",
      outcome: "win",
      finishedAt: FINISHED_AT,
      eventCount: 7,
      terminalStatus: "finished",
    })
    expect(history.page[0].players.map((player) => player.deckNameAtFinish)).toEqual([
      "Atraxa",
      undefined,
    ])
    expect(history.page[0].players.map((player) => player.displayName)).toEqual(["Ada", "Grace"])
    const entries = await owner.query(api.history.entries, {
      paginationOpts: { numItems: 10, cursor: null },
    })
    expect(entries.page).toHaveLength(1)
    expect(entries.page[0]).toMatchObject({
      kind: "game",
      source: "local",
      publicId: args.publicId,
      outcome: "win",
      players: [{ displayName: "Ada" }, { displayName: "Grace" }],
    })

    const rows = await t.run(async (ctx) => ({
      games: await ctx.db.query("games").collect(),
      entries: await ctx.db.query("gameHistoryEntries").collect(),
      results: await ctx.db.query("deckGameResults").collect(),
      stats: await ctx.db
        .query("deckStats")
        .withIndex("by_deck", (q) => q.eq("deckId", deckId))
        .unique(),
      versionStats: await ctx.db
        .query("deckVersionStats")
        .withIndex("by_version", (q) => q.eq("deckVersionId", versionId))
        .unique(),
    }))
    expect(rows.stats).toMatchObject({ games: 1, wins: 1, losses: 0 })
    expect(rows.versionStats).toMatchObject({ games: 1, wins: 1 })
    expect(rows.games).toHaveLength(1)
    expect(rows.games[0]).toMatchObject({ mode: "local", status: "finished" })
    expect(rows.entries).toHaveLength(1)
    expect(rows.entries[0]).toMatchObject({ source: "local", outcome: "win" })
    expect(rows.results).toHaveLength(1)
  })

  it("keeps a game with no seat of the user's as a backup with an unknown outcome", async () => {
    const t = convexTest(schema, modules)
    const owner = await synced(t, "owner", "Owner")
    await owner.mutation(api.games.publishFinishedLocalGame, finishedGame())
    const history = await owner.query(api.games.connectedHistory, {
      paginationOpts: { numItems: 10, cursor: null },
    })
    expect(history.page[0]).toMatchObject({ source: "local", outcome: "unknown" })
    const rows = await t.run(async (ctx) => ({
      players: await ctx.db.query("gamePlayers").collect(),
      summaries: await ctx.db.query("gameSummaries").collect(),
      results: await ctx.db.query("deckGameResults").collect(),
    }))
    expect(rows.players.every((player) => player.userId === undefined)).toBe(true)
    expect(rows.summaries[0]).toMatchObject({ resultKind: "win" })
    expect(rows.summaries[0].players.map((player) => player.outcome)).toEqual(["win", "loss"])
    expect(rows.results).toHaveLength(0)
    await expect(
      owner.query(api.games.connectedSummary, { publicId: finishedGame().publicId }),
    ).resolves.toMatchObject({
      resultKind: "win",
      viewerPlayerIds: [],
      players: [{ displayName: "Ada" }, { displayName: "Grace" }],
    })
    const other = await synced(t, "other", "Other")
    await expect(
      other.query(api.games.connectedSummary, { publicId: finishedGame().publicId }),
    ).rejects.toThrow("Host permission required")
  })

  it("rejects decks the user does not own, decks on other seats, and other accounts' ids", async () => {
    const t = convexTest(schema, modules)
    const owner = await synced(t, "owner", "Owner")
    const other = await synced(t, "other", "Other")
    const { versionId } = await ownedDeck(other)
    const base = finishedGame()
    await expect(
      owner.mutation(api.games.publishFinishedLocalGame, {
        ...base,
        players: [{ ...base.players[0], me: true, deckVersionId: versionId }, base.players[1]],
      }),
    ).rejects.toThrow("Deck version not found")
    await expect(
      other.mutation(api.games.publishFinishedLocalGame, {
        ...base,
        players: [base.players[0], { ...base.players[1], deckVersionId: versionId }],
      }),
    ).rejects.toThrow("Only your seat can record a deck")
    await expect(
      other.mutation(api.games.publishFinishedLocalGame, {
        ...base,
        format: "standard",
        ruleset: "standard",
        startingLife: 20,
        players: [{ ...base.players[0], me: true, deckVersionId: versionId }, base.players[1]],
      }),
    ).rejects.toThrow("Choose a deck matching the game format")
    await expect(t.mutation(api.games.publishFinishedLocalGame, base)).rejects.toThrow(
      "Authentication required",
    )

    await owner.mutation(api.games.publishFinishedLocalGame, base)
    await expect(other.mutation(api.games.publishFinishedLocalGame, base)).rejects.toThrow(
      "Game identifier collision",
    )
  })

  it("stores a game without a system as none, not as Magic", async () => {
    const t = convexTest(schema, modules)
    const owner = await synced(t, "owner", "Owner")
    await owner.mutation(api.games.publishFinishedLocalGame, {
      ...finishedGame({ system: undefined, format: undefined, ruleset: "none", startingLife: 20 }),
      players: [
        {
          localId: "player_a",
          seat: 1,
          displayName: "Ada",
          color: "#7C3AED",
          currentLife: 12,
          me: true,
        },
        { localId: "player_b", seat: 2, displayName: "Grace", color: "#2563EB", currentLife: 0 },
      ],
    })
    const rows = await t.run(async (ctx) => ({
      game: await ctx.db.query("games").unique(),
      summary: await ctx.db.query("gameSummaries").unique(),
    }))
    expect(rows.game).toMatchObject({ game: "none", system: "none", ruleset: "none" })
    expect(rows.game?.format).toBeUndefined()
    expect(rows.summary).toMatchObject({ game: "none", system: "none", format: "none" })
    const history = await owner.query(api.history.entries, {
      paginationOpts: { numItems: 10, cursor: null },
    })
    expect(history.page[0]).toMatchObject({ system: "none", format: "none" })
  })

  it("stays finished through stale-game cleanup", async () => {
    const t = convexTest(schema, modules)
    const owner = await synced(t, "owner", "Owner")
    await owner.mutation(api.games.publishFinishedLocalGame, finishedGame())
    await expect(t.mutation(internal.games.cleanupStaleGames, {})).resolves.toMatchObject({
      examined: 0,
      abandoned: 0,
    })
    const game = await t.run(async (ctx) => await ctx.db.query("games").unique())
    expect(game?.status).toBe("finished")
  })

  it("unlinks a published game with no seat of the user's when the account is deleted", async () => {
    // why: deletion phases are driven by hand here, so the scheduler must not run them after the test.
    jest.useFakeTimers()
    const previousClerkSecret = process.env.CLERK_SECRET_KEY
    process.env.CLERK_SECRET_KEY = "sk_test_local_publish"
    const t = convexTest(schema, modules)
    const owner = await synced(t, "owner", "Owner")
    await owner.mutation(api.games.publishFinishedLocalGame, finishedGame())
    const request = await owner.mutation(api.accountDeletion.requestCurrentAccountDeletion, {
      confirmation: "DELETE",
    })
    for (let pass = 0; pass < 8; pass += 1)
      await t.mutation(internal.accountDeletion.processUserLinkedData, {
        requestId: request.requestId,
      })
    const rows = await t.run(async (ctx) => ({
      game: await ctx.db.query("games").unique(),
      summary: await ctx.db.query("gameSummaries").unique(),
      entries: await ctx.db.query("gameHistoryEntries").collect(),
    }))
    expect(rows.game?.hostUserId).toBeUndefined()
    expect(rows.summary?.finishedByUserId).toBeUndefined()
    expect(rows.summary?.players.map((player) => player.displayName)).toEqual(["Ada", "Grace"])
    expect(rows.entries).toHaveLength(0)
    jest.clearAllTimers()
    jest.useRealTimers()
    if (previousClerkSecret === undefined) delete process.env.CLERK_SECRET_KEY
    else process.env.CLERK_SECRET_KEY = previousClerkSecret
  })
})
