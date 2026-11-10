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
  readonly commander?: number
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
  readonly groups?: TurnGroups
  /** why: a Two-Headed Giant team has one life (CR 810.8a), so one head out puts out the team, and 21 from one commander counts across both heads. */
  readonly sharedFate?: true
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
  if (!state.sharedFate) return seatOutReason(state, playerId)
  const team = turnGroupOf(state.groups, playerId) as readonly Id[]
  const lethal = teamCommanderLethal(state, team)
  if (lethal) return lethal
  const seats = { ...state, commanderDamage: undefined }
  for (const seat of team) {
    const reason = seatOutReason(seats, seat)
    if (reason) return reason
  }
  return undefined
}

function teamCommanderLethal<Id extends string>(
  { commanderDamage }: OutState<Id>,
  team: readonly Id[],
): OutReason<Id> | undefined {
  if (!commanderDamage) return undefined
  const sums = new Map<string, { fromPlayerId: Id; total: number }>()
  for (const { fromPlayerId, toPlayerId, commander, total } of commanderDamage.totals) {
    if (!team.includes(toPlayerId) || team.includes(fromPlayerId)) continue
    const key = `${fromPlayerId}#${commander ?? 0}`
    sums.set(key, { fromPlayerId, total: (sums.get(key)?.total ?? 0) + total })
  }
  for (const { fromPlayerId, total } of sums.values())
    if (total >= commanderDamage.lethal) return { cause: "commanderDamage", fromPlayerId, total }
  return undefined
}

function seatOutReason<Id extends string>(
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

export function isGroupOut<Id extends string>(state: OutState<Id>, playerId: Id): boolean {
  return turnGroupOf(state.groups, playerId).every(
    (seat) => outReason(state, seat as Id) !== undefined,
  )
}

export function standingWinners<Id extends string>(state: OutState<Id>): Id[] | undefined {
  const standing = state.lives.filter(({ playerId }) => !outReason(state, playerId))
  if (standing.length === 0) return undefined
  const group = turnGroupOf(state.groups, standing[0].playerId)
  if (!standing.every(({ playerId }) => group.includes(playerId))) return undefined
  return state.lives.flatMap(({ playerId }) => (group.includes(playerId) ? [playerId] : []))
}
