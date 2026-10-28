import { convexTest, type TestConvex } from "convex-test"

import { registerRateLimiter } from "../test/registerRateLimiter"
import { api, internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import schema from "./schema"

const modules = {
  "./_generated/api.ts": async () => jest.requireActual("./_generated/api"),
  "./_generated/server.ts": async () => jest.requireActual("./_generated/server"),
  "./accountDeletion.ts": async () => jest.requireActual("./accountDeletion"),
  "./events.ts": async () => jest.requireActual("./events"),
  "./users.ts": async () => jest.requireActual("./users"),
}

async function account(t: TestConvex<typeof schema>, subject: string) {
  const actor = t.withIdentity({ subject })
  await actor.mutation(api.users.syncCurrent, { displayName: subject })
  return actor
}

const swiss = {
  name: "Friday Modern",
  system: "mtg",
  format: "modern",
  structure: "swiss" as const,
  bestOf: 3 as const,
  plannedRounds: 3,
  roundMinutes: 50,
  joinAsPlayer: false,
}

async function setup(players = ["ana", "ben", "cat"]) {
  const t = convexTest(schema, modules)
  registerRateLimiter(t)
  const organizer = await account(t, "organizer")
  const { eventId, code } = await organizer.mutation(api.events.create, {
    ...swiss,
    codeCandidates: ["ABC123"],
  })
  const actors = new Map<string, Awaited<ReturnType<typeof account>>>()
  for (const name of players) {
    const actor = await account(t, name)
    await actor.mutation(api.events.join, { code: code.toLowerCase() })
    actors.set(name, actor)
  }
  return { t, organizer, eventId, code, actors }
}

async function deleteAccount(t: TestConvex<typeof schema>, subject: string) {
  const requestId = await t.run(async (ctx) => {
    const user = (await ctx.db
      .query("users")
      .withIndex("by_clerk_user", (q) => q.eq("clerkUserId", subject))
      .unique())!
    return await ctx.db.insert("accountDeletionRequests", {
      clerkUserId: subject,
      userId: user._id,
      status: "processing",
      attempts: 0,
      requestedAt: Date.now(),
      updatedAt: Date.now(),
    })
  })
  for (let step = 0; step < 8; step += 1)
    await t.mutation(internal.accountDeletion.processUserLinkedData, { requestId })
}

async function tablesOf(t: TestConvex<typeof schema>, eventId: Id<"events">) {
  const view = await t.query(api.events.view, { eventId })
  return view!.tables
}

describe("events", () => {
  it("pairs a round with a bye for the odd player and starts the clock", async () => {
    const { t, organizer, eventId } = await setup()
    await organizer.mutation(api.events.startNextRound, { eventId })
    const view = await t.query(api.events.view, { eventId })
    expect(view).toMatchObject({ status: "active", round: 1, isOrganizer: false })
    expect(view!.clock).toMatchObject({ durationMs: 50 * 60_000 })
    expect(view!.tables.map((table) => table.playerIds.length)).toEqual([2, 1])
    expect(view!.tables[1]).toMatchObject({ status: "confirmed", result: { kind: "bye" } })
  })

  it("lets one player report and another at the table confirm", async () => {
    const { t, organizer, eventId, actors } = await setup(["ana", "ben"])
    await organizer.mutation(api.events.startNextRound, { eventId })
    const [table] = await tablesOf(t, eventId)
    const ana = actors.get("ana")!
    const ben = actors.get("ben")!
    const anaView = await ana.query(api.events.view, { eventId })
    const anaSeat = table.playerIds.indexOf(anaView!.myPlayerId!)
    const gamesWon = anaSeat === 0 ? [2, 1] : [1, 2]

    await ana.mutation(api.events.report, {
      tableId: table.id,
      result: { kind: "match", gamesWon, gamesDrawn: 0 },
    })
    await expect(ana.mutation(api.events.confirm, { tableId: table.id })).rejects.toThrow(
      "Another player at your table confirms your report",
    )
    await ben.mutation(api.events.confirm, { tableId: table.id })
    expect((await tablesOf(t, eventId))[0]).toMatchObject({ status: "confirmed" })
    await expect(
      ben.mutation(api.events.report, {
        tableId: table.id,
        result: { kind: "match", gamesWon: [2, 0], gamesDrawn: 0 },
      }),
    ).rejects.toThrow("Ask the organizer to change a confirmed result")

    const standings = await t.query(api.events.standings, { eventId, throughRound: 1 })
    expect(standings![0]).toMatchObject({ playerId: anaView!.myPlayerId, points: 3, rank: 1 })
  })

  it("keeps players off other tables and rejects impossible scores", async () => {
    const { t, organizer, eventId, actors } = await setup(["ana", "ben", "cat", "dan"])
    await organizer.mutation(api.events.startNextRound, { eventId })
    const tables = await tablesOf(t, eventId)
    const ana = actors.get("ana")!
    const anaId = (await ana.query(api.events.view, { eventId }))!.myPlayerId!
    const other = tables.find((table) => !table.playerIds.includes(anaId))!
    const mine = tables.find((table) => table.playerIds.includes(anaId))!

    await expect(
      ana.mutation(api.events.report, {
        tableId: other.id,
        result: { kind: "match", gamesWon: [2, 0], gamesDrawn: 0 },
      }),
    ).rejects.toThrow("You can only report your own table")
    await expect(
      ana.mutation(api.events.report, {
        tableId: mine.id,
        result: { kind: "match", gamesWon: [3, 0], gamesDrawn: 0 },
      }),
    ).rejects.toThrow("Each player wins 0–2 games")
  })

  it("waits for every result before pairing the next round, and the organizer can enter them", async () => {
    const { t, organizer, eventId } = await setup(["ana", "ben"])
    await organizer.mutation(api.events.startNextRound, { eventId })
    await expect(organizer.mutation(api.events.startNextRound, { eventId })).rejects.toThrow(
      "Enter every result before the next round",
    )
    const [table] = await tablesOf(t, eventId)
    await organizer.mutation(api.events.report, {
      tableId: table.id,
      result: { kind: "match", gamesWon: [1, 1], gamesDrawn: 1 },
    })
    expect((await tablesOf(t, eventId))[0]).toMatchObject({ status: "confirmed" })
    await organizer.mutation(api.events.startNextRound, { eventId })
    expect((await t.query(api.events.view, { eventId }))!.round).toBe(2)
  })

  it("removes a player who drops before the first round and keeps one who drops after", async () => {
    const { t, organizer, eventId, actors } = await setup(["ana", "ben", "cat"])
    const cat = actors.get("cat")!
    const catId = (await cat.query(api.events.view, { eventId }))!.myPlayerId!
    await cat.mutation(api.events.dropPlayer, { playerId: catId })
    expect((await t.query(api.events.view, { eventId }))!.players).toHaveLength(2)

    const guestId = await organizer.mutation(api.events.addGuest, { eventId, name: "Dee" })
    await organizer.mutation(api.events.startNextRound, { eventId })
    await organizer.mutation(api.events.dropPlayer, { playerId: guestId })
    const players = (await t.query(api.events.view, { eventId }))!.players
    expect(players.find((player) => player.id === guestId)).toMatchObject({
      guest: true,
      dropped: true,
    })
  })

  it("returns nothing for an unknown code instead of throwing", async () => {
    const { t } = await setup([])
    const stranger = await account(t, "stranger")
    expect(await stranger.mutation(api.events.join, { code: "ZZZ999" })).toBeNull()
  })

  it("caps how many unfinished events one organizer runs", async () => {
    const t = convexTest(schema, modules)
    registerRateLimiter(t)
    const organizer = await account(t, "organizer")
    for (let index = 0; index < 5; index++)
      await organizer.mutation(api.events.create, {
        ...swiss,
        codeCandidates: [`CODE0${index}`],
      })
    await expect(
      organizer.mutation(api.events.create, { ...swiss, codeCandidates: ["CODE05"] }),
    ).rejects.toThrow("Finish an event first")
  })

  it("refuses an unknown code once a player has guessed too many", async () => {
    const { actors } = await setup(["ana"])
    const ana = actors.get("ana")!
    for (let guess = 0; guess < 9; guess += 1)
      expect(await ana.mutation(api.events.join, { code: `ZZZZ${10 + guess}` })).toBeNull()
    await expect(ana.mutation(api.events.join, { code: "ZZZZ99" })).rejects.toThrow(
      "Too many requests",
    )
  })

  it("keeps the organizer's controls from players", async () => {
    const { actors, eventId } = await setup()
    await expect(
      actors.get("ana")!.mutation(api.events.startNextRound, { eventId }),
    ).rejects.toThrow("Only the organizer")
  })

  it("starts the next round on a reported result without waiting for confirmation", async () => {
    const { t, organizer, eventId, actors } = await setup(["ana", "ben"])
    await organizer.mutation(api.events.startNextRound, { eventId })
    const [table] = await tablesOf(t, eventId)
    const reporter = [...actors.values()][0]!
    await reporter.mutation(api.events.report, {
      tableId: table!.id,
      result: { kind: "match", gamesWon: [2, 0], gamesDrawn: 0 },
    })

    expect(await organizer.mutation(api.events.startNextRound, { eventId })).toBe(2)
  })

  it("detaches a deleted organizer and anonymizes a deleted player", async () => {
    jest.useFakeTimers()
    const { t, organizer, eventId } = await setup(["ana", "ben"])
    await organizer.mutation(api.events.startNextRound, { eventId })
    await deleteAccount(t, "organizer")
    await deleteAccount(t, "ana")

    const rows = await t.run(async (ctx) => ({
      event: await ctx.db.get(eventId),
      players: await ctx.db
        .query("eventPlayers")
        .withIndex("by_event", (q) => q.eq("eventId", eventId))
        .collect(),
    }))
    expect(rows.event).toMatchObject({ status: "finished" })
    expect(rows.event?.ownerUserId).toBeUndefined()
    expect(rows.event?.clock).toBeUndefined()
    expect(rows.players.map((player) => [player.name, player.userId === undefined])).toEqual([
      ["Deleted player", true],
      ["ben", false],
    ])
    jest.clearAllTimers()
    jest.useRealTimers()
  })

  describe("importing a nearby event", () => {
    const nearby = {
      nearbyId: "event_abc",
      name: "Wifi Night",
      format: "modern",
      structure: "swiss" as const,
      bestOf: 3 as const,
      points: { win: 3, draw: 1, loss: 0 },
      plannedRounds: 1,
      roundMinutes: 50,
      round: 1,
      createdAt: 1,
      finishedAt: 2,
      players: [
        { id: "p1", name: "Kim" },
        { id: "p2", name: "Gus" },
        { id: "p3", name: "Lin" },
      ],
      tables: [
        {
          round: 1,
          table: 1,
          playerIds: ["p1", "p2"],
          status: "confirmed" as const,
          result: { kind: "match" as const, gamesWon: [2, 1], gamesDrawn: 0 },
          reportedBy: "p1",
        },
        {
          round: 1,
          table: 2,
          playerIds: ["p3"],
          status: "confirmed" as const,
          result: { kind: "bye" as const },
        },
      ],
      codeCandidates: ["NRB123", "NRB124"],
    }

    it("stores the finished event once, however often it's sent", async () => {
      const { t, organizer } = await setup([])
      const first = await organizer.mutation(api.events.importNearby, nearby)
      const again = await organizer.mutation(api.events.importNearby, nearby)
      expect(again.eventId).toBe(first.eventId)
      expect(again.ownerId).toBe("organizer")

      const view = await t.query(api.events.view, { eventId: first.eventId })
      expect(view).toMatchObject({ status: "finished", round: 1, name: "Wifi Night" })
      const standings = await t.query(api.events.standings, {
        eventId: first.eventId,
        throughRound: 1,
      })
      expect(standings!.map((row) => [row.points, row.wins])).toEqual([
        [3, 1],
        [3, 1],
        [0, 0],
      ])
    })

    it("refuses tables that name players the event doesn't have", async () => {
      const { organizer } = await setup([])
      await expect(
        organizer.mutation(api.events.importNearby, {
          ...nearby,
          nearbyId: "event_bad",
          tables: [{ ...nearby.tables[0]!, playerIds: ["p1", "ghost"] }],
        }),
      ).rejects.toThrow("Unknown player")
    })

    it.each([
      [
        "a player listed twice",
        { players: [...nearby.players, { id: "p1", name: "Kim again" }] },
        "Duplicate player",
      ],
      [
        "a player seated twice in a round",
        { tables: [nearby.tables[0]!, { ...nearby.tables[1]!, playerIds: ["p1"] }] },
        "appears twice",
      ],
      [
        "a table number used twice in a round",
        { tables: [nearby.tables[0]!, { ...nearby.tables[1]!, table: 1 }] },
        "appears twice",
      ],
      [
        "a table in a round that wasn't played",
        { tables: [{ ...nearby.tables[0]!, round: 2 }] },
        "wasn't played",
      ],
      [
        "a bye shared by two players",
        { tables: [{ ...nearby.tables[1]!, playerIds: ["p1", "p3"] }] },
        "lone player",
      ],
    ])("refuses %s", async (_case, change, message) => {
      const { organizer } = await setup([])
      await expect(
        organizer.mutation(api.events.importNearby, { ...nearby, nearbyId: "event_x", ...change }),
      ).rejects.toThrow(message)
    })

    it("gives each organizer their own copy of the same nearby event", async () => {
      const { t, organizer } = await setup([])
      const other = await account(t, "other-organizer")
      const mine = await organizer.mutation(api.events.importNearby, nearby)
      const theirs = await other.mutation(api.events.importNearby, {
        ...nearby,
        codeCandidates: ["NRB125", "NRB126"],
      })
      expect(theirs.eventId).not.toBe(mine.eventId)
    })
  })
})
