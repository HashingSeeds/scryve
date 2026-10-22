import type { FunctionArgs, FunctionReturnType } from "convex/server"
import { convexTest } from "convex-test"

import { registerRateLimiter } from "../test/registerRateLimiter"
import { api, internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { deckFingerprint } from "./lib/deckFingerprint"
import { assertDeckKey } from "./lib/deckKeys"
import { deckRateLimiter } from "./lib/deckRateLimits"
import { addDeckResult, canonicalResultId, removeDeckResult } from "./lib/deckResults"
import { removeGameResult } from "./lib/results"
import schema from "./schema"

const modules = {
  "./_generated/api.ts": async () => jest.requireActual("./_generated/api"),
  "./_generated/server.ts": async () => jest.requireActual("./_generated/server"),
  "./decks.ts": async () => jest.requireActual("./decks"),
  "./games.ts": async () => jest.requireActual("./games"),
  "./matches.ts": async () => jest.requireActual("./matches"),
  "./users.ts": async () => jest.requireActual("./users"),
  "./resultsBackfill.ts": async () => jest.requireActual("./resultsBackfill"),
  "./accountDeletion.ts": async () => jest.requireActual("./accountDeletion"),
}
function setup() {
  const t = convexTest(schema, modules)
  registerRateLimiter(t)
  return t
}
type Tester = ReturnType<typeof setup>
async function account(t: Tester, subject = "owner") {
  const actor = t.withIdentity({ subject })
  await actor.mutation(api.users.syncCurrent, { displayName: subject })
  const userId = await t.run(
    async (ctx) =>
      (await ctx.db
        .query("users")
        .withIndex("by_clerk_user", (q) => q.eq("clerkUserId", subject))
        .unique())!._id,
  )
  return { actor, userId }
}
async function deck(t: Tester, key = "deck-key") {
  const { actor, userId } = await account(t)
  const deckId = await actor.mutation(api.decks.create, {
    name: "Burn",
    format: "modern",
    deckKey: key,
  })
  const versionId = await actor.mutation(api.decks.saveVersion, { deckId, cards: [] })
  return { actor, userId, deckId, versionId }
}
const fingerprint = `v1:${"a".repeat(64)}`
const tally = { total: 1, wins: 1, losses: 0, draws: 0, unknown: 0 }
function publish(
  publicId = "local-finished-game-0001",
): FunctionArgs<typeof api.games.publishFinishedLocalGame> {
  return {
    publicId,
    system: "mtg",
    format: "modern",
    ruleset: "modern",
    startingLife: 20,
    startedAt: 1700000000000,
    finishedAt: 1700000060000,
    eventCount: 1,
    players: [
      { localId: "me", me: true, seat: 1, displayName: "Me", color: "#123456", currentLife: 20 },
      { localId: "them", seat: 2, displayName: "Them", color: "#654321", currentLife: 0 },
    ],
    result: { kind: "win", winnerLocalIds: ["me"] },
  }
}
function manual(
  publicId = "manual-finished-match-001",
): FunctionArgs<typeof api.matches.recordManualMatch> {
  return {
    publicId,
    bestOf: 3,
    finishedAt: Date.now() - 1000,
    me: { seat: 1, outcome: "win", gamesWon: 2, gamesDrawn: 1 },
    opponents: [{ seat: 2, displayName: "Them", outcome: "loss", gamesWon: 1, gamesDrawn: 1 }],
  }
}
async function comparisons(t: Tester) {
  let cursor: string | null = null
  const mismatches = []
  for (;;) {
    const page: FunctionReturnType<typeof internal.resultsBackfill.compareDeckKeyStats> =
      await t.query(internal.resultsBackfill.compareDeckKeyStats, {
        cursor,
        batchSize: 100,
      })
    mismatches.push(...page.mismatches)
    if (page.isDone) return mismatches
    cursor = page.continueCursor
  }
}
async function assertEqual(t: Tester) {
  expect(await comparisons(t)).toEqual([])
}
async function moveVersion(t: Tester, deckId: Id<"decks">) {
  return t.run(async (ctx) => {
    const current = await ctx.db
      .query("deckVersions")
      .withIndex("by_deck_and_archived_at", (q) =>
        q.eq("deckId", deckId).eq("archivedAt", undefined),
      )
      .collect()
    const version = current.sort((a, b) => a.versionNumber - b.versionNumber).at(-1)
    return version ? { id: version._id, updatedAt: version.updatedAt ?? version.createdAt } : null
  })
}
async function allStats(t: Tester) {
  return await t.run(async (ctx) => ctx.db.query("deckKeyStats").collect())
}

it("writer adds once and reverses the stored deltas exactly, including envelopes", async () => {
  const t = setup()
  const { userId } = await account(t)
  const result = {
    resultId: "match:one:1",
    userId,
    deckKey: "local",
    fingerprint,
    kind: "match" as const,
    source: "manual" as const,
    outcome: "win" as const,
    finishedAt: 1,
    deltas: {
      manualMatches: tally,
      manualGames: { total: 4, wins: 2, losses: 1, draws: 1, unknown: 0 },
    },
  }
  await t.run(async (ctx) => {
    await addDeckResult(ctx, result)
    await addDeckResult(ctx, { ...result, deltas: { games: tally } })
    await addDeckResult(ctx, {
      ...result,
      resultId: "game:two:1",
      kind: "game",
      source: "local",
      deltas: { games: tally },
    })
  })
  expect(await allStats(t)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        fingerprint: "all",
        games: 1,
        wins: 1,
        manualMatches: tally,
        manualGames: result.deltas.manualGames,
      }),
    ]),
  )
  expect(await allStats(t)).toHaveLength(2)
  await t.run(async (ctx) => {
    await removeDeckResult(ctx, result.userId, result.resultId)
    await removeDeckResult(ctx, result.userId, result.resultId)
    await removeDeckResult(ctx, result.userId, "missing")
  })
  for (const row of await allStats(t))
    expect(row).toMatchObject({
      games: 1,
      wins: 1,
      manualMatches: { total: 0, wins: 0 },
      manualGames: { total: 0, wins: 0, losses: 0, draws: 0 },
    })
  await t.run(async (ctx) => removeDeckResult(ctx, result.userId, "game:two:1"))
  for (const row of await allStats(t)) expect(row).toMatchObject({ games: 0, wins: 0 })
})

it("uses the same ids for device, cloud, match and historical results", () => {
  expect(
    canonicalResultId({
      kind: "game",
      publicId: "rewritten",
      clientGameId: "original",
      localId: "me",
      playerId: "server",
    }),
  ).toBe("game:original:me")
  expect(canonicalResultId({ kind: "game", publicId: "cloud", playerId: "seat" })).toBe(
    "game:cloud:seat",
  )
  expect(
    canonicalResultId({
      kind: "game",
      publicId: "old",
      playerId: "seat",
      legacySummaryId: "summary",
    }),
  ).toBe("legacy:summary:seat")
  expect(canonicalResultId({ kind: "match", publicId: "match", seat: 2 })).toBe("match:match:2")
})

