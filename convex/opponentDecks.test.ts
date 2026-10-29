import type { FunctionArgs } from "convex/server"

import { type ConvexTestHarness, makeConvexTest, signedIn } from "../test/convexTest"
import { api, internal } from "./_generated/api"
import type { Id } from "./_generated/dataModel"
import { deckFingerprint } from "./lib/deckFingerprint"
import { hashSeatPassToken } from "./lib/seatPass"

const FINISHED_AT = 1_700_000_900_000
const fingerprint = `v1:${"b".repeat(64)}`

async function commanderDeck(
  t: ConvexTestHarness,
  actor: Awaited<ReturnType<typeof signedIn>>,
  name: string,
  commanders: { cardId: string; name: string }[],
) {
  const deckId = await actor.mutation(api.decks.create, { name, format: "commander" })
  const versionId = await actor.mutation(api.decks.saveVersion, { deckId, cards: [] })
  await t.run(async (ctx) => {
    for (const commander of commanders)
      await ctx.db.insert("deckCards", {
        deckVersionId: versionId,
        game: "mtg",
        identityNamespace: "scryfall-oracle",
        cardId: commander.cardId,
        name: commander.name,
        section: "commander",
        quantity: 1,
      })
    await ctx.db.insert("deckCards", {
      deckVersionId: versionId,
      game: "mtg",
      identityNamespace: "scryfall-oracle",
      cardId: "sol-ring",
      name: "Sol Ring",
      section: "main",
      quantity: 1,
    })
  })
  return { deckId, versionId }
}

function localGame(
  players: FunctionArgs<typeof api.games.publishFinishedLocalGame>["players"],
  publicId = "local-opponents-game-0001",
): FunctionArgs<typeof api.games.publishFinishedLocalGame> {
  return {
    publicId,
    system: "mtg",
    format: "commander",
    ruleset: "commander",
    startingLife: 40,
    startedAt: FINISHED_AT - 60_000,
    finishedAt: FINISHED_AT,
    eventCount: 2,
    players,
    result: { kind: "win", winnerLocalIds: ["them"] },
  }
}

const me = { localId: "me", me: true, seat: 1, displayName: "Me", color: "#123456", currentLife: 0 }
const them = { localId: "them", seat: 2, displayName: "Bob", color: "#654321", currentLife: 12 }

function resultsOf(t: ConvexTestHarness, userId: Id<"users">) {
  return t.run(async (ctx) =>
    ctx.db
      .query("deckResults")
      .withIndex("by_user_and_finished_at", (q) => q.eq("userId", userId))
      .collect(),
  )
}

describe("local games", () => {
  it("remember each opponent's label, and old payloads still name the opponent", async () => {
    const t = makeConvexTest()
    const actor = await signedIn(t, "host")
    const { userId } = actor
    const label = {
      name: "  Bob's Atraxa  ",
      identity: [
        { cardId: "tymna", name: "Tymna the Weaver" },
        { cardId: "thrasios", name: "Thrasios, Triton Hero" },
      ],
    }
    await actor.mutation(
      api.games.publishFinishedLocalGame,
      localGame([me, { ...them, deckLabel: label }]),
    )
    await actor.mutation(
      api.games.publishFinishedLocalGame,
      localGame([me, them], "local-opponents-game-0002"),
    )

    const [labeled, unlabeled] = (await resultsOf(t, userId)).sort((a, b) =>
      a.resultId.localeCompare(b.resultId),
    )
    expect(labeled.opponents).toEqual([
      {
        displayName: "Bob",
        outcome: "win",
        deck: {
          name: "Bob's Atraxa",
          identity: [
            { cardId: "thrasios", name: "Thrasios, Triton Hero" },
            { cardId: "tymna", name: "Tymna the Weaver" },
          ],
        },
      },
    ])
    expect(unlabeled.opponents).toEqual([{ displayName: "Bob", outcome: "win" }])
  })

  it("rejects a label whose fingerprint has no deck key, or with three identity cards", async () => {
    const t = makeConvexTest()
    const actor = await signedIn(t, "host")
    await expect(
      actor.mutation(
        api.games.publishFinishedLocalGame,
        localGame([me, { ...them, deckLabel: { fingerprint } }]),
      ),
    ).rejects.toThrow("A list fingerprint needs its deck key")
    const three = ["a", "b", "c"].map((cardId) => ({ cardId, name: cardId }))
    await expect(
      actor.mutation(
        api.games.publishFinishedLocalGame,
        localGame([me, { ...them, deckLabel: { identity: three } }]),
      ),
    ).rejects.toThrow("A deck is known by 1–2 distinct cards")
  })
})

