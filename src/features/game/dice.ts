import type { GamePlayer, PlayerId } from "./types"

export type Die = "d6" | "d20"
export type DiceTool = Die | "coin"
export type CoinFace = "Heads" | "Tails"
export type DiceRoll = { tool: Die; value: number } | { tool: "coin"; value: CoinFace }

export type DicePhase = "bloom" | "chip"

export type SeatResult = { roll: DiceRoll; phase: DicePhase; attempt: number }

export type ChoiceReason = "flip" | "loss"

export type FirstPlayer =
  | {
      kind: "rolloff"
      die: Die
      rolls: Partial<Record<PlayerId, number>>
      attempts: Partial<Record<PlayerId, number>>
      pool: PlayerId[]
      phase: DicePhase
    }
  | { kind: "choice"; seatId: PlayerId; reason: ChoiceReason }
  | { kind: "picked"; seatId: PlayerId; phase: DicePhase; note?: string }

export interface DiceState {
  armed: DiceTool | null
  results: Partial<Record<PlayerId, SeatResult>>
  first: FirstPlayer | null
}

export type DiceSeatView =
  | { kind: "roll"; roll: DiceRoll; attempt: number }
  | {
      kind: "rolloff"
      die: Die
      value: number
      attempt: number
      status: "won" | "tied" | "out" | "lost"
    }
  | { kind: "choice"; reason: ChoiceReason }
  | { kind: "waiting" }
  | { kind: "first"; status: "won" | "lost"; note?: string }

export type DiceSeatChip = { kind: "roll"; roll: DiceRoll } | { kind: "first" }

export const EMPTY_DICE: DiceState = { armed: null, results: {}, first: null }
export const DIE_SIDES: Record<Die, number> = { d6: 6, d20: 20 }
const COIN_FACES: readonly CoinFace[] = ["Heads", "Tails"]

export function randomIndex(count: number, random = Math.random) {
  return Math.floor(random() * count)
}

/** why: Yu-Gi-Oh! tournament rules use a six-sided die; a d20 has no use there. */
export function systemDie(system: unknown): Die {
  return system === "ygo" ? "d6" : "d20"
}

function rollDie(die: Die, random: () => number) {
  return randomIndex(DIE_SIDES[die], random) + 1
}

export function roll(tool: DiceTool, random = Math.random): DiceRoll {
  return tool === "coin"
    ? { tool, value: COIN_FACES[randomIndex(COIN_FACES.length, random)] }
    : { tool, value: rollDie(tool, random) }
}

export function toolLabel(tool: DiceTool) {
  return tool === "coin" ? "Coin" : tool
}

export function armTool(state: DiceState, tool: DiceTool): DiceState {
  return { ...state, armed: state.armed === tool ? null : tool }
}

export function rollForSeat(
  state: DiceState,
  seatId: PlayerId,
  random = Math.random,
): { state: DiceState; roll: DiceRoll } | undefined {
  if (!state.armed) return undefined
  const result = roll(state.armed, random)
  const attempt = (state.results[seatId]?.attempt ?? 0) + 1
  return {
    state: {
      ...state,
      results: { ...state.results, [seatId]: { roll: result, phase: "bloom", attempt } },
    },
    roll: result,
  }
}

export function settleResult(state: DiceState, seatId: PlayerId): DiceState {
  const result = state.results[seatId]
  if (!result || result.phase === "chip") return state
  return { ...state, results: { ...state.results, [seatId]: { ...result, phase: "chip" } } }
}

export function clearResult(state: DiceState, seatId: PlayerId): DiceState {
  const { [seatId]: _cleared, ...results } = state.results
  return { ...state, results }
}

export function startRollOff(
  state: DiceState,
  seatIds: readonly PlayerId[],
  die: Die,
  random = Math.random,
): DiceState {
  return { ...state, first: resolveRollOff(die, {}, {}, seatIds, random) }
}

export function rerollTies(state: DiceState, random = Math.random): DiceState {
  if (state.first?.kind !== "rolloff" || state.first.pool.length < 2) return state
  return {
    ...state,
    first: resolveRollOff(
      state.first.die,
      state.first.rolls,
      state.first.attempts,
      state.first.pool,
      random,
    ),
  }
}

