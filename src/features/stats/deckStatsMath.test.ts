import {
  chanceRate,
  exactRecord,
  honestRate,
  likelyRange,
  listStats,
  recordText,
  sumSlices,
  type DeckSummary,
  type StatsSlice,
} from "./deckStatsMath"

const slice = (overrides: Partial<StatsSlice> = {}): StatsSlice => ({
  source: "scryve",
  fingerprint: "a",
  podSize: 4,
  wentFirst: null,
  games: 8,
  wins: 4,
  losses: 4,
  draws: 0,
  firstAt: 1,
  lastAt: 2,
  ...overrides,
})

it("sums combined source, list and pod filters without dropping untracked results", () => {
  const slices = [
    slice(),
    slice({
      source: "manual",
      fingerprint: null,
      podSize: 2,
      games: 2,
      wins: 1,
      losses: 0,
      draws: 1,
    }),
  ]
  expect(sumSlices(slices)).toEqual({ games: 10, wins: 5, losses: 4, draws: 1 })
  expect(sumSlices(slices, "manual", { fingerprint: null, podSize: 2 })).toEqual({
    games: 2,
    wins: 1,
    losses: 0,
    draws: 1,
  })
  expect(sumSlices(slices, "scryve", { fingerprint: null }).games).toBe(0)
})

it("shows a record under ten games and a percentage from ten", () => {
  expect(honestRate(slice())).toEqual({ text: "4-4", tooFew: true, games: 8 })
  expect(honestRate(slice({ games: 10, wins: 4, losses: 5, draws: 1 }))).toEqual({
    text: "40%",
    tooFew: false,
    games: 10,
  })
  expect(recordText(slice({ draws: 1 }))).toBe("4-4-1")
  expect(honestRate(sumSlices([])).text).toBe("0-0")
})

it("compares the most common pod size without blending sizes or sources", () => {
  const slices = [
    slice(),
    slice({ games: 2, wins: 1, losses: 1, podSize: 2 }),
    slice({ games: 100, podSize: null }),
    slice({ source: "manual", games: 10, wins: 6, losses: 4, podSize: 2 }),
  ]
  expect(chanceRate(slices, "scryve")).toEqual({
    podSize: 4,
    expected: 0.25,
    record: { games: 8, wins: 4, losses: 4, draws: 0 },
  })
  expect(chanceRate(slices, "all")).toEqual({
    podSize: 2,
    expected: 0.5,
    record: { games: 12, wins: 7, losses: 5, draws: 0 },
  })
  expect(chanceRate([slice({ podSize: null })])).toBeUndefined()
  expect(chanceRate([slice({ podSize: 0 })])).toBeUndefined()
})

it("excludes unknown outcomes from rates, sample thresholds and likely ranges", () => {
  const known = slice({ games: 10, wins: 4, losses: 5, draws: 1 })
  const withUnknown = { ...known, games: 30 }
  expect(honestRate(withUnknown)).toEqual({ text: "40%", tooFew: false, games: 10 })
  expect(honestRate(slice({ games: 30 }))).toEqual({ text: "4-4", tooFew: true, games: 8 })
  expect(likelyRange(withUnknown)).toEqual(likelyRange(known))
  const unknownOnly = { games: 30, wins: 0, losses: 0, draws: 0 }
  expect(honestRate(unknownOnly)).toEqual({ text: "0-0", tooFew: true, games: 0 })
  expect(likelyRange(unknownOnly)).toBeUndefined()
})

it("computes the 90 percent Wilson interval including zero and all wins", () => {
  expect(likelyRange(slice({ games: 10, wins: 5, losses: 5 }))).toEqual({ low: 27, high: 73 })
  expect(likelyRange(slice({ games: 10, wins: 0, losses: 10 }))).toEqual({ low: 0, high: 21 })
  expect(likelyRange(slice({ games: 10, wins: 10, losses: 0 }))).toEqual({ low: 79, high: 100 })
  expect(likelyRange(sumSlices([]))).toBeUndefined()
})

it("counts manual results as matches, like the breakdown rows", () => {
  const row = {
    games: 20,
    wins: 12,
    losses: 7,
    draws: 1,
    manualMatches: { total: 5, wins: 3, losses: 2, draws: 0 },
    manualGames: { total: 12, wins: 7, losses: 5, draws: 0 },
  } as NonNullable<DeckSummary["all"]>
  expect(exactRecord(row, "all")).toEqual({ games: 25, wins: 15, losses: 9, draws: 1 })
  expect(exactRecord(row, "manual")).toEqual({ games: 5, wins: 3, losses: 2, draws: 0 })
})

it("orders lists by last played, untracked results included", () => {
  const summary: DeckSummary = {
    all: null,
    lists: [],
    scannedAll: true,
    slices: [
      slice({ fingerprint: "old", lastAt: 10 }),
      slice({ fingerprint: "newest", lastAt: 30 }),
      slice({ fingerprint: null, lastAt: 40 }),
      slice({ fingerprint: "middle", lastAt: 20 }),
    ],
  }
  expect(listStats(summary).map(({ fingerprint }) => fingerprint)).toEqual([
    null,
    "newest",
    "middle",
    "old",
  ])
})

it("combines turn order with source, pod and list filters, keeping unknown separate from false", () => {
  const slices = [
    slice({ wentFirst: true }),
    slice({ wentFirst: false, wins: 2, losses: 6 }),
    slice(),
    slice({ source: "manual", wentFirst: null }),
  ]
  expect(sumSlices(slices, "scryve", { wentFirst: true, fingerprint: "a", podSize: 4 })).toEqual({
    games: 8,
    wins: 4,
    losses: 4,
    draws: 0,
  })
  expect(sumSlices(slices, "scryve", { wentFirst: false }).wins).toBe(2)
  expect(sumSlices(slices, "scryve", { wentFirst: null }).games).toBe(8)
  expect(sumSlices(slices, "all", { wentFirst: null }).games).toBe(16)
  expect(sumSlices(slices).games).toBe(32)
})
