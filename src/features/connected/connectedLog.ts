import { asActorId, asDeviceId, asGameId, asOperationId, asPlayerId } from "@/features/game/domain"
import {
  counterLog as localCounterLog,
  gameLog,
  mergedLog,
  rowPosition,
} from "@/features/game/LifeLog"
import type { CounterLogEntry, GameEvent, GamePlayer, TurnLogEntry } from "@/features/game/types"

import { compareQueued, type PendingLifeAction } from "./model"
import type { ConnectedLogEvent } from "../../../convex/lib/gameLog"
import {
  loggedCounterId,
  loggedCounterValue,
  type TableAction,
  type TableState,
} from "../../../convex/lib/table"
import type { Turn } from "../../../convex/lib/turns"

const NO_ACTOR = asActorId("")
const NO_DEVICE = asDeviceId("")

export function connectedLogEvents(
  confirmed: readonly ConnectedLogEvent[],
  pending: readonly PendingLifeAction[],
  gameId: string,
  anyoneEdits = false,
): ConnectedLogEvent[] {
  const known = new Set(confirmed.map(({ operationId }) => operationId))
  const unsent = [...pending].sort(compareQueued).flatMap(({ event }): ConnectedLogEvent[] => {
    if (event.gameId !== gameId || known.has(event.operationId)) return []
    const base = { operationId: event.operationId, clientCreatedAt: event.clientCreatedAt }
    if (event.type === "life.changed")
      return [
        {
          ...base,
          kind: event.type,
          playerId: event.playerId,
          delta: event.delta,
          ...(event.compensatesOperationId ? { undoOf: event.compensatesOperationId } : {}),
          mine: true,
        },
      ]
    if (event.type === "table.action")
      return [
        {
          ...base,
          kind: event.action.kind,
          playerId: event.action.playerId,
          action: event.action,
          ...(loggedCounterId(event.action) && "delta" in event.action
            ? { delta: event.action.delta }
            : {}),
          ...(event.undoOf ? { undoOf: event.undoOf } : {}),
          mine: true,
        },
      ]
    const confirmation = `${event.operationId}_confirmed`
    if (event.type === "commanderDamage.submitted" && anyoneEdits && !known.has(confirmation))
      return [
        {
          ...base,
          operationId: confirmation,
          kind: "commanderDamage.confirmed",
          playerId: event.toPlayerId,
          fromPlayerId: event.fromPlayerId,
          delta: event.delta,
          mine: true,
        },
      ]
    return []
  })
  return [...confirmed, ...unsent]
}

export function logPositions(
  events: readonly ConnectedLogEvent[],
): (operationId: string) => number | undefined {
  const positions = new Map(events.map(({ operationId }, index) => [operationId, index]))
  return (operationId) => positions.get(operationId)
}

export function connectedLogInputs(
  events: readonly ConnectedLogEvent[],
  gameId: string,
  turn: Turn | undefined,
  table: CounterTable = {},
) {
  const game = asGameId(gameId)
  const lifeEvents = events.flatMap((event): GameEvent[] => {
    if (event.delta === undefined) return []
    const base = {
      operationId: asOperationId(event.operationId),
      gameId: game,
      actorId: NO_ACTOR,
      deviceId: NO_DEVICE,
      clientCreatedAt: event.clientCreatedAt,
    }
    if (event.kind === "life.changed")
      return [
        {
          ...base,
          type: "life.changed",
          playerId: asPlayerId(event.playerId),
          delta: event.delta,
          ...(event.undoOf ? { compensatesOperationId: asOperationId(event.undoOf) } : {}),
        },
      ]
    if (event.kind === "commanderDamage.confirmed" && event.fromPlayerId)
      return [
        {
          ...base,
          type: "commanderDamage.assigned",
          fromPlayerId: asPlayerId(event.fromPlayerId),
          toPlayerId: asPlayerId(event.playerId),
          delta: event.delta,
        },
      ]
    return []
  })
  return { events: lifeEvents, turns: turnLog(events, turn), counters: counterLog(events, table) }
}

export interface CounterTable {
  players?: TableState["players"]
  /** why: a Two-Headed Giant team shares poison, so both heads' taps count back from one value. */
  counterKey?: (playerId: string, counterId: string) => string
}