it("publishes local deck keys without legacy rows, keeps local ids, and replays once", async () => {
  const t = setup()
  const { actor } = await account(t)
  const args = publish()
  args.players[0] = { ...args.players[0], deckKey: "local-only", deckFingerprint: fingerprint }
  const ack = await actor.mutation(api.games.publishFinishedLocalGame, args)
  expect(await actor.mutation(api.games.publishFinishedLocalGame, args)).toEqual(ack)
  const state = await t.run(async (ctx) => ({
    summary: await ctx.db.get(ack.summaryId),
    results: await ctx.db.query("deckResults").collect(),
    legacy: await ctx.db.query("deckGameResults").collect(),
  }))
  expect(state.summary).toMatchObject({
    clientGameId: args.publicId,
    players: [
      expect.objectContaining({ localId: "me", deckKey: "local-only" }),
      expect.objectContaining({ localId: "them" }),
    ],
  })
  expect(state.results).toEqual([
    expect.objectContaining({
      resultId: `game:${args.publicId}:me`,
      deckKey: "local-only",
      fingerprint,
    }),
  ])
  expect(state.legacy).toEqual([])
  expect((await actor.query(api.decks.statsForKey, { deckKey: "local-only" })).all).toMatchObject({
    games: 1,
    wins: 1,
  })
})

it.each(["archived", "moved", "missing", "missingDeck", "archivedVersion"] as const)(
  "records %s versions from installed clients",
  async (kind) => {
    const t = setup()
    const { actor, deckId, versionId } = await deck(t)
    await t.run(async (ctx) => {
      if (kind === "missing") await ctx.db.delete(versionId)
      else if (kind === "missingDeck") await ctx.db.delete(deckId)
      else if (kind === "archivedVersion") await ctx.db.patch(versionId, { archivedAt: 1 })
      else
        await ctx.db.patch(deckId, {
          archivedAt: 1,
          ...(kind === "moved" ? { movedToDeviceAt: 1 } : {}),
        })
    })
    const args = publish()
    args.players[0] = {
      ...args.players[0],
      deckVersionId: versionId,
    }
    const ack = await actor.mutation(api.games.publishFinishedLocalGame, args)
    await t.run(async (ctx) => {
      const summary = (await ctx.db.get(ack.summaryId))!
      const result = (await ctx.db.query("deckResults").unique())!
      const deckStillExists = kind === "archived" || kind === "moved" || kind === "archivedVersion"
      expect(summary.players[0].deckId).toBe(deckStillExists ? deckId : undefined)
      expect(summary.players[0].deckKey).toBe(deckStillExists ? "deck-key" : undefined)
      expect(result.deckKey).toBe(deckStillExists ? "deck-key" : undefined)
      expect(result.fingerprint).toBeUndefined()
      expect(await ctx.db.query("deckGameResults").collect()).toHaveLength(deckStillExists ? 1 : 0)
    })
    await assertEqual(t)
  },
)

it("keeps each account's copy of a seat result even when ids collide", async () => {
  const t = setup()
  const { userId } = await account(t)
  const other = await account(t, "other")
  const shared = {
    resultId: "game:nearby:seat-1",
    kind: "game" as const,
    source: "local" as const,
    outcome: "win" as const,
    finishedAt: 1,
    deltas: { games: tally },
  }
  await t.run(async (ctx) => {
    await addDeckResult(ctx, { ...shared, userId: other.userId, deckKey: "theirs" })
    await addDeckResult(ctx, { ...shared, userId, deckKey: "mine" })
  })
  expect((await allStats(t)).map((row) => [row.deckKey, row.games]).sort()).toEqual([
    ["mine", 1],
    ["theirs", 1],
  ])
})

it("counts a deckless result for the deck its seat is later claimed with", async () => {
  const t = setup()
  const { userId } = await account(t)
  const result = {
    resultId: "game:nearby:seat-1",
    userId,
    kind: "game" as const,
    source: "local" as const,
    outcome: "win" as const,
    finishedAt: 1,
    deltas: { games: tally },
  }
  await t.run(async (ctx) => {
    await addDeckResult(ctx, result)
    await addDeckResult(ctx, { ...result, deckKey: "claimed", fingerprint })
    await addDeckResult(ctx, { ...result, deckKey: "claimed", fingerprint })
  })
  expect((await allStats(t)).map((row) => [row.fingerprint, row.games]).sort()).toEqual([
    ["all", 1],
    [fingerprint, 1],
  ])
  await t.run(async (ctx) => removeDeckResult(ctx, userId, result.resultId))
  expect((await allStats(t)).every((row) => row.games === 0)).toBe(true)
})

it("keeps a new client's pinned key and deck name for a moved deck", async () => {
  const t = setup()
  const { actor, deckId, versionId } = await deck(t)
  await actor.mutation(api.decks.moveToDevice, {
    deckId,
    expectedRevision: 0,
    expectedVersion: await moveVersion(t, deckId),
  })
  const args = publish()
  args.players[0] = {
    ...args.players[0],
    deckVersionId: versionId,
    deckKey: "deck-key",
    deckFingerprint: fingerprint,
    deckName: "Burn",
  }
  const ack = await actor.mutation(api.games.publishFinishedLocalGame, args)
  await t.run(async (ctx) => {
    const summary = (await ctx.db.get(ack.summaryId))!
    expect(summary.players[0]).toMatchObject({ deckKey: "deck-key", deckNameAtFinish: "Burn" })
    expect(summary.players[0].deckId).toBe(deckId)
    expect(await ctx.db.query("deckResults").unique()).toMatchObject({
      deckKey: "deck-key",
      fingerprint,
      podSize: 2,
    })
  })
  await assertEqual(t)
})

it("fingerprints a new client's synced deck from its version when the device had no cards cached", async () => {
  const t = setup()
  const { actor, versionId } = await deck(t)
  const args = { ...publish(), startedAt: Date.now(), finishedAt: Date.now() }
  args.players[0] = { ...args.players[0], deckVersionId: versionId, deckKey: "deck-key" }
  await actor.mutation(api.games.publishFinishedLocalGame, args)
  const result = await t.run(async (ctx) => ctx.db.query("deckResults").unique())
  expect(result).toMatchObject({ deckKey: "deck-key", fingerprint: await deckFingerprint([]) })
})

it("leaves the list unknown when a synced deck changed after its uncached game started", async () => {
  const t = setup()
  const { actor, versionId } = await deck(t)
  const args = publish()
  args.players[0] = { ...args.players[0], deckVersionId: versionId, deckKey: "deck-key" }
  await actor.mutation(api.games.publishFinishedLocalGame, args)
  const result = await t.run(async (ctx) => ctx.db.query("deckResults").unique())
  expect(result).toMatchObject({ deckKey: "deck-key" })
  expect(result?.fingerprint).toBeUndefined()
})

