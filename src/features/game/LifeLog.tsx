import { createContext, useContext, type ReactNode } from "react"
import { usePaginatedQuery } from "convex/react"

import { ConvexQueryBoundary } from "@/features/async/ConvexQueryBoundary"
import type { PendingLifeAction } from "@/features/connected/model"

import type { CommanderDamageAssignedEvent, GameEvent, LifeChangedEvent } from "./types"
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
export function localLifeChanges(events: readonly GameEvent[], playerId: string): LifeLogChange[] {
  const lifeEvents = events.filter(
    (event): event is LifeChangedEvent | CommanderDamageAssignedEvent =>
      event.type === "life.changed" || event.type === "commanderDamage.assigned",
  )
  const undone = new Set(lifeEvents.map(({ compensatesOperationId }) => compensatesOperationId))
  return lifeEvents
    .flatMap((event) => {
      if (event.compensatesOperationId || undone.has(event.operationId)) return []
      if (event.type === "life.changed")
        return event.playerId === playerId ? [{ id: event.operationId, delta: event.delta }] : []
      return event.toPlayerId === playerId ? [{ id: event.operationId, delta: -event.delta }] : []
    })
    .reverse()
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
