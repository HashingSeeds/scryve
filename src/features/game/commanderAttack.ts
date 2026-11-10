import { clampedCommanderDelta, COMMANDER_SLOTS, MAX_COMMANDER_DAMAGE } from "./domain"
import type { CommanderSlot, PlayerId } from "./types"

export type AttackChange = { toPlayerId: PlayerId; commander?: CommanderSlot; delta: number }

type Hit = readonly number[]

export type AttackState = {
  armed: PlayerId | null
  /** why: keyed by attacker and slot, and kept across attacks, so a commander's pumped power is still set the next time it attacks. */
  powers: Partial<Record<`${PlayerId}:${number}`, number>>
  acted: boolean
  /** why: each defender's hits this attack, newest last, so undo takes back exactly the last hit rather than the current power. */
  hits: Partial<Record<PlayerId, readonly Hit[]>>
  staged: readonly AttackChange[]
  /** why: commander slots sat out of this attack by tapping their names. They keep their number, so tapping again brings them back at the same power. */
  sitting: readonly number[]
}

export type AttackAction =
  | { type: "press"; playerId: PlayerId }
  | { type: "send" }
  | { type: "power"; slot: number; power: number }
  | { type: "sit"; slot: number }
  | { type: "hit"; to: PlayerId }
  | { type: "undo"; to: PlayerId }

export type AttackBoard = {
  recorded: (from: PlayerId, to: PlayerId, commander: CommanderSlot) => number
  commanders: readonly { name?: string; power?: number }[]
  /** why: only connected games buffer, since assignment and confirmation live on separate devices; local play commits each step as pressed. */
  buffered: boolean
}

export type AttackCommit = {
  from: PlayerId
  changes: readonly AttackChange[]
}

export const IDLE_ATTACK: AttackState = {
  armed: null,
  powers: {},
  acted: false,
  hits: {},
  staged: [],
  // why: a second partner starts each attack sat out, so a fresh hit lands on one commander; tapping its name brings it in at its printed power.
  sitting: [1],
}

/** why: a partner sits a hit out at 0, so one commander can carry the whole hit. A lone commander always hits for at least 1. */
export const lowestPower = (partners: boolean) => (partners ? 0 : 1)

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0)

const sameSeat = (to: PlayerId, commander: CommanderSlot) => (change: AttackChange) =>
  change.toPlayerId === to && change.commander === commander

const heldIn = (staged: readonly AttackChange[], to: PlayerId, commander: CommanderSlot) =>
  staged.find(sameSeat(to, commander))?.delta ?? 0

function restage(
  staged: readonly AttackChange[],
  to: PlayerId,
  commander: CommanderSlot,
  delta: number,
): readonly AttackChange[] {
  const change = { toPlayerId: to, ...(commander ? { commander } : {}), delta }
  if (!staged.some(sameSeat(to, commander))) return delta ? [...staged, change] : staged
  return delta
    ? staged.map((held) => (sameSeat(to, commander)(held) ? change : held))
    : staged.filter((held) => !sameSeat(to, commander)(held))
}

export function attackView(state: AttackState, board: AttackBoard, to: PlayerId) {
  const { armed } = state
  const hits = state.hits[to] ?? []
  const commanders = board.commanders.map(({ name, power }, slot) => {
    const commander = COMMANDER_SLOTS[slot]
    const total = armed
      ? board.recorded(armed, to, commander) + heldIn(state.staged, to, commander)
      : 0
    return {
      name,
      power: (armed ? state.powers[`${armed}:${slot}`] : undefined) ?? power ?? 1,
      sitting: state.sitting.includes(slot),
      total,
      // why: this attack's share of the total, shown apart on the defender's ring until the attack ends.
      landed: Math.min(total, sum(hits.map((steps) => steps[slot] ?? 0))),
    }
  })
  const steps = commanders.map(({ power, total, sitting }) =>
    sitting ? 0 : Math.max(0, Math.min(power, MAX_COMMANDER_DAMAGE - total)),
  )
  const lastSteps = hits.at(-1) ?? commanders.map(({ power }) => power)
  const takeBacks = commanders.map(({ total }, slot) => Math.min(lastSteps[slot] ?? 0, total))
  // why: a local hit lowers the defender's life as it lands; a buffered one waits for Send, so none of it is applied yet.
  const applied = board.buffered ? 0 : sum(commanders.map(({ landed }) => landed))
  return {
    commanders,
    steps,
    dealt: sum(steps),
    takeBacks,
    takeBack: sum(takeBacks),
    applied,
  }
}

