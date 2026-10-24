import { isCommanderLethal } from "./gameRules"
import { isCounterOut, type CounterDefinition, type TableDefinition } from "./systems"
import { counterValue, type TableState } from "./table"

export type OutReason<Id extends string = string> =
  | { readonly cause: "commanderDamage"; readonly fromPlayerId: Id; readonly total: number }
  | { readonly cause: "counter"; readonly counterId: string; readonly value: number }
  | { readonly cause: "life" }

export interface OutState<Id extends string = string> {
  readonly counter: CounterDefinition | undefined
  readonly tableRules: TableDefinition
  readonly table?: TableState
  readonly lives: readonly { readonly playerId: Id; readonly life: number }[]
  readonly commanderDamage?: readonly {
    readonly fromPlayerId: Id
    readonly toPlayerId: Id
    readonly total: number
  }[]
}

export function outReason<Id extends string>(
  state: OutState<Id>,
  playerId: Id,
): OutReason<Id> | undefined {
  const lethal = state.commanderDamage?.find(
    (damage) =>
      damage.toPlayerId === playerId &&
      damage.fromPlayerId !== playerId &&
      isCommanderLethal(damage.total),
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

export function lastStanding<Id extends string>(state: OutState<Id>): Id | undefined {
  const standing = state.lives.filter(({ playerId }) => !outReason(state, playerId))
  return standing.length === 1 ? standing[0].playerId : undefined
}
