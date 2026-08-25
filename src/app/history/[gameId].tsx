import { router, useLocalSearchParams } from "expo-router"

import { ConvexQueryBoundary } from "@/features/async/ConvexQueryBoundary"
import { ConnectedGate } from "@/features/connected/ConnectedGate"
import { ConnectedSummarySource } from "@/features/connected/ConnectedSummarySource"
import { localGameRepository } from "@/features/game/localPersistence"
import { localChanges, localSummaryModel } from "@/screens/gameSummary"
import { GameSummaryScreen } from "@/screens/GameSummaryScreen"

export default function GameSummaryRoute() {
  const { gameId, source } = useLocalSearchParams<{ gameId?: string; source?: string }>()
  const onBack = () => router.back()

  if (source === "connected" && typeof gameId === "string") {
    return (
      <ConnectedGate onBack={onBack}>
        <ConvexQueryBoundary
          resetKey={gameId}
          fallback={({ retry }) => (
            <GameSummaryScreen
              summary={{ status: "unavailable", retry }}
              timeline={{ status: "unavailable" }}
              onBack={onBack}
            />
          )}
        >
          <ConnectedSummarySource publicId={gameId}>
            {({ summary, timeline, viewerPlayerIds }) => (
              <GameSummaryScreen
                summary={summary}
                timeline={timeline}
                onBack={onBack}
                moderation={{ publicId: gameId, viewerPlayerIds }}
              />
            )}
          </ConnectedSummarySource>
        </ConvexQueryBoundary>
      </ConnectedGate>
    )
  }

  const detail = typeof gameId === "string" ? localGameRepository.loadHistoryDetail(gameId) : null
  return (
    <GameSummaryScreen
      summary={{ status: "ready", value: detail ? localSummaryModel(detail.game) : null }}
      timeline={
        detail
          ? {
              status: "ready",
              items: localChanges(detail.game),
              nextPage: { status: "exhausted" },
              olderEventsDropped: detail.eventsTruncated,
            }
          : { status: "unavailable" }
      }
      onBack={onBack}
    />
  )
}
