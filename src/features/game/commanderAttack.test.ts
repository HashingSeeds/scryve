import {
  attackView,
  IDLE_ATTACK,
  reduceAttack,
  stagedTargets,
  type AttackAction,
  type AttackBox,
  type AttackChange,
  type AttackState,
  type OthersChange,
} from "./commanderAttack"
import { asPlayerId, commanderDamageKey, MAX_COMMANDER_DAMAGE, PARTNER_COMMANDER } from "./domain"
import type { CommanderSlot, PlayerId } from "./types"

const ada = asPlayerId("ada")
const grace = asPlayerId("grace")
const katherine = asPlayerId("katherine")

/** why: plays the authority's part, so committed hits show up in the next action's recorded totals as they do on a real board. */
function attack({
  recorded = {},
  commanders = [{}],
  buffered = false,
  others = true,
}: {
  recorded?: Record<string, number>
  commanders?: { name?: string; power?: number }[]
  buffered?: boolean
  others?: boolean
} = {}) {
  const totals = { ...recorded }
  const key = (from: PlayerId, to: PlayerId, commander: CommanderSlot) =>
    commanderDamageKey(from, to, commander)
  const board = {
    recorded: (from: PlayerId, to: PlayerId, commander: CommanderSlot) =>
      totals[key(from, to, commander)] ?? 0,
    commanders,
    buffered,
    others,
  }
  let state: AttackState = IDLE_ATTACK
  const commits: (readonly AttackChange[])[] = []
  const lifeLosses: (readonly OthersChange[])[] = []
  return {
    run: (...actions: AttackAction[]) => {
      for (const action of actions) {
        const result = reduceAttack(state, action, board)
        state = result.state
        if (!result.commit) continue
        if (result.commit.others.length) lifeLosses.push(result.commit.others)
        if (!result.commit.changes.length) continue
        commits.push(result.commit.changes)
        for (const { toPlayerId, commander, delta } of result.commit.changes) {
          const at = key(result.commit.from, toPlayerId, commander)
          totals[at] = (totals[at] ?? 0) + delta
        }
      }
    },
    commits,
    lifeLosses,
    state: () => state,
    view: (to: PlayerId) => attackView(state, board, to),
  }
}

const hit = (to: PlayerId): AttackAction => ({ type: "hit", to })
const undo = (to: PlayerId): AttackAction => ({ type: "undo", to })
const press = (playerId: PlayerId): AttackAction => ({ type: "press", playerId })
const send: AttackAction = { type: "send" }
const sit = (box: AttackBox): AttackAction => ({ type: "sit", box })

