import { type ConvexTestHarness, makeConvexTest, signedIn } from "../test/convexTest"
import { api } from "./_generated/api"
import type { Doc, Id } from "./_generated/dataModel"
import { MATCHUP_SCAN } from "./deckStats"
import type { ResultOpponent } from "./lib/opponentDecks"

const T = 1_700_000_000_000
const atraxa = [{ cardId: "atraxa", name: "Atraxa, Praetors' Voice" }]
const partners = [
  { cardId: "thrasios", name: "Thrasios, Triton Hero" },
  { cardId: "tymna", name: "Tymna the Weaver" },
]

let next = 0
function result(
  t: ConvexTestHarness,
  userId: Id<"users">,
  fields: Partial<Doc<"deckResults">> & { opponents?: ResultOpponent[] },
) {
  next += 1
  return t.run(async (ctx) =>
    ctx.db.insert("deckResults", {
      resultId: `game:matchup-${next}:seat`,
      userId,
      deckKey: "burn",
      kind: "game",
      source: "local",
      outcome: "loss",
      finishedAt: T + next,
      deltas: {},
      ...fields,
    }),
  )
}

describe("deckStats.matchups", () => {
  it("groups a deck's games by commander, opponent deck, and opponent player", async () => {
    const t = makeConvexTest()
    const actor = await signedIn(t, "owner")
    const { userId } = actor
    const friend = await signedIn(t, "friend")
    const ana = {
      displayName: "Ana",
      userId: friend.userId,
      deck: { deckKey: "ana-atraxa", name: "Superfriends", identity: atraxa },
    }
    await result(t, userId, {
      outcome: "loss",
      podSize: 4,
      opponents: [
        { ...ana, outcome: "win" },
        { displayName: "Bob", outcome: "loss", deck: { identity: partners } },
        { displayName: "Cy", outcome: "loss" },
      ],
    })
    await result(t, userId, {
      outcome: "win",
      podSize: 2,
      opponents: [{ ...ana, outcome: "loss" }],
    })
    await result(t, userId, {
      outcome: "draw",
      podSize: 2,
      opponents: [{ displayName: " bob ", outcome: "draw", deck: { name: "Tymna Thrasios" } }],
    })
    await result(t, userId, { outcome: "win", podSize: 2 })
    await result(t, userId, {
      kind: "match",
      source: "connected",
      outcome: "win",
      opponents: [{ ...ana, outcome: "loss" }],
    })

    const matchups = await actor.query(api.deckStats.matchups, { deckKey: "burn" })

    const tally = (row: { games: number; wins: number; losses: number; draws: number }) => [
      row.games,
      row.wins,
      row.losses,
      row.draws,
    ]
    expect(matchups).toMatchObject({ counted: 3, scannedAll: true })
    expect(matchups.byIdentity.map((row) => [row.key, ...tally(row), row.theirWins])).toEqual([
      ["atraxa", 2, 1, 1, 0, 1],
      ["thrasios+tymna", 1, 0, 1, 0, 0],
    ])
    expect(matchups.byIdentity[0].expectedWins).toBeCloseTo(0.75)
    expect(matchups.byDeck.map((row) => [row.key, row.name, row.opponentDeckKey])).toEqual([
      ["deck:ana-atraxa", "Superfriends", "ana-atraxa"],
      ["name:tymna thrasios", "Tymna Thrasios", null],
      ["identity:thrasios+tymna", null, null],
    ])
    expect(matchups.byPlayer.map((row) => [row.key, row.displayName, ...tally(row)])).toEqual([
      ["name:bob", " bob ", 2, 0, 1, 1],
      [`user:${friend.userId}`, "Ana", 2, 1, 1, 0],
      ["name:cy", "Cy", 1, 0, 1, 0],
    ])
    expect(matchups.byPlayer.every((row) => row.deckKey === "burn")).toBe(true)
  })

  it("lists every deck of the caller when no deck is named, and only the caller's", async () => {
    const t = makeConvexTest()
    const actor = await signedIn(t, "owner")
    const { userId } = actor
    const other = await signedIn(t, "other")
    await result(t, userId, { deckKey: "burn", opponents: [{ displayName: "Ana" }] })
    await result(t, userId, { deckKey: "elves", opponents: [{ displayName: "Ana" }] })
    await result(t, userId, { deckKey: undefined, opponents: [{ displayName: "Ana" }] })
    await result(t, other.userId, { deckKey: "burn", opponents: [{ displayName: "Ana" }] })

    const all = await actor.query(api.deckStats.matchups, {})

    expect(all.byPlayer.map((row) => [row.deckKey, row.games]).sort()).toEqual([
      ["burn", 1],
      ["elves", 1],
    ])
    await expect(t.query(api.deckStats.matchups, {})).rejects.toThrow()
  })

  it("hides a blocked opponent's name, deck and commander", async () => {
    const t = makeConvexTest()
    const actor = await signedIn(t, "owner")
    const { userId } = actor
    const blocked = await signedIn(t, "blocked")
    await t.run(async (ctx) =>
      ctx.db.insert("userBlocks", {
        blockerUserId: userId,
        blockedUserId: blocked.userId,
        createdAt: T,
      }),
    )
    await result(t, userId, {
      opponents: [
        {
          displayName: "Blocked",
          userId: blocked.userId,
          outcome: "win",
          deck: { deckKey: "theirs", name: "Their deck", identity: atraxa },
        },
      ],
    })

    const matchups = await actor.query(api.deckStats.matchups, { deckKey: "burn" })

    expect(matchups.byPlayer).toEqual([])
    expect(matchups.byDeck).toEqual([])
    expect(matchups.byIdentity).toEqual([])
  })

  it("never returns a deck, guest or commander name the name gate hides", async () => {
    const t = makeConvexTest()
    const actor = await signedIn(t, "owner")
    const { userId } = actor
    await result(t, userId, {
      opponents: [
        { displayName: "kkk", deck: { name: "Hitler Youth", identity: atraxa } },
        { displayName: "Bob", deck: { deckKey: "bobs", name: "Nazi Zombies", identity: partners } },
        { displayName: "Cy", deck: { identity: [{ cardId: "spam", name: "Pedo Lord" }] } },
      ],
    })
    await result(t, userId, {
      opponents: [{ displayName: "KKK crew", deck: { name: "pedo tribal" } }],
    })

    const matchups = await actor.query(api.deckStats.matchups, { deckKey: "burn" })

    expect(JSON.stringify(matchups)).not.toMatch(/hitler|nazi|pedo|kkk/i)
    expect(matchups.byDeck.map((row) => [row.key, row.name, row.games])).toEqual([
      ["hidden", "Deck", 2],
      ["deck:bobs", "Deck", 1],
    ])
    expect(matchups.byDeck.every((row) => row.identity === null)).toBe(true)
    expect(matchups.byIdentity).toEqual([])
    expect(matchups.byPlayer.map((row) => [row.key, row.displayName, row.games])).toEqual([
      ["hidden", "Player", 2],
      ["name:bob", "Bob", 1],
      ["name:cy", "Cy", 1],
    ])
  })

  it("shows a held opponent's placeholder, not the name stored on the result", async () => {
    const t = makeConvexTest()
    const actor = await signedIn(t, "owner")
    const { userId } = actor
    const held = await signedIn(t, "held")
    await t.run((ctx) =>
      ctx.db.patch(held.userId, {
        username: "oldname",
        moderationHold: {
          placeholderUsername: "player-4821",
          heldUsername: "oldname",
          reason: "operator",
          createdAt: T,
        },
      }),
    )
    await result(t, userId, {
      opponents: [
        {
          displayName: "oldname",
          userId: held.userId,
          deck: { name: "Superfriends", identity: atraxa },
        },
      ],
    })

    const matchups = await actor.query(api.deckStats.matchups, { deckKey: "burn" })

    expect(JSON.stringify(matchups)).not.toContain("oldname")
    expect(matchups.byPlayer.map((row) => row.displayName)).toEqual(["player-4821"])
    expect(matchups.byDeck.map((row) => row.name)).toEqual(["Superfriends"])
  })

  it(`reads at most the ${MATCHUP_SCAN} most recent results`, async () => {
    const t = makeConvexTest()
    const actor = await signedIn(t, "owner")
    const { userId } = actor
    await t.run(async (ctx) => {
      for (let index = 0; index <= MATCHUP_SCAN; index += 1)
        await ctx.db.insert("deckResults", {
          resultId: `game:bound-${index}:seat`,
          userId,
          deckKey: "burn",
          kind: "game",
          source: "local",
          outcome: "win",
          finishedAt: T + index,
          deltas: {},
          opponents: [{ displayName: index === 0 ? "Oldest" : "Recent" }],
        })
    })

    const matchups = await actor.query(api.deckStats.matchups, { deckKey: "burn" })

    expect(matchups).toMatchObject({ counted: MATCHUP_SCAN, scannedAll: false })
    expect(matchups.byPlayer.map((row) => row.displayName)).toEqual(["Recent"])
  })
})