it("comparison reports games a deck played while it was only on a device", async () => {
  const t = setup()
  const { actor, versionId } = await deck(t)
  const synced = publish("synced-game-000000001")
  synced.players[0] = { ...synced.players[0], deckVersionId: versionId, deckKey: "deck-key" }
  await actor.mutation(api.games.publishFinishedLocalGame, synced)
  const local = publish("local-game-0000000001")
  local.players[0] = { ...local.players[0], deckKey: "deck-key", deckName: "Burn" }
  await actor.mutation(api.games.publishFinishedLocalGame, local)
  expect((await actor.query(api.decks.statsForKey, { deckKey: "deck-key" })).all).toMatchObject({
    games: 2,
  })
  expect(await comparisons(t)).toEqual([
    expect.objectContaining({ scope: "deck", reasons: ["device_only_results"] }),
  ])
})

it("names a local deck's results from the name its device sends", async () => {
  const t = setup()
  const { actor } = await account(t)
  const args = publish()
  args.players[0] = { ...args.players[0], deckKey: "local-only", deckName: "  Mono Red  " }
  const ack = await actor.mutation(api.games.publishFinishedLocalGame, args)
  const summary = await t.run(async (ctx) => ctx.db.get(ack.summaryId))
  expect(summary?.players[0].deckNameAtFinish).toBe("Mono Red")
})

it("lists a synced deck with totals from games it played while only on a device", async () => {
  const t = setup()
  const { actor } = await account(t)
  const args = publish()
  args.players[0] = { ...args.players[0], deckKey: "deck-key", deckName: "Burn" }
  await actor.mutation(api.games.publishFinishedLocalGame, args)
  await actor.mutation(api.decks.create, { name: "Burn", format: "modern", deckKey: "deck-key" })
  const [listed] = (await actor.query(api.decks.listMine, {})).decks
  expect(listed.record.games).toBe(0)
  expect(listed.keyRecord).toMatchObject({ games: 1, wins: 1 })
})

it("settles a device copy onto the live deck that already has its key", async () => {
  const t = setup()
  const { actor, deckId } = await deck(t)
  const copy = await actor.mutation(api.decks.importGuest, {
    localId: "00000000-0000-4000-8000-000000000002",
    localUpdatedAt: 7,
    deckKey: "deck-key",
    name: "Burn",
    format: "modern",
    cards: [],
  })
  expect(copy).toEqual({ status: "already_imported", deckId, localUpdatedAt: 7 })
  const edited = await actor.mutation(api.decks.importGuest, {
    localId: "00000000-0000-4000-8000-000000000003",
    localUpdatedAt: 8,
    deckKey: "deck-key",
    name: "Burn",
    format: "modern",
    cards: [{ name: "Shock", quantity: 4 }],
  })
  expect(edited).toEqual({ status: "already_imported", deckId, localUpdatedAt: null })
  expect(await t.run(async (ctx) => ctx.db.query("decks").collect())).toHaveLength(1)
})

it("rejects another account's version even when archived", async () => {
  const t = setup()
  const { deckId, versionId } = await deck(t)
  const other = await account(t, "other")
  await t.run(async (ctx) => ctx.db.patch(deckId, { archivedAt: 1 }))
  const args = publish()
  args.players[0].deckVersionId = versionId
  await expect(other.actor.mutation(api.games.publishFinishedLocalGame, args)).rejects.toThrow(
    "Deck version not found",
  )
})

it("dual-writes local games and manual create/delete, and leaves totals intact when moved", async () => {
  const t = setup()
  const { actor, deckId, versionId } = await deck(t)
  const game = publish()
  game.players[0].deckVersionId = versionId
  await actor.mutation(api.games.publishFinishedLocalGame, game)
  const match = manual()
  match.me.deckVersionId = versionId
  const ack = await actor.mutation(api.matches.recordManualMatch, match)
  await assertEqual(t)
  expect(
    (await t.run(async (ctx) => ctx.db.query("deckResults").collect())).map(
      (row) => row.deckVersionId,
    ),
  ).toEqual([versionId, versionId])
  expect((await allStats(t))[0]).toMatchObject({
    games: 1,
    wins: 1,
    manualMatches: tally,
    manualGames: { total: 4, wins: 2, losses: 1, draws: 1 },
  })
  const before = await allStats(t)
  await expect(
    actor.mutation(api.decks.moveToDevice, {
      deckId,
      expectedRevision: 99,
      expectedVersion: await moveVersion(t, deckId),
    }),
  ).rejects.toThrow("Deck changed")
  const moved = await actor.mutation(api.decks.moveToDevice, {
    deckId,
    expectedRevision: 0,
    expectedVersion: await moveVersion(t, deckId),
  })
  expect(moved.deleted).toBe(true)
  expect(moved.revision).toBe(1)
  expect(
    await actor.mutation(api.decks.moveToDevice, {
      deckId,
      expectedRevision: 0,
      expectedVersion: await moveVersion(t, deckId),
    }),
  ).toEqual(moved)
  expect(await allStats(t)).toEqual(before)
  await actor.mutation(api.matches.deleteManualMatch, { matchId: ack.matchId })
  await assertEqual(t)
  expect((await allStats(t))[0]).toMatchObject({
    games: 1,
    manualMatches: { total: 0 },
    manualGames: { total: 0 },
  })
})

it("manual local decks record a fingerprint and name without a version", async () => {
  const t = setup()
  const { actor } = await account(t)
  const args = manual()
  args.me.deckKey = "offline"
  args.me.deckFingerprint = fingerprint
  args.me.deckName = " Mono Red "
  const ack = await actor.mutation(api.matches.recordManualMatch, args)
  const match = await t.run(async (ctx) => ctx.db.get(ack.matchId))
  expect(match?.seats[0].deckName).toBe("Mono Red")
  expect(await t.run(async (ctx) => ctx.db.query("deckResults").unique())).toMatchObject({
    podSize: 2,
  })
  expect(
    (await actor.query(api.decks.statsForKey, { deckKey: "offline" })).fingerprints,
  ).toHaveLength(1)
  await actor.mutation(api.matches.deleteManualMatch, { matchId: ack.matchId })
  expect((await allStats(t)).every((row) => row.manualMatches?.total === 0)).toBe(true)
})

it("pins cloud deck keys and lists at start and copies them at finish", async () => {
  const t = setup()
  const { actor, deckId, versionId, userId } = await deck(t)
  const second = await account(t, "second")
  const publicId = "cloud-pinned-game-0001"
  await actor.mutation(api.games.createLobby, {
    publicId,
    playerCount: 2,
    startingLife: 20,
    ruleset: "modern",
    inviteToken: "t".repeat(43),
    manualCodeCandidates: ["ABC234"],
    hostDisplayName: "Owner",
    hostColor: "#123456",
  })
  await second.actor.mutation(api.games.claimSeat, {
    token: "t".repeat(43),
    displayName: "Second",
    color: "#654321",
  })
  await actor.mutation(api.decks.selectForSeat, { publicId, seat: 1, deckVersionId: versionId })
  const empty = await deckFingerprint([])
  expect(
    await t.run(async (ctx) =>
      ctx.db
        .query("gamePlayers")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .unique(),
    ),
  ).toMatchObject({ deckKey: "deck-key", deckFingerprint: empty })
  await actor.mutation(api.games.startGame, { publicId })
  await t.run(async (ctx) =>
    ctx.db.insert("deckCards", {
      deckVersionId: versionId,
      name: "Changed midgame",
      quantity: 1,
      oracleId: "changed",
    }),
  )
  const ack = await actor.mutation(api.games.finishGame, { publicId })
  const summary = await t.run(async (ctx) => ctx.db.get(ack.summaryId))
  expect(summary?.players[0]).toMatchObject({ deckKey: "deck-key", deckFingerprint: empty })
  const results = await t.run(async (ctx) => ctx.db.query("deckResults").collect())
  expect(results).toHaveLength(2)
  expect(results[0].resultId).toBe(`game:${publicId}:${summary!.players[0].playerId}`)
  await assertEqual(t)
  expect((await actor.query(api.decks.statsForKey, { deckKey: "deck-key" })).all).toMatchObject({
    games: 1,
  })
  expect(await t.run(async (ctx) => ctx.db.get(deckId))).not.toBeNull()
})

