import { v, type Infer } from "convex/values"

const turnFields = {
  playerId: v.string(),
  number: v.number(),
  startedAt: v.number(),
  operationId: v.string(),
  spent: v.optional(v.record(v.string(), v.number())),
  waiting: v.optional(v.literal(true)),
}

export const previousTurnValidator = v.object(turnFields)

export const turnGroupsValidator = v.array(v.array(v.string()))
export type TurnGroups = readonly (readonly string[])[]

export const turnBankValidator = v.object({
  ms: v.number(),
  base: v.record(v.string(), v.number()),
})

export const turnValidator = v.object({
  ...turnFields,
  previous: v.optional(previousTurnValidator),
  bank: v.optional(turnBankValidator),
})

export const turnActionValidators = [
  v.object({ kind: v.literal("turn.passed"), playerId: v.string(), toPlayerId: v.string() }),
  v.object({ kind: v.literal("turn.set"), playerId: v.string(), toPlayerId: v.string() }),
  v.object({ kind: v.literal("turn.undone"), playerId: v.string(), turnOperationId: v.string() }),
  v.object({ kind: v.literal("turn.clock"), playerId: v.string(), bankMs: v.optional(v.number()) }),
  v.object({ kind: v.literal("turn.started"), playerId: v.string() }),
] as const

export type Turn = Infer<typeof turnValidator>
export type PreviousTurn = Infer<typeof previousTurnValidator>
export type TurnBank = Infer<typeof turnBankValidator>
export const MAX_BANK_MS = 180 * 60_000
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
  groups?: TurnGroups
  /** why: a device names the next seat from what it last saw, so the authority, which knows who is out now, picks where a pass lands. */
  nextSeat?: (from: string) => string | undefined
}

export const turnGroupOf = (groups: TurnGroups | undefined, playerId: string): readonly string[] =>
  groups?.find((group) => group.includes(playerId)) ?? [playerId]

export const turnLead = (groups: TurnGroups | undefined, playerId: string) =>
  turnGroupOf(groups, playerId)[0]

export const sharesTurn = (groups: TurnGroups | undefined, playerId: string, otherId: string) =>
  turnGroupOf(groups, playerId).includes(otherId)

const settled = ({ previous: _previous, bank: _bank, ...turn }: Turn): PreviousTurn => turn

const isBankMs = (ms: number) => Number.isInteger(ms) && ms >= 60_000 && ms <= MAX_BANK_MS

function spentAfter(turn: Turn, now: number): Record<string, number> {
  const held = turnElapsed(turn, now)
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
    ...(turn.bank ? { bank: turn.bank } : {}),
  }
}

function withBank(turn: Turn, bankMs: number | undefined, now: number): Turn | null {
  const { bank: _before, ...rest } = turn
  if (bankMs === undefined) return rest
  if (!isBankMs(bankMs)) return null
  return { ...rest, bank: { ms: bankMs, base: spentAfter(turn, now) } }
}

/** why: one reducer for local games, the connected overlay, Convex, and a nearby host, so every device lands on the same turn. */
export function applyTurnAction(
  turn: Turn | undefined,
  action: TurnAction,
  context: TurnContext,
): Turn | undefined | null {
  if (action.kind === "turn.undone") {
    const previous = turn?.previous
    if (!turn || !previous || turn.operationId !== action.turnOperationId) return null
    if (!sharesTurn(context.groups, previous.playerId, action.playerId)) return null
    return turn.bank ? { ...previous, bank: turn.bank } : previous
  }
  if (action.kind === "turn.clock") return turn ? withBank(turn, action.bankMs, context.now) : null
  if (action.kind === "turn.started") return turn ? (startedTurn(turn, context.now) ?? turn) : null
  if (!context.isSeat(action.toPlayerId)) return null
  const to = turnLead(context.groups, action.toPlayerId)
  if (!turn) {
    if (action.kind === "turn.passed") return null
    if (!sharesTurn(context.groups, action.toPlayerId, action.playerId)) return null
    return {
      playerId: to,
      number: 1,
      startedAt: context.now,
      operationId: context.operationId,
      waiting: true,
    }
  }
  if (!sharesTurn(context.groups, turn.playerId, action.playerId)) return null
  const next =
    action.kind === "turn.passed" && context.nextSeat ? context.nextSeat(turn.playerId) : to
  if (next === undefined) return null
  if (next === turn.playerId) return action.kind === "turn.set" ? turn : null
  return handOff(turn, next, action.kind === "turn.passed" ? turn.number + 1 : turn.number, context)
}

