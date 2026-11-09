import { createContext, useContext, type ReactNode } from "react"
import { usePaginatedQuery } from "convex/react"

import { ConvexQueryBoundary } from "@/features/async/ConvexQueryBoundary"
import type { PendingLifeAction } from "@/features/connected/model"

import type {
  CommanderDamageAssignedEvent,
  CounterLogEntry,
  GameEvent,
  GamePlayer,
  LifeChangedEvent,
  TurnLogEntry,
} from "./types"
import { api } from "../../../convex/_generated/api"
import { CONNECTED_EVENT_PAGE_MAX_ITEMS } from "../../../convex/lib/pagination"
import { turnGroupOf, type TurnGroups } from "../../../convex/lib/turns"

export interface LifeLogStep {
  id: string
  delta?: number
  life: number
}

interface LifeLogChange {
  id: string
  delta: number
}

/** why: a Two-Headed Giant head's life is its team's, so `teams` folds both heads' changes into one history. */
export type LifeLogSource =
  | { kind: "local"; events: readonly GameEvent[]; teams?: TurnGroups }
  | {
      kind: "connected"
      publicId: string
      pending: readonly PendingLifeAction[]
      teams?: TurnGroups
    }

export const LifeLogContext = createContext<LifeLogSource | undefined>(undefined)

// why: built back from the total the card shows, the log agrees with the card even when only the newest changes are at hand.
export function lifeLog(life: number, newestFirst: readonly LifeLogChange[]): LifeLogStep[] {
  const steps: LifeLogStep[] = []
  let total = life
  for (const { id, delta } of newestFirst) {
    steps.push({ id, delta, life: total })
    total -= delta
  }
  steps.push({ id: "before", life: total })
  return steps.reverse()
}

// why: an undo leaves the log as if the change never happened, so both it and the change it reverses drop out.
function standingLifeEvents(events: readonly GameEvent[]) {
  const lifeEvents = events.filter(
    (event): event is LifeChangedEvent | CommanderDamageAssignedEvent =>
      event.type === "life.changed" || event.type === "commanderDamage.assigned",
  )
  const undone = new Set(lifeEvents.map(({ compensatesOperationId }) => compensatesOperationId))
  return lifeEvents.filter(
    (event) => !event.compensatesOperationId && !undone.has(event.operationId),
  )
}

function lifeChangeOf(event: LifeChangedEvent | CommanderDamageAssignedEvent) {
  return event.type === "life.changed"
    ? { playerId: event.playerId, delta: event.delta }
    : { playerId: event.toPlayerId, delta: -event.delta, fromPlayerId: event.fromPlayerId }
}

export function localLifeChanges(
  events: readonly GameEvent[],
  playerId: string,
  teams?: TurnGroups,
): LifeLogChange[] {
  const team = turnGroupOf(teams, playerId)
  return standingLifeEvents(events)
    .flatMap((event) => {
      const change = lifeChangeOf(event)
      return team.includes(change.playerId) ? [{ id: event.operationId, delta: change.delta }] : []
    })
    .reverse()
}

export type GameLogRow = ReturnType<typeof lifeChangeOf> & {
  id: string
  life: number
  at: number
  operationIds: string[]
}

// why: a seat's card sums quick taps into one number until it rests this long, so the log reads the same burst as one change, even when another seat changes in between.
export const LIFE_BURST_MS = 1800

export function gameLog(
  players: readonly Pick<GamePlayer, "id" | "life">[],
  events: readonly GameEvent[],
  teams?: TurnGroups,
): GameLogRow[] {
  const totals = new Map<string, number>(players.map(({ id, life }) => [id, life]))
  const rows: GameLogRow[] = []
  const bursts = new Map<string, { row: GameLogRow; oldestAt: number }>()
  for (const event of standingLifeEvents(events).reverse()) {
    const change = lifeChangeOf(event)
    const life = totals.get(change.playerId)
    if (life === undefined) continue
    for (const id of turnGroupOf(teams, change.playerId)) totals.set(id, life - change.delta)
    const key = `${change.playerId}\u0000${change.fromPlayerId ?? ""}`
    const burst = bursts.get(key)
    if (burst && Math.abs(burst.oldestAt - event.clientCreatedAt) <= LIFE_BURST_MS) {
      burst.row.delta += change.delta
      burst.row.id = event.operationId
      burst.row.operationIds.push(event.operationId)
      burst.oldestAt = event.clientCreatedAt
    } else {
      const row = {
        id: event.operationId,
        life,
        at: event.clientCreatedAt,
        operationIds: [event.operationId],
        ...change,
      }
      rows.push(row)
      bursts.set(key, { row, oldestAt: event.clientCreatedAt })
    }
  }
  // why: a burst that nets to nothing, like a stray tap taken back, changed nothing at the table.
  return rows.filter(({ delta }) => delta !== 0)
}

export type GameCounterRow = Omit<CounterLogEntry, "operationId"> & {
  kind: "counter"
  id: string
  operationIds: string[]
}

