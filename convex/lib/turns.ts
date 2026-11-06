import { v, type Infer } from "convex/values"

const turnFields = {
  playerId: v.string(),
  number: v.number(),
  startedAt: v.number(),
  operationId: v.string(),
  spent: v.optional(v.record(v.string(), v.number())),
}

export const previousTurnValidator = v.object(turnFields)

export const turnValidator = v.object({
  ...turnFields,
  /** why: one level is enough to take back an accidental pass, and keeps every projection small. */
  previous: v.optional(previousTurnValidator),
})

/**
 * why: `playerId` is the seat sending the action, so seat ownership decides who may act. Only the
 * seat holding the turn passes or hands it on, and only the seat that passed takes it back.
 */
export const turnActionValidators = [
  v.object({ kind: v.literal("turn.passed"), playerId: v.string(), toPlayerId: v.string() }),
  v.object({ kind: v.literal("turn.set"), playerId: v.string(), toPlayerId: v.string() }),
  v.object({ kind: v.literal("turn.undone"), playerId: v.string(), turnOperationId: v.string() }),
] as const

export type Turn = Infer<typeof turnValidator>
export type PreviousTurn = Infer<typeof previousTurnValidator>
export type TurnAction = Infer<(typeof turnActionValidators)[number]>
export type TurnActionKind = TurnAction["kind"]

export const TURN_ACTION_KINDS: readonly string[] = turnActionValidators.map(
  (member) => member.fields.kind.value,
)

export const isTurnAction = (action: { kind: string }): action is TurnAction =>
  TURN_ACTION_KINDS.includes(action.kind)

export interface TurnContext {
  operationId: string
  now: number
  isSeat: (playerId: string) => boolean
}

const settled = ({ previous: _previous, ...turn }: Turn): PreviousTurn => turn

function spentAfter(turn: Turn, now: number): Record<string, number> {
  const held = Math.max(0, now - turn.startedAt)
  return { ...turn.spent, [turn.playerId]: (turn.spent?.[turn.playerId] ?? 0) + held }
}

function handOff(turn: Turn, toPlayerId: string, number: number, context: TurnContext): Turn {
  return {
    playerId: toPlayerId,
    number,
    startedAt: context.now,
    operationId: context.operationId,
    spent: spentAfter(turn, context.now),
    previous: settled(turn),
  }
}

/**
 * why: one reducer for local games, the connected overlay, Convex, and a nearby host, so every
 * device lands on the same turn. An undo restores the passer's start time too, so their clock runs
 * on as if the pass never happened.
 */
export function applyTurnAction(
  turn: Turn | undefined,
  action: TurnAction,
  context: TurnContext,
): Turn | undefined | null {
  if (action.kind === "turn.undone") {
    const previous = turn?.previous
    if (!turn || !previous || turn.operationId !== action.turnOperationId) return null
    return previous.playerId === action.playerId ? previous : null
  }
  if (!context.isSeat(action.toPlayerId)) return null
  if (!turn) {
    if (action.kind === "turn.passed" || action.toPlayerId !== action.playerId) return null
    return {
      playerId: action.toPlayerId,
      number: 1,
      startedAt: context.now,
      operationId: context.operationId,
    }
  }
  if (turn.playerId !== action.playerId) return null
  if (action.toPlayerId === turn.playerId) return action.kind === "turn.set" ? turn : null
  return handOff(
    turn,
    action.toPlayerId,
    action.kind === "turn.passed" ? turn.number + 1 : turn.number,
    context,
  )
}

export function nextTurnSeat(
  order: readonly string[],
  current: string,
  isOut: (playerId: string) => boolean = () => false,
): string | undefined {
  const start = order.indexOf(current)
  if (start < 0) return undefined
  for (let step = 1; step < order.length; step += 1) {
    const candidate = order[(start + step) % order.length]
    if (!isOut(candidate)) return candidate
  }
  return undefined
}

export const turnElapsed = (turn: Pick<Turn, "startedAt">, now: number) =>
  Math.max(0, now - turn.startedAt)

export function turnTimeSpent(turn: Turn, playerId: string, now: number) {
  const before = turn.spent?.[playerId] ?? 0
  return turn.playerId === playerId ? before + turnElapsed(turn, now) : before
}

const isRecordOfNumbers = (value: unknown): value is Record<string, number> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  Object.values(value).every((item) => typeof item === "number" && Number.isFinite(item))

function isPreviousTurn(value: unknown, playerIds: ReadonlySet<string>): value is PreviousTurn {
  if (typeof value !== "object" || value === null) return false
  const turn = value as Record<string, unknown>
  return (
    typeof turn.playerId === "string" &&
    playerIds.has(turn.playerId) &&
    typeof turn.number === "number" &&
    Number.isInteger(turn.number) &&
    turn.number >= 1 &&
    typeof turn.startedAt === "number" &&
    Number.isFinite(turn.startedAt) &&
    typeof turn.operationId === "string" &&
    (turn.spent === undefined ||
      (isRecordOfNumbers(turn.spent) && Object.keys(turn.spent).every((id) => playerIds.has(id))))
  )
}

export function isValidTurn(value: unknown, playerIds: ReadonlySet<string>): value is Turn {
  if (!isPreviousTurn(value, playerIds)) return false
  const { previous } = value as Turn
  return previous === undefined || isPreviousTurn(previous, playerIds)
}

export function remapTurn(turn: Turn, idOf: (playerId: string) => string): Turn {
  const remap = (step: PreviousTurn): PreviousTurn => ({
    ...step,
    playerId: idOf(step.playerId),
    ...(step.spent
      ? {
          spent: Object.fromEntries(
            Object.entries(step.spent).map(([playerId, ms]) => [idOf(playerId), ms]),
          ),
        }
      : {}),
  })
  return { ...remap(turn), ...(turn.previous ? { previous: remap(turn.previous) } : {}) }
}
