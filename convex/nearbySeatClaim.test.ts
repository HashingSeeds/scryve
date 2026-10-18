import type { FunctionArgs } from "convex/server"
import { convexTest } from "convex-test"

import { api, internal } from "./_generated/api"
import { hashSeatPassToken } from "./lib/seatPass"
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
  "./users.ts": async () => jest.requireActual("./users"),
}

const FINISHED_AT = 1_700_000_900_000
const PUBLIC_ID = "lan_0123456789abcdef0123456789abcdef-1"
const GUEST_TOKEN = "token_guest"
const OTHER_TOKEN = "token_other"

type PublishArgs = FunctionArgs<typeof api.games.publishFinishedLocalGame>
type Players = PublishArgs["players"]

async function synced(t: ReturnType<typeof convexTest>, subject: string) {
  const actor = t.withIdentity({ subject })
  await actor.mutation(api.users.syncCurrent, { displayName: subject })
  return actor
}

async function nearbyGame(players?: Players, publicId = PUBLIC_ID): Promise<PublishArgs> {
  return {
    publicId,
    system: "mtg",
    format: "commander",
    ruleset: "commander",
    startingLife: 40,
    startedAt: FINISHED_AT - 60_000,
    finishedAt: FINISHED_AT,
    eventCount: 3,
    players: players ?? [
      {
        localId: "seat_host",
        seat: 1,
        displayName: "Host",
        color: "#7C3AED",
        currentLife: 30,
        me: true,
      },
      {
        localId: "seat_guest",
        seat: 2,
        displayName: "Guest",
        color: "#2563EB",
        currentLife: 0,
        seatPassHash: await hashSeatPassToken(GUEST_TOKEN),
      },
      {
        localId: "seat_other",
        seat: 3,
        displayName: "Other",
        color: "#DC2626",
        currentLife: 5,
        seatPassHash: await hashSeatPassToken(OTHER_TOKEN),
      },
    ],
    result: { kind: "win", winnerLocalIds: ["seat_host"] },
  }
}

async function ownedDeck(actor: Awaited<ReturnType<typeof synced>>, format = "commander") {
  const deckId = await actor.mutation(api.decks.create, { name: "Atraxa", format })
  const versionId = await actor.mutation(api.decks.saveVersion, { deckId, cards: [] })
  return { deckId, versionId }
}

const historyOf = (actor: Awaited<ReturnType<typeof synced>>) =>
  actor.query(api.games.connectedHistory, { paginationOpts: { numItems: 10, cursor: null } })

