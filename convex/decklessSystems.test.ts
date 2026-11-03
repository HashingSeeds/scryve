import { makeConvexTest, signedIn, type ConvexTestHarness } from "../test/convexTest"
import { api } from "./_generated/api"
import { hashSeatPassToken } from "./lib/seatPass"
import type * as Definitions from "./lib/systems/definitions"

jest.mock("./lib/systems/definitions", () => {
  const actual: typeof Definitions = jest.requireActual("./lib/systems/definitions")
  return {
    ...actual,
    SYSTEMS: { ...actual.SYSTEMS, mtg: { ...actual.SYSTEMS.mtg, resultTracking: false } },
  }
})

const token = "t".repeat(43)

async function deckOf(actor: Awaited<ReturnType<typeof signedIn>>, deckKey: string) {
  const deckId = await actor.mutation(api.decks.create, { name: "Burn", format: "modern", deckKey })
  return await actor.mutation(api.decks.saveVersion, { deckId, cards: [] })
}

async function deckFieldsStored(t: ConvexTestHarness) {
  return await t.run(async (ctx) => {
    const rows: object[] = [
      ...(await ctx.db.query("gamePlayers").collect()),
      ...(await ctx.db.query("gameSummaries").collect()).flatMap((summary) => summary.players),
      ...(await ctx.db.query("matches").collect()).flatMap((match) => match.seats),
    ]
    return rows.flatMap((row) => Object.keys(row).filter((key) => key.startsWith("deck")))
  })
}

it("a finished local game and its nearby claim keep no deck on any seat", async () => {
  const t = makeConvexTest()
  const host = await signedIn(t, "host")
  const guest = await signedIn(t, "guest")
  const hostDeck = await deckOf(host, "host-deck")
  const guestDeck = await deckOf(guest, "guest-deck")

  const { publicId } = await host.mutation(api.games.publishFinishedLocalGame, {
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
        deckVersionId: hostDeck,
        deckKey: "host-deck",
        deckName: "Burn",
      },
      {
        localId: "them",
        seat: 2,
        displayName: "Them",
        color: "#654321",
        currentLife: 0,
        deckLabel: { name: "Jinx" },
        seatPassHash: await hashSeatPassToken("guest-pass"),
      },
    ],
    result: { kind: "win", winnerLocalIds: ["me"] },
    match: { publicId: "local-finished-match-001", bestOf: 3, gameNumber: 1 },
  })
  await expect(
    guest.mutation(api.games.claimNearbySeat, {
      publicId,
      token: "guest-pass",
      deckVersionId: guestDeck,
    }),
  ).resolves.toEqual({ status: "claimed" })

  expect(await deckFieldsStored(t)).toEqual([])
})

it("a connected lobby ignores deck choices and requirements", async () => {
  const t = makeConvexTest()
  const host = await signedIn(t, "host")
  const guest = await signedIn(t, "guest")
  const publicId = "cloud-deckless-game-0001"
  await host.mutation(api.games.createLobby, {
    publicId,
    playerCount: 2,
    startingLife: 20,
    ruleset: "modern",
    deckRequired: true,
    inviteToken: token,
    manualCodeCandidates: ["ABC234"],
    hostDisplayName: "Host",
    hostColor: "#123456",
  })
  await guest.mutation(api.games.claimSeat, { token, displayName: "Guest", color: "#654321" })
  await host.mutation(api.decks.selectForSeat, {
    publicId,
    seat: 1,
    deckVersionId: await deckOf(host, "host-deck"),
  })
  await host.mutation(api.games.updateLobbySettings, { publicId, deckRequired: true })

  expect(await host.query(api.games.lobbyProjection, { publicId })).toMatchObject({
    deckRequired: false,
  })
  await host.mutation(api.games.startGame, { publicId })
  await host.mutation(api.games.finishGameWithOperation, {
    publicId,
    operationId: "deckless-cloud-finish-001",
  })

  expect(await deckFieldsStored(t)).toEqual([])
})

it("a manual match keeps no deck on any seat", async () => {
  const t = makeConvexTest()
  const actor = await signedIn(t, "owner")

  await actor.mutation(api.matches.recordManualMatch, {
    publicId: "manual-finished-match-001",
    bestOf: 3,
    finishedAt: Date.now() - 1000,
    me: {
      seat: 1,
      outcome: "win",
      gamesWon: 2,
      deckVersionId: await deckOf(actor, "owner-deck"),
      deckKey: "owner-deck",
      deckName: "Burn",
    },
    opponents: [
      {
        seat: 2,
        displayName: "Them",
        outcome: "loss",
        gamesWon: 1,
        deckName: "Jinx",
        deckLabel: { name: "Jinx" },
      },
    ],
  })

  expect(await deckFieldsStored(t)).toEqual([])
})
