import { localLogPositions } from "./domain"
import type { LocalGame } from "./types"

export interface ReceiptChange {
  playerId: string
  delta: number
  from?: string
  turn?: number
}

export interface ReceiptLog {
  changes: ReceiptChange[]
  finishTurn?: number
}

export function localReceiptLog(game: LocalGame): ReceiptLog {
  const undone = new Set(game.events.flatMap((event) => compensated(event) ?? []))
  // why: picking a first player logs turn 1 even when nobody passes, which would stamp every change T1.
  const turns = game.turnLog?.some(({ number }) => number > 1) ? game.turnLog : []
  const position = localLogPositions(game)
  const turnOf = (operationId: string) => {
    const at = position(operationId)
    if (at === undefined) return undefined
    return turns.findLast((entry) => (position(entry.operationId) ?? Infinity) < at)?.number
  }
  const changes = game.events.flatMap((event): ReceiptChange[] => {
    if (event.type !== "life.changed" && event.type !== "commanderDamage.assigned") return []
    if (event.compensatesOperationId || undone.has(event.operationId)) return []
    const turn = turnOf(event.operationId)
    return [
      {
        ...(event.type === "life.changed"
          ? { playerId: event.playerId, delta: event.delta }
          : { playerId: event.toPlayerId, delta: -event.delta, from: event.fromPlayerId }),
        ...(turn === undefined ? {} : { turn }),
      },
    ]
  })
  const finishTurn = turns.at(-1)?.number
  return { changes, ...(finishTurn === undefined ? {} : { finishTurn }) }
}

const compensated = (event: LocalGame["events"][number]) =>
  "compensatesOperationId" in event ? event.compensatesOperationId : undefined