it("imports guest localId, revives the same row by key and rejects live conflicts", async () => {
  const t = setup()
  const { actor } = await account(t)
  const localId = "00000000-0000-4000-8000-000000000001"
  const args = { localId, localUpdatedAt: 1, name: "Guest", format: "modern", cards: [] }
  const ack = await actor.mutation(api.decks.importGuest, args)
  if (ack.status !== "imported") throw new Error("Expected import")
  expect(await t.run(async (ctx) => ctx.db.get(ack.deckId))).toMatchObject({ deckKey: localId })
  await expect(
    actor.mutation(api.decks.create, { name: "Duplicate", format: "modern", deckKey: localId }),
  ).rejects.toThrow("live deck")
  await actor.mutation(api.decks.moveToDevice, {
    deckId: ack.deckId,
    expectedRevision: 0,
    expectedVersion: await moveVersion(t, ack.deckId),
  })
  const revived = await actor.mutation(api.decks.importGuest, {
    ...args,
    name: "Revived",
    deckKey: localId,
    localUpdatedAt: 2,
  })
  expect(revived).toMatchObject({ deckId: ack.deckId })
  const stored = await t.run(async (ctx) => ctx.db.get(ack.deckId))
  expect(stored).toMatchObject({ name: "Revived", syncRevision: 2 })
  expect(stored?.archivedAt).toBeUndefined()
  expect(stored?.movedToDeviceAt).toBeUndefined()
  expect(await t.run(async (ctx) => ctx.db.query("decks").collect())).toHaveLength(1)
})

it.each(["", "has spaces", "x".repeat(129), "unsafe:colon"])(
  "validates deck key %j",
  async (key) => {
    const t = setup()
    const { actor } = await account(t)
    await expect(
      actor.mutation(api.decks.create, { name: "Invalid", format: "modern", deckKey: key }),
    ).rejects.toThrow("Deck key")
  },
)

it("statsForKey is authenticated and scoped to the caller, with at most 50 lists", async () => {
  const t = setup()
  const { actor, userId } = await account(t)
  const other = await account(t, "other")
  await t.run(async (ctx) => {
    for (let i = 0; i < 55; i++)
      await addDeckResult(ctx, {
        resultId: `game:${i}:1`,
        userId,
        deckKey: "key",
        fingerprint: `v1:${i.toString(16).padStart(64, "0")}`,
        kind: "game",
        source: "local",
        outcome: "win",
        finishedAt: i,
        deltas: { games: tally },
      })
  })
  await expect(t.query(api.decks.statsForKey, { deckKey: "key" })).rejects.toThrow(
    "Authentication required",
  )
  expect(await other.actor.query(api.decks.statsForKey, { deckKey: "key" })).toEqual({
    all: null,
    fingerprints: [],
  })
  const stats = await actor.query(api.decks.statsForKey, { deckKey: "key" })
  expect(stats.all?.games).toBe(55)
  expect(stats.fingerprints).toHaveLength(50)
})

it("local uploads use the resolved deck's key over the client's key", async () => {
  const t = setup()
  const { actor, versionId } = await deck(t)
  const args = publish()
  args.players[0] = { ...args.players[0], deckVersionId: versionId, deckKey: "some-other-key" }
  await actor.mutation(api.games.publishFinishedLocalGame, args)
  expect(await t.run(async (ctx) => ctx.db.query("deckResults").unique())).toMatchObject({
    deckKey: "deck-key",
  })
  expect((await actor.query(api.decks.statsForKey, { deckKey: "some-other-key" })).all).toBeNull()
  await assertEqual(t)
})

it("manual matches use the resolved deck's key over the client's key", async () => {
  const t = setup()
  const { actor, versionId } = await deck(t)
  const args = manual()
  args.me = { ...args.me, deckVersionId: versionId, deckKey: "some-other-key" }
  const ack = await actor.mutation(api.matches.recordManualMatch, args)
  expect(await t.run(async (ctx) => ctx.db.get(ack.matchId))).toMatchObject({
    seats: [expect.objectContaining({ deckKey: "deck-key" }), expect.anything()],
  })
  expect(await t.run(async (ctx) => ctx.db.query("deckResults").unique())).toMatchObject({
    deckKey: "deck-key",
  })
  expect((await actor.query(api.decks.statsForKey, { deckKey: "some-other-key" })).all).toBeNull()
  await assertEqual(t)
})

it("generates a valid key when a caller creates a deck without one", async () => {
  const t = setup()
  const { actor } = await account(t)
  const deckId = await actor.mutation(api.decks.create, { name: "Burn", format: "modern" })
  const stored = await t.run(async (ctx) => ctx.db.get(deckId))
  if (!stored) throw new Error("Expected a deck")
  expect(assertDeckKey(stored.deckKey)).toBe(stored.deckKey)
})

it("reimports an archived migrated guest deck without duplicating its alias", async () => {
  const t = setup()
  const { actor, deckId } = await deck(t)
  const localId = "00000000-0000-4000-8000-000000000001"
  await t.run(async (ctx) =>
    ctx.db.patch(deckId, { archivedAt: 1, deckKey: String(deckId), guestLocalId: localId }),
  )
  const args = {
    deckKey: localId,
    movedFromAccount: true,
    localId,
    localUpdatedAt: 1,
    name: "Guest",
    format: "modern",
    cards: [],
  }
  await expect(actor.mutation(api.decks.importGuest, args)).resolves.toMatchObject({
    status: "imported",
    deckId,
  })
  expect(await t.run(async (ctx) => ctx.db.query("decks").collect())).toEqual([
    expect.objectContaining({ _id: deckId, deckKey: String(deckId), guestLocalId: localId }),
  ])
  await expect(actor.mutation(api.decks.importGuest, args)).resolves.toMatchObject({
    status: "already_imported",
    deckId,
  })
  const game = publish()
  game.players[0].deckKey = localId
  await actor.mutation(api.games.publishFinishedLocalGame, game)
  expect((await actor.query(api.decks.statsForKey, { deckKey: localId })).all?.games).toBe(1)
})