/** why: like life, each counter row's value counts back from what the table shows now, and a change taken back leaves with its undo. */
function counterLog(events: readonly ConnectedLogEvent[], table: CounterTable): CounterLogEntry[] {
  const undone = new Set(
    events.flatMap(({ undoOf, action }) =>
      undoOf && action && loggedCounterId(action) ? [undoOf] : [],
    ),
  )
  const values = new Map<string, number>()
  const entries: CounterLogEntry[] = []
  for (const event of [...events].reverse()) {
    const counterId = event.action && loggedCounterId(event.action)
    if (!counterId || !event.delta || event.undoOf || undone.has(event.operationId)) continue
    const key = table.counterKey?.(event.playerId, counterId) ?? `${event.playerId}:${counterId}`
    const value = values.get(key) ?? loggedCounterValue(table.players?.[event.playerId], counterId)
    values.set(key, value - event.delta)
    entries.push({
      operationId: event.operationId,
      playerId: asPlayerId(event.playerId),
      counterId,
      delta: event.delta,
      value,
      at: event.clientCreatedAt,
    })
  }
  return entries.reverse()
}

function turnLog(events: readonly ConnectedLogEvent[], turn: Turn | undefined): TurnLogEntry[] {
  if (!turn) return []
  const undone = new Set(
    events.flatMap(({ action }) =>
      action?.kind === "turn.undone" ? [action.turnOperationId] : [],
    ),
  )
  const starts = events.filter(
    ({ action, operationId }) =>
      (action?.kind === "turn.passed" || action?.kind === "turn.set") && !undone.has(operationId),
  )
  const newest = starts.findLastIndex(({ operationId }) => operationId === turn.operationId)
  if (newest < 0)
    return [
      {
        operationId: turn.operationId,
        playerId: asPlayerId(turn.playerId),
        number: turn.number,
        at: turn.startedAt,
      },
    ]
  const entries: TurnLogEntry[] = []
  let number = turn.number
  let firstPasser: string | undefined
  for (const event of starts.slice(0, newest + 1).reverse()) {
    if (number < 1) break
    const { action } = event
    if (action?.kind !== "turn.passed" && action?.kind !== "turn.set") continue
    if (entries.at(-1)?.number !== number)
      entries.push({
        operationId: event.operationId,
        playerId: asPlayerId(action.toPlayerId),
        number,
        at: event.clientCreatedAt,
      })
    firstPasser = action.kind === "turn.passed" ? action.playerId : undefined
    if (action.kind === "turn.passed") number -= 1
  }
  if (number === 1 && firstPasser && entries.at(-1)?.number !== 1)
    entries.push({
      operationId: `${turn.operationId}:first`,
      playerId: asPlayerId(firstPasser),
      number: 1,
      at: 0,
    })
  return entries.reverse()
}

export type ConnectedLogUndo =
  | { kind: "life"; changes: { operationId: string; playerId: string; delta: number }[] }
  | { kind: "counter"; changes: { operationId: string; action: TableAction }[] }
  | { kind: "turn"; playerId: string; turnOperationId: string }

export function connectedLogUndo(
  events: readonly ConnectedLogEvent[],
  players: readonly Pick<GamePlayer, "id" | "life">[],
  gameId: string,
  turn: Turn | undefined,
  { turns, table }: { turns: boolean; table?: CounterTable },
): ConnectedLogUndo | undefined {
  const mine = new Map(
    events.flatMap((event) => (event.mine ? [[event.operationId, event] as const] : [])),
  )
  const inputs = connectedLogInputs(events, gameId, turn, table)
  const positionOf = logPositions(events)
  const rows = mergedLog(
    gameLog(players, inputs.events),
    localCounterLog(inputs.counters),
    positionOf,
  )
  const row = rows.find(({ operationIds }) => operationIds.some((id) => mine.has(id)))
  const pass = turn?.previous ? mine.get(turn.operationId) : undefined
  const ownPass =
    turns &&
    pass?.action?.kind === "turn.passed" &&
    (!row || (positionOf(pass.operationId) ?? -1) >= rowPosition(row, positionOf))
      ? pass
      : undefined
  if (ownPass)
    return { kind: "turn", playerId: ownPass.playerId, turnOperationId: ownPass.operationId }
  if (!row || !row.operationIds.every((id) => mine.has(id))) return undefined
  if (row.kind === "counter")
    return {
      kind: "counter",
      changes: row.operationIds.flatMap((operationId) => {
        const action = mine.get(operationId)?.action
        const delta = mine.get(operationId)?.delta
        if (
          !delta ||
          (action?.kind !== "counter.changed" && action?.kind !== "customCounter.changed")
        )
          return []
        return [{ operationId, action: { ...action, delta: -delta } }]
      }),
    }
  if (row.fromPlayerId) return undefined
  return {
    kind: "life",
    changes: row.operationIds.flatMap((operationId) => {
      const event = mine.get(operationId)
      return event?.delta ? [{ operationId, playerId: event.playerId, delta: event.delta }] : []
    }),
  }
}
