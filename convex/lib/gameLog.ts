import type { GameEventRecord } from "./gameEngine"
import { commanderField, type CommanderSlot } from "./gameRules"
import type { TableAction } from "./table"
import type { Turn } from "./turns"

export interface ConnectedLogEvent {
  operationId: string
  playerId: string
  kind: string
  delta?: number
  fromPlayerId?: string
  commander?: CommanderSlot
  claimOperationId?: string
  clientCreatedAt: number
  action?: TableAction
  undoOf?: string
  mine?: true
}

export const NEARBY_LOG_LIMIT = 200

// why: Pokémon actions carry card names the name gate may hide, and the log draws none of them.
const loggedAction = ({ kind, actionIdentity }: GameEventRecord): TableAction | undefined =>
  actionIdentity === undefined ||
  kind === "life.changed" ||
  kind.startsWith("commanderDamage.") ||
  kind.startsWith("pokemon.")
    ? undefined
    : (JSON.parse(actionIdentity) as TableAction)

export function connectedLogEvent(event: GameEventRecord, viewer: string): ConnectedLogEvent {
  const sent = loggedAction(event)
  // why: the authority hands a pass to the next seat still in, which can differ from the seat the device named, and records the one it chose.
  const action =
    sent?.kind === "turn.passed" && event.toPlayerId !== undefined
      ? { ...sent, toPlayerId: event.toPlayerId }
      : sent
  return {
    operationId: event.operationId,
    playerId: event.playerId,
    kind: event.kind,
    ...(event.delta === undefined ? {} : { delta: event.delta }),
    ...(event.fromPlayerId === undefined ? {} : { fromPlayerId: event.fromPlayerId }),
    ...commanderField(event.commander),
    ...(event.claimOperationId === undefined ? {} : { claimOperationId: event.claimOperationId }),
    clientCreatedAt: event.clientCreatedAt,
    ...(action ? { action } : {}),
    ...(event.undoOfOperationId === undefined ? {} : { undoOf: event.undoOfOperationId }),
    ...(event.actorUserId === viewer ? { mine: true as const } : {}),
  }
}

export interface TurnStart {
  operationId: string
  playerId: string
  number: number
  at: number
}

// why: the table keeps only the current turn, so earlier turn numbers are counted back from it over the passes still standing. A turn handed to another seat keeps a start for each hand-off.
export function turnLog(events: readonly ConnectedLogEvent[], turn: Turn | undefined): TurnStart[] {
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
        playerId: turn.playerId,
        number: turn.number,
        at: turn.startedAt,
      },
    ]
  const entries: TurnStart[] = []
  let number = turn.number
  let firstPasser: string | undefined
  for (const event of starts.slice(0, newest + 1).reverse()) {
    if (number < 1) break
    const { action } = event
    if (action?.kind !== "turn.passed" && action?.kind !== "turn.set") continue
    entries.push({
      operationId: event.operationId,
      playerId: action.toPlayerId,
      number,
      at: event.clientCreatedAt,
    })
    firstPasser = action.kind === "turn.passed" ? action.playerId : undefined
    if (action.kind === "turn.passed") number -= 1
  }
  if (number === 1 && firstPasser && entries.at(-1)?.number !== 1)
    entries.push({
      operationId: `${turn.operationId}:first`,
      playerId: firstPasser,
      number: 1,
      at: 0,
    })
  return entries.reverse()
}
