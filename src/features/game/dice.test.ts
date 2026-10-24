import {
  armTool,
  claimFirst,
  clearFirst,
  clearResult,
  diceSeatChips,
  diceSeatView,
  EMPTY_DICE,
  firstPlayerSeat,
  offerChoice,
  pickFirst,
  rerollTies,
  rollForSeat,
  rollOffAnnouncement,
  settleFirst,
  settleResult,
  startFlip,
  startRollOff,
  systemDice,
} from "./dice"
import { asPlayerId } from "./domain"

const [ada, grace, kat] = ["p1", "p2", "p3"].map(asPlayerId)
const players = [
  { id: ada, name: "Ada" },
  { id: grace, name: "Grace" },
  { id: kat, name: "Katherine" },
]

const magic = systemDice("mtg")
const ygo = systemDice("ygo")

function d20s(...values: number[]) {
  const queue = values.map((value) => (value - 1) / 20)
  return () => queue.shift() ?? 0
}

describe("dice roll-off", () => {
  it("hands the highest roll the first turn, blooming on every seat and settling into one chip", () => {
    const state = startRollOff(EMPTY_DICE, [ada, grace, kat], magic, d20s(7, 18, 3))
    expect(diceSeatView(state, grace)).toEqual({
      kind: "rolloff",
      die: "d20",
      value: 18,
      attempt: 1,
      status: "won",
    })
    expect(diceSeatView(state, ada)).toMatchObject({ value: 7, status: "lost" })
    expect(rollOffAnnouncement(state.first, players)).toBe("Grace rolled 18, goes first")
    expect(firstPlayerSeat(state)).toBe(grace)

    const settled = settleFirst(state)
    expect(diceSeatView(settled, grace)).toBeUndefined()
    expect(diceSeatChips(settled, grace)).toEqual([{ kind: "first" }])
    expect(diceSeatChips(settled, ada)).toEqual([])
    expect(clearFirst(settled).first).toBeNull()
  })

  it("re-rolls only the tied seats and leaves the rest out", () => {
    const tied = startRollOff(EMPTY_DICE, [ada, grace, kat], magic, d20s(18, 18, 3))
    expect(diceSeatView(tied, ada)).toMatchObject({ value: 18, attempt: 1, status: "tied" })
    expect(diceSeatView(tied, kat)).toMatchObject({ value: 3, attempt: 1, status: "out" })
    expect(rollOffAnnouncement(tied.first, players)).toBe("Tie at 18, Ada and Grace. Rolling again")
    expect(settleFirst(tied)).toBe(tied)
    expect(firstPlayerSeat(tied)).toBeUndefined()

    const settled = rerollTies(tied, d20s(2, 20))
    expect(diceSeatView(settled, ada)).toMatchObject({ value: 2, attempt: 2, status: "lost" })
    expect(diceSeatView(settled, grace)).toMatchObject({ value: 20, attempt: 2, status: "won" })
    expect(diceSeatView(settled, kat)).toMatchObject({ value: 3, attempt: 1, status: "lost" })
    expect(rerollTies(settled)).toBe(settled)
  })

  it("rolls Yu-Gi-Oh!'s d6 for the roll-off and its tie rerolls", () => {
    expect(magic.die).toBe("d20")
    const top = () => 0.99
    const tied = startRollOff(EMPTY_DICE, [ada, grace], ygo, top)
    expect(diceSeatView(tied, ada)).toMatchObject({ die: "d6", value: 6, status: "tied" })
    expect(diceSeatView(rerollTies(tied, top), ada)).toMatchObject({ die: "d6", value: 6 })
  })

  it("lets the Yu-Gi-Oh! roll winner choose first or second instead of crowning them", () => {
    const rolls = [0.1, 0.9]
    const state = startRollOff(EMPTY_DICE, [ada, grace], ygo, () => rolls.shift() ?? 0)
    expect(diceSeatView(state, grace)).toMatchObject({ value: 6, status: "chooses" })
    expect(diceSeatView(state, ada)).toMatchObject({ value: 1, status: "lost" })
    expect(rollOffAnnouncement(state.first, players)).toBe("Grace rolled 6. Go first or second")
    expect(firstPlayerSeat(state)).toBeUndefined()

    const asked = settleFirst(state)
    expect(diceSeatView(asked, grace)).toEqual({ kind: "choice", reason: "roll" })
    expect(diceSeatView(asked, ada)).toEqual({ kind: "waiting" })
  })
})

describe("first-player choice", () => {
  it("flips a coin over every seat, then asks the winner on its own card and crowns the pick", () => {
    const flipping = startFlip(EMPTY_DICE, [ada, grace], () => 0.9)
    expect(diceSeatView(flipping, ada)).toEqual({ kind: "flip" })
    expect(firstPlayerSeat(flipping)).toBeUndefined()
    const asked = settleFirst(flipping)
    expect(asked).toEqual(offerChoice(EMPTY_DICE, grace, "flip"))
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

  it("lands a claimed seat straight in its chip, replacing any open choice", () => {
    const claimed = claimFirst(offerChoice(EMPTY_DICE, grace, "flip"), ada)
    expect(diceSeatView(claimed, ada)).toBeUndefined()
    expect(diceSeatView(claimed, grace)).toBeUndefined()
    expect(diceSeatChips(claimed, ada)).toEqual([{ kind: "first" }])
    expect(firstPlayerSeat(claimed)).toBe(ada)
  })
})

describe("dice per seat", () => {
  it("rolls once for the tapped seat, then puts the tool away", () => {
    expect(rollForSeat(EMPTY_DICE, ada)).toBeUndefined()
    const armed = armTool(EMPTY_DICE, "d20")
    const rolled = rollForSeat(armed, ada, d20s(17))!
    expect(rolled.roll).toEqual({ tool: "d20", value: 17 })
    expect(rolled.state.armed).toBeNull()
    expect(diceSeatView(rolled.state, ada)).toEqual({ kind: "roll", roll: rolled.roll, attempt: 1 })
    expect(diceSeatView(rolled.state, grace)).toBeUndefined()
    expect(rollForSeat(rolled.state, grace)).toBeUndefined()
  })

  it("settles a bloom into a chip that the next roll replaces and a tap clears", () => {
    const rolled = rollForSeat(armTool(EMPTY_DICE, "coin"), grace, () => 0.7)!.state
    const chipped = settleResult(rolled, grace)
    expect(diceSeatView(chipped, grace)).toBeUndefined()
    expect(diceSeatChips(chipped, grace)).toEqual([
      { kind: "roll", roll: { tool: "coin", value: "Tails" } },
    ])
    expect(settleResult(chipped, grace)).toBe(chipped)

    const again = rollForSeat(armTool(chipped, "coin"), grace, () => 0.1)!.state
    expect(diceSeatView(again, grace)).toEqual({
      kind: "roll",
      roll: { tool: "coin", value: "Heads" },
      attempt: 2,
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
