import type { GameEventRecord } from "./gameEngine"
import type { TableAction } from "./table"

export interface ConnectedLogEvent {
  operationId: string
  playerId: string
  kind: string
  delta?: number
  fromPlayerId?: string
  clientCreatedAt: number
  action?: TableAction
  undoOf?: string
  /** why: a device may take back only its own changes, and only the authority knows who made each. */
  mine?: true
}

/** why: a nearby host sends its log in one message, so a guest gets the newest changes only. */
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
    clientCreatedAt: event.clientCreatedAt,
    ...(action ? { action } : {}),
    ...(event.undoOfOperationId === undefined ? {} : { undoOf: event.undoOfOperationId }),
    ...(event.actorUserId === viewer ? { mine: true as const } : {}),
  }
}