it("only restores a moved account copy for an account with its key or alias", async () => {
  const t = setup()
  const { actor: jane, deckId } = await deck(t)
  const { actor: john } = await account(t, "john")
  await jane.mutation(api.decks.moveToDevice, {
    deckId,
    expectedRevision: 0,
    expectedVersion: await moveVersion(t, deckId),
  })
  const args = {
    movedFromAccount: true,
    deckKey: "deck-key",
    localId: "00000000-0000-4000-8000-000000000001",
    localUpdatedAt: 1,
    name: "Burn",
    format: "modern",
    cards: [],
  }
  await expect(john.mutation(api.decks.importGuest, args)).resolves.toEqual({
    status: "other_account",
  })
  expect(await t.run(async (ctx) => ctx.db.query("decks").collect())).toHaveLength(1)
  await expect(jane.mutation(api.decks.importGuest, args)).resolves.toMatchObject({
    status: "imported",
    deckId,
  })
  await expect(
    john.mutation(api.decks.importGuest, {
      ...args,
      movedFromAccount: undefined,
      deckKey: "fresh-key",
      localId: "00000000-0000-4000-8000-000000000002",
    }),
  ).resolves.toMatchObject({ status: "imported" })
  expect(await t.run(async (ctx) => ctx.db.query("decks").collect())).toHaveLength(2)
})

it("rejects a move when a card save changed the version since detail was read", async () => {
  const t = setup()
  const { actor, deckId, versionId } = await deck(t)
  const detail = await actor.query(api.decks.detail, { deckId })
  const version = detail.version!
  const expectedVersion = { id: version._id, updatedAt: version.updatedAt ?? version.createdAt }
  jest.spyOn(Date, "now").mockReturnValue(expectedVersion.updatedAt + 1)
  try {
    await actor.mutation(api.decks.saveVersion, {
      deckId,
      versionId,
      cards: [
        {
          name: "Shock",
          quantity: 4,
          oracleId: "00000000-0000-4000-8000-000000000009",
          scryfallId: "00000000-0000-4000-8000-000000000010",
        },
      ],
    })
    await expect(
      actor.mutation(api.decks.moveToDevice, { deckId, expectedRevision: 0, expectedVersion }),
    ).rejects.toThrow('"code":"sync_conflict"')
    const stored = await t.run(async (ctx) => ctx.db.get(deckId))
    expect(stored?.syncRevision ?? 0).toBe(0)
    expect(stored?.archivedAt).toBeUndefined()
    expect((await actor.query(api.decks.detail, { deckId })).cards).toEqual([
      expect.objectContaining({ name: "Shock", quantity: 4 }),
    ])
  } finally {
    jest.restoreAllMocks()
  }
})

it("backfills in bounded pages, retries without duplication, and matches legacy totals", async () => {
  const t = setup()
  const { actor, versionId } = await deck(t)
  const game = publish()
  game.players[0].deckVersionId = versionId
  const ack = await actor.mutation(api.games.publishFinishedLocalGame, game)
  const match = manual()
  match.me.deckVersionId = versionId
  await actor.mutation(api.matches.recordManualMatch, match)
  await t.run(async (ctx) => {
    for (const row of await ctx.db.query("deckResults").collect())
      await removeDeckResult(ctx, row.userId, row.resultId)
    const summary = (await ctx.db.get(ack.summaryId))!
    await ctx.db.patch(summary._id, {
      clientGameId: undefined,
      players: summary.players.map(
        ({ localId: _, resultId: _resultId, deckKey: _key, ...player }) => player,
      ),
    })
    for (const match of await ctx.db.query("matches").collect())
      await ctx.db.patch(match._id, { seats: match.seats.map(({ deckKey: _, ...seat }) => seat) })
  })
  for (let run = 0; run < 2; run++) {
    for (const fn of [
      internal.resultsBackfill.backfillDeckKeys,
      internal.resultsBackfill.backfillGameResults,
      internal.resultsBackfill.backfillMatchResults,
    ]) {
      let cursor: string | null = null
      for (;;) {
        const result: { isDone: boolean; continueCursor: string } = await t.mutation(fn, {
          cursor,
          batchSize: 1,
        })
        if (result.isDone) break
        cursor = result.continueCursor
      }
    }
    await assertEqual(t)
  }
  const rows = await t.run(async (ctx) => ctx.db.query("deckResults").collect())
  expect(rows).toHaveLength(2)
  expect(rows.every((row) => row.fingerprint === undefined)).toBe(true)
  expect(rows.every((row) => row.deckVersionId === versionId)).toBe(true)
  expect(rows.find((row) => row.kind === "game")?.resultId).toBe(
    `legacy:${ack.summaryId}:${(await t.run(async (ctx) => ctx.db.get(ack.summaryId)))!.players[0].playerId}`,
  )
})

it.each(["deckKeyStats", "deckVersionStats"] as const)(
  "comparison reports a tampered %s row with its ids",
  async (table) => {
    const t = setup()
    const { actor, deckId, versionId } = await deck(t)
    const args = publish()
    args.players[0] = { ...args.players[0], deckVersionId: versionId, deckFingerprint: fingerprint }
    await actor.mutation(api.games.publishFinishedLocalGame, args)
    await assertEqual(t)
    const statsId = await t.run(async (ctx) => {
      const row =
        table === "deckKeyStats"
          ? (await ctx.db.query(table).collect()).find((row) => row.fingerprint === "all")!
          : (await ctx.db.query(table).unique())!
      await ctx.db.patch(row._id, { games: 999 })
      return row._id
    })
    expect(await comparisons(t)).toEqual(
      expect.arrayContaining([
        expect.objectContaining(
          table === "deckKeyStats"
            ? {
                scope: "key",
                reason: "totals_differ_from_results",
                statsId,
                deckKey: "deck-key",
                expected: expect.objectContaining({ games: 1 }),
              }
            : {
                scope: "version",
                reason: "unexplained",
                legacyStatsId: statsId,
                deckId,
                deckVersionId: versionId,
                fingerprints: [{ fingerprint, stats: expect.objectContaining({ games: 1 }) }],
              },
        ),
      ]),
    )
  },
)

it("comparison partitions a shared fingerprint by the legacy version on each result", async () => {
  const t = setup()
  const { actor, versionId } = await deck(t)
  const secondVersion = await t.run(async (ctx) => {
    const { _id: _, _creationTime: __, ...version } = (await ctx.db.get(versionId))!
    return ctx.db.insert("deckVersions", { ...version, versionNumber: 2 })
  })
  for (const [index, deckVersionId] of [versionId, secondVersion].entries()) {
    const args = publish(`shared-fingerprint-game-${index}`)
    args.players[0] = { ...args.players[0], deckVersionId, deckFingerprint: fingerprint }
    await actor.mutation(api.games.publishFinishedLocalGame, args)
  }
  await assertEqual(t)
  expect((await allStats(t)).find((row) => row.fingerprint === fingerprint)?.games).toBe(2)
})

