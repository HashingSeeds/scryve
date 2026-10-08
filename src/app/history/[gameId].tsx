import { router, useLocalSearchParams } from "expo-router"

import { ConvexQueryBoundary } from "@/features/async/ConvexQueryBoundary"
import { useAuthAccess } from "@/features/auth/AuthContext"
import { ConnectedGate } from "@/features/connected/ConnectedGate"
import { ConnectedSummarySource } from "@/features/connected/ConnectedSummarySource"
import { localGameRepository } from "@/features/game/localPersistence"
import { localChanges, localSummaryModel } from "@/screens/gameSummary"
import { GameSummaryScreen } from "@/screens/GameSummaryScreen"

export default function GameSummaryRoute() {
  const { gameId, source } = useLocalSearchParams<{ gameId?: string; source?: string }>()
  const auth = useAuthAccess()
  const onBack = () =>
    router.canGoBack()
      ? router.back()
      : router.replace({ pathname: "/", params: { destination: "play" } })

  const stored =
    source !== "connected" && typeof gameId === "string"
      ? localGameRepository.loadHistoryDetail(gameId)
      : null
  // why: same rule as the list, so a deep link cannot open another account's game on a shared device.
  const detail =
    stored &&
    (stored.game.account === undefined ||
      (auth.isSignedIn && stored.game.account.ownerId === auth.userId))
      ? stored
      : null
  // why: a local game published from another device only exists on the server.
  const connectedId =
    typeof gameId === "string" && (source === "connected" || (!detail && auth.isSignedIn))
      ? gameId
      : undefined

  if (connectedId) {
    return (
      <ConnectedGate onBack={onBack}>
        <ConvexQueryBoundary
          resetKey={connectedId}
          fallback={({ retry }) => (
            <GameSummaryScreen
              summary={{ status: "unavailable", retry }}
              timeline={{ status: "unavailable" }}
              onBack={onBack}
              gameId={connectedId}
              onOpenSupport={() => router.push("/support")}
            />
          )}
        >
          <ConnectedSummarySource publicId={connectedId}>
            {({ summary, timeline, viewerPlayerIds }) => (
              <GameSummaryScreen
                summary={summary}
                timeline={timeline}
                onBack={onBack}
                gameId={connectedId}
                onOpenSupport={() => router.push("/support")}
                moderation={{ publicId: connectedId, viewerPlayerIds }}
              />
            )}
          </ConnectedSummarySource>
        </ConvexQueryBoundary>
      </ConnectedGate>
    )
  }

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
      gameId={typeof gameId === "string" ? gameId : undefined}
      onOpenSupport={() => router.push("/support")}
    />
  )
}
