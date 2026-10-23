import { allRecord, keyStatsRecord } from "./deckStatLines"

const tally = (wins: number, losses: number, draws = 0, unknown = 0) => ({
  total: wins + losses + draws + unknown,
  wins,
  losses,
  draws,
  unknown,
})

describe("allRecord", () => {
  it("adds manual matches to games played in Scryve, once", () => {
    const record = keyStatsRecord({
      games: 1,
      wins: 1,
      losses: 0,
      draws: 0,
      unknown: 0,
      manualMatches: tally(0, 1),
      manualGames: tally(1, 2),
    })
    expect(allRecord(record)).toEqual({ games: 2, wins: 1, losses: 1, draws: 0, unknown: 0 })
  })

  it("reads Scryve games alone when a response has no manual results", () => {
    const legacy = { games: 6, wins: 4, losses: 2, draws: 0, unknown: 0 }
    expect(allRecord(legacy)).toEqual(legacy)
    expect(allRecord(keyStatsRecord(null))).toEqual({
      games: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      unknown: 0,
    })
  })
})
