import { useState, type ReactNode } from "react"
import { useConvexAuth, usePaginatedQuery, useQuery } from "convex/react"

import type { GameSummaryModel, SummaryChangeFeed } from "@/screens/gameSummary"
import { connectedChanges, connectedSummaryModel } from "@/screens/gameSummary"

import { api } from "../../../convex/_generated/api"

const EVENT_PAGE_SIZE = 20

export function ConnectedSummarySource({
  publicId,
  children,
}: {
  publicId: string
  children: (state: {
    model: GameSummaryModel | null
    changes: SummaryChangeFeed
    loading: boolean
  }) => ReactNode
}) {
  const { isAuthenticated } = useConvexAuth()
  const [timelineRequested, setTimelineRequested] = useState(false)
  const summary = useQuery(api.games.connectedSummary, isAuthenticated ? { publicId } : "skip")
  const events = usePaginatedQuery(
    api.games.connectedEvents,
    isAuthenticated && timelineRequested ? { publicId } : "skip",
    { initialNumItems: EVENT_PAGE_SIZE },
  )

  return children({
    model: summary ? connectedSummaryModel(summary as any) : null,
    loading: summary === undefined,
    changes: {
      changes: connectedChanges(events.results as any[]),
      onExpand: () => setTimelineRequested(true),
      canLoadMore: events.status === "CanLoadMore",
      loadMore: () => events.loadMore(EVENT_PAGE_SIZE),
    },
  })
}