export function counterLog(entries: readonly CounterLogEntry[]): GameCounterRow[] {
  const rows: GameCounterRow[] = []
  const bursts = new Map<string, { row: GameCounterRow; oldestAt: number }>()
  for (const { operationId, ...entry } of [...entries].reverse()) {
    const key = `${entry.playerId}\u0000${entry.counterId}`
    const burst = bursts.get(key)
    if (burst && Math.abs(burst.oldestAt - entry.at) <= LIFE_BURST_MS) {
      burst.row.delta += entry.delta
      burst.row.operationIds.push(operationId)
      burst.oldestAt = entry.at
    } else {
      const row: GameCounterRow = {
        kind: "counter",
        id: operationId,
        operationIds: [operationId],
        ...entry,
      }
      rows.push(row)
      bursts.set(key, { row, oldestAt: entry.at })
    }
  }
  return rows.filter(({ delta }) => delta !== 0)
}

type GameLogChange = (GameLogRow & { kind?: undefined }) | GameCounterRow

/** why: newest first; a connected log passes `positionOf` so device clocks that drift apart don't reorder life and counter rows. */
export function mergedLog(
  life: readonly GameLogRow[],
  counters: readonly GameCounterRow[],
  positionOf?: (operationId: string) => number | undefined,
): GameLogChange[] {
  const placeOf = (row: GameLogChange) => (positionOf ? rowPosition(row, positionOf) : row.at)
  return [...life, ...counters].sort((left, right) => placeOf(right) - placeOf(left))
}

type TurnDivider = Pick<TurnLogEntry, "operationId" | "playerId" | "number" | "at"> & {
  kind: "turn"
}

export type GameLogItem = GameLogChange | TurnDivider

/** why: a connected log places a row by the newest change in it, where the authority recorded that change. */
export const rowPosition = (
  row: Pick<GameLogChange, "operationIds">,
  positionOf: (operationId: string) => number | undefined,
) => Math.max(...row.operationIds.map((id) => positionOf(id) ?? -Infinity))

/**
 * why: a local game has one clock, so rows go under a turn by time. A connected log passes
 * `positionOf`, the authority's order, since device clocks drift apart; a turn whose start hasn't
 * loaded yet heads every loaded row.
 */
export function withTurnDividers(
  rows: readonly GameLogChange[],
  turns: readonly TurnLogEntry[],
  positionOf?: (operationId: string) => number | undefined,
): GameLogItem[] {
  const startOf = (turn: TurnLogEntry) =>
    positionOf ? (positionOf(turn.operationId) ?? -Infinity) : turn.at
  const placeOf = (row: GameLogChange) => (positionOf ? rowPosition(row, positionOf) : row.at)
  const items: GameLogItem[] = []
  let index = 0
  for (const turn of [...turns].reverse()) {
    const start = index
    const begins = startOf(turn)
    while (index < rows.length && placeOf(rows[index]) >= begins) index += 1
    items.push({ kind: "turn", ...turn }, ...rows.slice(start, index))
  }
  return [...items, ...rows.slice(index)]
}

type LifeLogProps = {
  playerId: string
  life: number
  children: (steps: readonly LifeLogStep[]) => ReactNode
}

export function LifeLog({ playerId, life, children }: LifeLogProps) {
  const source = useContext(LifeLogContext)
  if (!source) return null
  if (source.kind === "local")
    return children(lifeLog(life, localLifeChanges(source.events, playerId, source.teams)))
  return (
    <ConvexQueryBoundary resetKey={source.publicId} fallback={() => null}>
      <ConnectedLifeLog source={source} playerId={playerId} life={life}>
        {children}
      </ConnectedLifeLog>
    </ConvexQueryBoundary>
  )
}

function ConnectedLifeLog({
  source,
  playerId,
  life,
  children,
}: LifeLogProps & { source: Extract<LifeLogSource, { kind: "connected" }> }) {
  // why: one page holds more steps than fit on a line, and an unsent change still shows from the pending queue offline.
  const { results } = usePaginatedQuery(
    api.games.connectedEvents,
    { publicId: source.publicId },
    { initialNumItems: CONNECTED_EVENT_PAGE_MAX_ITEMS },
  )
  const confirmed = new Set(results.map(({ operationId }) => operationId))
  const team = turnGroupOf(source.teams, playerId)
  const pending = source.pending
    .flatMap(({ event }) =>
      event.type === "life.changed" &&
      event.gameId === source.publicId &&
      team.includes(event.playerId) &&
      !confirmed.has(event.operationId)
        ? [{ id: event.operationId, delta: event.delta }]
        : [],
    )
    .reverse()
  const synced = results.flatMap((event) =>
    team.includes(event.playerId) && event.delta !== undefined
      ? event.kind === "life.changed"
        ? [{ id: event.operationId, delta: event.delta }]
        : event.kind === "commanderDamage.confirmed"
          ? [{ id: event.operationId, delta: -event.delta }]
          : []
      : [],
  )
  return children(lifeLog(life, [...pending, ...synced]))
}
