import { router, useLocalSearchParams } from "expo-router"

import { ConvexQueryBoundary } from "@/features/async/ConvexQueryBoundary"
import { useAuthAccess } from "@/features/auth/AuthContext"
import { ConnectedHistorySource } from "@/features/connected/ConnectedHistorySource"
import { localGameRepository } from "@/features/game/localPersistence"
import type { HistorySource } from "@/screens/historyEntries"
import { HistoryScreen } from "@/screens/HistoryScreen"

export default function HistoryRoute() {
  const auth = useAuthAccess()
  const { source } = useLocalSearchParams<{ source?: string }>()
  const games = localGameRepository.loadHistory()
  const shared = {
    games,
    initialSource:
      source === "connected" || source === "local" ? (source as HistorySource) : undefined,
    onBack: () => router.back(),
    onSelectLocal: (gameId: string) =>
      router.push({ pathname: "/history/[gameId]", params: { gameId } }),
    onSelectConnected: (gameId: string) =>
      router.push({ pathname: "/history/[gameId]", params: { gameId, source: "connected" } }),
  }
  if (!auth.configured || !auth.isSignedIn) return <HistoryScreen {...shared} />
  return (
    <ConvexQueryBoundary
      fallback={({ retry }) => (
        <HistoryScreen
          {...shared}
          connected={{
            page: { status: "unavailable", retry },
            access: { status: "unavailable", retry },
            migration: { status: "complete" },
          }}
        />
      )}
    >
      <ConnectedHistorySource>
        {(connected) => <HistoryScreen {...shared} connected={connected} />}
      </ConnectedHistorySource>
    </ConvexQueryBoundary>
  )
}
