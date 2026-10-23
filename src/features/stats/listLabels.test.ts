import { listStats, type DeckSummary, type StatsSlice } from "./deckStatsMath"
import { fingerprintsToRead, labelLists, LISTS_WITH_CHANGES } from "./listLabels"

const slice = (fingerprint: string | null, lastAt: number): StatsSlice => ({
  source: "scryve",
  fingerprint,
  podSize: 4,
  wentFirst: null,
  games: 1,
  wins: 1,
  losses: 0,
  draws: 0,
  firstAt: lastAt,
  lastAt,
})

const summary = (...slices: StatsSlice[]): DeckSummary => ({
  all: null,
  lists: [],
  slices,
  scannedAll: true,
})

const lists = listStats(summary(slice("c", 30), slice("b", 20), slice("a", 10), slice(null, 5)))

it("calls a list Current only when it is the deck's current list", () => {
  const kinds = (currentFingerprint?: string) =>
    labelLists(lists, { currentFingerprint, cards: new Map() }).map((list) => list.kind)
  expect(kinds("c")).toEqual(["current", "dated", "dated", "untracked"])
  expect(kinds("b")).toEqual(["dated", "current", "dated", "untracked"])
  expect(kinds(undefined)).toEqual(["dated", "dated", "dated", "untracked"])
})

it("diffs each list against the one played before it, and skips lists whose cards are missing", () => {
  const cards = new Map([
    ["c", [{ name: "Forest", quantity: 2 }]],
    [
      "b",
      [
        { name: "Forest", quantity: 1 },
        { name: "Plains", quantity: 1 },
      ],
    ],
  ])
  const labeled = labelLists(lists, { cards })
  expect(labeled[0].changes).toEqual([
    { name: "Forest", quantity: 1 },
    { name: "Plains", quantity: -1 },
  ])
  expect(labeled[1].changes).toEqual([])
  expect(labeled[2].changes).toEqual([])
  expect(labeled[3].changes).toEqual([])
})

it("reads cards for only the newest lists and one older list", () => {
  const rows = [null, ...Array.from({ length: 9 }, (_, index) => String(index))].map(
    (fingerprint) => ({ fingerprint }),
  )
  expect(fingerprintsToRead(rows)).toEqual(["0", "1", "2", "3", "4", "5"])
  expect(fingerprintsToRead(rows)).toHaveLength(LISTS_WITH_CHANGES + 1)
})
