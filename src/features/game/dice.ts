import { translate } from "@/i18n/translate"

import type { GamePlayer, PlayerId } from "./types"

export type Die = "d6" | "d20"
export type DiceTool = Die | "coin"
export type CoinFace = "Heads" | "Tails"
export type DiceRoll = { tool: Die; value: number } | { tool: "coin"; value: CoinFace }

export type DicePhase = "bloom" | "chip"

export type SeatResult = { roll: DiceRoll; phase: DicePhase; attempt: number }

export type ChoiceReason = "flip" | "roll" | "loss"

export type FirstPlayer =
  | {
      kind: "rolloff"
      die: Die
      winnerChooses: boolean
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
      status: "won" | "chooses" | "tied" | "out" | "lost"
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

export type DiceRules = { die: Die; winnerChooses: boolean }

const DEFAULT_DICE: DiceRules = { die: "d20", winnerChooses: false }
// why: Yu-Gi-Oh! rules use a six-sided die, and the roll's winner picks whether to go first or second.
const YGO_DICE: DiceRules = { die: "d6", winnerChooses: true }

export function systemDice(system: unknown): DiceRules {
  return system === "ygo" ? YGO_DICE : DEFAULT_DICE
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
  return translate(`board:dice.tool.${tool}`)
}

export function rollValueLabel(roll: DiceRoll) {
  return roll.tool === "coin" ? translate(`board:dice.coinFace.${roll.value}`) : String(roll.value)
}

export function rollLabel(playerName: string, roll: DiceRoll) {
  return translate("board:dice.rollResult", {
    name: playerName,
    tool: toolLabel(roll.tool),
    value: rollValueLabel(roll),
  })
}

export function dicePlayerName(
  players: readonly Pick<GamePlayer, "id" | "name">[],
  seatId: PlayerId,
) {
  return players.find(({ id }) => id === seatId)?.name ?? translate("board:dice.unnamedPlayer")
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
  rules: DiceRules,
  random = Math.random,
): DiceState {
  return { ...state, first: resolveRollOff(rules, {}, {}, seatIds, random) }
}

export function rerollTies(state: DiceState, random = Math.random): DiceState {
  if (state.first?.kind !== "rolloff" || state.first.pool.length < 2) return state
  return {
    ...state,
    first: resolveRollOff(
      state.first,
      state.first.rolls,
      state.first.attempts,
      state.first.pool,
      random,
    ),
  }
}

function resolveRollOff(
  { die, winnerChooses }: DiceRules,
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
    winnerChooses,
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
  const name = (seatId: PlayerId) => dicePlayerName(players, seatId)
  const value = first.rolls[first.pool[0]]
  if (first.pool.length === 1)
    return first.winnerChooses
      ? translate("board:dice.rolledGoFirstOrSecond", { name: name(first.pool[0]), value })
      : translate("board:dice.rolloffLabel.won", { name: name(first.pool[0]), value })
  return translate("board:dice.tieRollAgain", {
    value,
    names: first.pool.map(name).join(translate("board:dice.nameSeparator")),
  })
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
    return first.winnerChooses
      ? offerChoice(state, first.pool[0], "roll")
      : { ...state, first: { kind: "picked", seatId: first.pool[0], phase: "chip" } }
  }
  return { ...state, first: { ...first, phase: "chip" } }
}

export function clearFirst(state: DiceState): DiceState {
  return state.first ? { ...state, first: null } : state
}

export function firstPlayerSeat(state: DiceState): PlayerId | undefined {
  const { first } = state
  if (first?.kind === "picked") return first.seatId
  if (first?.kind === "rolloff" && first.pool.length === 1 && !first.winnerChooses)
    return first.pool[0]
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
        status: decided
          ? inPool
            ? first.winnerChooses
              ? "chooses"
              : "won"
            : "lost"
          : inPool
            ? "tied"
            : "out",
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
