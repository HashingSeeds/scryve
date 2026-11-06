import { isCounterOut, type CounterDefinition, type TableDefinition } from "./systems"
import { counterValue, type TableState } from "./table"
import { turnGroupOf, type TurnGroups } from "./turns"

export type OutReason<Id extends string = string> =
  | { readonly cause: "commanderDamage"; readonly fromPlayerId: Id; readonly total: number }
  | { readonly cause: "counter"; readonly counterId: string; readonly value: number }
  | { readonly cause: "life" }

export interface CommanderTotal<Id extends string = string> {
  readonly fromPlayerId: Id
  readonly toPlayerId: Id
  readonly total: number
}

export interface OutState<Id extends string = string> {
  readonly counter: CounterDefinition | undefined
  readonly tableRules: TableDefinition
  readonly table?: TableState
  readonly lives: readonly { readonly playerId: Id; readonly life: number }[]
  readonly commanderDamage?: {
    readonly lethal: number
    readonly totals: readonly CommanderTotal<Id>[]
  }
  /** why: seats that share a turn also win and lose together, such as a Two-Headed Giant team or Archenemy's opponents. */
  readonly groups?: TurnGroups
}

export function commanderOutState<Id extends string>(
  lethal: number | undefined,
  totals: readonly CommanderTotal<Id>[] | undefined,
): OutState<Id>["commanderDamage"] {
  return lethal === undefined || totals === undefined ? undefined : { lethal, totals }
}

export function outReason<Id extends string>(
  state: OutState<Id>,
  playerId: Id,
): OutReason<Id> | undefined {
  const { commanderDamage } = state
  const lethal =
    commanderDamage &&
    commanderDamage.totals.find(
      (damage) =>
        damage.toPlayerId === playerId &&
        damage.fromPlayerId !== playerId &&
        damage.total >= commanderDamage.lethal,
    )
  if (lethal) {
    return { cause: "commanderDamage", fromPlayerId: lethal.fromPlayerId, total: lethal.total }
  }
  const { table } = state
  for (const { id, losesAt } of table ? state.tableRules.counters : []) {
    const value = table ? counterValue(table, playerId, id) : 0
    if (losesAt !== undefined && value >= losesAt) return { cause: "counter", counterId: id, value }
  }
  if (!state.counter) return undefined
  const life = state.lives.find((seat) => seat.playerId === playerId)?.life ?? 0
  const others = state.lives.filter((seat) => seat.playerId !== playerId).map((seat) => seat.life)
  return isCounterOut(state.counter, life, others) ? { cause: "life" } : undefined
}

/** why: a group is out only once every seat in it is; a teammate who is out still shares the group's win. */
export function isGroupOut<Id extends string>(state: OutState<Id>, playerId: Id): boolean {
  return turnGroupOf(state.groups, playerId).every(
    (seat) => outReason(state, seat as Id) !== undefined,
  )
}

/** why: the game is decided once one group is left standing: one player, or a whole team with any of its fallen seats. */
export function standingWinners<Id extends string>(state: OutState<Id>): Id[] | undefined {
  const standing = state.lives.filter(({ playerId }) => !outReason(state, playerId))
  if (standing.length === 0) return undefined
  const group = turnGroupOf(state.groups, standing[0].playerId)
  if (!standing.every(({ playerId }) => group.includes(playerId))) return undefined
  return state.lives.flatMap(({ playerId }) => (group.includes(playerId) ? [playerId] : []))
}
