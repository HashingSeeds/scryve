import { convexTest } from "convex-test"

import { registerRateLimiter } from "../test/registerRateLimiter"
import { api } from "./_generated/api"
import type * as Definitions from "./lib/systems/definitions"
import schema from "./schema"

jest.mock("./lib/systems/definitions", () => {
  const actual: typeof Definitions = jest.requireActual("./lib/systems/definitions")
  return {
    ...actual,
    SYSTEMS: { ...actual.SYSTEMS, mtg: { ...actual.SYSTEMS.mtg, resultTracking: false } },
  }
})

const modules = {
  "./_generated/api.ts": async () => jest.requireActual("./_generated/api"),
  "./_generated/server.ts": async () => jest.requireActual("./_generated/server"),
  "./decks.ts": async () => jest.requireActual("./decks"),
  "./games.ts": async () => jest.requireActual("./games"),
  "./matches.ts": async () => jest.requireActual("./matches"),
  "./users.ts": async () => jest.requireActual("./users"),
}

it("a system without result tracking keeps the game but writes no deck results or stats", async () => {
  const t = convexTest(schema, modules)
  registerRateLimiter(t)
  const actor = t.withIdentity({ subject: "owner" })
  await actor.mutation(api.users.syncCurrent, { displayName: "owner" })
  const deckId = await actor.mutation(api.decks.create, {
    name: "Burn",
    format: "modern",
    deckKey: "deck-key",
  })
  const deckVersionId = await actor.mutation(api.decks.saveVersion, { deckId, cards: [] })

  await actor.mutation(api.games.publishFinishedLocalGame, {
    publicId: "local-finished-game-0001",
    system: "mtg",
    format: "modern",
    ruleset: "modern",
    startingLife: 20,
    startedAt: 1700000000000,
    finishedAt: 1700000060000,
    eventCount: 1,
    players: [
      {
        localId: "me",
        me: true,
        seat: 1,
        displayName: "Me",
        color: "#123456",
        currentLife: 20,
        deckVersionId,
      },
      { localId: "them", seat: 2, displayName: "Them", color: "#654321", currentLife: 0 },
    ],
    result: { kind: "win", winnerLocalIds: ["me"] },
  })
  const { matchId } = await actor.mutation(api.matches.recordManualMatch, {
    publicId: "manual-finished-match-001",
    bestOf: 3,
    system: "mtg",
    finishedAt: Date.now() - 1000,
    me: { seat: 1, outcome: "win", gamesWon: 2, deckVersionId },
    opponents: [{ seat: 2, displayName: "Them", outcome: "loss", gamesWon: 1 }],
  })
  await actor.mutation(api.matches.deleteManualMatch, { matchId })

  const rows = await t.run(async (ctx) => ({
    summaries: (await ctx.db.query("gameSummaries").collect()).length,
    results: [
      ...(await ctx.db.query("deckResults").collect()),
      ...(await ctx.db.query("deckKeyStats").collect()),
      ...(await ctx.db.query("deckStats").collect()),
      ...(await ctx.db.query("deckGameResults").collect()),
      ...(await ctx.db.query("deckMatchResults").collect()),
    ],
  }))
  expect(rows).toEqual({ summaries: 1, results: [] })
})
