import { recordSummary } from "./deckCopy"

it("rates a deck only on games with a recorded outcome, like the Stats screen", () => {
  expect(recordSummary({ games: 12, wins: 6, losses: 3, draws: 0, unknown: 3 })).toBe("6-3")
  expect(recordSummary({ games: 12, wins: 7, losses: 3, draws: 0, unknown: 2 })).toBe("70% of 10")
  expect(recordSummary({ games: 3, wins: 0, losses: 0, draws: 0, unknown: 3 })).toBe("0-0")
  expect(recordSummary({ games: 0, wins: 0, losses: 0, draws: 0, unknown: 0 })).toBe("No games yet")
})
