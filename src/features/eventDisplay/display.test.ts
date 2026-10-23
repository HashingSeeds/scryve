import {
  chunk,
  clockPhase,
  eventDisplayUrl,
  fitGrid,
  formatClock,
  standingsThroughRound,
} from "./display"

describe("eventDisplayUrl", () => {
  it("builds the display link from the site origin and a normalized code", () => {
    expect(eventDisplayUrl("https://Scryve.app/", " ab-c123 ")).toBe("https://scryve.app/e/ABC123")
  })

  it("refuses an insecure origin or a malformed code", () => {
    expect(eventDisplayUrl("http://scryve.app", "ABC123")).toBeNull()
    expect(eventDisplayUrl("https://scryve.app", "ABC12")).toBeNull()
  })
})

describe("formatClock", () => {
  it("rounds up so the last second shows until it ends", () => {
    expect(formatClock(50 * 60_000)).toBe("50:00")
    expect(formatClock(61_001)).toBe("1:02")
    expect(formatClock(500)).toBe("0:01")
    expect(formatClock(0)).toBe("0:00")
  })

  it("shows hours past an hour", () => {
    expect(formatClock(90 * 60_000)).toBe("1:30:00")
  })

  it("counts overtime as negative", () => {
    expect(formatClock(-500)).toBe("0:00")
    expect(formatClock(-1_000)).toBe("−0:01")
    expect(formatClock(-(3 * 60_000 + 12_000))).toBe("−3:12")
  })
})

describe("clockPhase", () => {
  const clock = { startedAt: 0, durationMs: 60_000 }

  it("calls time once the clock runs out, paused or not", () => {
    expect(clockPhase(clock, 1)).toBe("running")
    expect(clockPhase({ ...clock, pausedAt: 10 }, 1)).toBe("paused")
    expect(clockPhase(clock, 0)).toBe("time")
    expect(clockPhase({ ...clock, pausedAt: 10 }, -5)).toBe("time")
  })
})

describe("chunk", () => {
  it("splits into fixed-size runs with a short last one", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
    expect(chunk([], 3)).toEqual([])
  })
})

describe("fitGrid", () => {
  const tv = { width: 1880, height: 900, rowHeight: 50, minColumnWidth: 800 }

  it("uses one column when everything fits", () => {
    expect(fitGrid({ ...tv, count: 10 })).toEqual({ rows: 10, columns: 1, pages: 1 })
  })

  it("balances rows across the columns it needs", () => {
    expect(fitGrid({ ...tv, count: 32 })).toEqual({ rows: 16, columns: 2, pages: 1 })
  })

  it("pages when the columns are full", () => {
    expect(fitGrid({ ...tv, count: 64 })).toEqual({ rows: 18, columns: 2, pages: 2 })
  })

  it("keeps one row and column in a tiny or empty area", () => {
    expect(
      fitGrid({ count: 0, width: 10, height: 10, rowHeight: 50, minColumnWidth: 800 }),
    ).toEqual({ rows: 1, columns: 1, pages: 1 })
  })
})

describe("standingsThroughRound", () => {
  const done = { result: { kind: "bye" } }
  const open = { result: null }

  it("has no standings during registration", () => {
    expect(standingsThroughRound({ status: "registration", round: 0, tables: [] })).toBeNull()
  })

  it("counts the current round only once every table has a result", () => {
    expect(standingsThroughRound({ status: "active", round: 3, tables: [done, open] })).toBe(2)
    expect(standingsThroughRound({ status: "active", round: 3, tables: [done, done] })).toBe(3)
  })

  it("counts every round once the event finishes", () => {
    expect(standingsThroughRound({ status: "finished", round: 4, tables: [open] })).toBe(4)
  })
})
