import { translate } from "@/i18n/translate"

import type { GamePlayer, PlayerId } from "./types"
import { systemDefinition, type FirstPlayerDefinition } from "../../../convex/lib/systems"

export type DiceRules = Pick<FirstPlayerDefinition, "die" | "winnerChooses">
export type Die = DiceRules["die"]
export const BAG_DICE = ["d4", "d6", "d8", "d10", "d12", "d20", "d100"] as const
export type BagDie = (typeof BAG_DICE)[number]
export type DiceTool = BagDie | "coin"
export const DICE_TOOLS: readonly DiceTool[] = [...BAG_DICE, "coin"]
export type CoinFace = "Heads" | "Tails"
export type DiceRoll = { tool: BagDie; value: number } | { tool: "coin"; value: CoinFace }

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
  | { kind: "flip"; seatId: PlayerId }
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
  | { kind: "flip" }
  | { kind: "waiting" }
  | { kind: "first"; status: "won" | "lost"; note?: string }

export type DiceSeatChip = { kind: "roll"; roll: DiceRoll } | { kind: "first" } | { kind: "claim" }

export const CLAIM_CHIP: DiceSeatChip = { kind: "claim" }

export const PROMPT_FADE_MS = 260
export const EMPTY_DICE: DiceState = { armed: null, results: {}, first: null }
export const DIE_SIDES: Record<BagDie, number> = {
  d4: 4,
  d6: 6,
  d8: 8,
  d10: 10,
  d12: 12,
  d20: 20,
  d100: 100,
}
const COIN_FACES: readonly CoinFace[] = ["Heads", "Tails"]

export function randomIndex(count: number, random = Math.random) {
  return Math.floor(random() * count)
}

const DEFAULT_DICE: FirstPlayerDefinition = {
  die: "d20",
  winnerChooses: false,
  twoPlayerCoinFlip: false,
}

export function systemDice(system: unknown): FirstPlayerDefinition {
  return systemDefinition(system)?.firstPlayer ?? DEFAULT_DICE
}

function rollDie(die: BagDie, random: () => number) {
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
  return state.armed === tool ? state : { ...state, armed: tool }
}

export function defaultTool({ die, twoPlayerCoinFlip }: FirstPlayerDefinition): DiceTool {
  return twoPlayerCoinFlip ? "coin" : die
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
      armed: null,
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

export function startFlip(
  state: DiceState,
  seatIds: readonly PlayerId[],
  random = Math.random,
): DiceState {
  return { ...state, first: { kind: "flip", seatId: flipForFirst(seatIds, random) } }
}

export function claimFirst(state: DiceState, seatId: PlayerId): DiceState {
  return { ...state, first: { kind: "picked", seatId, phase: "chip" } }
}

export function offerChoice(state: DiceState, seatId: PlayerId, reason: ChoiceReason): DiceState {
  return { ...state, first: { kind: "choice", seatId, reason } }
}

export function pickFirst(state: DiceState, seatId: PlayerId, note?: string): DiceState {
  return { ...state, first: { kind: "picked", seatId, phase: "bloom", ...(note ? { note } : {}) } }
}

export function settleFirst(state: DiceState): DiceState {
  const { first } = state
  if (first?.kind === "flip") return offerChoice(state, first.seatId, "flip")
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
  if (first?.kind === "flip") return { kind: "flip" }
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
