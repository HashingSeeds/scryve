import { router, useLocalSearchParams } from "expo-router"

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
        <ConnectedSummarySource publicId={gameId}>
          {({ model, changes, loading, viewerPlayerIds }) => (
            <GameSummaryScreen
              model={model}
              changes={changes}
              loading={loading}
              onBack={onBack}
              moderation={{ publicId: gameId, viewerPlayerIds }}
            />
          )}
        </ConnectedSummarySource>
      </ConnectedGate>
    )
  }

  const detail = typeof gameId === "string" ? localGameRepository.loadHistoryDetail(gameId) : null
  return (
    <GameSummaryScreen
      model={detail ? localSummaryModel(detail.game) : null}
      changes={
        detail
          ? {
              changes: localChanges(detail.game),
              olderEventsDropped: detail.eventsTruncated,
            }
          : undefined
      }
      onBack={onBack}
    />
  )
}
