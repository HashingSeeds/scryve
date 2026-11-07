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

export interface LifeLogStep {
  id: string
  delta?: number
  life: number
}

interface LifeLogChange {
  id: string
  delta: number
}

export type LifeLogSource =
  | { kind: "local"; events: readonly GameEvent[] }
  | { kind: "connected"; publicId: string; pending: readonly PendingLifeAction[] }

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

export function localLifeChanges(events: readonly GameEvent[], playerId: string): LifeLogChange[] {
  return standingLifeEvents(events)
    .flatMap((event) => {
      const change = lifeChangeOf(event)
      return change.playerId === playerId ? [{ id: event.operationId, delta: change.delta }] : []
    })
    .reverse()
}

export type GameLogRow = ReturnType<typeof lifeChangeOf> & {
  id: string
  life: number
  at: number
  operationIds: string[]
}

// why: a seat's card sums quick taps into one number until it rests this long, so the log reads the same burst as one change.
export const LIFE_BURST_MS = 1800

export function gameLog(
  players: readonly Pick<GamePlayer, "id" | "life">[],
  events: readonly GameEvent[],
): GameLogRow[] {
  const totals = new Map<string, number>(players.map(({ id, life }) => [id, life]))
  const rows: GameLogRow[] = []
  let newerAt = Infinity
  for (const event of standingLifeEvents(events).reverse()) {
    const change = lifeChangeOf(event)
    const life = totals.get(change.playerId)
    if (life === undefined) continue
    totals.set(change.playerId, life - change.delta)
    const newer = rows.at(-1)
    if (
      newer?.playerId === change.playerId &&
      newer.fromPlayerId === change.fromPlayerId &&
      newerAt - event.clientCreatedAt <= LIFE_BURST_MS
    ) {
      newer.delta += change.delta
      newer.id = event.operationId
      newer.operationIds.push(event.operationId)
    } else
      rows.push({
        id: event.operationId,
        life,
        at: event.clientCreatedAt,
        operationIds: [event.operationId],
        ...change,
      })
    newerAt = event.clientCreatedAt
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
    if (burst && burst.oldestAt - entry.at <= LIFE_BURST_MS) {
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

export function mergedLog(
  life: readonly GameLogRow[],
  counters: readonly GameCounterRow[],
): GameLogChange[] {
  return [...life, ...counters].sort((left, right) => right.at - left.at)
}

type TurnDivider = Pick<TurnLogEntry, "operationId" | "playerId" | "number" | "at"> & {
  kind: "turn"
}

export type GameLogItem = GameLogChange | TurnDivider

export function withTurnDividers(
  rows: readonly GameLogChange[],
  turns: readonly TurnLogEntry[],
): GameLogItem[] {
  const items: GameLogItem[] = []
  let index = 0
  for (const turn of [...turns].reverse()) {
    const start = index
    while (index < rows.length && rows[index].at >= turn.at) index += 1
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
    return children(lifeLog(life, localLifeChanges(source.events, playerId)))
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
  const pending = source.pending
    .flatMap(({ event }) =>
      event.type === "life.changed" &&
      event.gameId === source.publicId &&
      event.playerId === playerId &&
      !confirmed.has(event.operationId)
        ? [{ id: event.operationId, delta: event.delta }]
        : [],
    )
    .reverse()
  const synced = results.flatMap((event) =>
    event.playerId === playerId && event.delta !== undefined
      ? event.kind === "life.changed"
        ? [{ id: event.operationId, delta: event.delta }]
        : event.kind === "commanderDamage.confirmed"
          ? [{ id: event.operationId, delta: -event.delta }]
          : []
      : [],
  )
  return children(lifeLog(life, [...pending, ...synced]))
}
