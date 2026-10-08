import { deckStatLines } from "./deckStatLines"

const tally = (wins: number, losses: number, draws = 0, unknown = 0) => ({
  total: wins + losses + draws + unknown,
  wins,
  losses,
  draws,
  unknown,
})

const legacy = { games: 6, wins: 4, losses: 2, draws: 0, unknown: 0 }

const record = {
  ...legacy,
  connected: { games: tally(4, 2) },
  manual: { matches: tally(3, 1, 1), games: tally(7, 3, 1) },
}

describe("deckStatLines", () => {
  it("shows only Scryve games by default because Scryve matches are not recorded yet", () => {
    expect(deckStatLines(record, "scryve")).toEqual([{ label: "Games", text: "4-2-0" }])
  })

  it("falls back to the legacy game fields when a response has no envelopes", () => {
    expect(deckStatLines(legacy, "scryve")).toEqual([{ label: "Games", text: "4-2-0" }])
    expect(deckStatLines(legacy, "all")).toEqual([{ label: "Games", text: "4-2-0" }])
    expect(deckStatLines(legacy, "manual")).toEqual([])
  })

  it("shows manual matches and games", () => {
    expect(deckStatLines(record, "manual")).toEqual([
      { label: "Matches", text: "3-1-1" },
      { label: "Games", text: "7-3-1" },
    ])
  })

  it("sums every source for All, including Scryve matches once they exist", () => {
    expect(deckStatLines(record, "all")).toEqual([
      { label: "Matches", text: "3-1-1" },
      { label: "Games", text: "11-5-1" },
    ])
    const withScryveMatches = {
      ...record,
      connected: { games: tally(4, 2), matches: tally(2, 1) },
    }
    expect(deckStatLines(withScryveMatches, "scryve")).toEqual([
      { label: "Matches", text: "2-1-0" },
      { label: "Games", text: "4-2-0" },
    ])
    expect(deckStatLines(withScryveMatches, "all")[0]).toEqual({
      label: "Matches",
      text: "5-2-1",
    })
  })

  it("drops the games line when manual results carry no game scores", () => {
    const scoreless = { ...record, manual: { matches: tally(2, 0) } }
    expect(deckStatLines(scoreless, "manual")).toEqual([{ label: "Matches", text: "2-0-0" }])
  })

  it("collapses to one line when matches and games read the same", () => {
    const pod = {
      ...legacy,
      games: 0,
      wins: 0,
      losses: 0,
      connected: { games: tally(0, 0) },
      manual: { matches: tally(2, 1, 1), games: tally(2, 1, 1) },
    }
    expect(deckStatLines(pod, "all")).toEqual([{ label: "Matches", text: "2-1-1" }])
  })

  it("returns nothing when the source has no results", () => {
    expect(deckStatLines({ ...record, manual: {} }, "manual")).toEqual([])
    expect(deckStatLines({ games: 0, wins: 0, losses: 0, draws: 0, unknown: 0 }, "all")).toEqual([])
  })
})
