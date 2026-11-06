import { clampedCommanderDelta, COMMANDER_SLOTS, MAX_COMMANDER_DAMAGE } from "./domain"
import type { CommanderSlot, PlayerId } from "./types"

export type AttackChange = { toPlayerId: PlayerId; commander?: CommanderSlot; delta: number }

export type AttackState = {
  armed: PlayerId | null
  /** why: keyed by attacker and slot, and kept across attacks, so a commander's pumped power is still set the next time it attacks. */
  powers: Partial<Record<`${PlayerId}:${number}`, number>>
  acted: boolean
  /** why: each defender's hits this attack, newest last, so undo takes back exactly the last hit rather than the current power. */
  hits: Partial<Record<PlayerId, readonly (readonly number[])[]>>
  staged: readonly AttackChange[]
}

export type AttackAction =
  | { type: "press"; playerId: PlayerId }
  | { type: "send" }
  | { type: "power"; slot: number; power: number }
  | { type: "hit"; to: PlayerId }
  | { type: "undo"; to: PlayerId }

export type AttackBoard = {
  recorded: (from: PlayerId, to: PlayerId, commander: CommanderSlot) => number
  commanders: readonly { name?: string; power?: number }[]
  /** why: only a connected game buffers, since assignment and confirmation live on separate devices there. Local play has nobody to confirm to, so each step commits as it is pressed and there is nothing to stage or send. */
  buffered: boolean
}

export type AttackCommit = { from: PlayerId; changes: readonly AttackChange[] }

export const IDLE_ATTACK: AttackState = {
  armed: null,
  powers: {},
  acted: false,
  hits: {},
  staged: [],
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
    // why: the second partner starts at 0, so a fresh attack lands on one commander until the player raises the other.
    const starting = slot > 0 ? 0 : (power ?? 1)
    const total = armed
      ? board.recorded(armed, to, commander) + heldIn(state.staged, to, commander)
      : 0
    return {
      name,
      power: (armed ? state.powers[`${armed}:${slot}`] : undefined) ?? starting,
      total,
      // why: the part of the total this attack's hits dealt, which the defender's ring shows apart until the attack ends.
      landed: Math.min(total, sum(hits.map((hit) => hit[slot] ?? 0))),
    }
  })
  const steps = commanders.map(({ power, total }) =>
    Math.max(0, Math.min(power, MAX_COMMANDER_DAMAGE - total)),
  )
  const lastHit = hits.at(-1) ?? commanders.map(({ power }) => power)
  const takeBacks = commanders.map(({ total }, slot) => Math.min(lastHit[slot] ?? 0, total))
  // why: a local hit lowers the defender's life as it lands; a buffered one waits for Send, so none of it is on their life yet.
  const applied = board.buffered ? 0 : sum(commanders.map(({ landed }) => landed))
  return { commanders, steps, dealt: sum(steps), takeBacks, takeBack: sum(takeBacks), applied }
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
    case "hit": {
      const view = attackView(state, board, action.to)
      if (!armed || armed === action.to || view.dealt <= 0) return { state }
      const hits = [...(state.hits[action.to] ?? []), view.steps]
      return land({ ...state, hits: { ...state.hits, [action.to]: hits } }, board, armed, {
        to: action.to,
        deltas: view.steps,
      })
    }
    case "undo": {
      const view = attackView(state, board, action.to)
      if (!armed || armed === action.to || view.takeBack <= 0) return { state }
      const hits = (state.hits[action.to] ?? []).slice(0, -1)
      return land({ ...state, hits: { ...state.hits, [action.to]: hits } }, board, armed, {
        to: action.to,
        deltas: view.takeBacks.map((amount) => -amount),
      })
    }
  }
}

function finish(state: AttackState): AttackResult {
  if (!state.armed) return { state }
  const commit =
    state.armed && state.staged.length ? { from: state.armed, changes: state.staged } : undefined
  return {
    state: {
      ...state,
      armed: null,
      acted: false,
      hits: {},
      staged: [],
    },
    commit,
  }
}

/** why: every change is clamped against the total the defender shows, recorded plus staged, so a buffered attack can never send more than the storage cap allows. */
function land(
  state: AttackState,
  board: AttackBoard,
  from: PlayerId,
  { to, deltas }: { to: PlayerId; deltas: readonly number[] },
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