function startedTurn(turn: Turn, now: number): Turn | undefined {
  if (!turn.waiting) return undefined
  const { waiting: _waiting, ...running } = turn
  return { ...running, startedAt: now }
}

export function startedByChange(turn: Turn | undefined, now: number) {
  return turn ? startedTurn(turn, now) : undefined
}

export function nextTurnSeat(
  order: readonly string[],
  current: string,
  isOut: (playerId: string) => boolean = () => false,
  groups?: TurnGroups,
): string | undefined {
  const leads = [...new Set(order.map((playerId) => turnLead(groups, playerId)))]
  const start = leads.indexOf(turnLead(groups, current))
  if (start < 0) return undefined
  for (let step = 1; step < leads.length; step += 1) {
    const candidate = leads[(start + step) % leads.length]
    if (!turnGroupOf(groups, candidate).every(isOut)) return candidate
  }
  return undefined
}

export function isValidTurnGroups(
  value: unknown,
  playerIds: ReadonlySet<string>,
): value is string[][] {
  if (!Array.isArray(value)) return false
  const seen = new Set<string>()
  return value.every(
    (group) =>
      Array.isArray(group) &&
      group.length > 0 &&
      group.every((playerId) => {
        if (typeof playerId !== "string" || !playerIds.has(playerId) || seen.has(playerId))
          return false
        seen.add(playerId)
        return true
      }),
  )
}

export const turnElapsed = (turn: Pick<Turn, "startedAt" | "waiting">, now: number) =>
  turn.waiting ? 0 : Math.max(0, now - turn.startedAt)

export function turnTimeSpent(turn: Turn, playerId: string, now: number) {
  const before = turn.spent?.[playerId] ?? 0
  return turn.playerId === playerId ? before + turnElapsed(turn, now) : before
}

export function bankLeft(turn: Turn, playerId: string, now: number) {
  if (!turn.bank) return undefined
  return turn.bank.ms - (turnTimeSpent(turn, playerId, now) - (turn.bank.base[playerId] ?? 0))
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
    (turn.waiting === undefined || turn.waiting === true) &&
    (turn.spent === undefined ||
      (isRecordOfNumbers(turn.spent) && Object.keys(turn.spent).every((id) => playerIds.has(id))))
  )
}

export function isValidTurn(value: unknown, playerIds: ReadonlySet<string>): value is Turn {
  if (!isPreviousTurn(value, playerIds)) return false
  const { previous, bank } = value as Turn
  return (
    (previous === undefined || isPreviousTurn(previous, playerIds)) &&
    (bank === undefined ||
      (typeof bank === "object" &&
        bank !== null &&
        typeof bank.ms === "number" &&
        isBankMs(bank.ms) &&
        isRecordOfNumbers(bank.base) &&
        Object.keys(bank.base).every((id) => playerIds.has(id))))
  )
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
  const remapped = Object.fromEntries(
    Object.entries(turn.bank?.base ?? {}).map(([playerId, ms]) => [idOf(playerId), ms]),
  )
  return {
    ...remap(turn),
    ...(turn.previous ? { previous: remap(turn.previous) } : {}),
    ...(turn.bank ? { bank: { ms: turn.bank.ms, base: remapped } } : {}),
  }
}