describe("commander attack", () => {
  it("lands a fresh partner attack on the first commander, splits it once the partner is brought in, and leaves a partner at 0 out", () => {
    const board = attack({ commanders: [{ power: 2 }, { power: 4 }] })
    board.run(press(ada), hit(grace), sit(1), hit(grace))
    board.run({ type: "power", slot: 0, power: 0 }, hit(grace))

    expect(board.commits).toEqual([
      [{ toPlayerId: grace, delta: 2 }],
      [
        { toPlayerId: grace, delta: 2 },
        { toPlayerId: grace, commander: PARTNER_COMMANDER, delta: 4 },
      ],
      [{ toPlayerId: grace, commander: PARTNER_COMMANDER, delta: 4 }],
    ])
    expect(board.view(grace).commanders.map(({ total }) => total)).toEqual([4, 8])
  })

  it("undoes the last hit, then the current power, and stops at zero", () => {
    const board = attack({ recorded: { [commanderDamageKey(ada, grace)]: 2 } })
    board.run(press(ada), { type: "power", slot: 0, power: 3 })
    board.run(hit(grace), { type: "power", slot: 0, power: 2 }, undo(grace))
    expect(board.view(grace).commanders[0].total).toBe(2)

    board.run(undo(grace), undo(grace), undo(grace))
    expect(board.commits.map((changes) => changes[0].delta)).toEqual([3, -3, -2])
    expect(board.view(grace).takeBack).toBe(0)
  })

  it("counts what this attack's hits landed, apart from earlier damage, until the attack ends", () => {
    const board = attack({ recorded: { [commanderDamageKey(ada, grace)]: 4 } })
    board.run(press(ada), { type: "power", slot: 0, power: 3 }, hit(grace), hit(grace))
    expect(board.view(grace).commanders[0]).toMatchObject({ total: 10, landed: 6 })

    board.run(undo(grace))
    expect(board.view(grace).commanders[0]).toMatchObject({ total: 7, landed: 3 })

    board.run(send, press(ada))
    expect(board.view(grace).commanders[0]).toMatchObject({ total: 7, landed: 0 })
  })

  it("deals Others as life loss beside commander damage, takes it back on undo, and starts each attack at 1, sat out", () => {
    const board = attack()
    board.run(press(ada))
    expect(board.view(grace)).toMatchObject({ others: 1, othersSitting: true, dealt: 1 })
    board.run(sit("others"), { type: "others", power: 3 }, hit(grace), hit(grace), undo(grace))
    expect(board.commits.map((changes) => changes[0].delta)).toEqual([1, 1, -1])
    expect(board.lifeLosses).toEqual([
      [{ toPlayerId: grace, amount: 3 }],
      [{ toPlayerId: grace, amount: 3 }],
      [{ toPlayerId: grace, amount: -3 }],
    ])
    expect(board.view(grace)).toMatchObject({ othersLanded: 3, applied: 4 })

    board.run(press(ada), press(ada))
    expect(board.view(grace)).toMatchObject({ others: 1, othersSitting: true })
  })

  it("sits a box out of the attack by its name, keeps its power for when it comes back, and resets who sits out next attack", () => {
    const board = attack({ commanders: [{ power: 4 }] })
    board.run(press(ada), sit("others"), { type: "others", power: 2 }, sit(0), hit(grace))
    expect(board.commits).toEqual([])
    expect(board.lifeLosses).toEqual([[{ toPlayerId: grace, amount: 2 }]])

    board.run(sit(0), sit("others"), hit(grace))
    expect(board.commits).toEqual([[{ toPlayerId: grace, delta: 4 }]])
    expect(board.lifeLosses).toHaveLength(1)

    board.run(sit(0), hit(katherine))
    expect(board.view(katherine).dealt).toBe(0)
    board.run(press(ada), press(ada))
    expect(board.view(grace)).toMatchObject({ dealt: 4, othersSitting: true })
  })

  it("deals no Others where the game takes no life change on another seat, even when brought in", () => {
    const board = attack({ buffered: true, others: false })
    board.run(press(ada), sit("others"), { type: "others", power: 5 }, hit(grace), send)
    expect(board.view(grace)).toMatchObject({ othersShown: false, othersSitting: true })
    expect(board.lifeLosses).toEqual([])
    expect(board.commits).toEqual([[{ toPlayerId: grace, delta: 1 }]])
  })

  it("holds a connected attack's Others damage until Send, even with no commander damage", () => {
    const board = attack({ commanders: [{ power: 2 }, { power: 4 }], buffered: true })
    board.run(press(ada), { type: "power", slot: 0, power: 0 }, sit("others"))
    board.run({ type: "others", power: 5 })
    board.run(hit(grace), hit(katherine))
    expect(board.lifeLosses).toEqual([])
    expect(stagedTargets(board.state())).toBe(2)

    board.run(send)
    expect(board.commits).toEqual([])
    expect(board.lifeLosses).toEqual([
      [
        { toPlayerId: grace, amount: 5 },
        { toPlayerId: katherine, amount: 5 },
      ],
    ])
  })

  it("reports a hit as already on the defender's life only when it commits as it lands", () => {
    const local = attack()
    local.run(press(ada), hit(grace), hit(grace))
    expect(local.view(grace).applied).toBe(2)

    const connected = attack({ buffered: true })
    connected.run(press(ada), hit(grace), hit(grace))
    expect(connected.view(grace)).toMatchObject({ applied: 0, commanders: [{ landed: 2 }] })
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
    board.run(press(ada), sit(1))
    board.run(hit(grace), hit(katherine), undo(katherine))

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

  it("sends the staged attack before another seat arms", () => {
    const board = attack({ buffered: true })
    board.run(press(ada))
    expect(board.state()).toMatchObject({ armed: ada, acted: false })

    board.run(hit(grace))
    expect(board.state().acted).toBe(true)
    board.run(press(katherine))
    expect(board.commits).toEqual([[{ toPlayerId: grace, delta: 1 }]])
    expect(board.state()).toMatchObject({ armed: katherine, acted: false })
  })

  it("starts at the printed power, lets a partner reach 0 but a lone commander only 1, and keeps a typed power across attacks", () => {
    const board = attack({ commanders: [{ power: 3 }, { power: 5 }] })
    board.run(press(ada))
    expect(board.view(grace).commanders).toMatchObject([
      { power: 3, sitting: false },
      { power: 5, sitting: true },
    ])

    board.run({ type: "power", slot: 0, power: -2 }, { type: "power", slot: 1, power: 7.6 })
    board.run(send, press(ada))
    expect(board.view(grace).commanders).toEqual([
      { name: undefined, power: 0, sitting: false, total: 0, landed: 0 },
      { name: undefined, power: 7, sitting: true, total: 0, landed: 0 },
    ])

    const lone = attack({ commanders: [{}] })
    lone.run(press(ada))
    expect(lone.view(grace).commanders[0].power).toBe(1)
    lone.run({ type: "power", slot: 0, power: 0 }, { type: "power", slot: 0, power: 500 })
    expect(lone.view(grace).commanders[0].power).toBe(MAX_COMMANDER_DAMAGE)
  })
})
