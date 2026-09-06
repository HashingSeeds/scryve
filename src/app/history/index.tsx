import { memo, useEffect, useState } from "react"
import { router, useLocalSearchParams } from "expo-router"

import { ConvexQueryBoundary } from "@/features/async/ConvexQueryBoundary"
import { useAuthAccess } from "@/features/auth/AuthContext"
import {
  ConnectedHistorySource,
  type ConnectedHistoryFeed,
} from "@/features/connected/ConnectedHistorySource"
import { localGameRepository } from "@/features/game/localPersistence"
import type { HistorySource } from "@/screens/historyEntries"
import { HistoryScreen } from "@/screens/HistoryScreen"

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
            access: { status: "unavailable", retry },
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
  const auth = useAuthAccess()
  const [connected, setConnected] = useState<{ ownerId?: string; feed: ConnectedHistoryFeed }>()
  const signedIn = auth.configured && auth.isSignedIn
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
  return (
    <>
      {signedIn ? <HistoryConnection ownerId={auth.userId} onChange={setConnected} /> : null}
      <HistoryScreen
        {...shared}
        connected={signedIn && connected?.ownerId === auth.userId ? connected?.feed : undefined}
      />
    </>
  )
}
