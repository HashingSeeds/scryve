import {
  localClockFor,
  matchSetupFor,
  nextRoundBlocker,
  resultIsValid,
  standingsThroughRound,
} from "./eventLogic"
import type { EventTableView, EventView } from "./eventSource"

const table = (overrides: Partial<EventTableView> = {}): EventTableView => ({
  id: "t1",
  table: 1,
  playerIds: ["a", "b"],
  status: "open",
  result: null,
  reportedBy: null,
  ...overrides,
})

const event = (overrides: Partial<EventView> = {}): EventView => ({
  id: "e1",
  code: "ABC123",
  name: "Friday Modern",
  system: "mtg",
  format: "modern",
  structure: "swiss",
  bestOf: 3,
  points: { win: 3, draw: 1, loss: 0 },
  plannedRounds: 3,
  roundMinutes: 50,
  status: "active",
  round: 2,
  clock: null,
  isOrganizer: false,
  myPlayerId: "a",
  players: [
    { id: "a", name: "Ada", guest: false, dropped: false },
    { id: "b", name: "Grace", guest: true, dropped: false },
  ],
  tables: [table()],
  ...overrides,
})

const reported = table({ result: { kind: "match", gamesWon: [2, 1], gamesDrawn: 0 } })

describe("standingsThroughRound", () => {
  it("counts the current round only once every table has a result", () => {
    expect(standingsThroughRound(event({ round: 0, tables: [] }))).toBe(0)
    expect(standingsThroughRound(event())).toBe(1)
    expect(standingsThroughRound(event({ tables: [reported] }))).toBe(2)
  })
})

describe("nextRoundBlocker", () => {
  it("names what stops the next round", () => {
    expect(nextRoundBlocker(event())).toEqual({ kind: "results" })
    expect(nextRoundBlocker(event({ tables: [reported] }))).toBeUndefined()
    expect(nextRoundBlocker(event({ structure: "pods", round: 0, tables: [] }))).toEqual({
      kind: "players",
      count: 3,
    })
  })
})

describe("resultIsValid", () => {
  it("accepts one match winner within the best of", () => {
    const view = event()
    const match = (gamesWon: number[], gamesDrawn = 0) =>
      resultIsValid(view, table(), { kind: "match", gamesWon, gamesDrawn })
    expect(match([2, 1])).toBe(true)
    expect(match([1, 1], 1)).toBe(true)
    expect(match([2, 2])).toBe(false)
    expect(match([3, 0])).toBe(false)
  })

  it("accepts a pod winner by seat or a draw", () => {
    const view = event({ structure: "pods", bestOf: 1 })
    const pod = table({ playerIds: ["a", "b", "c"] })
    expect(resultIsValid(view, pod, { kind: "pod", winnerSeat: 2 })).toBe(true)
    expect(resultIsValid(view, pod, { kind: "pod", winnerSeat: null })).toBe(true)
    expect(resultIsValid(view, pod, { kind: "pod", winnerSeat: 3 })).toBe(false)
  })
})

describe("localClockFor", () => {
  it("rounds the minutes left up and skips a finished clock", () => {
    const clock = { startedAt: 0, durationMs: 50 * 60_000 }
    expect(localClockFor(clock, 17 * 60_000 + 50_000)).toEqual({ mode: "countdown", minutes: 33 })
    expect(localClockFor({ ...clock, pausedAt: 60_000 }, 40 * 60_000)).toEqual({
      mode: "countdown",
      minutes: 49,
    })
    expect(localClockFor(clock, 51 * 60_000)).toBeUndefined()
    expect(localClockFor(null, 0)).toBeUndefined()
  })
})

describe("matchSetupFor", () => {
  it("seats players in table order with the event's match settings", () => {
    const view = event({
      format: "commander",
      structure: "pods",
      bestOf: 1,
      players: [
        { id: "a", name: "Sam", guest: false, dropped: false },
        { id: "b", name: "Ada", guest: true, dropped: false },
        { id: "c", name: "sam", guest: true, dropped: false },
      ],
      clock: { startedAt: 0, durationMs: 50 * 60_000 },
    })
    const setup = matchSetupFor(view, table({ playerIds: ["b", "a", "c"] }), 20 * 60_000)
    expect(setup.players.map((player) => player.name)).toEqual(["Ada", "Sam", "sam 3"])
    expect(setup).toMatchObject({
      startingLife: 40,
      system: "mtg",
      format: "commander",
      match: { bestOf: 1 },
      clock: { mode: "countdown", minutes: 30 },
    })
  })
})
