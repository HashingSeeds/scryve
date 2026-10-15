import {
  addRoundBonusTurns,
  adjustRoundClock,
  callRoundTime,
  isRoundClockSetup,
  pauseRoundClock,
  resumeRoundClock,
  roundClockText,
  roundClockView,
  startRoundClock,
  stepRoundTurn,
} from "./roundClock"

const MINUTE = 60_000
const fifty = startRoundClock({ mode: "countdown", minutes: 50 }, 0)

describe("round clock", () => {
  it("counts down from the minutes left and calls time at zero", () => {
    expect(roundClockText(roundClockView(fifty, "mtg", 12 * MINUTE + 48_500))).toBe("37:12")
    expect(roundClockView(fifty, "mtg", 50 * MINUTE)).toEqual({ kind: "time", turn: 0, turns: 5 })
  })

  it("holds its time while paused", () => {
    const paused = pauseRoundClock(fifty, 10 * MINUTE)
    expect(roundClockView(paused, "mtg", 40 * MINUTE)).toEqual({
      kind: "remaining",
      ms: 40 * MINUTE,
    })
    const resumed = resumeRoundClock(paused, 40 * MINUTE)
    expect(roundClockView(resumed, "mtg", 41 * MINUTE)).toEqual({
      kind: "remaining",
      ms: 39 * MINUTE,
    })
  })

  it("walks the end-of-round turns, including a judge's bonus turns", () => {
    let clock = callRoundTime(adjustRoundClock(fifty, MINUTE), 20 * MINUTE)
    expect(roundClockText(roundClockView(clock, "mtg", 20 * MINUTE))).toBe("Finish turn")
    clock = stepRoundTurn(stepRoundTurn(clock, "mtg", 1), "mtg", 1)
    expect(roundClockText(roundClockView(clock, "mtg", 21 * MINUTE))).toBe("Turn 2 of 5")
    clock = addRoundBonusTurns(clock, 2)
    expect(roundClockText(roundClockView(clock, "mtg", 21 * MINUTE))).toBe("Turn 2 of 7")
    for (let step = 0; step < 10; step++) clock = stepRoundTurn(clock, "mtg", 1)
    expect(roundClockText(roundClockView(clock, "mtg", 22 * MINUTE))).toBe("Turns done")
  })

  it("caps Pokémon's three turns with 15 minutes of overtime", () => {
    const clock = stepRoundTurn(
      startRoundClock({ mode: "countdown", minutes: 30 }, 0),
      "pokemon",
      1,
    )
    expect(roundClockText(roundClockView(clock, "pokemon", 32 * MINUTE))).toBe(
      "Turn 1 of 3 · 13:00",
    )
  })

  it("ends a Yu-Gi-Oh! match at time with no extra turns", () => {
    expect(roundClockText(roundClockView(fifty, "ygo", 51 * MINUTE))).toBe("")
  })

  it("rejects malformed setups from a prepared game", () => {
    expect(isRoundClockSetup({ mode: "stopwatch" })).toBe(true)
    expect(isRoundClockSetup({ mode: "countdown", minutes: 0 })).toBe(false)
    expect(isRoundClockSetup({ mode: "countdown", minutes: "50" })).toBe(false)
  })
})