export function stagedTargets(state: AttackState) {
  return new Set(state.staged.map(({ toPlayerId }) => toPlayerId)).size
}

type AttackResult = { state: AttackState; commit?: AttackCommit }

export function reduceAttack(
  state: AttackState,
  action: AttackAction,
  board: AttackBoard,
): AttackResult {
  const { armed } = state
  switch (action.type) {
    case "press": {
      const finished = finish(state)
      return armed === action.playerId
        ? finished
        : { ...finished, state: { ...finished.state, armed: action.playerId } }
    }
    case "send":
      return finish(state)
    case "power": {
      if (!armed || !Number.isFinite(action.power)) return { state }
      const key = `${armed}:${action.slot}` as const
      const lowest = lowestPower(board.commanders.length > 1)
      const power = Math.min(MAX_COMMANDER_DAMAGE, Math.max(lowest, Math.trunc(action.power)))
      return { state: { ...state, powers: { ...state.powers, [key]: power } } }
    }
    case "sit": {
      if (!armed) return { state }
      const { slot } = action
      const sitting = state.sitting.includes(slot)
        ? state.sitting.filter((held) => held !== slot)
        : [...state.sitting, slot]
      return { state: { ...state, sitting } }
    }
    case "hit": {
      const view = attackView(state, board, action.to)
      if (!armed || armed === action.to || view.dealt <= 0) return { state }
      const hits = [...(state.hits[action.to] ?? []), view.steps]
      return land(
        { ...state, hits: { ...state.hits, [action.to]: hits } },
        board,
        armed,
        action.to,
        view.steps,
      )
    }
    case "undo": {
      const view = attackView(state, board, action.to)
      if (!armed || armed === action.to || view.takeBack <= 0) return { state }
      const hits = (state.hits[action.to] ?? []).slice(0, -1)
      return land(
        { ...state, hits: { ...state.hits, [action.to]: hits } },
        board,
        armed,
        action.to,
        view.takeBacks.map((amount) => -amount),
      )
    }
  }
}

function finish(state: AttackState): AttackResult {
  if (!state.armed) return { state }
  const commit = state.staged.length ? { from: state.armed, changes: state.staged } : undefined
  return {
    state: {
      ...state,
      armed: null,
      acted: false,
      hits: {},
      staged: [],
      sitting: IDLE_ATTACK.sitting,
    },
    commit,
  }
}

/** why: every change is clamped against the total the defender shows, recorded plus staged, so a buffered attack can never send more than the storage cap allows. */
function land(
  state: AttackState,
  board: AttackBoard,
  from: PlayerId,
  to: PlayerId,
  deltas: readonly number[],
): AttackResult {
  let next = state.staged
  const changes: AttackChange[] = []
  deltas.forEach((delta, slot) => {
    const commander = COMMANDER_SLOTS[slot]
    const held = heldIn(next, to, commander)
    const step = clampedCommanderDelta(board.recorded(from, to, commander) + held, delta)
    if (!step) return
    if (board.buffered) next = restage(next, to, commander, held + step)
    else changes.push({ toPlayerId: to, ...(commander ? { commander } : {}), delta: step })
  })
  if (!changes.length && next === state.staged) return { state }
  return {
    state: { ...state, staged: next, acted: true },
    commit: changes.length ? { from, changes } : undefined,
  }
}
