import { createLocalGame, createNextMatchGame } from "@/features/game/domain"
import { saveListSnapshot } from "@/features/stats/listSnapshots"

import {
  betweenGames,
  loadMatchSwaps,
  matchSeatDeck,
  saveMatchSwaps,
  swapPool,
  swapsOf,
} from "./matchSideboard"

const cards = [
  { name: "Lightning Bolt", quantity: 4, section: "main" },
  { name: "Searing Blaze", quantity: 2, section: "main" },
  { name: "Rest in Peace", quantity: 2, section: "sideboard" },
]

function matchGame() {
  return createLocalGame({
    players: [
      { name: "Ada", color: "#41476E" },
      { name: "Grace", color: "#39755C" },
    ],
    startingLife: 20,
    system: "mtg",
    format: "modern",
    match: { bestOf: 3 },
  })
}

describe("match sideboard", () => {
  it("offers swaps only in formats with a sideboard", () => {
    expect(swapPool(cards, { game: "mtg", format: "modern" })?.side).toEqual([
      { key: "sideboard:Rest in Peace", name: "Rest in Peace", quantity: 2 },
    ])
    expect(swapPool(cards, { game: "pokemon", format: "standard" })).toBeUndefined()
  })

  it("never moves more copies than the list has", () => {
    const pool = swapPool(cards, { game: "mtg", format: "modern" })!
    const swaps = swapsOf(
      { in: { "sideboard:Rest in Peace": 5 }, out: { "main:Searing Blaze": 2 } },
      pool,
    )
    expect(swaps.in).toEqual([
      { key: "sideboard:Rest in Peace", name: "Rest in Peace", quantity: 2 },
    ])
    expect(swaps.out).toEqual([{ key: "main:Searing Blaze", name: "Searing Blaze", quantity: 2 }])
  })

  it("keeps swaps for their match only", () => {
    const swaps = {
      in: [{ key: "sideboard:Rest in Peace", name: "Rest in Peace", quantity: 2 }],
      out: [],
    }
    saveMatchSwaps("match-1", swaps)
    expect(loadMatchSwaps("match-1")).toEqual(swaps)
    expect(loadMatchSwaps("match-2")).toEqual({ in: [], out: [] })
    saveMatchSwaps("match-1", { in: [], out: [] })
    expect(loadMatchSwaps("match-1")).toEqual({ in: [], out: [] })
  })

  it("sideboards only before a later game of the match starts", () => {
    const first = matchGame()
    expect(betweenGames(first)).toBeUndefined()
    const second = createNextMatchGame({
      ...first,
      status: "finished",
      result: { kind: "win", winnerPlayerIds: [first.players[0].id] },
    })
    expect(betweenGames(second)?.gameNumber).toBe(2)
  })
  it("reads the list pinned when the match began before the cached version", () => {
    const { account } = createLocalGame({
      players: [
        { name: "Ada", color: "#41476E" },
        { name: "Grace", color: "#39755C" },
      ],
      startingLife: 20,
      account: {
        ownerId: "owner",
        meSeat: 0,
        deckVersionId: "version-1",
        deckKey: "deck-key",
        deckFingerprint: "fingerprint-1",
      },
    })
    expect(matchSeatDeck(account)).toEqual({ ownerId: "owner", versionId: "version-1" })
    saveListSnapshot("deck-key", "fingerprint-1", cards)
    expect(matchSeatDeck(account)).toEqual({ deckKey: "deck-key", fingerprint: "fingerprint-1" })
  })
})