it("comparison checks device-only keys and reports missing totals", async () => {
  const t = setup()
  const { actor } = await account(t)
  const args = publish()
  args.players[0].deckKey = "device-only"
  await actor.mutation(api.games.publishFinishedLocalGame, args)
  await assertEqual(t)
  await t.run(async (ctx) => {
    const row = (await ctx.db.query("deckKeyStats").unique())!
    await ctx.db.patch(row._id, { games: 999 })
  })
  expect(await comparisons(t)).toEqual([
    expect.objectContaining({ scope: "key", reason: "totals_differ_from_results" }),
  ])
  await t.run(async (ctx) => ctx.db.delete((await ctx.db.query("deckKeyStats").unique())!._id))
  expect(await comparisons(t)).toEqual([
    expect.objectContaining({ scope: "result", reason: "missing_totals", deckKey: "device-only" }),
  ])
})

it("comparison reports an oversized history instead of accepting a truncated sum", async () => {
  const t = setup()
  const { userId } = await account(t)
  await t.run(async (ctx) => {
    for (let i = 0; i < 2001; i++)
      await addDeckResult(ctx, {
        resultId: `game:large:${i}`,
        userId,
        deckKey: "large-history",
        kind: "game",
        source: "local",
        outcome: "win",
        finishedAt: i,
        deltas: { games: tally },
      })
  })
  const page = await t.query(internal.resultsBackfill.compareDeckKeyStats, {
    cursor: "totals:",
    batchSize: 100,
  })
  expect(page.mismatches).toEqual([
    expect.objectContaining({
      scope: "key",
      reason: "comparison_limit",
      userId,
      deckKey: "large-history",
      statsId: expect.any(String),
    }),
  ])
  expect(page.isDone).toBe(false)
})

it.each(["abandoned", "duplicate", "clamped"] as const)(
  "comparison reports the reason for %s legacy differences",
  async (kind) => {
    const t = setup()
    const { actor, versionId } = await deck(t)
    const args = publish()
    args.players[0].deckVersionId = versionId
    const ack = await actor.mutation(api.games.publishFinishedLocalGame, args)
    await t.run(async (ctx) => {
      if (kind === "abandoned") {
        await ctx.db.patch(ack.summaryId, { terminalStatus: "abandoned" })
        const row = (await ctx.db.query("deckResults").unique())!
        await removeDeckResult(ctx, row.userId, row.resultId)
      } else if (kind === "duplicate") {
        const {
          _id: _,
          _creationTime: __,
          ...row
        } = (await ctx.db.query("deckGameResults").unique())!
        await ctx.db.insert("deckGameResults", row)
        const old = (await ctx.db.query("deckStats").unique())!
        await ctx.db.patch(old._id, { games: 2, wins: 2 })
      } else {
        const old = (await ctx.db.query("deckStats").unique())!
        await ctx.db.patch(old._id, { games: 0, wins: 0 })
      }
    })
    expect(await comparisons(t)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          scope: "deck",
          reason: {
            abandoned: "abandoned_games_skipped",
            duplicate: "duplicate_legacy_seats",
            clamped: "legacy_zero_clamp_possible",
          }[kind],
          reasons: expect.arrayContaining([
            {
              abandoned: "abandoned_games_skipped",
              duplicate: "duplicate_legacy_seats",
              clamped: "legacy_zero_clamp_possible",
            }[kind],
          ]),
        }),
      ]),
    )
  },
)

it("abandoned cleanup reverses both writers exactly and retries safely", async () => {
  const t = setup()
  const { actor, versionId } = await deck(t)
  const args = publish()
  args.players[0].deckVersionId = versionId
  const ack = await actor.mutation(api.games.publishFinishedLocalGame, args)
  await t.run(async (ctx) => {
    await ctx.db.patch(ack.summaryId, { terminalStatus: "abandoned" })
    const row = (await ctx.db.query("deckGameResults").unique())!
    await removeGameResult(ctx, row, Date.now())
  })
  expect((await allStats(t))[0].games).toBe(0)
  await assertEqual(t)
  await t.mutation(internal.resultsBackfill.backfillGameResults, { cursor: null, batchSize: 10 })
  expect(await t.run(async (ctx) => ctx.db.query("deckResults").collect())).toEqual([])
})

it("limits free manual results to 50 daily, replays free, deletion does not refund, Pro bypasses", async () => {
  const t = setup()
  const { actor, userId } = await account(t)
  const first = manual()
  const ack = await actor.mutation(api.matches.recordManualMatch, first)
  await t.run(async (ctx) => {
    expect((await deckRateLimiter.limit(ctx, "manualResult", { key: userId, count: 49 })).ok).toBe(
      true,
    )
  })
  expect(await actor.mutation(api.matches.recordManualMatch, first)).toEqual(ack)
  await actor.mutation(api.matches.deleteManualMatch, { matchId: ack.matchId })
  await expect(
    actor.mutation(api.matches.recordManualMatch, manual("manual-over-quota-0001")),
  ).rejects.toThrow("Too many results")
  await t.run(async (ctx) =>
    ctx.db.insert("userEntitlements", {
      userId,
      feature: "pro_decks_limit",
      source: "test",
      enabled: true,
      updatedAt: Date.now(),
    }),
  )
  await expect(
    actor.mutation(api.matches.recordManualMatch, manual("manual-pro-result-0001")),
  ).resolves.toHaveProperty("matchId")
})

it("only throttles opted-in local uploads after checking replays", async () => {
  const t = setup()
  const { actor, userId } = await account(t)
  const args = { ...publish(), retriesThrottled: true }
  const ack = await actor.mutation(api.games.publishFinishedLocalGame, args)
  await t.run(async (ctx) => {
    expect(
      (await deckRateLimiter.limit(ctx, "localGamePublish", { key: userId, count: 19 })).ok,
    ).toBe(true)
  })
  expect(await actor.mutation(api.games.publishFinishedLocalGame, args)).toEqual(ack)
  await expect(
    actor.mutation(api.games.publishFinishedLocalGame, {
      ...args,
      publicId: "local-throttled-game-0001",
    }),
  ).rejects.toThrow("Too many results")
  await expect(
    actor.mutation(api.games.publishFinishedLocalGame, publish("local-old-client-game-001")),
  ).resolves.toHaveProperty("summaryId")
})