describe("claimNearbySeat", () => {
  it("waits for the host's upload, then files the game under the guest once", async () => {
    const t = convexTest(schema, modules)
    const host = await synced(t, "host")
    const guest = await synced(t, "guest")
    const claim = { publicId: PUBLIC_ID, token: GUEST_TOKEN }

    await expect(guest.mutation(api.games.claimNearbySeat, claim)).resolves.toEqual({
      status: "pending",
    })
    const { publicId } = await host.mutation(api.games.publishFinishedLocalGame, await nearbyGame())
    await expect(guest.mutation(api.games.claimNearbySeat, claim)).resolves.toEqual({
      status: "claimed",
    })
    await expect(guest.mutation(api.games.claimNearbySeat, claim)).resolves.toEqual({
      status: "claimed",
    })

    expect(publicId).toBe(PUBLIC_ID)
    const history = await historyOf(guest)
    expect(history.page).toHaveLength(1)
    expect(history.page[0]).toMatchObject({
      publicId,
      source: "local",
      outcome: "loss",
      finishedAt: FINISHED_AT,
    })
    expect((await historyOf(host)).page).toHaveLength(1)
    const summary = await t.run((ctx) =>
      ctx.db
        .query("gameSummaries")
        .withIndex("by_public_id", (q) => q.eq("publicId", publicId))
        .unique(),
    )
    expect(summary?.players.filter((player) => player.userId).map((player) => player.seat)).toEqual(
      [1, 2],
    )
    const opened = await guest.query(api.games.connectedSummary, { publicId })
    expect(opened?.publicId).toBe(publicId)
    await expect(host.query(api.games.connectedSummary, { publicId })).resolves.toBeTruthy()
  })

  it("counts the guest's own deck toward its stats once", async () => {
    const t = convexTest(schema, modules)
    const host = await synced(t, "host")
    const guest = await synced(t, "guest")
    const { deckId, versionId } = await ownedDeck(guest)
    await host.mutation(api.games.publishFinishedLocalGame, await nearbyGame())
    const claim = { publicId: PUBLIC_ID, token: GUEST_TOKEN, deckVersionId: versionId }

    await guest.mutation(api.games.claimNearbySeat, claim)
    await guest.mutation(api.games.claimNearbySeat, claim)

    const rows = await t.run(async (ctx) => ({
      results: await ctx.db.query("deckGameResults").collect(),
      stats: await ctx.db
        .query("deckStats")
        .withIndex("by_deck", (q) => q.eq("deckId", deckId))
        .unique(),
      summary: await ctx.db.query("gameSummaries").unique(),
    }))
    expect(rows.results).toEqual([
      expect.objectContaining({ deckVersionId: versionId, outcome: "loss" }),
    ])
    expect(rows.stats).toMatchObject({ games: 1, losses: 1 })
    expect(rows.summary?.players.find((player) => player.seat === 2)).toMatchObject({
      deckId,
      deckVersionId: versionId,
      deckNameAtFinish: "Atraxa",
    })
  })

  it("still files the seat when the deck isn't the guest's own or doesn't fit the game", async () => {
    const t = convexTest(schema, modules)
    const host = await synced(t, "host")
    const guest = await synced(t, "guest")
    const other = await synced(t, "other")
    const { versionId: hostDeck } = await ownedDeck(host)
    const { versionId: modernDeck } = await ownedDeck(other, "modern")
    await host.mutation(api.games.publishFinishedLocalGame, await nearbyGame())

    await expect(
      guest.mutation(api.games.claimNearbySeat, {
        publicId: PUBLIC_ID,
        token: GUEST_TOKEN,
        deckVersionId: hostDeck,
      }),
    ).resolves.toEqual({ status: "claimed" })
    await expect(
      other.mutation(api.games.claimNearbySeat, {
        publicId: PUBLIC_ID,
        token: OTHER_TOKEN,
        deckVersionId: modernDeck,
      }),
    ).resolves.toEqual({ status: "claimed" })

    const results = await t.run((ctx) => ctx.db.query("deckGameResults").collect())
    expect(results).toEqual([])
    expect((await historyOf(guest)).page).toHaveLength(1)
  })

  it("finds no seat for a wrong pass, and refuses a held seat or a second seat for one account", async () => {
    const t = convexTest(schema, modules)
    const host = await synced(t, "host")
    const guest = await synced(t, "guest")
    const intruder = await synced(t, "intruder")
    const { publicId } = await host.mutation(api.games.publishFinishedLocalGame, await nearbyGame())

    await expect(
      guest.mutation(api.games.claimNearbySeat, { publicId: PUBLIC_ID, token: "token_guessed" }),
    ).resolves.toEqual({ status: "pending" })
    await guest.mutation(api.games.claimNearbySeat, { publicId: PUBLIC_ID, token: GUEST_TOKEN })
    await expect(
      intruder.mutation(api.games.claimNearbySeat, { publicId: PUBLIC_ID, token: GUEST_TOKEN }),
    ).rejects.toThrow("Another account claimed this seat")
    await expect(
      guest.mutation(api.games.claimNearbySeat, { publicId: PUBLIC_ID, token: OTHER_TOKEN }),
    ).rejects.toThrow("already hold a seat")
    await expect(
      host.mutation(api.games.claimNearbySeat, { publicId: PUBLIC_ID, token: OTHER_TOKEN }),
    ).rejects.toThrow("already hold a seat")
    expect((await historyOf(intruder)).page).toHaveLength(0)
    await expect(intruder.query(api.games.connectedSummary, { publicId })).rejects.toThrow(
      "Game membership required",
    )
  })

  it("refuses a seat to the host of a game it holds no seat in", async () => {
    const t = convexTest(schema, modules)
    const host = await synced(t, "host")
    const [mine, guest, other] = (await nearbyGame()).players
    const { publicId } = await host.mutation(
      api.games.publishFinishedLocalGame,
      await nearbyGame([{ ...mine, me: undefined }, guest, other]),
    )

    await expect(
      host.mutation(api.games.claimNearbySeat, { publicId: PUBLIC_ID, token: GUEST_TOKEN }),
    ).rejects.toThrow("already hold a seat")
    expect((await historyOf(host)).page).toHaveLength(1)
    await expect(host.query(api.games.connectedSummary, { publicId })).resolves.toMatchObject({
      publicId,
    })
  })

  it("rejects a pass hash on the host's own seat, a malformed hash, and a repeated hash", async () => {
    const t = convexTest(schema, modules)
    const host = await synced(t, "host")
    const valid = await nearbyGame()
    const [mine, guest, other] = valid.players
    const hash = guest.seatPassHash!

    for (const players of [
      [{ ...mine, seatPassHash: hash }, { ...guest, seatPassHash: undefined }, other],
      [mine, { ...guest, seatPassHash: "not-a-hash" }, other],
      [mine, guest, { ...other, seatPassHash: hash }],
    ])
      await expect(
        host.mutation(api.games.publishFinishedLocalGame, await nearbyGame(players)),
      ).rejects.toThrow("Seat passes must be distinct hashes")
  })

  it("keeps the host's upload and every claim working when a guest publishes under the round first", async () => {
    const t = convexTest(schema, modules)
    const host = await synced(t, "host")
    const hostile = await synced(t, "hostile")
    const other = await synced(t, "other")
    const [mine, guestSeat, otherSeat] = (await nearbyGame()).players
    const plain = [
      mine,
      { ...guestSeat, seatPassHash: undefined },
      { ...otherSeat, seatPassHash: undefined },
    ]
    await hostile.mutation(api.games.publishFinishedLocalGame, await nearbyGame(plain))
    await hostile.mutation(
      api.games.publishFinishedLocalGame,
      await nearbyGame([mine, guestSeat, { ...otherSeat, seatPassHash: undefined }]),
    )

    const { publicId } = await host.mutation(api.games.publishFinishedLocalGame, await nearbyGame())
    expect(publicId).not.toBe(PUBLIC_ID)
    await expect(
      host.mutation(api.games.publishFinishedLocalGame, await nearbyGame()),
    ).resolves.toMatchObject({ publicId })
    await expect(
      other.mutation(api.games.claimNearbySeat, { publicId: PUBLIC_ID, token: OTHER_TOKEN }),
    ).resolves.toEqual({ status: "claimed" })
    expect((await historyOf(other)).page.map((entry) => entry.publicId)).toEqual([publicId])
  })

  it("files each round a pass was reused in under that round", async () => {
    const t = convexTest(schema, modules)
    const host = await synced(t, "host")
    const guest = await synced(t, "guest")
    const secondRound = "lan_0123456789abcdef0123456789abcdef-2"
    const first = await host.mutation(api.games.publishFinishedLocalGame, await nearbyGame())
    const second = await host.mutation(
      api.games.publishFinishedLocalGame,
      await nearbyGame(undefined, secondRound),
    )

    for (const round of [secondRound, PUBLIC_ID])
      await expect(
        guest.mutation(api.games.claimNearbySeat, { publicId: round, token: GUEST_TOKEN }),
      ).resolves.toEqual({ status: "claimed" })
    expect((await historyOf(guest)).page.map((entry) => entry.publicId).sort()).toEqual(
      [first.publicId, second.publicId].sort(),
    )
  })

  it("lets no one claim a deleted guest's seat with its old pass", async () => {
    // why: deletion phases are driven by hand here, so the scheduler must not run them after the test.
    jest.useFakeTimers()
    const previousClerkSecret = process.env.CLERK_SECRET_KEY
    process.env.CLERK_SECRET_KEY = "sk_test_nearby_claim"
    const t = convexTest(schema, modules)
    const host = await synced(t, "host")
    const guest = await synced(t, "guest")
    const intruder = await synced(t, "intruder")
    await host.mutation(api.games.publishFinishedLocalGame, await nearbyGame())
    const claim = { publicId: PUBLIC_ID, token: GUEST_TOKEN }
    await guest.mutation(api.games.claimNearbySeat, claim)
    const request = await guest.mutation(api.accountDeletion.requestCurrentAccountDeletion, {
      confirmation: "DELETE",
    })
    await t.mutation(internal.accountDeletion.processMemberships, { requestId: request.requestId })

    await expect(intruder.mutation(api.games.claimNearbySeat, claim)).resolves.toEqual({
      status: "pending",
    })
    expect((await historyOf(intruder)).page).toHaveLength(0)
    const seat = await t.run((ctx) =>
      ctx.db
        .query("gamePlayers")
        .filter((q) => q.eq(q.field("seat"), 2))
        .unique(),
    )
    expect(seat).not.toHaveProperty("userId")
    expect(seat).not.toHaveProperty("seatPassHash")
    expect(seat?.deletedAt).toEqual(expect.any(Number))
    jest.clearAllTimers()
    jest.useRealTimers()
    if (previousClerkSecret === undefined) delete process.env.CLERK_SECRET_KEY
    else process.env.CLERK_SECRET_KEY = previousClerkSecret
  })
})
