import { asActorId, asDeviceId, asGameId, asOperationId, asPlayerId } from "@/features/game/domain"
import { gameLog } from "@/features/game/LifeLog"
import type { GameEvent, GamePlayer, TurnLogEntry } from "@/features/game/types"

import type { PendingLifeAction } from "./model"
import type { ConnectedLogEvent } from "../../../convex/lib/gameLog"
import type { Turn } from "../../../convex/lib/turns"

const NO_ACTOR = asActorId("")
const NO_DEVICE = asDeviceId("")

/**
 * why: this device's unsent changes show at once and give way to the authority's copy, matched by
 * operation id, so the log reads the same offline, on reconnect, and after a rejection drops one.
 * Where anyone edits any seat, the authority confirms commander damage as it lands, so an unsent
 * claim shows as that confirmation, under the id the authority gives it.
 */
export function connectedLogEvents(
  confirmed: readonly ConnectedLogEvent[],
  pending: readonly PendingLifeAction[],
  gameId: string,
  anyoneEdits = false,
): ConnectedLogEvent[] {
  const known = new Set(confirmed.map(({ operationId }) => operationId))
  const unsent = pending.flatMap(({ event }): ConnectedLogEvent[] => {
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
  // why: device clocks drift apart, so confirmed changes keep the authority's order and only this device's own unsent ones sort by when it made them.
  const ordered = [
    ...confirmed,
    ...unsent.sort((left, right) => left.clientCreatedAt - right.clientCreatedAt),
  ]
  // why: the log places rows under turn headings and folds bursts by time, so each change's time never runs behind the one before it; a skewed clock moves only by the gap.
  let last = -Infinity
  return ordered.map((event) => {
    const at = Math.max(event.clientCreatedAt, last + 1)
    last = at
    return at === event.clientCreatedAt ? event : { ...event, clientCreatedAt: at }
  })
}

/** why: the local log's own builders draw the rows, so a connected game reads like a local one. */
export function connectedLogInputs(
  events: readonly ConnectedLogEvent[],
  gameId: string,
  turn: Turn | undefined,
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
  return { events: lifeEvents, turns: turnLog(events, turn) }
}

/**
 * why: connected events don't carry turn numbers, but each turn record names the pass that began
 * it, so numbers count back from the turn the table holds now. A hand-off keeps the number, and a
 * turn named twice (a first player picked again) shows once, as its newest holder. The log arrives
 * a page at a time, so the current turn heads it even before the change that began it has loaded.
 */
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
  // why: a game can begin with its first turn already set, as Archenemy's does, so no change starts turn 1; its holder is whoever passed it on.
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
  | { kind: "turn"; playerId: string; turnOperationId: string }

/**
 * why: each device owns its seats, so Undo takes back only the newest change this account made:
 * a life change (a quick-tap burst at once) or its own pass while the table still holds that turn.
 * Commander damage needs the defender's say, so when that is the newest, Undo waits.
 */
export function connectedLogUndo(
  events: readonly ConnectedLogEvent[],
  players: readonly Pick<GamePlayer, "id" | "life">[],
  gameId: string,
  turn: Turn | undefined,
  { turns }: { turns: boolean },
): ConnectedLogUndo | undefined {
  const mine = new Map(
    events.flatMap((event) => (event.mine ? [[event.operationId, event] as const] : [])),
  )
  const rows = gameLog(players, connectedLogInputs(events, gameId, turn).events)
  const row = rows.find(({ operationIds }) => operationIds.some((id) => mine.has(id)))
  const pass = turn?.previous ? mine.get(turn.operationId) : undefined
  const ownPass =
    turns && pass?.action?.kind === "turn.passed" && (!row || pass.clientCreatedAt >= row.at)
      ? pass
      : undefined
  if (ownPass)
    return { kind: "turn", playerId: ownPass.playerId, turnOperationId: ownPass.operationId }
  if (!row || row.fromPlayerId || !row.operationIds.every((id) => mine.has(id))) return undefined
  return {
    kind: "life",
    changes: row.operationIds.flatMap((operationId) => {
      const event = mine.get(operationId)
      return event?.delta ? [{ operationId, playerId: event.playerId, delta: event.delta }] : []
    }),
  }
}
