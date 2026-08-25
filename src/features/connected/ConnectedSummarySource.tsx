import { useCallback, useState, type ReactNode } from "react"
import { useConvexAuth, usePaginatedQuery, useQuery } from "convex/react"

import { ConvexQueryBoundary } from "@/features/async/ConvexQueryBoundary"
import { remotePage, remoteValue } from "@/features/async/remoteState"
import type { GameSummaryState, SummaryTimelineState } from "@/screens/gameSummary"
import { connectedChanges, connectedSummaryModel } from "@/screens/gameSummary"

import { api } from "../../../convex/_generated/api"

const EVENT_PAGE_SIZE = 20

interface ConnectedSummaryState {
  summary: GameSummaryState
  timeline: SummaryTimelineState
  viewerPlayerIds: string[]
}

function ConnectedTimelineSource({
  publicId,
  enabled,
  request,
  children,
}: {
  publicId: string
  enabled: boolean
  request: () => void
  children: (timeline: SummaryTimelineState) => ReactNode
}) {
  const events = usePaginatedQuery(api.games.connectedEvents, enabled ? { publicId } : "skip", {
    initialNumItems: EVENT_PAGE_SIZE,
  })
  if (!enabled) return children({ status: "idle", request })
  const page = remotePage(events, EVENT_PAGE_SIZE)
  return children(
    page.status === "loading" ? page : { ...page, items: connectedChanges(page.items) },
  )
}

export function ConnectedSummarySource({
  publicId,
  children,
}: {
  publicId: string
  children: (state: ConnectedSummaryState) => ReactNode
}) {
  const { isAuthenticated } = useConvexAuth()
  const [timelineRequested, setTimelineRequested] = useState(false)
  const requestTimeline = useCallback(() => setTimelineRequested(true), [])
  const summary = useQuery(api.games.connectedSummary, isAuthenticated ? { publicId } : "skip")
  const remoteSummary = remoteValue(summary)
  const state: Omit<ConnectedSummaryState, "timeline"> = {
    summary:
      remoteSummary.status === "loading"
        ? remoteSummary
        : {
            status: "ready",
            value: remoteSummary.value ? connectedSummaryModel(remoteSummary.value) : null,
          },
    viewerPlayerIds: summary?.viewerPlayerIds ?? [],
  }

  return (
    <ConvexQueryBoundary
      resetKey={publicId}
      fallback={({ retry }) => children({ ...state, timeline: { status: "error", retry } })}
    >
      <ConnectedTimelineSource
        publicId={publicId}
        enabled={timelineRequested}
        request={requestTimeline}
      >
        {(timeline) => children({ ...state, timeline })}
      </ConnectedTimelineSource>
    </ConvexQueryBoundary>
  )
}
