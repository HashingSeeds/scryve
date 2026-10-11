import {
  armTool,
  clearFirst,
  clearResult,
  diceSeatChips,
  diceSeatView,
  EMPTY_DICE,
  firstPlayerSeat,
  flipForFirst,
  offerChoice,
  pickFirst,
  rerollTies,
  rollForSeat,
  rollOffAnnouncement,
  settleFirst,
  settleResult,
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
  it("hands the highest roll the first turn, blooming on every seat and settling into one chip", () => {
    const state = startRollOff(EMPTY_DICE, [ada, grace, kat], d20s(7, 18, 3))
    expect(diceSeatView(state, grace)).toEqual({ kind: "rolloff", value: 18, status: "won" })
    expect(diceSeatView(state, ada)).toEqual({ kind: "rolloff", value: 7, status: "lost" })
    expect(rollOffAnnouncement(state.first, players)).toBe("Grace rolled 18, goes first")
    expect(firstPlayerSeat(state)).toBe(grace)

    const settled = settleFirst(state)
    expect(diceSeatView(settled, grace)).toBeUndefined()
    expect(diceSeatChips(settled, grace)).toEqual([{ kind: "first" }])
    expect(diceSeatChips(settled, ada)).toEqual([])
    expect(clearFirst(settled).first).toBeNull()
  })

  it("re-rolls only the tied seats and leaves the rest out", () => {
    const tied = startRollOff(EMPTY_DICE, [ada, grace, kat], d20s(18, 18, 3))
    expect(diceSeatView(tied, ada)).toEqual({ kind: "rolloff", value: 18, status: "tied" })
    expect(diceSeatView(tied, kat)).toEqual({ kind: "rolloff", value: 3, status: "out" })
    expect(rollOffAnnouncement(tied.first, players)).toBe("Tie at 18, Ada and Grace. Roll again")
    expect(settleFirst(tied)).toBe(tied)
    expect(firstPlayerSeat(tied)).toBeUndefined()

    const settled = rerollTies(tied, d20s(2, 20))
    expect(diceSeatView(settled, ada)).toEqual({ kind: "rolloff", value: 2, status: "lost" })
    expect(diceSeatView(settled, grace)).toEqual({ kind: "rolloff", value: 20, status: "won" })
    expect(diceSeatView(settled, kat)).toEqual({ kind: "rolloff", value: 3, status: "lost" })
    expect(rerollTies(settled)).toBe(settled)
  })
})

describe("first-player choice", () => {
  it("flips to one seat, asks it on its own card, and crowns the pick", () => {
    expect(flipForFirst([ada, grace], () => 0.9)).toBe(grace)
    const asked = offerChoice(EMPTY_DICE, grace, "flip")
    expect(diceSeatView(asked, grace)).toEqual({ kind: "choice", reason: "flip" })
    expect(diceSeatView(asked, ada)).toEqual({ kind: "waiting" })
    expect(settleFirst(asked)).toBe(asked)

    const picked = pickFirst(asked, ada, "Grace chose second")
    expect(diceSeatView(picked, ada)).toEqual({
      kind: "first",
      status: "won",
      note: "Grace chose second",
    })
    expect(diceSeatView(picked, grace)).toEqual({ kind: "first", status: "lost" })
    expect(diceSeatChips(settleFirst(picked), ada)).toEqual([{ kind: "first" }])
  })
})

describe("dice per seat", () => {
  it("rolls for the tapped seat while a tool is armed and keeps the tool armed", () => {
    expect(rollForSeat(EMPTY_DICE, ada)).toBeUndefined()
    const armed = armTool(EMPTY_DICE, "d20")
    const rolled = rollForSeat(armed, ada, d20s(17))!
    expect(rolled.roll).toEqual({ tool: "d20", value: 17 })
    expect(rolled.state.armed).toBe("d20")
    expect(diceSeatView(rolled.state, ada)).toEqual({ kind: "roll", roll: rolled.roll })
    expect(diceSeatView(rolled.state, grace)).toBeUndefined()
    expect(armTool(rolled.state, "d20").armed).toBeNull()
  })

  it("settles a bloom into a chip that the next roll replaces and a tap clears", () => {
    const rolled = rollForSeat(armTool(EMPTY_DICE, "coin"), grace, () => 0.7)!.state
    const chipped = settleResult(rolled, grace)
    expect(diceSeatView(chipped, grace)).toBeUndefined()
    expect(diceSeatChips(chipped, grace)).toEqual([
      { kind: "roll", roll: { tool: "coin", value: "Tails" } },
    ])
    expect(settleResult(chipped, grace)).toBe(chipped)

    const again = rollForSeat(chipped, grace, () => 0.1)!.state
    expect(diceSeatView(again, grace)).toEqual({
      kind: "roll",
      roll: { tool: "coin", value: "Heads" },
    })
    expect(diceSeatChips(again, grace)).toEqual([])
    expect(diceSeatChips(clearResult(chipped, grace), grace)).toEqual([])
  })

  it("keeps a seat's roll chip beside its first-player chip", () => {
    const first = settleFirst(pickFirst(EMPTY_DICE, ada))
    const rolled = settleResult(rollForSeat(armTool(first, "d20"), ada, d20s(9))!.state, ada)
    expect(diceSeatChips(rolled, ada)).toEqual([
      { kind: "first" },
      { kind: "roll", roll: { tool: "d20", value: 9 } },
    ])
  })
})