function resolveRollOff(
  die: Die,
  previous: Partial<Record<PlayerId, number>>,
  previousAttempts: Partial<Record<PlayerId, number>>,
  pool: readonly PlayerId[],
  random: () => number,
): FirstPlayer {
  const rolls = { ...previous }
  const attempts = { ...previousAttempts }
  for (const seatId of pool) {
    rolls[seatId] = rollDie(die, random)
    attempts[seatId] = (attempts[seatId] ?? 0) + 1
  }
  const high = Math.max(...pool.map((seatId) => rolls[seatId] ?? 0))
  return {
    kind: "rolloff",
    die,
    rolls,
    attempts,
    pool: pool.filter((seatId) => rolls[seatId] === high),
    phase: "bloom",
  }
}

export function rollOffAnnouncement(
  first: FirstPlayer | null,
  players: readonly Pick<GamePlayer, "id" | "name">[],
) {
  if (first?.kind !== "rolloff") return undefined
  const name = (seatId: PlayerId) => players.find(({ id }) => id === seatId)?.name ?? "Player"
  const high = first.rolls[first.pool[0]]
  if (first.pool.length === 1) return `${name(first.pool[0])} rolled ${high}, goes first`
  return `Tie at ${high}, ${first.pool.map(name).join(" and ")}. Roll again`
}

export function flipForFirst(seatIds: readonly PlayerId[], random = Math.random): PlayerId {
  return seatIds[randomIndex(seatIds.length, random)]
}

export function offerChoice(state: DiceState, seatId: PlayerId, reason: ChoiceReason): DiceState {
  return { ...state, first: { kind: "choice", seatId, reason } }
}

export function pickFirst(state: DiceState, seatId: PlayerId, note?: string): DiceState {
  return { ...state, first: { kind: "picked", seatId, phase: "bloom", ...(note ? { note } : {}) } }
}

export function settleFirst(state: DiceState): DiceState {
  const { first } = state
  if (!first || first.kind === "choice" || first.phase === "chip") return state
  if (first.kind === "rolloff") {
    if (first.pool.length !== 1) return state
    return { ...state, first: { kind: "picked", seatId: first.pool[0], phase: "chip" } }
  }
  return { ...state, first: { ...first, phase: "chip" } }
}

export function clearFirst(state: DiceState): DiceState {
  return state.first ? { ...state, first: null } : state
}

export function firstPlayerSeat(state: DiceState): PlayerId | undefined {
  const { first } = state
  if (first?.kind === "picked") return first.seatId
  if (first?.kind === "rolloff" && first.pool.length === 1) return first.pool[0]
  return undefined
}

export function diceSeatView(state: DiceState, seatId: PlayerId): DiceSeatView | undefined {
  const { first } = state
  if (first?.kind === "choice") {
    return first.seatId === seatId ? { kind: "choice", reason: first.reason } : { kind: "waiting" }
  }
  if (first?.kind === "picked" && first.phase === "bloom") {
    return first.seatId === seatId
      ? { kind: "first", status: "won", ...(first.note ? { note: first.note } : {}) }
      : { kind: "first", status: "lost" }
  }
  if (first?.kind === "rolloff" && first.phase === "bloom") {
    const value = first.rolls[seatId]
    if (value !== undefined) {
      const inPool = first.pool.includes(seatId)
      const decided = first.pool.length === 1
      return {
        kind: "rolloff",
        die: first.die,
        value,
        attempt: first.attempts[seatId] ?? 1,
        status: decided ? (inPool ? "won" : "lost") : inPool ? "tied" : "out",
      }
    }
  }
  const result = state.results[seatId]
  return result?.phase === "bloom"
    ? { kind: "roll", roll: result.roll, attempt: result.attempt }
    : undefined
}

export function diceSeatChips(state: DiceState, seatId: PlayerId): DiceSeatChip[] {
  const chips: DiceSeatChip[] = []
  const { first } = state
  if (first?.kind === "picked" && first.phase === "chip" && first.seatId === seatId)
    chips.push({ kind: "first" })
  const result = state.results[seatId]
  if (result?.phase === "chip") chips.push({ kind: "roll", roll: result.roll })
  return chips
}