it("sync creation defaults to syncId and explicit keys revive archived rows without resetting revisions", async () => {
  const t = setup()
  const { actor, deckId } = await deck(t)
  const id = "00000000-0000-4000-8000-000000000002"
  const metadata = {
    id,
    operationId: "00000000-0000-4000-8000-000000000003",
    expectedRevision: 0,
    name: "Synced",
    format: "modern",
    game: "mtg",
    note: "",
    deleted: false,
  }
  const created = await actor.mutation(api.decks.syncWrite, metadata)
  if ("status" in created) throw new Error("Expected write")
  expect(created).toMatchObject({ deckKey: id, revision: 1 })
  const moved = await actor.mutation(api.decks.moveToDevice, {
    deckId,
    expectedRevision: 0,
    expectedVersion: await moveVersion(t, deckId),
  })
  const revived = await actor.mutation(api.decks.syncWrite, {
    ...metadata,
    deckKey: "deck-key",
    operationId: "00000000-0000-4000-8000-000000000004",
    id: deckId,
    expectedRevision: moved.revision,
  })
  expect(revived).toMatchObject({ deckId, deckKey: "deck-key", deleted: false, revision: 2 })
  const card = {
    name: "Card",
    quantity: 4,
    oracleId: "00000000-0000-4000-8000-000000000009",
    scryfallId: "00000000-0000-4000-8000-000000000010",
  }
  const versionId = await actor.mutation(api.decks.saveVersion, { deckId, cards: [card] })
  await actor.mutation(api.decks.moveToDevice, {
    deckId,
    expectedRevision: 2,
    expectedVersion: await moveVersion(t, deckId),
  })
  const revivedByKey = await actor.mutation(api.decks.syncWrite, {
    ...metadata,
    deckKey: "deck-key",
    id: "00000000-0000-4000-8000-000000000005",
    operationId: "00000000-0000-4000-8000-000000000006",
  })
  if ("status" in revivedByKey) throw new Error("Expected write")
  expect(revivedByKey).toMatchObject({
    deckId,
    deckKey: "deck-key",
    revision: 4,
    deleted: false,
  })
  await expect(
    actor.mutation(api.decks.syncWrite, {
      ...metadata,
      name: "Renamed",
      id: revivedByKey.id,
      operationId: "00000000-0000-4000-8000-000000000011",
      expectedRevision: 4,
    }),
  ).resolves.toMatchObject({ deckId, name: "Renamed", revision: 5 })
  const cards = await t.run(async (ctx) =>
    ctx.db
      .query("deckCards")
      .withIndex("by_deck_version", (q) => q.eq("deckVersionId", versionId))
      .collect(),
  )
  expect(cards).toEqual([expect.objectContaining(card)])
  await expect(
    actor.mutation(api.decks.syncWrite, {
      ...metadata,
      deckKey: "deck-key",
      id: "00000000-0000-4000-8000-000000000007",
      operationId: "00000000-0000-4000-8000-000000000008",
    }),
  ).rejects.toThrow("live deck")
})

it("revival replaces deck content without creating a duplicate version and requires ownership", async () => {
  const t = setup()
  const { actor, deckId, versionId } = await deck(t)
  const other = await account(t, "other")
  await expect(
    other.actor.mutation(api.decks.moveToDevice, {
      deckId,
      expectedRevision: 0,
      expectedVersion: await moveVersion(t, deckId),
    }),
  ).rejects.toThrow("Deck not found")
  await actor.mutation(api.decks.moveToDevice, {
    deckId,
    expectedRevision: 0,
    expectedVersion: await moveVersion(t, deckId),
  })
  const card = {
    name: "Card",
    quantity: 4,
    oracleId: "00000000-0000-4000-8000-000000000009",
    scryfallId: "00000000-0000-4000-8000-000000000010",
  }
  const revived = await actor.mutation(api.decks.importResolved, {
    deckKey: "deck-key",
    name: "Restored",
    format: "modern",
    cards: [card],
  })
  expect(revived).toBe(deckId)
  const cards = await t.run(async (ctx) =>
    ctx.db
      .query("deckCards")
      .withIndex("by_deck_version", (q) => q.eq("deckVersionId", versionId))
      .collect(),
  )
  expect(cards).toEqual([expect.objectContaining(card)])
  expect(await t.run(async (ctx) => ctx.db.query("deckVersions").collect())).toHaveLength(1)
})

it("preserves old guestLocalId as an owner-scoped alias after backfilling keys", async () => {
  const t = setup()
  const { actor, deckId } = await deck(t)
  const alias = "00000000-0000-4000-8000-000000000011"
  await t.run(async (ctx) => ctx.db.patch(deckId, { deckKey: String(deckId), guestLocalId: alias }))
  await t.mutation(internal.resultsBackfill.backfillDeckKeys, { cursor: null, batchSize: 100 })
  const args = publish()
  args.players[0].deckKey = alias
  await actor.mutation(api.games.publishFinishedLocalGame, args)
  expect(await t.run(async (ctx) => ctx.db.query("deckResults").unique())).toMatchObject({
    deckKey: String(deckId),
  })
  expect((await actor.query(api.decks.statsForKey, { deckKey: alias })).all?.games).toBe(1)
})

it("keeps a connected match's first fingerprint across uploads and dual-writes the finished match", async () => {
  const t = setup()
  const { actor, versionId } = await deck(t)
  const matchPublicId = "connected-match-key-0001"
  for (let gameNumber = 1; gameNumber <= 2; gameNumber++) {
    const args = publish(`connected-match-game-${gameNumber}`)
    args.match = { publicId: matchPublicId, bestOf: 3, gameNumber }
    args.players[0] = {
      ...args.players[0],
      deckVersionId: versionId,
      deckKey: "deck-key",
      deckFingerprint: gameNumber === 1 ? fingerprint : `v1:${"b".repeat(64)}`,
    }
    await actor.mutation(api.games.publishFinishedLocalGame, args)
  }
  await actor.mutation(api.matches.finishScryveMatch, {
    publicId: matchPublicId,
    finishedAt: 1700000120000,
    gameCount: 2,
    seats: [
      { seat: 1, gamesWon: 2, gamesDrawn: 0, outcome: "win" },
      { seat: 2, gamesWon: 0, gamesDrawn: 0, outcome: "loss" },
    ],
  })
  const results = await t.run(async (ctx) => ctx.db.query("deckResults").collect())
  expect(results).toHaveLength(3)
  expect(results.every((row) => row.fingerprint === fingerprint)).toBe(true)
  expect(results.find((row) => row.kind === "match")?.resultId).toBe(`match:${matchPublicId}:1`)
  await assertEqual(t)
  expect((await actor.query(api.decks.statsForKey, { deckKey: "deck-key" })).all).toMatchObject({
    games: 2,
    connectedMatches: tally,
  })
})

it("abandoned games leave history without results, and the same user in two seats gets two results", async () => {
  const t = setup()
  const { actor, userId } = await account(t)
  const publicId = "cloud-abandoned-game-001"
  await actor.mutation(api.games.createLobby, {
    publicId,
    playerCount: 2,
    startingLife: 20,
    ruleset: "modern",
    inviteToken: "a".repeat(43),
    manualCodeCandidates: ["ABC234"],
    hostDisplayName: "Owner",
    hostColor: "#123456",
  })
  await actor.mutation(api.games.abandonGame, { publicId })
  expect(await t.run(async (ctx) => ctx.db.query("deckResults").collect())).toEqual([])
  expect(await t.run(async (ctx) => ctx.db.query("gameHistoryEntries").collect())).toHaveLength(1)
  const local = await actor.mutation(api.games.publishFinishedLocalGame, publish())
  await t.run(async (ctx) => {
    const summary = (await ctx.db.get(local.summaryId))!
    const second = { ...summary.players[1], userId, deckKey: "second-deck" }
    const { recordPlayerResult } =
      jest.requireActual<typeof import("./lib/results")>("./lib/results")
    await recordPlayerResult(ctx, summary, second, Date.now())
  })
  const results = await t.run(async (ctx) => ctx.db.query("deckResults").collect())
  expect(results).toHaveLength(2)
  expect(results.map((row) => row.resultId).sort()).toEqual([
    `game:${publish().publicId}:me`,
    `game:${publish().publicId}:them`,
  ])
})

