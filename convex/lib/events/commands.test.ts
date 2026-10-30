import { changeClock, clockRemainingMs, reportResult, type EventTable } from "./commands"
import type { TableResult } from "./model"

const MINUTE = 60_000

describe("event clock", () => {
  const clock = { startedAt: 0, durationMs: 50 * MINUTE }

  it("stops counting while paused and resumes where it left off", () => {
    const paused = changeClock(clock, { kind: "pause" }, 10 * MINUTE)
    expect(clockRemainingMs(paused, 30 * MINUTE)).toBe(40 * MINUTE)
    const resumed = changeClock(paused, { kind: "resume" }, 30 * MINUTE)
    expect(resumed.pausedAt).toBeUndefined()
    expect(clockRemainingMs(resumed, 35 * MINUTE)).toBe(35 * MINUTE)
  })

  it("goes negative after time is called and adjusts by whole minutes", () => {
    expect(clockRemainingMs(clock, 52 * MINUTE)).toBe(-2 * MINUTE)
    const extended = changeClock(clock, { kind: "adjust", minutes: 5 }, 52 * MINUTE)
    expect(clockRemainingMs(extended, 52 * MINUTE)).toBe(3 * MINUTE)
    expect(() => changeClock(clock, { kind: "adjust", minutes: 0.5 }, 0)).toThrow()
  })
})

describe("reportResult", () => {
  const table: EventTable = { round: 2, table: 1, playerIds: ["a", "b"], status: "confirmed" }
  const win: TableResult = { kind: "match", gamesWon: [2, 0], gamesDrawn: 0 }

  it("refuses the organizer too once the event finishes, since a nearby event reaches Convex only then", () => {
    const finished = { status: "finished", round: 2, table } as const
    expect(() => reportResult(finished, { kind: "organizer" }, win)).toThrow(
      "This event has finished",
    )
    expect(() => reportResult(finished, { kind: "organizer" }, null)).toThrow(
      "This event has finished",
    )
  })
})
