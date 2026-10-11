import {
  armTool,
  clearSeat,
  diceSeatView,
  EMPTY_DICE,
  rerollTies,
  rollForSeat,
  rollOffAnnouncement,
  showFirst,
  startRollOff,
} from "./dice"
import { asPlayerId } from "./domain"

const [ada, grace, kat] = ["p1", "p2", "p3"].map(asPlayerId)
const players = [
  { id: ada, name: "Ada" },
  { id: grace, name: "Grace" },
  { id: kat, name: "Katherine" },
]

function d20s(...values: number[]) {
  const queue = values.map((value) => (value - 1) / 20)
  return () => queue.shift() ?? 0
}

describe("dice roll-off", () => {
  it("hands the highest roll the first turn", () => {
    const state = startRollOff([ada, grace, kat], d20s(7, 18, 3))
    expect(diceSeatView(state, grace)).toEqual({ kind: "rolloff", value: 18, status: "won" })
    expect(diceSeatView(state, ada)).toEqual({ kind: "rolloff", value: 7, status: "lost" })
    expect(rollOffAnnouncement(state.board, players)).toBe("Grace rolled 18, goes first")
  })

  it("re-rolls only the tied seats and leaves the rest out", () => {
    const tied = startRollOff([ada, grace, kat], d20s(18, 18, 3))
    expect(diceSeatView(tied, ada)).toEqual({ kind: "rolloff", value: 18, status: "tied" })
    expect(diceSeatView(tied, kat)).toEqual({ kind: "rolloff", value: 3, status: "out" })
    expect(rollOffAnnouncement(tied.board, players)).toBe("Tie at 18, Ada and Grace. Roll again")

    const settled = rerollTies(tied, d20s(2, 20))
    expect(diceSeatView(settled, ada)).toEqual({ kind: "rolloff", value: 2, status: "lost" })
    expect(diceSeatView(settled, grace)).toEqual({ kind: "rolloff", value: 20, status: "won" })
    expect(diceSeatView(settled, kat)).toEqual({ kind: "rolloff", value: 3, status: "lost" })
    expect(rerollTies(settled)).toBe(settled)
  })

  it("is cleared from any seat because it belongs to the table", () => {
    const state = startRollOff([ada, grace], d20s(4, 9))
    expect(clearSeat(state, grace).board).toBeNull()
  })
})

describe("dice per seat", () => {
  it("rolls for the tapped seat only while a tool is armed, then disarms", () => {
    expect(rollForSeat(EMPTY_DICE, ada)).toBeUndefined()
    const armed = armTool(EMPTY_DICE, "d20")
    const rolled = rollForSeat(armed, ada, d20s(17))
    expect(rolled?.roll).toEqual({ tool: "d20", value: 17 })
    expect(rolled?.state.armed).toBeNull()
    expect(diceSeatView(rolled!.state, ada)).toEqual({
      kind: "rolls",
      rolls: [{ tool: "d20", value: 17 }],
    })
    expect(diceSeatView(rolled!.state, grace)).toBeUndefined()
  })

  it("keeps the last three results, newest first, and clears one seat at a time", () => {
    let state = EMPTY_DICE
    for (const value of [1, 2, 3, 4]) {
      const rolled = rollForSeat(armTool(state, "d20"), ada, d20s(value))!
      state = rolled.state
    }
    const flipped = rollForSeat(armTool(state, "coin"), grace, () => 0.7)!
    expect(diceSeatView(flipped.state, ada)).toEqual({
      kind: "rolls",
      rolls: [
        { tool: "d20", value: 4 },
        { tool: "d20", value: 3 },
        { tool: "d20", value: 2 },
      ],
    })
    expect(flipped.roll).toEqual({ tool: "coin", value: "Tails" })

    const cleared = clearSeat(flipped.state, ada)
    expect(diceSeatView(cleared, ada)).toBeUndefined()
    expect(diceSeatView(cleared, grace)?.kind).toBe("rolls")
  })

  it("arming a tool drops a table result, and a table result drops seat rolls", () => {
    const rolled = rollForSeat(armTool(EMPTY_DICE, "d20"), ada, d20s(5))!.state
    expect(startRollOff([ada, grace], d20s(1, 2)).newestRollsBySeat).toEqual({})
    expect(showFirst(grace, true).newestRollsBySeat).toEqual({})
    expect(armTool(showFirst(grace, true), "coin").board).toBeNull()
    expect(armTool(rolled, "d20").armed).toBe("d20")
  })
})

describe("first pick", () => {
  it("shows the sweep on one seat and the settled pick on every seat", () => {
    const sweeping = showFirst(grace, false)
    expect(diceSeatView(sweeping, grace)).toEqual({ kind: "first", status: "sweep" })
    expect(diceSeatView(sweeping, ada)).toBeUndefined()

    const settled = showFirst(grace, true)
    expect(diceSeatView(settled, grace)).toEqual({ kind: "first", status: "won" })
    expect(diceSeatView(settled, ada)).toEqual({ kind: "first", status: "lost" })
  })
})
