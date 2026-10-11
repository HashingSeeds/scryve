import type { GamePlayer, PlayerId } from "./types"

export type DiceTool = "d20" | "coin"
export type CoinFace = "Heads" | "Tails"
export type DiceRoll = { tool: "d20"; value: number } | { tool: "coin"; value: CoinFace }

// why: a roll-off keeps every seat's die on the table; `pool` is who is still rolling, so one seat left is the winner and more is a tie.
export type DiceBoard =
  | { kind: "rolloff"; rolls: Partial<Record<PlayerId, number>>; pool: PlayerId[] }
  | { kind: "first"; seatId: PlayerId; settled: boolean }

export interface DiceState {
  armed: DiceTool | null
  newestRollsBySeat: Partial<Record<PlayerId, DiceRoll[]>>
  board: DiceBoard | null
}

export type DiceSeatView =
  | { kind: "rolls"; rolls: DiceRoll[] }
  | { kind: "rolloff"; value: number; status: "won" | "tied" | "out" | "lost" }
  | { kind: "first"; status: "sweep" | "won" | "lost" }

export const EMPTY_DICE: DiceState = { armed: null, newestRollsBySeat: {}, board: null }
export const SEAT_HISTORY = 3
const D20_SIDES = 20
const COIN_FACES: readonly CoinFace[] = ["Heads", "Tails"]

export function randomIndex(count: number, random = Math.random) {
  return Math.floor(random() * count)
}

export function rollD20(random = Math.random) {
  return randomIndex(D20_SIDES, random) + 1
}

export function roll(tool: DiceTool, random = Math.random): DiceRoll {
  return tool === "d20"
    ? { tool, value: rollD20(random) }
    : { tool, value: COIN_FACES[randomIndex(COIN_FACES.length, random)] }
}

export function toolLabel(tool: DiceTool) {
  return tool === "d20" ? "d20" : "Coin"
}

export function armTool(state: DiceState, tool: DiceTool): DiceState {
  return { ...state, armed: state.armed === tool ? null : tool, board: null }
}

export function rollForSeat(
  state: DiceState,
  seatId: PlayerId,
  random = Math.random,
): { state: DiceState; roll: DiceRoll } | undefined {
  if (!state.armed) return undefined
  const result = roll(state.armed, random)
  const history = [result, ...(state.newestRollsBySeat[seatId] ?? [])].slice(0, SEAT_HISTORY)
  return {
    state: {
      ...state,
      armed: null,
      newestRollsBySeat: { ...state.newestRollsBySeat, [seatId]: history },
    },
    roll: result,
  }
}

export function startRollOff(seatIds: readonly PlayerId[], random = Math.random): DiceState {
  return { ...EMPTY_DICE, board: resolveRollOff({}, seatIds, random) }
}

export function rerollTies(state: DiceState, random = Math.random): DiceState {
  if (state.board?.kind !== "rolloff" || state.board.pool.length < 2) return state
  return { ...state, board: resolveRollOff(state.board.rolls, state.board.pool, random) }
}

function resolveRollOff(
  previous: Partial<Record<PlayerId, number>>,
  pool: readonly PlayerId[],
  random: () => number,
): DiceBoard {
  const rolls = { ...previous }
  for (const seatId of pool) rolls[seatId] = rollD20(random)
  const high = Math.max(...pool.map((seatId) => rolls[seatId] ?? 0))
  return { kind: "rolloff", rolls, pool: pool.filter((seatId) => rolls[seatId] === high) }
}

export function rollOffAnnouncement(
  board: DiceBoard | null,
  players: readonly Pick<GamePlayer, "id" | "name">[],
) {
  if (board?.kind !== "rolloff") return undefined
  const name = (seatId: PlayerId) => players.find(({ id }) => id === seatId)?.name ?? "Player"
  const high = board.rolls[board.pool[0]]
  if (board.pool.length === 1) return `${name(board.pool[0])} rolled ${high}, goes first`
  return `Tie at ${high}, ${board.pool.map(name).join(" and ")}. Roll again`
}

export function showFirst(seatId: PlayerId, settled: boolean): DiceState {
  return { ...EMPTY_DICE, board: { kind: "first", seatId, settled } }
}

/** why: a seat's own rolls clear one card at a time; a roll-off or first pick belongs to the table, so one tap clears it everywhere. */
export function clearSeat(state: DiceState, seatId: PlayerId): DiceState {
  if (state.board) return { ...state, board: null }
  const { [seatId]: _cleared, ...newestRollsBySeat } = state.newestRollsBySeat
  return { ...state, newestRollsBySeat }
}

export function diceSeatView(state: DiceState, seatId: PlayerId): DiceSeatView | undefined {
  const { board } = state
  if (board?.kind === "rolloff") {
    const value = board.rolls[seatId]
    if (value === undefined) return undefined
    const inPool = board.pool.includes(seatId)
    const decided = board.pool.length === 1
    return {
      kind: "rolloff",
      value,
      status: decided ? (inPool ? "won" : "lost") : inPool ? "tied" : "out",
    }
  }
  if (board?.kind === "first") {
    if (board.settled) return { kind: "first", status: board.seatId === seatId ? "won" : "lost" }
    return board.seatId === seatId ? { kind: "first", status: "sweep" } : undefined
  }
  const rolls = state.newestRollsBySeat[seatId]
  return rolls?.length ? { kind: "rolls", rolls } : undefined
}
