import { PLANAR_DECKS, SCHEME_DECKS } from "./modeDecks"
import {
  applyModeAction,
  faceUpPlane,
  rollCost,
  schemeCards,
  startModes,
  type ModeAction,
  type TableModes,
} from "./tableModes"
import type { Turn, TurnGroups } from "./turns"

const turn = (playerId: string, number: number): Turn => ({
  playerId,
  number,
  startedAt: 0,
  operationId: `turn-${number}`,
})
const inOrder = () => 0
const groups: TurnGroups = [["ada", "bo"], ["cy"]]

function play(modes: TableModes | null, steps: [ModeAction, Turn | undefined][]) {
  return steps.reduce<TableModes | null>(
    (current, [action, at]) =>
      current && applyModeAction(current, action, { turn: at, groups, now: 1 }),
    modes,
  )
}

const deckWithPhenomenon = PLANAR_DECKS.find((deck) =>
  deck.cards.some((card) => card.kind === "phenomenon"),
)!

describe("Planechase", () => {
  const { modes } = startModes({ planechase: { decks: [deckWithPhenomenon.id] } }, ["ada", "cy"])

  it("starts on a plane, never a phenomenon", () => {
    for (const seed of [0, 0.3, 0.7, 0.99])
      expect(
        faceUpPlane(
          startModes({ planechase: { decks: [deckWithPhenomenon.id] } }, ["ada"], () => seed).modes
            ?.planechase,
        )?.kind,
      ).toBe("plane")
  })

  it("charges one more for each roll this turn, and a pass resets it", () => {
    const blank = { kind: "planar.rolled", playerId: "ada", face: "blank" } as const
    const rolled = play(modes!, [
      [blank, turn("ada", 1)],
      [blank, turn("ada", 1)],
      [blank, turn("ada", 1)],
    ])!
    expect(rolled.log?.map((entry) => entry.cost)).toEqual([0, 1, 2])
    expect(rollCost(rolled.planechase!, turn("ada", 1), "ada")).toBe(3)
    expect(rollCost(rolled.planechase!, turn("cy", 2), "cy")).toBe(0)
    expect(play(rolled, [[blank, turn("ada", 3)]])!.log?.at(-1)?.cost).toBe(0)
  })

  it("lets only the active team roll, each teammate with their own cost", () => {
    const at = turn("ada", 1)
    expect(play(modes!, [[{ kind: "planar.rolled", playerId: "cy", face: "blank" }, at]])).toBe(
      null,
    )
    const team = play(modes!, [
      [{ kind: "planar.rolled", playerId: "ada", face: "blank" }, at],
      [{ kind: "planar.rolled", playerId: "bo", face: "blank" }, at],
    ])!
    expect(team.log?.map((entry) => entry.cost)).toEqual([0, 0])
  })

  it("resets by hand when turns are off", () => {
    const blank = { kind: "planar.rolled", playerId: "cy", face: "blank" } as const
    const reset = play(modes!, [
      [blank, undefined],
      [blank, undefined],
      [{ kind: "planar.reset", playerId: "ada" }, undefined],
    ])!
    expect(rollCost(reset.planechase!, undefined, "cy")).toBe(0)
  })

  it("planeswalks on the Planeswalker face, and chaos leaves the plane in place", () => {
    const at = turn("ada", 1)
    const before = faceUpPlane(modes!.planechase)
    const chaos = play(modes!, [[{ kind: "planar.rolled", playerId: "ada", face: "chaos" }, at]])!
    expect(faceUpPlane(chaos.planechase)).toBe(before)
    const walked = play(chaos, [
      [{ kind: "planar.rolled", playerId: "ada", face: "planeswalk" }, at],
    ])!
    expect(walked.planechase!.order!.at(-1)).toBe(modes!.planechase!.order![0])
    expect(walked.log?.map((entry) => entry.kind)).toEqual(["rolled", "rolled", "walked"])
  })

  it("holds rolls on a phenomenon until it resolves with a planeswalk", () => {
    const at = turn("ada", 1)
    const phenomenon = deckWithPhenomenon.cards.findIndex((card) => card.kind === "phenomenon")
    const rest = deckWithPhenomenon.cards.map((_, index) => index).filter((i) => i !== phenomenon)
    const onPhenomenon: TableModes = {
      planechase: { decks: [deckWithPhenomenon.id], order: [phenomenon, ...rest], rolls: {} },
    }
    const roll = { kind: "planar.rolled", playerId: "ada", face: "blank" } as const
    expect(play(onPhenomenon, [[roll, at]])).toBe(null)
    const resolved = play(onPhenomenon, [[{ kind: "planar.walked", playerId: "ada" }, at]])!
    expect(resolved.planechase!.order).toEqual([...rest, phenomenon])
    expect(play(resolved, [[roll, at]])).not.toBe(null)
  })
})

describe("Archenemy", () => {
  const deck = SCHEME_DECKS.find((candidate) =>
    candidate.cards.some((card) => card.kind === "ongoing"),
  )!
  const cards = schemeCards(deck.id)
  const ongoing = cards.findIndex((card) => card.kind === "ongoing")
  const plain = cards.findIndex((card) => card.kind === "scheme")
  const others = cards.map((_, index) => index).filter((i) => i !== ongoing && i !== plain)
  const start: TableModes = {
    archenemy: { playerId: "ada", deck: deck.id, order: [plain, ongoing, ...others] },
  }
  const reveal = { kind: "scheme.revealed", playerId: "ada" } as const

  it("puts the archenemy alone against one team, first, at 40", () => {
    const started = startModes({ archenemy: { seat: 2 } }, ["ada", "bo", "cy", "di"])
    expect(started.archenemyId).toBe("bo")
    expect(started.turnGroups).toEqual([["bo"], ["ada", "cy", "di"]])
  })

  it("sends a plain scheme to the bottom and keeps an ongoing one face up", () => {
    const first = play(start, [[reveal, turn("ada", 1)]])!.archenemy!
    expect(first.order).toEqual([ongoing, ...others, plain])
    expect(first.shown).toBe(plain)
    expect(first.revealedTurn).toBe(1)
    const second = play(start, [
      [reveal, turn("ada", 1)],
      [reveal, turn("ada", 3)],
    ])!.archenemy!
    expect(second.ongoing).toEqual([ongoing])
    expect(second.order).toEqual([...others, plain])
    expect(second.shown).toBeUndefined()
  })

  it("abandons an ongoing scheme to the bottom, and only the archenemy acts", () => {
    const set = play(start, [
      [reveal, undefined],
      [reveal, undefined],
    ])!
    expect(play(set, [[{ kind: "scheme.revealed", playerId: "bo" }, undefined]])).toBe(null)
    const abandoned = play(set, [
      [{ kind: "scheme.abandoned", playerId: "ada", card: ongoing }, undefined],
    ])!.archenemy!
    expect(abandoned.ongoing).toEqual([])
    expect(abandoned.order?.at(-1)).toBe(ongoing)
    expect(
      play(set, [[{ kind: "scheme.abandoned", playerId: "ada", card: plain }, undefined]]),
    ).toBe(null)
  })

  it("logs a scheme set in motion from the archenemy's own cards", () => {
    const own = startModes({ archenemy: { seat: 1 } }, ["ada", "bo", "cy"], inOrder).modes!
    const revealed = play(own, [[reveal, turn("ada", 1)]])!
    expect(revealed.log).toEqual([{ kind: "revealed", playerId: "ada", at: 1 }])
    expect(revealed.archenemy?.revealedTurn).toBe(1)
  })
})