it("nearby rewriting preserves canonical ids, and seat claims write results without a deck", async () => {
  const t = setup()
  const host = await account(t)
  const secondHost = await account(t, "second-host")
  const guest = await account(t, "guest")
  const { hashSeatPassToken } =
    jest.requireActual<typeof import("./lib/seatPass")>("./lib/seatPass")
  const args = publish()
  args.players[1].seatPassHash = await hashSeatPassToken("first-seat-token")
  await host.actor.mutation(api.games.publishFinishedLocalGame, args)
  const secondArgs = publish()
  secondArgs.players[0] = { ...secondArgs.players[0], localId: "second-host-me" }
  secondArgs.players[1] = {
    ...secondArgs.players[1],
    localId: "second-guest",
    seatPassHash: await hashSeatPassToken("second-seat-token"),
  }
  secondArgs.result = { kind: "win", winnerLocalIds: ["second-host-me"] }
  const ack = await secondHost.actor.mutation(api.games.publishFinishedLocalGame, secondArgs)
  expect(ack.publicId).not.toBe(args.publicId)
  const claimed = await guest.actor.mutation(api.games.claimNearbySeat, {
    publicId: secondArgs.publicId,
    token: "second-seat-token",
  })
  expect(claimed.status).toBe("claimed")
  await guest.actor.mutation(api.games.claimNearbySeat, {
    publicId: secondArgs.publicId,
    token: "second-seat-token",
  })
  const results = await t.run(async (ctx) => ctx.db.query("deckResults").collect())
  expect(results).toHaveLength(3)
  expect(results.every((row) => row.source === "nearby")).toBe(true)
  expect(results.map((row) => row.resultId).sort()).toEqual(
    [
      `game:${args.publicId}:me`,
      `game:${args.publicId}:second-host-me`,
      `game:${args.publicId}:second-guest`,
    ].sort(),
  )
})

it("scrubs a deleted publisher without changing another player's result id during backfill", async () => {
  jest.useFakeTimers()
  try {
    const t = setup()
    const host = await deck(t)
    const guest = await account(t, "guest")
    const guestDeck = await guest.actor.mutation(api.decks.create, {
      name: "Guest",
      format: "modern",
    })
    const guestVersion = await guest.actor.mutation(api.decks.saveVersion, {
      deckId: guestDeck,
      cards: [],
    })
    const { hashSeatPassToken } =
      jest.requireActual<typeof import("./lib/seatPass")>("./lib/seatPass")
    const args = publish()
    args.players[0] = {
      ...args.players[0],
      deckVersionId: host.versionId,
      deckKey: "deck-key",
      deckFingerprint: fingerprint,
    }
    args.players[1].seatPassHash = await hashSeatPassToken("delete-host-token")
    const ack = await host.actor.mutation(api.games.publishFinishedLocalGame, args)
    await guest.actor.mutation(api.games.claimNearbySeat, {
      publicId: args.publicId,
      token: "delete-host-token",
      deckVersionId: guestVersion,
    })
    const before = await t.run(async (ctx) =>
      ctx.db
        .query("deckResults")
        .withIndex("by_user_and_finished_at", (q) => q.eq("userId", guest.userId))
        .collect(),
    )
    const requestId = await t.run(async (ctx) =>
      ctx.db.insert("accountDeletionRequests", {
        clerkUserId: "owner",
        userId: host.userId,
        status: "processing",
        attempts: 0,
        requestedAt: Date.now(),
        updatedAt: Date.now(),
      }),
    )
    await t.mutation(internal.accountDeletion.processMemberships, { requestId })
    await t.mutation(internal.accountDeletion.processUserLinkedData, { requestId })
    await t.mutation(internal.accountDeletion.processUserLinkedData, { requestId })
    await t.mutation(internal.resultsBackfill.backfillGameResults, { cursor: null, batchSize: 100 })
    const after = await t.run(async (ctx) => ({
      summary: await ctx.db.get(ack.summaryId),
      results: await ctx.db.query("deckResults").collect(),
      stats: await ctx.db
        .query("deckKeyStats")
        .withIndex("by_user_and_deck_key_and_fingerprint", (q) => q.eq("userId", host.userId))
        .collect(),
    }))
    expect(after.summary?.clientGameId).toBeUndefined()
    expect(after.summary?.players[0].deckKey).toBeUndefined()
    expect(after.summary?.players[0].deckFingerprint).toBeUndefined()
    expect(after.summary?.players[0].localId).toBeUndefined()
    expect(after.summary?.players[0].resultId).toBeUndefined()
    expect(after.results).toEqual(before.map((result) => ({ ...result, opponents: [] })))
    expect(after.stats).toEqual([])
    const guestStats = await guest.actor.query(api.decks.statsForKey, {
      deckKey: (await guest.actor.query(api.decks.detail, { deckId: guestDeck })).deck.deckKey,
    })
    expect(guestStats.all?.games).toBe(1)
  } finally {
    jest.clearAllTimers()
    jest.useRealTimers()
  }
})

it("continues installed-client matches whose first seats have no pinned fields", async () => {
  const t = setup()
  const { actor, versionId } = await deck(t)
  const args = publish()
  args.match = { publicId: "old-client-match-000001", bestOf: 3, gameNumber: 1 }
  args.players[0].deckVersionId = versionId
  await actor.mutation(api.games.publishFinishedLocalGame, args)
  await t.run(async (ctx) => {
    const match = (await ctx.db.query("matches").unique())!
    await ctx.db.patch(match._id, {
      seats: match.seats.map(({ deckKey: _, deckFingerprint: _fingerprint, ...seat }) => seat),
    })
  })
  await expect(
    actor.mutation(api.games.publishFinishedLocalGame, {
      ...args,
      publicId: "old-client-match-game-002",
      match: { ...args.match, gameNumber: 2 },
    }),
  ).resolves.toHaveProperty("summaryId")
  await assertEqual(t)
})

it("reviving by key preserves the sync id installed clients already use", async () => {
  const t = setup()
  const { actor } = await account(t)
  const id = "00000000-0000-4000-8000-000000000020"
  const args = {
    id,
    operationId: "00000000-0000-4000-8000-000000000021",
    expectedRevision: 0,
    name: "Sync",
    format: "modern",
    game: "mtg",
    note: "",
    deleted: false,
  }
  const created = await actor.mutation(api.decks.syncWrite, args)
  if ("status" in created) throw new Error("Expected write")
  await actor.mutation(api.decks.moveToDevice, {
    deckId: created.deckId,
    expectedRevision: 1,
    expectedVersion: await moveVersion(t, created.deckId),
  })
  const revived = await actor.mutation(api.decks.syncWrite, {
    ...args,
    id: "00000000-0000-4000-8000-000000000022",
    deckKey: id,
    operationId: "00000000-0000-4000-8000-000000000023",
  })
  expect(revived).toMatchObject({ id, deckId: created.deckId, revision: 3 })
  await expect(
    actor.mutation(api.decks.syncWrite, {
      ...args,
      expectedRevision: 3,
      operationId: "00000000-0000-4000-8000-000000000024",
    }),
  ).resolves.toMatchObject({ id, revision: 4 })
})
