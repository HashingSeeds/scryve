import {
  attackView,
  IDLE_ATTACK,
  reduceAttack,
  stagedTargets,
  type AttackAction,
  type AttackChange,
  type AttackState,
} from "./commanderAttack"
import { asPlayerId, commanderDamageKey, PARTNER_COMMANDER } from "./domain"
import type { CommanderSlot, PlayerId } from "./types"

const ada = asPlayerId("ada")
const grace = asPlayerId("grace")
const katherine = asPlayerId("katherine")

/** why: plays the authority's part, so committed hits show up in the next action's recorded totals as they do on a real board. */
function attack({
  recorded = {},
  commanders = [{}],
  buffered = false,
}: {
  recorded?: Record<string, number>
  commanders?: { name?: string; power?: number }[]
  buffered?: boolean
} = {}) {
  const totals = { ...recorded }
  const key = (from: PlayerId, to: PlayerId, commander: CommanderSlot) =>
    commanderDamageKey(from, to, commander)
  const board = {
    recorded: (from: PlayerId, to: PlayerId, commander: CommanderSlot) =>
      totals[key(from, to, commander)] ?? 0,
    commanders,
    buffered,
  }
  let state: AttackState = IDLE_ATTACK
  const commits: (readonly AttackChange[])[] = []
  return {
    run: (...actions: AttackAction[]) => {
      for (const action of actions) {
        const result = reduceAttack(state, action, board)
        state = result.state
        if (!result.commit) continue
        commits.push(result.commit.changes)
        for (const { toPlayerId, commander, delta } of result.commit.changes) {
          const at = key(result.commit.from, toPlayerId, commander)
          totals[at] = (totals[at] ?? 0) + delta
        }
      }
    },
    commits,
    state: () => state,
    view: (to: PlayerId) => attackView(state, board, to),
  }
}

const hit = (to: PlayerId): AttackAction => ({ type: "hit", to })
const undo = (to: PlayerId): AttackAction => ({ type: "undo", to })
const press = (playerId: PlayerId): AttackAction => ({ type: "press", playerId })
const send: AttackAction = { type: "send" }

describe("commander attack", () => {
  it("commits each partner's power to its own total on one hit, leaving a benched partner out", () => {
    const board = attack({ commanders: [{ power: 2 }, { power: 4 }] })
    board.run(press(ada), hit(grace), { type: "bench", slot: 0 }, hit(grace))

    expect(board.commits).toEqual([
      [
        { toPlayerId: grace, delta: 2 },
        { toPlayerId: grace, commander: PARTNER_COMMANDER, delta: 4 },
      ],
      [{ toPlayerId: grace, commander: PARTNER_COMMANDER, delta: 4 }],
    ])
    expect(board.view(grace).commanders.map(({ total }) => total)).toEqual([2, 8])
  })

  it("undoes the last hit, then the current power, and stops at zero", () => {
    const board = attack({ recorded: { [commanderDamageKey(ada, grace)]: 2 } })
    board.run(press(ada), { type: "power", slot: 0, step: 1 }, { type: "power", slot: 0, step: 1 })
    board.run(hit(grace), { type: "power", slot: 0, step: -1 }, undo(grace))
    expect(board.view(grace).commanders[0].total).toBe(2)

    board.run(undo(grace), undo(grace), undo(grace))
    expect(board.commits.map((changes) => changes[0].delta)).toEqual([3, -3, -2])
    expect(board.view(grace).takeBack).toBe(0)
  })

  it("never deals past the storage cap, whether it commits or stages", () => {
    const recorded = { [commanderDamageKey(ada, grace)]: 97 }
    const local = attack({ recorded, commanders: [{ power: 5 }] })
    local.run(press(ada), hit(grace), hit(grace))
    expect(local.commits).toEqual([[{ toPlayerId: grace, delta: 2 }]])

    const connected = attack({ recorded, buffered: true })
    connected.run(press(ada), hit(grace), hit(grace), hit(grace), hit(grace), hit(grace), send)
    expect(connected.commits).toEqual([[{ toPlayerId: grace, delta: 2 }]])
  })

  it("stages a connected attack on top of the recorded totals until it is sent", () => {
    const board = attack({
      recorded: { [commanderDamageKey(ada, grace, PARTNER_COMMANDER)]: 19 },
      commanders: [{ power: 2 }, { power: 4 }],
      buffered: true,
    })
    board.run(press(ada), hit(grace), hit(katherine), undo(katherine))

    expect(board.commits).toEqual([])
    expect(board.view(grace).commanders.map(({ total }) => total)).toEqual([2, 23])
    expect(stagedTargets(board.state())).toBe(1)

    board.run(send)
    expect(board.commits).toEqual([
      [
        { toPlayerId: grace, delta: 2 },
        { toPlayerId: grace, commander: PARTNER_COMMANDER, delta: 4 },
      ],
    ])
    expect(board.state()).toMatchObject({ armed: null, staged: [] })

    board.run(press(ada), send)
    expect(board.commits).toHaveLength(1)
  })

  it("sends the staged attack before another seat arms, and arming closes the inspected board", () => {
    const board = attack({ buffered: true })
    board.run({ type: "inspect", playerId: grace }, press(ada))
    expect(board.state()).toMatchObject({ armed: ada, inspected: null, acted: false })

    board.run(hit(grace))
    expect(board.state().acted).toBe(true)
    board.run(press(katherine))
    expect(board.commits).toEqual([[{ toPlayerId: grace, delta: 1 }]])
    expect(board.state()).toMatchObject({ armed: katherine, acted: false })
  })

  it("keeps a commander's power between 1 and the cap across attacks, and benches one partner at a time", () => {
    const board = attack({ commanders: [{ power: 1 }, { power: 3 }] })
    board.run(press(ada), { type: "power", slot: 0, step: -1 }, { type: "power", slot: 1, step: 1 })
    board.run({ type: "bench", slot: 0 }, { type: "bench", slot: 1 }, send, press(ada))

    expect(board.view(grace).commanders).toEqual([
      { name: undefined, power: 1, benched: false, total: 0 },
      { name: undefined, power: 4, benched: false, total: 0 },
    ])
    board.run({ type: "bench", slot: 0 }, { type: "bench", slot: 1 })
    expect(board.view(grace).commanders.map(({ benched }) => benched)).toEqual([true, false])
  })
})
