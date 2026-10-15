import { createContext, useContext, useEffect, type ReactNode } from "react"
import { usePaginatedQuery } from "convex/react"

import { ConvexQueryBoundary } from "@/features/async/ConvexQueryBoundary"

import type { GameEvent } from "./types"
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
  | { kind: "local"; startingLife: number; events: readonly GameEvent[] }
  | { kind: "connected"; startingLife: number; publicId: string }

export const LifeLogContext = createContext<LifeLogSource | undefined>(undefined)

export function lifeLog(startingLife: number, changes: readonly LifeLogChange[]): LifeLogStep[] {
  let life = startingLife
  return [
    { id: "start", life },
    ...changes.map(({ id, delta }) => {
      life += delta
      return { id, delta, life }
    }),
  ]
}

// why: an undo leaves the log as if the change never happened, so both it and the change it reverses drop out.
export function localLifeChanges(events: readonly GameEvent[], playerId: string): LifeLogChange[] {
  const undone = new Set(
    events.flatMap((event) =>
      event.type === "life.changed" && event.compensatesOperationId
        ? [event.compensatesOperationId]
        : [],
    ),
  )
  return events.flatMap((event) =>
    event.type === "life.changed" &&
    event.playerId === playerId &&
    !event.compensatesOperationId &&
    !undone.has(event.operationId)
      ? [{ id: event.operationId, delta: event.delta }]
      : [],
  )
}

type LifeLogProps = {
  playerId: string
  children: (steps: readonly LifeLogStep[]) => ReactNode
}

export function LifeLog({ playerId, children }: LifeLogProps) {
  const source = useContext(LifeLogContext)
  if (!source) return null
  if (source.kind === "local")
    return children(lifeLog(source.startingLife, localLifeChanges(source.events, playerId)))
  return (
    <ConvexQueryBoundary resetKey={source.publicId} fallback={() => null}>
      <ConnectedLifeLog source={source} playerId={playerId}>
        {children}
      </ConnectedLifeLog>
    </ConvexQueryBoundary>
  )
}

function ConnectedLifeLog({
  source,
  playerId,
  children,
}: LifeLogProps & { source: Extract<LifeLogSource, { kind: "connected" }> }) {
  const events = usePaginatedQuery(
    api.games.connectedEvents,
    { publicId: source.publicId },
    { initialNumItems: CONNECTED_EVENT_PAGE_MAX_ITEMS },
  )
  const { status, loadMore } = events
  // why: totals add up from the starting value, so the log waits for every page rather than showing wrong totals.
  useEffect(() => {
    if (status === "CanLoadMore") loadMore(CONNECTED_EVENT_PAGE_MAX_ITEMS)
  }, [status, loadMore])
  if (status !== "Exhausted") return null
  const changes = events.results
    .flatMap((event) =>
      event.kind === "life.changed" && event.playerId === playerId && event.delta !== undefined
        ? [{ id: event.operationId, delta: event.delta }]
        : [],
    )
    .reverse()
  return children(lifeLog(source.startingLife, changes))
}