describe("nearby games", () => {
  it("fills in a guest's real deck on every seat's result once the guest claims", async () => {
    const t = makeConvexTest()
    const host = await signedIn(t, "host")
    const guest = await signedIn(t, "guest")
    const { versionId } = await commanderDeck(t, guest, "Kenrith", [
      { cardId: "kenrith", name: "Kenrith, the Returned King" },
    ])
    const token = "guest-seat-token"
    await host.mutation(
      api.games.publishFinishedLocalGame,
      localGame(
        [
          me,
          {
            ...them,
            seatPassHash: await hashSeatPassToken(token),
            deckLabel: { name: "Typed by host" },
          },
        ],
        "lan_0123456789abcdef0123456789abcdef-1",
      ),
    )
    expect((await resultsOf(t, host.userId))[0].opponents).toEqual([
      { displayName: "Bob", outcome: "win", deck: { name: "Typed by host" } },
    ])

    await guest.mutation(api.games.claimNearbySeat, {
      publicId: "lan_0123456789abcdef0123456789abcdef-1",
      token,
      deckVersionId: versionId,
    })

    const kenrith = [{ cardId: "kenrith", name: "Kenrith, the Returned King" }]
    expect((await resultsOf(t, host.userId))[0].opponents).toEqual([
      {
        displayName: "Bob",
        userId: guest.userId,
        outcome: "win",
        deck: { deckKey: expect.any(String), name: "Kenrith", identity: kenrith },
      },
    ])
    expect((await resultsOf(t, guest.userId))[0].opponents).toEqual([
      { displayName: "Me", userId: host.userId, outcome: "loss" },
    ])
  })
})

describe("cloud games", () => {
  it("derive each seat's deck and commanders, and the host can label a guest seat", async () => {
    const t = makeConvexTest()
    const host = await signedIn(t, "host")
    const second = await signedIn(t, "second")
    const { versionId } = await commanderDeck(t, host, "Partners", [
      { cardId: "tymna", name: "Tymna the Weaver" },
      { cardId: "thrasios", name: "Thrasios, Triton Hero" },
    ])
    const publicId = "cloud-opponents-game-01"
    await host.mutation(api.games.createLobby, {
      publicId,
      playerCount: 3,
      startingLife: 40,
      ruleset: "commander",
      system: "mtg",
      format: "commander",
      inviteToken: "t".repeat(43),
      manualCodeCandidates: ["ABC234"],
      hostDisplayName: "Host",
      hostColor: "#123456",
    })
    await second.mutation(api.games.claimSeat, {
      token: "t".repeat(43),
      displayName: "Second",
      color: "#654321",
    })
    await host.mutation(api.decks.selectForSeat, {
      publicId,
      seat: 1,
      deckVersionId: versionId,
    })
    const guestSeat = await t.run(async (ctx) => {
      const game = (await ctx.db
        .query("games")
        .withIndex("by_public_id", (q) => q.eq("publicId", publicId))
        .unique())!
      return await ctx.db.insert("gamePlayers", {
        gameId: game._id,
        seat: 3,
        displayName: "Guest",
        color: "#22AA22",
        currentLife: 40,
        joinedAt: FINISHED_AT,
      })
    })
    await expect(
      second.mutation(api.games.labelGuestSeatDeck, {
        publicId,
        seat: 3,
        deckLabel: { name: "Mono red" },
      }),
    ).rejects.toThrow("Host permission required")
    await expect(
      host.mutation(api.games.labelGuestSeatDeck, {
        publicId,
        seat: 2,
        deckLabel: { name: "Not theirs to name" },
      }),
    ).rejects.toThrow("Only a guest seat can be labeled")
    await host.mutation(api.games.labelGuestSeatDeck, {
      publicId,
      seat: 3,
      deckLabel: { name: "Mono red" },
    })
    const projection = await host.query(api.games.lobbyProjection, { publicId })
    expect(projection.players.find((player) => player.seat === 3)?.deckLabel).toEqual({
      name: "Mono red",
    })
    await host.mutation(api.games.startGame, { publicId })
    await host.mutation(api.games.finishGame, {
      publicId,
      result: { kind: "win", winnerPlayerIds: [guestSeat] },
    })

    expect((await resultsOf(t, second.userId))[0].opponents).toEqual([
      {
        displayName: "Player 1",
        userId: host.userId,
        outcome: "loss",
        deck: {
          deckKey: expect.any(String),
          fingerprint: expect.stringMatching(/^v1:/),
          name: "Partners",
          identity: [
            { cardId: "thrasios", name: "Thrasios, Triton Hero" },
            { cardId: "tymna", name: "Tymna the Weaver" },
          ],
        },
      },
      { displayName: "Player 3", outcome: "win", deck: { name: "Mono red" } },
    ])
  })
})

