import { memo, useCallback, useEffect, useState } from "react"
import { router, useFocusEffect, useLocalSearchParams } from "expo-router"

import { ConvexQueryBoundary } from "@/features/async/ConvexQueryBoundary"
import { useAuthAccess } from "@/features/auth/AuthContext"
import {
  ConnectedHistorySource,
  type ConnectedHistoryFeed,
} from "@/features/connected/ConnectedHistorySource"
import { localGameVisibleTo } from "@/features/game/localGameClaims"
import { localGameRepository } from "@/features/game/localPersistence"
import type { HistorySource } from "@/screens/historyEntries"
import { HistoryScreen } from "@/screens/HistoryScreen"
import { captureAnalytics } from "@/utils/analytics"
import { goBack } from "@/utils/navigation"

function ReportHistory({
  feed,
  ownerId,
  onChange,
}: {
  feed: ConnectedHistoryFeed
  ownerId?: string
  onChange: (value: { ownerId?: string; feed: ConnectedHistoryFeed }) => void
}) {
  useEffect(() => onChange({ ownerId, feed }), [feed, ownerId, onChange])
  return null
}

const HistoryConnection = memo(function HistoryConnection({
  ownerId,
  onChange,
}: {
  ownerId?: string
  onChange: (value: { ownerId?: string; feed: ConnectedHistoryFeed }) => void
}) {
  return (
    <ConvexQueryBoundary
      resetKey={ownerId}
      fallback={({ retry }) => (
        <ReportHistory
          ownerId={ownerId}
          onChange={onChange}
          feed={{
            page: { status: "unavailable", retry },
            migration: { status: "complete" },
          }}
        />
      )}
    >
      <ConnectedHistorySource>
        {(feed) => <ReportHistory ownerId={ownerId} onChange={onChange} feed={feed} />}
      </ConnectedHistorySource>
    </ConvexQueryBoundary>
  )
})

export default function HistoryRoute() {
  useFocusEffect(
    useCallback(() => {
      captureAnalytics("stats_viewed", { surface: "history" })
    }, []),
  )
  const auth = useAuthAccess()
  const [connected, setConnected] = useState<{ ownerId?: string; feed: ConnectedHistoryFeed }>()
  const signedIn = auth.configured && auth.isSignedIn
  const { source } = useLocalSearchParams<{ source?: string }>()
  // why: a game claimed by one account stays private to it on a shared device; unclaimed games stay visible to everyone except the accounts that declined them.
  const games = localGameRepository
    .loadHistory()
    .filter((game) => localGameVisibleTo(game, signedIn ? auth.userId : undefined))
  const shared = {
    games,
    initialSource:
      source === "connected" || source === "local" || source === "manual"
        ? (source as HistorySource)
        : undefined,
    onBack: () => goBack({ pathname: "/", params: { destination: "play" } }),
    onSelectLocal: (gameId: string) =>
      router.push({ pathname: "/history/[gameId]", params: { gameId } }),
    onSelectConnected: (gameId: string) =>
      router.push({ pathname: "/history/[gameId]", params: { gameId, source: "connected" } }),
    onSelectManual: (publicId: string) =>
      router.push({ pathname: "/history/match/[publicId]", params: { publicId } }),
    ...(signedIn ? { onAddMatch: () => router.push("/connected/decks/match") } : {}),
  }
  return (
    <>
      {signedIn ? <HistoryConnection ownerId={auth.userId} onChange={setConnected} /> : null}
      <HistoryScreen
        {...shared}
        connected={
          signedIn && auth.userId !== undefined && connected?.ownerId === auth.userId
            ? connected?.feed
            : undefined
        }
      />
    </>
  )
}
