import { useEffect, useState, type ReactNode } from "react"
import { useConvexAuth, useMutation, usePaginatedQuery, useQuery } from "convex/react"

import type { HistoryEntry } from "@/screens/historyEntries"
import { connectedHistoryEntry } from "@/screens/historyEntries"

import { api } from "../../../convex/_generated/api"

export interface ConnectedHistoryFeed {
  entries: HistoryEntry[]
  loading: boolean
  canLoadMore: boolean
  loadMore: () => void
  premiumLocked: boolean
  error?: string
}

const PAGE_SIZE = 10

export function ConnectedHistorySource({
  children,
}: {
  children: (feed: ConnectedHistoryFeed) => ReactNode
}) {
  const { isAuthenticated } = useConvexAuth()
  const entitlements = useQuery(api.entitlements.current, isAuthenticated ? {} : "skip")
  const migrateHistory = useMutation(api.games.migrateMyHistoryEntries)
  const [migrationError, setMigrationError] = useState<string>()
  const { results, status, loadMore } = usePaginatedQuery(
    api.games.connectedHistory,
    isAuthenticated ? {} : "skip",
    { initialNumItems: PAGE_SIZE },
  )

  useEffect(() => {
    if (!isAuthenticated) return
    let cancelled = false
    void (async () => {
      let cursor: string | null = null
      let isDone = false
      while (!isDone && !cancelled) {
        const result: { continueCursor: string; isDone: boolean } = await migrateHistory({ cursor })
        cursor = result.continueCursor
        isDone = result.isDone
      }
    })().catch((cause) => {
      if (!cancelled)
        setMigrationError(cause instanceof Error ? cause.message : "Could not migrate game history")
    })
    return () => {
      cancelled = true
    }
  }, [isAuthenticated, migrateHistory])

  return children({
    entries: results.map((game: any) => connectedHistoryEntry(game)),
    loading: status === "LoadingFirstPage",
    canLoadMore: status === "CanLoadMore",
    loadMore: () => loadMore(PAGE_SIZE),
    premiumLocked: Boolean(entitlements && !entitlements.fullHistory && results.length >= 10),
    error: migrationError,
  })
}