describe("manual matches", () => {
  it("keep opponent labels and a synced deck's fingerprint, and accept old payloads", async () => {
    const t = makeConvexTest()
    const actor = await signedIn(t, "owner")
    const { userId } = actor
    const deckId = await actor.mutation(api.decks.create, { name: "Burn", format: "modern" })
    const deckVersionId = await actor.mutation(api.decks.saveVersion, { deckId, cards: [] })
    const listFingerprint = await deckFingerprint([])
    await actor.mutation(api.matches.recordManualMatch, {
      publicId: "manual-opponents-000001",
      bestOf: 1,
      finishedAt: FINISHED_AT,
      me: { seat: 1, deckVersionId, deckFingerprint: listFingerprint, outcome: "loss" },
      opponents: [
        {
          seat: 2,
          displayName: "Ana",
          deckName: "Ana's deck",
          deckLabel: { identity: [{ cardId: "edgar", name: "Edgar Markov" }] },
          outcome: "win",
        },
        { seat: 3, displayName: "Cy", outcome: "loss" },
      ],
    })
    await actor.mutation(api.matches.recordManualMatch, {
      publicId: "manual-opponents-000002",
      bestOf: 1,
      finishedAt: FINISHED_AT,
      me: { seat: 1, deckVersionId, outcome: "win" },
      opponents: [{ seat: 2, displayName: "Ana", deckName: "Vampires", outcome: "loss" }],
    })

    const results = (await resultsOf(t, userId)).sort((a, b) =>
      a.resultId.localeCompare(b.resultId),
    )
    expect(results[0]).toMatchObject({
      fingerprint: listFingerprint,
      opponents: [
        {
          displayName: "Ana",
          outcome: "win",
          deck: { name: "Ana's deck", identity: [{ cardId: "edgar", name: "Edgar Markov" }] },
        },
        { displayName: "Cy", outcome: "loss" },
      ],
    })
    expect(results[1].fingerprint).toBeUndefined()
    expect(results[1].opponents).toEqual([
      { displayName: "Ana", outcome: "loss", deck: { name: "Vampires" } },
    ])
  })
})

describe("account deletion", () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => {
    jest.clearAllTimers()
    jest.useRealTimers()
  })

  it("drops the deleted account from other players' results", async () => {
    const t = makeConvexTest()
    const host = await signedIn(t, "host")
    const guest = await signedIn(t, "guest")
    const token = "guest-seat-token"
    const publicId = "lan_0123456789abcdef0123456789abcdef-2"
    await host.mutation(
      api.games.publishFinishedLocalGame,
      localGame([me, { ...them, seatPassHash: await hashSeatPassToken(token) }], publicId),
    )
    await guest.mutation(api.games.claimNearbySeat, { publicId, token })
    expect((await resultsOf(t, host.userId))[0].opponents?.[0].userId).toBe(guest.userId)

    const requestId = await t.run(async (ctx) =>
      ctx.db.insert("accountDeletionRequests", {
        userId: guest.userId,
        clerkUserId: "guest",
        status: "processing",
        attempts: 0,
        requestedAt: FINISHED_AT,
        updatedAt: FINISHED_AT,
      }),
    )
    await t.mutation(internal.accountDeletion.processMemberships, { requestId })

    expect((await resultsOf(t, host.userId))[0].opponents).toEqual([])
  })
})

describe("backfillResultOpponents", () => {
  it("names opponents on older results once, and leaves newer ones alone", async () => {
    const t = makeConvexTest()
    const actor = await signedIn(t, "host")
    const { userId } = actor
    await actor.mutation(
      api.games.publishFinishedLocalGame,
      localGame([me, { ...them, deckLabel: { name: "Labeled" } }]),
    )
    await actor.mutation(api.matches.recordManualMatch, {
      publicId: "manual-opponents-000003",
      bestOf: 1,
      finishedAt: FINISHED_AT,
      me: { seat: 1, outcome: "win" },
      opponents: [{ seat: 2, displayName: "Ana", deckName: "Vampires", outcome: "loss" }],
    })
    const before = await resultsOf(t, userId)
    await t.run(async (ctx) => {
      for (const result of before) await ctx.db.patch(result._id, { opponents: undefined })
    })

    const first = await t.mutation(internal.resultsBackfill.backfillResultOpponents, {
      cursor: null,
      batchSize: 100,
    })
    const again = await t.mutation(internal.resultsBackfill.backfillResultOpponents, {
      cursor: null,
      batchSize: 100,
    })

    expect(first).toMatchObject({ patched: 2, isDone: true })
    expect(again.patched).toBe(0)
    expect((await resultsOf(t, userId)).map((result) => result.opponents)).toEqual(
      before.map((result) => result.opponents),
    )
  })
})
