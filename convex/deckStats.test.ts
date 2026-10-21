import type { FunctionArgs } from "convex/server"
import { convexTest } from "convex-test"

import { registerRateLimiter } from "../test/registerRateLimiter"
import { api } from "./_generated/api"
import { addDeckResult } from "./lib/deckResults"
import schema from "./schema"

const modules = {
  "./_generated/api.ts": async () => jest.requireActual("./_generated/api"),
  "./_generated/server.ts": async () => jest.requireActual("./_generated/server"),
  "./deckStats.ts": async () => jest.requireActual("./deckStats"),
  "./games.ts": async () => jest.requireActual("./games"),
  "./matches.ts": async () => jest.requireActual("./matches"),
  "./users.ts": async () => jest.requireActual("./users"),
}

async function signedIn(subject = "owner") {
  const t = convexTest(schema, modules)
  registerRateLimiter(t)
  const actor = t.withIdentity({ subject })
  await actor.mutation(api.users.syncCurrent, { displayName: subject })
  return { t, actor }
}

const T = 1_700_000_000_000
const list = (n: number) => `v1:${String(n).repeat(64)}`

function game(
  publicId: string,
  options: { win: boolean; fingerprint?: string; players?: number; finishedAt: number },
): FunctionArgs<typeof api.games.publishFinishedLocalGame> {
  const seats = Array.from({ length: options.players ?? 2 }, (_, index) => ({
    localId: `seat-${index}`,
    seat: index + 1,
    displayName: index === 0 ? "Me" : `Rival ${index}`,
    color: "#123456",
    currentLife: index === 0 ? 20 : 0,
  }))
  seats[0] = {
    ...seats[0],
    me: true,
    deckKey: "burn",
    deckName: "Burn",
    ...(options.fingerprint ? { deckFingerprint: options.fingerprint } : {}),
  } as (typeof seats)[number]
  return {
    publicId,
    system: "mtg",
    format: "modern",
    ruleset: "modern",
    startingLife: 20,
    startedAt: options.finishedAt - 60_000,
    finishedAt: options.finishedAt,
    eventCount: 1,
    players: seats,
    result: { kind: "win", winnerLocalIds: [options.win ? "seat-0" : "seat-1"] },
  }
}

it("breaks a deck's results down by source, list and pod size for its owner only", async () => {
  const { t, actor } = await signedIn()
  await actor.mutation(
    api.games.publishFinishedLocalGame,
    game("local-game-000000001", { win: true, fingerprint: list(1), finishedAt: T + 1_000 }),
  )
  await actor.mutation(
    api.games.publishFinishedLocalGame,
    game("local-game-000000002", {
      win: false,
      fingerprint: list(1),
      players: 4,
      finishedAt: T + 2_000,
    }),
  )
  await actor.mutation(
    api.games.publishFinishedLocalGame,
    game("local-game-000000003", { win: true, players: 4, finishedAt: T + 3_000 }),
  )

  const summary = await actor.query(api.deckStats.summary, { deckKey: "burn" })
  expect(summary.all).toMatchObject({ games: 3, wins: 2, losses: 1 })
  expect(summary.lists).toEqual([expect.objectContaining({ fingerprint: list(1), games: 2 })])
  expect(summary.scannedAll).toBe(true)
  expect(summary.slices).toEqual(
    expect.arrayContaining([
      {
        source: "scryve",
        fingerprint: list(1),
        podSize: 2,
        games: 1,
        wins: 1,
        losses: 0,
        draws: 0,
        firstAt: T + 1_000,
        lastAt: T + 1_000,
      },
      {
        source: "scryve",
        fingerprint: list(1),
        podSize: 4,
        games: 1,
        wins: 0,
        losses: 1,
        draws: 0,
        firstAt: T + 2_000,
        lastAt: T + 2_000,
      },
      {
        source: "scryve",
        fingerprint: null,
        podSize: 4,
        games: 1,
        wins: 1,
        losses: 0,
        draws: 0,
        firstAt: T + 3_000,
        lastAt: T + 3_000,
      },
    ]),
  )

  const other = t.withIdentity({ subject: "other" })
  await other.mutation(api.users.syncCurrent, { displayName: "other" })
  expect(await other.query(api.deckStats.summary, { deckKey: "burn" })).toMatchObject({
    all: null,
    lists: [],
    slices: [],
  })
  await expect(t.query(api.deckStats.summary, { deckKey: "burn" })).rejects.toThrow()
})

it("pages a deck's games newest first with filters and the ids History opens", async () => {
  const { actor } = await signedIn()
  for (const [index, fingerprint] of [list(1), undefined, list(1)].entries())
    await actor.mutation(
      api.games.publishFinishedLocalGame,
      game(`local-game-00000000${index}`, {
        win: index !== 1,
        fingerprint,
        players: 3,
        finishedAt: T + 1_000 * (index + 1),
      }),
    )

  const first = await actor.query(api.deckStats.games, {
    deckKey: "burn",
    paginationOpts: { numItems: 2, cursor: null },
  })
  expect(first.page.map((row) => row.finishedAt)).toEqual([T + 3_000, T + 2_000])
  expect(first.page[0]).toMatchObject({
    outcome: "win",
    podSize: 3,
    gamePublicId: "local-game-000000002",
    matchPublicId: null,
    opponents: [{ name: "Rival 1" }, { name: "Rival 2" }],
  })
  expect(first.isDone).toBe(false)

  const untracked = await actor.query(api.deckStats.games, {
    deckKey: "burn",
    fingerprint: null,
    paginationOpts: { numItems: 10, cursor: null },
  })
  expect(untracked.page.map((row) => row.outcome)).toEqual(["loss"])
  const tracked = await actor.query(api.deckStats.games, {
    deckKey: "burn",
    fingerprint: list(1),
    source: "scryve",
    paginationOpts: { numItems: 10, cursor: null },
  })
  expect(tracked.page).toHaveLength(2)
})

it("counts a connected match through its games only", async () => {
  const { t, actor } = await signedIn()
  const userId = (await t.run(async (ctx) => ctx.db.query("users").first()))!._id
  await t.run(async (ctx) => {
    for (const [resultId, kind, outcome] of [
      ["game:a:1", "game", "win"],
      ["game:b:1", "game", "loss"],
      ["game:c:1", "game", "win"],
      ["match:m:1", "match", "win"],
    ] as const)
      await addDeckResult(ctx, {
        resultId,
        userId,
        deckKey: "burn",
        kind,
        source: "connected",
        outcome,
        finishedAt: T,
        deltas: {},
      })
  })
  const summary = await actor.query(api.deckStats.summary, { deckKey: "burn" })
  expect(summary.slices.reduce((total, slice) => total + slice.games, 0)).toBe(3)
  const games = await actor.query(api.deckStats.games, {
    deckKey: "burn",
    paginationOpts: { numItems: 10, cursor: null },
  })
  expect(games.page.map((row) => row.kind)).toEqual(["game", "game", "game"])
})

it("lists each of the caller's deck keys with its total record", async () => {
  const { t, actor } = await signedIn()
  await actor.mutation(
    api.games.publishFinishedLocalGame,
    game("local-game-000000001", { win: true, fingerprint: list(1), finishedAt: T }),
  )
  expect(await actor.query(api.deckStats.totalsByKey, {})).toEqual([
    { deckKey: "burn", games: 1, wins: 1, losses: 0, draws: 0, unknown: 0 },
  ])
  const other = t.withIdentity({ subject: "other" })
  await other.mutation(api.users.syncCurrent, { displayName: "other" })
  expect(await other.query(api.deckStats.totalsByKey, {})).toEqual([])
})
